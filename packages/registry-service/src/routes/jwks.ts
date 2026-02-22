/**
 * JWKS endpoints
 * 
 * Serves JSON Web Key Sets for users by username.
 * Implements the behavior from supabase/functions/jwks/index.ts
 */

import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { Database } from '@openbotauth/github-connector';
import { base64PublicKeyToJWK, createWebBotAuthJWKS, generateKidFromJWK } from '@openbotauth/registry-signer';

export const jwksRouter: Router = Router();

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
    const agentKids = new Set<string>();

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

      // Derive kid from x if missing (fallback using same thumbprint logic)
      let kid = pk.kid;
      if (typeof kid !== 'string' || kid.length === 0) {
        // Generate kid from x using SHA-256 thumbprint of canonical JWK (RFC 7638 style)
        const canonical = JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x: pk.x });
        const hashBase64 = createHash('sha256').update(canonical).digest('base64');
        // Convert to base64url (full length, no truncation to avoid collisions)
        kid = hashBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Agent ${agent.id}: derived kid ${kid} from x (was missing)`);
        }
      }

      // Track agent kids regardless of dedupe so x5c lookup can still bind.
      agentKids.add(kid);

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
    }

    if (jwks.length === 0) {
      res.status(404).json({ error: 'No public keys found for user' });
      return;
    }

    // Attach x5c for keys that have issued certificates
    const kidsForCerts = Array.from(agentKids);

    if (kidsForCerts.length > 0) {
      const certResult = await db.getPool().query(
        `SELECT DISTINCT ON (c.kid) c.kid, c.x5c
         FROM agent_certificates c
         JOIN agents a ON a.id = c.agent_id
         WHERE c.kid = ANY($1)
           AND c.revoked_at IS NULL
           AND a.user_id = $2
         ORDER BY c.kid, c.created_at DESC`,
        [kidsForCerts, profile.id]
      );

      const certByKid = new Map<string, any>();
      for (const row of certResult.rows) {
        certByKid.set(row.kid, row.x5c);
      }

      for (const jwk of jwks as any[]) {
        if (jwk.kid && agentKids.has(jwk.kid) && certByKid.has(jwk.kid)) {
          jwk.x5c = certByKid.get(jwk.kid);
        }
      }
    }

    // Build Web Bot Auth response
    const response = createWebBotAuthJWKS(jwks, {
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

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=300');
    res.json(response);
  } catch (error) {
    console.error('Error in JWKS endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch JWKS' });
  }
});
