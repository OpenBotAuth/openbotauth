/**
 * JWKS endpoints
 * 
 * Serves JSON Web Key Sets for users by username.
 * Implements the behavior from supabase/functions/jwks/index.ts
 */

import { Router, type Request, type Response } from 'express';
import type { Database } from '@openbotauth/github-connector';
import {
  base64PublicKeyToJWK,
  createWebBotAuthJWKS,
  generateKidFromJWK,
  generateLegacyKidFromJWK,
} from '@openbotauth/registry-signer';
import { jwkThumbprint } from '../utils/jwk.js';

export const jwksRouter: Router = Router();

function withLegacyKidAliases(
  keys: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [...keys];
  const seenKids = new Set(
    keys
      .map((key) => (typeof key.kid === "string" ? key.kid : null))
      .filter((kid): kid is string => !!kid),
  );

  for (const key of keys) {
    if (
      key.kty !== "OKP" ||
      key.crv !== "Ed25519" ||
      typeof key.x !== "string" ||
      typeof key.kid !== "string"
    ) {
      continue;
    }

    const thumbprintInput = { kty: "OKP" as const, crv: "Ed25519" as const, x: key.x };
    const fullKid = generateKidFromJWK(thumbprintInput);
    const legacyKid = generateLegacyKidFromJWK(thumbprintInput);
    const aliasKid =
      key.kid === fullKid ? legacyKid : key.kid === legacyKid ? fullKid : null;

    if (!aliasKid || seenKids.has(aliasKid)) {
      continue;
    }

    seenKids.add(aliasKid);
    result.push({
      ...key,
      kid: aliasKid,
    });
  }

  return result;
}

/**
 * GET /jwks/{username}.json
 * 
 * Serve JWKS for a user's public keys
 */
jwksRouter.get('/:username.json', async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.params.username;
    const db: Database = req.app.locals.db;

    // Get user profile
    const profile = await db.findProfileByUsername(username);
    
    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get all active keys from key_history
    const keyHistoryResult = await db.getPool().query(
      `SELECT id, public_key, created_at
       FROM key_history
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [profile.id]
    );

    let keys: Array<{ id: string; public_key: string; created_at: Date }> = keyHistoryResult.rows;

    // Fallback to public_keys table if no key history
    if (keys.length === 0) {
      const publicKeyResult = await db.getPool().query(
        `SELECT id, public_key, created_at
         FROM public_keys
         WHERE user_id = $1`,
        [profile.id]
      );

      if (publicKeyResult.rows.length > 0) {
        keys = publicKeyResult.rows;
      }
    }

    // Convert user keys to JWK format, deriving kid from key material (not DB UUID)
    const jwks = keys.map(keyData => {
      const jwk = base64PublicKeyToJWK(
        keyData.public_key,
        keyData.id,
        keyData.created_at
      );
      jwk.kid = generateKidFromJWK(jwk);
      return jwk;
    });

    // Also include agent keys (already stored as JWK in JSONB)
    const agentsResult = await db.getPool().query(
      `SELECT id, public_key, created_at
       FROM agents
       WHERE user_id = $1 AND status = 'active'`,
      [profile.id]
    );

    // Track seen kids to dedupe (filter out any undefined/empty kids)
    const seenKids = new Set(
      jwks.map(k => k.kid).filter((k): k is string => typeof k === 'string' && k.length > 0)
    );
    const agentJwkRefs: Array<{ agentId: string; kid: string; jwk: Record<string, unknown> }> = [];

    for (const agent of agentsResult.rows) {
      const pk = agent.public_key;

      // Validate: must be object with non-empty x string
      if (!pk || typeof pk !== 'object') {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Skipping agent ${agent.id}: public_key is not an object`);
        }
        continue;
      }
      if (typeof pk.x !== 'string' || pk.x.length === 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Skipping agent ${agent.id}: missing or invalid x value`);
        }
        continue;
      }

      // Derive kid from x if missing (RFC 7638 OKP thumbprint)
      let kid = pk.kid;
      if (typeof kid !== 'string' || kid.length === 0) {
        kid = jwkThumbprint({ kty: 'OKP', crv: 'Ed25519', x: pk.x });
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Agent ${agent.id}: derived kid ${kid} from x (was missing)`);
        }
      }

      // Dedupe by kid
      if (seenKids.has(kid)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Skipping agent ${agent.id}: duplicate kid ${kid}`);
        }
        continue;
      }
      seenKids.add(kid);

      // Build validated JWK with proper typing
      const agentJwk = {
        kty: 'OKP' as const,
        crv: 'Ed25519' as const,
        x: pk.x as string,
        kid,
        use: 'sig' as const,
        alg: 'EdDSA' as const,
        nbf: undefined as number | undefined,
        exp: undefined as number | undefined,
      };

      // Add nbf/exp if we have created_at
      if (agent.created_at) {
        const createdAt = new Date(agent.created_at);
        agentJwk.nbf = Math.floor(createdAt.getTime() / 1000);
        agentJwk.exp = Math.floor(createdAt.getTime() / 1000) + 365 * 24 * 60 * 60;
      }

      jwks.push(agentJwk);
      agentJwkRefs.push({ agentId: agent.id, kid, jwk: agentJwk as unknown as Record<string, unknown> });
    }

    if (jwks.length === 0) {
      res.status(404).json({ error: 'No public keys found for user' });
      return;
    }

    // Attach x5c for keys that have issued certificates
    const kidsForCerts = Array.from(new Set(agentJwkRefs.map(ref => ref.kid)));
    const agentIdsForCerts = Array.from(new Set(agentJwkRefs.map(ref => ref.agentId)));

    if (kidsForCerts.length > 0 && agentIdsForCerts.length > 0) {
      const certResult = await db.getPool().query(
        `SELECT DISTINCT ON (c.agent_id, c.kid) c.agent_id, c.kid, c.x5c
         FROM agent_certificates c
         JOIN agents a ON a.id = c.agent_id
         WHERE c.agent_id = ANY($1)
           AND c.kid = ANY($2)
           AND c.revoked_at IS NULL
           AND c.not_before <= now()
           AND c.not_after > now()
           AND a.user_id = $3
         ORDER BY c.agent_id, c.kid, c.created_at DESC`,
        [agentIdsForCerts, kidsForCerts, profile.id]
      );

      const certByAgentKid = new Map<string, unknown>();
      for (const row of certResult.rows) {
        certByAgentKid.set(`${row.agent_id}:${row.kid}`, row.x5c);
      }

      for (const ref of agentJwkRefs) {
        const certKey = `${ref.agentId}:${ref.kid}`;
        if (certByAgentKid.has(certKey)) {
          ref.jwk.x5c = certByAgentKid.get(certKey);
        }
      }
    }

    // Build Web Bot Auth response
    const response = createWebBotAuthJWKS(withLegacyKidAliases(jwks as unknown as Array<Record<string, unknown>>) as any, {
      client_name: profile.client_name || profile.username,
      client_uri: profile.client_uri || undefined,
      logo_uri: profile.logo_uri || undefined,
      contacts: profile.contacts || undefined,
      expected_user_agent: profile.expected_user_agent || undefined,
      rfc9309_product_token: profile.rfc9309_product_token || undefined,
      rfc9309_compliance: profile.rfc9309_compliance || undefined,
      trigger: profile.trigger || undefined,
      purpose: profile.purpose || undefined,
      targeted_content: profile.targeted_content || undefined,
      rate_control: profile.rate_control || undefined,
      rate_expectation: profile.rate_expectation || undefined,
      known_urls: profile.known_urls || undefined,
      known_identities: profile.github_username ? 'Github' : undefined,
      verified: false, // Placeholder
    });

    res.setHeader('Content-Type', 'application/http-message-signatures-directory+json');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=300');
    res.json(response);
  } catch (error) {
    console.error('Error in JWKS endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch JWKS' });
  }
});
