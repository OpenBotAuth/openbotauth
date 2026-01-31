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

import type { Request, Response, NextFunction } from 'express';
import type { Database } from '@openbotauth/github-connector';
import { hashToken } from '../utils/crypto.js';

const TOKEN_RE = /^oba_[0-9a-f]{64}$/i;
const BEARER_RE = /^Bearer\s+(.+)$/i;

// --- Failure-only rate limiter (10 failures/min/IP) ---

const AUTH_FAIL_MAX = 10;
const AUTH_FAIL_WINDOW_MS = 60_000;

interface FailEntry {
  count: number;
  resetAt: number;
}

const failStore = new Map<string, FailEntry>();

const failCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failStore.entries()) {
    if (now > entry.resetAt) failStore.delete(key);
  }
}, 60_000);
failCleanup.unref();

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Record an auth failure and return true if the IP is over the limit.
 */
function recordFailure(req: Request): boolean {
  const ip = getClientIp(req);
  const now = Date.now();
  let entry = failStore.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + AUTH_FAIL_WINDOW_MS };
    failStore.set(ip, entry);
  }
  entry.count++;
  return entry.count > AUTH_FAIL_MAX;
}

function getRetryAfter(req: Request): number {
  const ip = getClientIp(req);
  const entry = failStore.get(ip);
  if (!entry) return 0;
  return Math.ceil((entry.resetAt - Date.now()) / 1000);
}

// Re-export for convenience (canonical source: utils/crypto.ts)
export { hashToken } from '../utils/crypto.js';

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

  // Parse Bearer token (case-insensitive, tolerant of extra whitespace)
  const bearerMatch = BEARER_RE.exec(authHeader);
  if (!bearerMatch) {
    next();
    return;
  }

  const rawToken = bearerMatch[1].trim();

  // Non-oba_ bearer token — pass through (could be another scheme)
  if (!rawToken.startsWith('oba_')) {
    next();
    return;
  }

  // --- From here on, we OWN the response. No more next() on failure. ---

  // Helper: record failure and return 429 if over limit, otherwise the given status
  const fail = (status: number, error: string): void => {
    if (recordFailure(req)) {
      const retryAfter = getRetryAfter(req);
      res.setHeader('Retry-After', retryAfter.toString());
      res.status(429).json({ error: 'Too many authentication failures', retry_after: retryAfter });
    } else {
      res.status(status).json({ error });
    }
  };

  // Validate format
  if (!TOKEN_RE.test(rawToken)) {
    fail(401, 'Malformed token');
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
      fail(401, 'Invalid token');
      return;
    }

    const token = result.rows[0];

    // Check expiry
    if (token.expires_at && new Date(token.expires_at) <= new Date()) {
      fail(401, 'Token expired');
      return;
    }

    // Load user + profile
    const user = await db.findUserById(token.user_id);
    if (!user) {
      fail(401, 'Invalid token');
      return;
    }

    const profile = await db.findProfileByUserId(user.id);
    if (!profile) {
      fail(401, 'Invalid token');
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
    recordFailure(req);
    res.status(500).json({ error: 'Internal server error' });
  }
}
