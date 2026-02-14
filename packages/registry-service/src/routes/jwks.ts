/**
 * JWKS endpoints
 * 
 * Serves JSON Web Key Sets for users by username.
 * Implements the behavior from supabase/functions/jwks/index.ts
 */

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

    for (const agent of agentsResult.rows) {
      if (agent.public_key && typeof agent.public_key === 'object') {
        // Agent keys are already JWK format - use as-is, preserving their kid
        const agentJwk = {
          kty: agent.public_key.kty || 'OKP',
          crv: agent.public_key.crv || 'Ed25519',
          x: agent.public_key.x,
          kid: agent.public_key.kid, // Preserve portal-generated kid
          use: agent.public_key.use || 'sig',
          alg: agent.public_key.alg || 'EdDSA',
        };
        // Only add nbf/exp if we have created_at
        if (agent.created_at) {
          const createdAt = new Date(agent.created_at);
          (agentJwk as Record<string, unknown>).nbf = Math.floor(createdAt.getTime() / 1000);
          (agentJwk as Record<string, unknown>).exp = Math.floor(createdAt.getTime() / 1000) + 365 * 24 * 60 * 60;
        }
        jwks.push(agentJwk);
      }
    }

    if (jwks.length === 0) {
      res.status(404).json({ error: 'No public keys found for user' });
      return;
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
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(response);
  } catch (error) {
    console.error('Error in JWKS endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch JWKS' });
  }
});

