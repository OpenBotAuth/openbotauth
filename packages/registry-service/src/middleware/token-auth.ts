/**
 * Bearer token (PAT) authentication middleware
 *
 * Checks `Authorization: Bearer oba_...` and populates req.session
 * with the same shape as session middleware so downstream routes
 * work transparently.
 *
 * If the header is present and starts with `oba_`, this middleware
 * owns the response — it will never fall through to session auth on failure.
 */

import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Database } from '@openbotauth/github-connector';
import { createRateLimiter } from './rate-limit.js';

const TOKEN_RE = /^oba_[0-9a-f]{64}$/i;

/** Rate-limit failed auth attempts: 10 per minute per IP */
const authFailLimiter = createRateLimiter({
  max: 10,
  windowMs: 60_000,
  message: 'Too many authentication failures',
});

/**
 * SHA-256 hash a raw token string. Returns lowercase hex.
 */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function tokenAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  // No Authorization header at all — pass through to session middleware
  if (!authHeader) {
    next();
    return;
  }

  // Authorization header present but not a Bearer token — pass through
  if (!authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const rawToken = authHeader.slice(7); // strip "Bearer "

  // Non-oba_ bearer token — pass through (could be another scheme)
  if (!rawToken.startsWith('oba_')) {
    next();
    return;
  }

  // --- From here on, we OWN the response. No more next() on failure. ---

  // Apply rate limiter for failed attempts
  authFailLimiter(req, res, () => {
    /* not rate limited */
  });
  if (res.headersSent) {
    // Rate limiter already sent 429
    return;
  }

  // Validate format
  if (!TOKEN_RE.test(rawToken)) {
    res.status(401).json({ error: 'Malformed token' });
    return;
  }

  try {
    const db: Database = req.app.locals.db;
    const hash = hashToken(rawToken);

    const result = await db.getPool().query(
      `SELECT id, user_id, scopes, expires_at FROM api_tokens WHERE token_hash = $1`,
      [hash]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const token = result.rows[0];

    // Check expiry
    if (token.expires_at && new Date(token.expires_at) < new Date()) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }

    // Load user + profile
    const user = await db.findUserById(token.user_id);
    if (!user) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const profile = await db.findProfileByUserId(user.id);
    if (!profile) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Populate req.session with the same shape as session middleware
    req.session = {
      user: {
        id: user.id,
        email: user.email,
        github_username: user.github_username,
        avatar_url: user.avatar_url,
      },
      profile: {
        id: profile.id,
        username: profile.username,
        client_name: profile.client_name,
      },
    };

    req.authMethod = 'token';
    req.authTokenId = token.id;
    req.authScopes = token.scopes || [];

    // Fire-and-forget: update last_used_at
    db.getPool()
      .query(`UPDATE api_tokens SET last_used_at = now() WHERE id = $1`, [token.id])
      .catch((err) => console.error('Failed to update token last_used_at:', err));

    next();
  } catch (error) {
    console.error('Token auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
