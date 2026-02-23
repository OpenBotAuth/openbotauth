/**
 * Certificate issuance endpoints (MVP)
 */

import { webcrypto, createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { Database } from "@openbotauth/github-connector";
import { issueCertificateForJwk, getCertificateAuthority } from "../utils/ca.js";
import { requireScope } from "../middleware/scopes.js";
import { jwkThumbprint } from "../utils/jwk.js";

/**
 * Check if a PoP nonce has been used and mark it as used.
 * Returns true if the nonce is new (not a replay), false if already used.
 * Uses the check_pop_nonce Postgres function for atomic check-and-set.
 */
interface SqlQueryExecutor {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

async function checkPopNonce(
  queryExecutor: SqlQueryExecutor,
  message: string,
): Promise<boolean> {
  const hash = createHash("sha256").update(message).digest("hex");
  try {
    const result = await queryExecutor.query(
      `SELECT check_pop_nonce($1, 300) AS is_new`,
      [hash],
    );
    return result.rows[0]?.is_new === true;
  } catch (err: any) {
    // Fail closed if migration 009 is missing. Replay protection is required.
    if (err?.code === "42883" || err.message?.includes("check_pop_nonce")) {
      console.error(
        "PoP nonce check unavailable: migration 009 not applied or function missing",
      );
      return false;
    }
    throw err;
  }
}

/**
 * Verify proof-of-possession signature.
 * The proof message format is: "cert-issue:{agent_id}:{timestamp}"
 * Timestamp must be within 5 minutes in the past (30s future drift tolerated for clock skew).
 */
async function verifyProofOfPossession(
  proof: unknown,
  agentId: string,
  publicKey: { kty?: string; crv?: string; x: string },
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Type validation
    if (!proof || typeof proof !== "object") {
      return { valid: false, error: "Proof must be an object" };
    }
    const { message, signature } = proof as Record<string, unknown>;
    if (typeof message !== "string" || typeof signature !== "string") {
      return { valid: false, error: "Proof message and signature must be strings" };
    }

    // Parse and validate message format: cert-issue:{agent_id}:{timestamp}
    const match = message.match(/^cert-issue:([^:]+):(\d+)$/);
    if (!match) {
      return { valid: false, error: "Invalid proof message format. Expected: cert-issue:{agent_id}:{timestamp}" };
    }

    const [, proofAgentId, timestampStr] = match;

    // Verify agent_id matches
    if (proofAgentId !== agentId) {
      return { valid: false, error: "Proof agent_id does not match requested agent" };
    }

    // Validate timestamp: must be in the past, within 5 minutes
    const timestamp = parseInt(timestampStr, 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 300; // 5 minutes
    const maxDrift = 30; // 30 seconds future tolerance for clock skew

    if (timestamp > now + maxDrift) {
      return { valid: false, error: "Proof timestamp is in the future" };
    }
    if (now - timestamp > maxAge) {
      return { valid: false, error: "Proof timestamp expired (older than 5 minutes)" };
    }

    // Validate signature length (Ed25519 signatures are always 64 bytes)
    const signatureBuffer = Buffer.from(signature, "base64");
    if (signatureBuffer.length !== 64) {
      return { valid: false, error: "Invalid signature length (Ed25519 signatures must be 64 bytes)" };
    }

    // Import public key
    const jwk = {
      kty: publicKey.kty || "OKP",
      crv: publicKey.crv || "Ed25519",
      x: publicKey.x,
    };

    const key = await webcrypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "Ed25519" },
      false,
      ["verify"],
    );

    // Verify signature
    const messageBuffer = new TextEncoder().encode(message);

    const valid = await webcrypto.subtle.verify(
      { name: "Ed25519" },
      key,
      signatureBuffer,
      messageBuffer,
    );

    if (!valid) {
      return { valid: false, error: "Signature verification failed" };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message || "Proof verification error" };
  }
}

export const certsRouter: Router = Router();

const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

function sanitizeDnValue(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\r\n\t\0]/g, " ")
    .replace(/[=,+<>#;"\\]/g, " ");
  const compact = cleaned.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  return compact.slice(0, 64);
}

function isValidAgentId(value: string): boolean {
  if (value.length > 255) return false;
  if (!value.startsWith("agent:")) return false;
  if (/\s/.test(value)) return false;
  return /^agent:[A-Za-z0-9._-]+@[A-Za-z0-9.-]+(\/[A-Za-z0-9._-]+)?$/.test(
    value,
  );
}

function parsePositiveInt(
  input: unknown,
  defaultValue: number,
  min: number,
  max: number,
): number | null {
  if (input === undefined) return defaultValue;
  if (typeof input !== "string") return null;
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

function readPositiveEnvInt(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

const REVOCATION_REASONS = new Set([
  "unspecified",
  "key_compromise",
  "ca_compromise",
  "affiliation_changed",
  "superseded",
  "cessation_of_operation",
  "certificate_hold",
  "privilege_withdrawn",
  "remove_from_crl",
  "aa_compromise",
]);

function parseRevocationReason(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) {
    return null;
  }
  if (normalized.length > 64) {
    return undefined;
  }
  if (!REVOCATION_REASONS.has(normalized)) {
    return undefined;
  }
  return normalized;
}

certsRouter.post(
  "/v1/certs/issue",
  requireAuth,
  requireScope("agents:write"),
  async (req: Request, res: Response): Promise<void> => {
    const db: Database = req.app.locals.db;
    const client = await db.getPool().connect();
    let transactionOpen = false;

    const rollbackIfNeeded = async () => {
      if (!transactionOpen) return;
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Certificate issuance rollback error:", rollbackError);
      } finally {
        transactionOpen = false;
      }
    };

    try {
      const { agent_id } = req.body || {};

      if (!agent_id) {
        res.status(400).json({
          error: "Missing required input: agent_id",
        });
        return;
      }

      await client.query("BEGIN");
      transactionOpen = true;

      const result = await client.query(
        `SELECT * FROM agents WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [agent_id, req.session!.user.id],
      );
      const agent = result.rows[0] || null;

      if (!agent) {
        await rollbackIfNeeded();
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const pk = agent.public_key;
      if (!pk || typeof pk !== "object" || typeof pk.x !== "string") {
        res.status(400).json({ error: "Agent public key is invalid" });
        return;
      }

      // Verify proof-of-possession: caller must prove they have the private key
      const { proof } = req.body || {};
      if (!proof) {
        res.status(400).json({
          error: "Missing proof-of-possession. Provide proof: { message: 'cert-issue:{agent_id}:{timestamp}', signature: '<base64>' }",
        });
        return;
      }

      const popResult = await verifyProofOfPossession(proof, agent.id, pk);
      if (!popResult.valid) {
        res.status(403).json({
          error: `Proof-of-possession failed: ${popResult.error}`,
        });
        return;
      }

      // Check for replay attack: ensure this proof hasn't been used before
      const isNewNonce = await checkPopNonce(client, proof.message);
      if (!isNewNonce) {
        await rollbackIfNeeded();
        res.status(403).json({
          error:
            "Proof-of-possession replay detected or replay protection unavailable",
        });
        return;
      }

      const resolvedKid =
        typeof pk.kid === "string" && pk.kid.length > 0
          ? pk.kid
          : jwkThumbprint({ kty: "OKP", crv: "Ed25519", x: pk.x });

      const maxDailyIssues = readPositiveEnvInt(
        "OBA_CERT_MAX_ISSUES_PER_AGENT_PER_DAY",
        10,
      );
      const dailyIssueCountResult = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM agent_certificates c
         JOIN agents a ON a.id = c.agent_id
         WHERE c.agent_id = $1
           AND a.user_id = $2
           AND c.created_at >= now() - interval '1 day'`,
        [agent.id, req.session!.user.id],
      );
      const dailyIssueCount = Number(dailyIssueCountResult.rows[0]?.count ?? 0);
      if (dailyIssueCount >= maxDailyIssues) {
        await rollbackIfNeeded();
        res.status(429).json({
          error: `Daily certificate issuance limit exceeded (${maxDailyIssues} per 24h)`,
        });
        return;
      }

      const maxActivePerKid = readPositiveEnvInt(
        "OBA_CERT_MAX_ACTIVE_PER_KID",
        1,
      );
      const activeForKidResult = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM agent_certificates c
         JOIN agents a ON a.id = c.agent_id
         WHERE c.agent_id = $1
           AND a.user_id = $2
           AND c.kid = $3
           AND c.revoked_at IS NULL
           AND c.not_after > now()`,
        [agent.id, req.session!.user.id, resolvedKid],
      );
      const activeForKidCount = Number(activeForKidResult.rows[0]?.count ?? 0);
      if (activeForKidCount >= maxActivePerKid) {
        await rollbackIfNeeded();
        res.status(409).json({
          error: `Active certificate limit reached for key ${resolvedKid}; revoke existing certificates before issuing a new one`,
        });
        return;
      }

      const subjectCn = sanitizeDnValue(
        agent.name || "OpenBotAuth Agent",
        "OpenBotAuth Agent",
      );
      const subject = `CN=${subjectCn}`;
      const validityDays = parseInt(
        process.env.OBA_LEAF_CERT_VALID_DAYS || "90",
        10,
      );

      const jwkForCert = {
        kty: pk.kty || "OKP",
        crv: pk.crv || "Ed25519",
        x: pk.x,
        kid: resolvedKid,
      };

      const issued = await issueCertificateForJwk(
        jwkForCert,
        subject,
        validityDays,
        typeof agent.oba_agent_id === "string" && isValidAgentId(agent.oba_agent_id)
          ? agent.oba_agent_id
          : null,
      );

      await client.query(
        `INSERT INTO agent_certificates
         (agent_id, kid, serial, cert_pem, chain_pem, x5c, not_before, not_after, fingerprint_sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          agent.id,
          resolvedKid,
          issued.serial,
          issued.certPem,
          issued.chainPem,
          issued.x5c,
          issued.notBefore,
          issued.notAfter,
          issued.fingerprintSha256,
        ],
      );
      await client.query("COMMIT");
      transactionOpen = false;

      res.setHeader("Cache-Control", "no-store");
      res.json({
        serial: issued.serial,
        not_before: issued.notBefore,
        not_after: issued.notAfter,
        fingerprint_sha256: issued.fingerprintSha256,
        cert_pem: issued.certPem,
        chain_pem: issued.chainPem,
        x5c: issued.x5c,
      });
    } catch (error: any) {
      await rollbackIfNeeded();
      console.error("Certificate issuance error:", error);
      res.status(500).json({ error: "Failed to issue certificate" });
    } finally {
      client.release();
    }
  },
);

certsRouter.post(
  "/v1/certs/revoke",
  requireAuth,
  requireScope("agents:write"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db: Database = req.app.locals.db;
      const { serial, kid, reason } = req.body || {};
      const revocationReason = parseRevocationReason(reason);

      if (!serial && !kid) {
        res.status(400).json({ error: "Missing required input: serial or kid" });
        return;
      }
      if (revocationReason === undefined) {
        res.status(400).json({
          error:
            "Invalid revocation reason. Use RFC 5280 reason names (e.g. key_compromise, cessation_of_operation).",
        });
        return;
      }

      const params: any[] = [req.session!.user.id];
      let condition = "";

      if (serial) {
        params.push(serial);
        condition = "c.serial = $2";
      } else if (kid) {
        params.push(kid);
        condition = "c.kid = $2";
      }

      const matchResult = await db.getPool().query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE c.revoked_at IS NULL)::int AS revocable
         FROM agent_certificates c
         JOIN agents a ON a.id = c.agent_id
         WHERE a.user_id = $1
           AND ${condition}`,
        params,
      );
      const total = Number(matchResult.rows[0]?.total ?? 0);
      const revocable = Number(matchResult.rows[0]?.revocable ?? 0);
      if (total === 0) {
        res.status(404).json({ error: "Certificate not found" });
        return;
      }
      if (revocable === 0) {
        res.setHeader("Cache-Control", "no-store");
        res.json({
          success: true,
          revoked: 0,
          already_revoked: true,
        });
        return;
      }

      const result = await db.getPool().query(
        `UPDATE agent_certificates c
         SET revoked_at = now(), revoked_reason = $3
         FROM agents a
         WHERE c.agent_id = a.id
           AND a.user_id = $1
           AND ${condition}
           AND c.revoked_at IS NULL
         RETURNING c.id`,
        [...params, revocationReason],
      );

      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, revoked: result.rows.length });
    } catch (error: any) {
      console.error("Certificate revocation error:", error);
      res.status(500).json({ error: "Failed to revoke certificate" });
    }
  },
);

certsRouter.get(
  "/v1/certs",
  requireAuth,
  requireScope("agents:read"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db: Database = req.app.locals.db;
      const agentId =
        typeof req.query.agent_id === "string" && req.query.agent_id.length > 0
          ? req.query.agent_id
          : null;
      const kid =
        typeof req.query.kid === "string" && req.query.kid.length > 0
          ? req.query.kid
          : null;
      const statusRaw =
        typeof req.query.status === "string"
          ? req.query.status.toLowerCase()
          : "all";
      if (!["active", "revoked", "all"].includes(statusRaw)) {
        res
          .status(400)
          .json({ error: "Invalid status. Use active, revoked, or all." });
        return;
      }

      const limit = parsePositiveInt(req.query.limit, 50, 1, 200);
      const offset = parsePositiveInt(req.query.offset, 0, 0, 1000000);
      if (limit === null || offset === null) {
        res
          .status(400)
          .json({ error: "Invalid pagination. limit=1..200, offset>=0." });
        return;
      }

      const whereClauses: string[] = ["a.user_id = $1"];
      const params: unknown[] = [req.session!.user.id];
      let paramIndex = 2;

      if (agentId) {
        whereClauses.push(`c.agent_id = $${paramIndex}`);
        params.push(agentId);
        paramIndex++;
      }
      if (kid) {
        whereClauses.push(`c.kid = $${paramIndex}`);
        params.push(kid);
        paramIndex++;
      }
      if (statusRaw === "active") {
        whereClauses.push("c.revoked_at IS NULL AND c.not_before <= now() AND c.not_after > now()");
      } else if (statusRaw === "revoked") {
        whereClauses.push("c.revoked_at IS NOT NULL");
      }

      const countResult = await db.getPool().query(
        `SELECT COUNT(*)::int AS total
         FROM agent_certificates c
         JOIN agents a ON a.id = c.agent_id
         WHERE ${whereClauses.join(" AND ")}`,
        params,
      );

      const total = Number(countResult.rows[0]?.total ?? 0);
      const pageParams = [...params, limit, offset];
      const limitParam = paramIndex;
      const offsetParam = paramIndex + 1;

      const result = await db.getPool().query(
        `SELECT c.id, c.agent_id, c.kid, c.serial, c.fingerprint_sha256,
                c.not_before, c.not_after, c.revoked_at, c.revoked_reason, c.created_at,
                (c.revoked_at IS NULL AND c.not_before <= now() AND c.not_after > now()) AS is_active
         FROM agent_certificates c
         JOIN agents a ON a.id = c.agent_id
         WHERE ${whereClauses.join(" AND ")}
         ORDER BY c.created_at DESC
         LIMIT $${limitParam}
         OFFSET $${offsetParam}`,
        pageParams,
      );

      const items = result.rows;

      res.setHeader("Cache-Control", "no-store");
      res.json({ items, total, limit, offset });
    } catch (error: any) {
      console.error("Certificate list error:", error);
      res.status(500).json({ error: "Failed to list certificates" });
    }
  },
);

certsRouter.get(
  "/v1/certs/status",
  requireAuth,
  requireScope("agents:read"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db: Database = req.app.locals.db;
      const serial =
        typeof req.query.serial === "string" && req.query.serial.length > 0
          ? req.query.serial
          : null;
      const fingerprint =
        typeof req.query.fingerprint_sha256 === "string" &&
        req.query.fingerprint_sha256.length > 0
          ? req.query.fingerprint_sha256.toLowerCase()
          : null;

      if ((!serial && !fingerprint) || (serial && fingerprint)) {
        res.status(400).json({
          error: "Provide exactly one lookup parameter: serial or fingerprint_sha256",
        });
        return;
      }

      // Validate fingerprint format if provided
      if (fingerprint && !/^[a-f0-9]{64}$/.test(fingerprint)) {
        res.status(400).json({
          error: "Invalid fingerprint_sha256: must be 64 hex characters",
        });
        return;
      }

      const condition = serial ? "c.serial = $2" : "c.fingerprint_sha256 = $2";
      const lookupValue = serial ?? fingerprint!;
      const result = await db.getPool().query(
        `SELECT c.serial, c.fingerprint_sha256, c.not_before, c.not_after, c.revoked_at, c.revoked_reason
         FROM agent_certificates c
         JOIN agents a ON a.id = c.agent_id
         WHERE a.user_id = $1 AND ${condition}
         ORDER BY c.created_at DESC
         LIMIT 1`,
        [req.session!.user.id, lookupValue],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Certificate not found" });
        return;
      }

      const cert = result.rows[0];
      const revoked = Boolean(cert.revoked_at);
      const nowMs = Date.now();
      const valid =
        !revoked &&
        new Date(cert.not_before).getTime() <= nowMs &&
        new Date(cert.not_after).getTime() > nowMs;

      res.setHeader("Cache-Control", "no-store");
      res.json({
        valid,
        revoked,
        not_before: cert.not_before,
        not_after: cert.not_after,
        revoked_at: cert.revoked_at,
        revoked_reason: cert.revoked_reason,
        serial: cert.serial,
        fingerprint_sha256: cert.fingerprint_sha256,
      });
    } catch (error: any) {
      console.error("Certificate status error:", error);
      res.status(500).json({ error: "Failed to check certificate status" });
    }
  },
);

/**
 * Public certificate status endpoint for relying parties (e.g., ClawAuth).
 * No authentication required - allows external services to check revocation.
 * Only supports fingerprint_sha256 lookup (not serial) for security.
 */
certsRouter.get(
  "/v1/certs/public-status",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db: Database = req.app.locals.db;
      const fingerprint =
        typeof req.query.fingerprint_sha256 === "string" &&
        req.query.fingerprint_sha256.length > 0
          ? req.query.fingerprint_sha256.toLowerCase()
          : null;

      if (!fingerprint) {
        res.status(400).json({
          error: "Missing required parameter: fingerprint_sha256",
        });
        return;
      }

      // Validate fingerprint format: must be 64 hex characters (SHA-256)
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
        res.status(400).json({
          error: "Invalid fingerprint_sha256: must be 64 hex characters",
        });
        return;
      }

      const result = await db.getPool().query(
        `SELECT c.not_before, c.not_after, c.revoked_at, c.revoked_reason
         FROM agent_certificates c
         WHERE c.fingerprint_sha256 = $1
         ORDER BY c.created_at DESC
         LIMIT 1`,
        [fingerprint],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Certificate not found" });
        return;
      }

      const cert = result.rows[0];
      const revoked = Boolean(cert.revoked_at);
      const nowMs = Date.now();
      const valid =
        !revoked &&
        new Date(cert.not_before).getTime() <= nowMs &&
        new Date(cert.not_after).getTime() > nowMs;

      res.setHeader("Cache-Control", "no-store");
      res.json({
        valid,
        revoked,
        not_before: cert.not_before,
        not_after: cert.not_after,
        revoked_at: cert.revoked_at,
        revoked_reason: cert.revoked_reason,
      });
    } catch (error: any) {
      console.error("Public certificate status error:", error);
      res.status(500).json({ error: "Failed to check certificate status" });
    }
  },
);

certsRouter.get(
  "/v1/certs/:serial",
  requireAuth,
  requireScope("agents:read"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db: Database = req.app.locals.db;
      const serial = req.params.serial;
      if (!serial) {
        res.status(400).json({ error: "Missing serial" });
        return;
      }

      const result = await db.getPool().query(
        `SELECT c.id, c.agent_id, c.kid, c.serial, c.fingerprint_sha256,
                c.not_before, c.not_after, c.revoked_at, c.revoked_reason, c.created_at,
                c.cert_pem, c.chain_pem, c.x5c,
                (c.revoked_at IS NULL AND c.not_before <= now() AND c.not_after > now()) AS is_active
         FROM agent_certificates c
         JOIN agents a ON a.id = c.agent_id
         WHERE a.user_id = $1 AND c.serial = $2
         ORDER BY c.created_at DESC
         LIMIT 1`,
        [req.session!.user.id, serial],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Certificate not found" });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Certificate get error:", error);
      res.status(500).json({ error: "Failed to fetch certificate" });
    }
  },
);

certsRouter.get("/.well-known/ca.pem", async (_req, res: Response): Promise<void> => {
  try {
    const ca = await getCertificateAuthority();
    res.setHeader("Content-Type", "application/x-pem-file");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(ca.certPem);
  } catch (error: any) {
    console.error("CA fetch error:", error);
    res.status(501).json({ error: "CA not configured" });
  }
});
