/**
 * Signature Agent Card endpoint
 *
 * Serves /.well-known/signature-agent-card
 */

import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { Database } from "@openbotauth/github-connector";

export const signatureAgentCardRouter: Router = Router();

function deriveKidFromX(x: string): string {
  const canonical = JSON.stringify({ crv: "Ed25519", kty: "OKP", x });
  const hashBase64 = createHash("sha256").update(canonical).digest("base64");
  return hashBase64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

signatureAgentCardRouter.get(
  "/.well-known/signature-agent-card",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db: Database = req.app.locals.db;
      const agentId = typeof req.query.agent_id === "string" ? req.query.agent_id : null;
      const username = typeof req.query.username === "string" ? req.query.username : null;

      let agent: any = null;
      let profile: any = null;

      if (agentId) {
        const agentResult = await db.getPool().query(
          `SELECT * FROM agents WHERE id = $1`,
          [agentId],
        );
        agent = agentResult.rows[0] || null;
        if (agent) {
          profile = await db.findProfileByUserId(agent.user_id);
        }
      } else if (username) {
        profile = await db.findProfileByUsername(username);
        if (profile) {
          const agentResult = await db.getPool().query(
            `SELECT * FROM agents
             WHERE user_id = $1 AND status = 'active'
             ORDER BY created_at DESC
             LIMIT 1`,
            [profile.id],
          );
          agent = agentResult.rows[0] || null;
        }
      } else if (req.session) {
        const agentResult = await db.getPool().query(
          `SELECT * FROM agents
           WHERE user_id = $1 AND status = 'active'
           ORDER BY created_at DESC
           LIMIT 1`,
          [req.session.user.id],
        );
        agent = agentResult.rows[0] || null;
        if (agent) {
          profile = await db.findProfileByUserId(agent.user_id);
        }
      }

      if (!agent) {
        res.status(404).json({
          error: "Agent not found",
          message:
            "Provide ?agent_id=... or ?username=..., or authenticate to resolve a default agent",
        });
        return;
      }

      const pk = agent.public_key;
      if (!pk || typeof pk !== "object" || typeof pk.x !== "string") {
        res.status(400).json({ error: "Agent public key is invalid" });
        return;
      }

      const kid =
        typeof pk.kid === "string" && pk.kid.length > 0
          ? pk.kid
          : deriveKidFromX(pk.x);

      const agentJwk: Record<string, unknown> = {
        kty: "OKP",
        crv: "Ed25519",
        x: pk.x,
        kid,
        use: "sig",
        alg: "EdDSA",
      };

      // Include x5c if we have an issued cert for this kid
      const certResult = await db.getPool().query(
        `SELECT x5c
         FROM agent_certificates
         WHERE agent_id = $1 AND kid = $2 AND revoked_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [agent.id, kid],
      );
      if (certResult.rows.length > 0) {
        agentJwk.x5c = certResult.rows[0].x5c;
      }

      const card: Record<string, unknown> = {
        client_name: agent.name,
        client_uri: profile?.client_uri || undefined,
        contacts: profile?.contacts || undefined,
        "rfc9309-product-token": profile?.rfc9309_product_token || undefined,
        purpose: profile?.purpose ? [profile.purpose] : undefined,
        keys: { keys: [agentJwk] },
        oba_agent_id: agent.oba_agent_id || undefined,
        oba_parent_agent_id: agent.oba_parent_agent_id || undefined,
        oba_principal: agent.oba_principal || undefined,
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(card);
    } catch (error) {
      console.error("Error serving signature agent card:", error);
      res.status(500).json({ error: "Failed to serve signature agent card" });
    }
  },
);
