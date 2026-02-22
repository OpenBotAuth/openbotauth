/**
 * Certificate issuance endpoints (MVP)
 */

import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { Database } from "@openbotauth/github-connector";
import { issueCertificateForJwk, getCertificateAuthority } from "../utils/ca.js";
import { requireScope } from "../middleware/scopes.js";

export const certsRouter: Router = Router();

const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

function deriveKidFromX(x: string): string {
  const canonical = JSON.stringify({ crv: "Ed25519", kty: "OKP", x });
  const hashBase64 = createHash("sha256").update(canonical).digest("base64");
  return hashBase64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

certsRouter.post(
  "/v1/certs/issue",
  requireAuth,
  requireScope("agents:write"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db: Database = req.app.locals.db;
      const { agent_id, kid } = req.body || {};

      if (!agent_id && !kid) {
        res.status(400).json({
          error: "Missing required input: agent_id or kid",
        });
        return;
      }

      let agent: any = null;
      if (agent_id) {
        const result = await db.getPool().query(
          `SELECT * FROM agents WHERE id = $1 AND user_id = $2`,
          [agent_id, req.session!.user.id],
        );
        agent = result.rows[0] || null;
      } else if (kid) {
        const result = await db.getPool().query(
          `SELECT * FROM agents
           WHERE user_id = $1 AND public_key->>'kid' = $2
           ORDER BY created_at DESC
           LIMIT 1`,
          [req.session!.user.id, kid],
        );
        agent = result.rows[0] || null;
      }

      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const pk = agent.public_key;
      if (!pk || typeof pk !== "object" || typeof pk.x !== "string") {
        res.status(400).json({ error: "Agent public key is invalid" });
        return;
      }

      const resolvedKid =
        typeof pk.kid === "string" && pk.kid.length > 0
          ? pk.kid
          : deriveKidFromX(pk.x);

      const subject = `CN=${agent.name || "OpenBotAuth Agent"}`;
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

      const issued = await issueCertificateForJwk(jwkForCert, subject, validityDays);

      await db.getPool().query(
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
      console.error("Certificate issuance error:", error);
      res.status(500).json({ error: error.message || "Failed to issue certificate" });
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

      if (!serial && !kid) {
        res.status(400).json({ error: "Missing required input: serial or kid" });
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

      const result = await db.getPool().query(
        `UPDATE agent_certificates c
         SET revoked_at = now(), revoked_reason = $3
         FROM agents a
         WHERE c.agent_id = a.id AND a.user_id = $1 AND ${condition}
         RETURNING c.id`,
        [...params, reason || null],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Certificate not found" });
        return;
      }

      res.json({ success: true, revoked: result.rows.length });
    } catch (error: any) {
      console.error("Certificate revocation error:", error);
      res.status(500).json({ error: error.message || "Failed to revoke certificate" });
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
    res.status(501).json({ error: error.message || "CA not configured" });
  }
});
