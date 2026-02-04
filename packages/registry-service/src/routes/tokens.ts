/**
 * Token management routes
 *
 * CRUD endpoints for Personal Access Tokens (PATs).
 * All endpoints require session-cookie authentication — token auth
 * is explicitly rejected to prevent token-bootstrap attacks.
 */

import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { Database } from '@openbotauth/github-connector';
import { hashToken } from '../utils/crypto.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

export const tokensRouter: Router = Router();

const VALID_SCOPES = [
  'agents:read',
  'agents:write',
  'keys:read',
  'keys:write',
  'profile:read',
  'profile:write',
] as const;

export const MAX_TOKENS_PER_USER = 25;
const TOKEN_PREFIX_LEN = 4; // hex chars after "oba_" stored as prefix
const NAME_MAX_LEN = 100;

// Printable ASCII (space 0x20 through tilde 0x7E)
const PRINTABLE_ASCII_RE = /^[\x20-\x7e]+$/;

// UUID v4 format
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Guards ---

/**
 * Require session-cookie auth. Rejects unauthenticated and token-authed requests.
 */
function requireSessionAuth(req: Request, res: Response, next: Function) {
  if (!req.session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.authMethod === 'token') {
    res.status(403).json({ error: 'Token management requires session authentication' });
    return;
  }
  next();
}

// --- Rate limiters (per-user) ---

const createLimiter = createRateLimiter({
  max: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  keyExtractor: (req) => `create:${req.session?.user.id ?? 'anon'}`,
  message: 'Token creation rate limit exceeded',
});

const listLimiter = createRateLimiter({
  max: 60,
  windowMs: 60_000,
  keyExtractor: (req) => `list:${req.session?.user.id ?? 'anon'}`,
  message: 'Token list rate limit exceeded',
});

const deleteLimiter = createRateLimiter({
  max: 30,
  windowMs: 60_000,
  keyExtractor: (req) => `delete:${req.session?.user.id ?? 'anon'}`,
  message: 'Token deletion rate limit exceeded',
});

// --- Endpoints ---

/**
 * POST /auth/tokens
 *
 * Create a new personal access token. Returns the raw token exactly once.
 */
tokensRouter.post('/', requireSessionAuth, createLimiter, async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  try {
    const session = req.session!;
    const db: Database = req.app.locals.db;

    const { name, scopes, expires_in_days } = req.body;

    // Validate name
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > NAME_MAX_LEN) {
      res.status(400).json({ error: `name must be 1-${NAME_MAX_LEN} characters` });
      return;
    }
    if (!PRINTABLE_ASCII_RE.test(trimmedName)) {
      res.status(400).json({ error: 'name must contain only printable ASCII characters' });
      return;
    }

    // Validate scopes
    if (scopes != null && !Array.isArray(scopes)) {
      res.status(400).json({ error: 'scopes must be an array' });
      return;
    }
    const scopeArray: unknown[] = scopes ?? [];
    for (const s of scopeArray) {
      if (typeof s !== 'string') {
        res.status(400).json({ error: 'Each scope must be a string' });
        return;
      }
      if (!(VALID_SCOPES as readonly string[]).includes(s)) {
        res.status(400).json({ error: `Invalid scope: ${s}` });
        return;
      }
    }

    // Validate expires_in_days
    let expiresAt: Date | null = null;
    const days = expires_in_days ?? 90;
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) {
      res.status(400).json({ error: 'expires_in_days must be an integer between 1 and 365' });
      return;
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    // Check per-user limit
    const countResult = await db.getPool().query(
      `SELECT count(*)::int AS cnt FROM api_tokens WHERE user_id = $1`,
      [session.user.id]
    );
    if (countResult.rows[0].cnt >= MAX_TOKENS_PER_USER) {
      res.status(400).json({ error: `Maximum of ${MAX_TOKENS_PER_USER} tokens per user` });
      return;
    }

    // Generate token
    const rawHex = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const rawToken = `oba_${rawHex}`;
    const hash = hashToken(rawToken);
    const prefix = `oba_${rawHex.slice(0, TOKEN_PREFIX_LEN)}`;

    const result = await db.getPool().query(
      `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, token_prefix, scopes, expires_at, last_used_at, created_at`,
      [session.user.id, trimmedName, hash, prefix, scopeArray, expiresAt]
    );

    res.status(201).json({
      ...result.rows[0],
      token: rawToken, // returned exactly once
    });
  } catch (error) {
    console.error('Error creating token:', error);
    res.status(500).json({ error: 'Failed to create token' });
  }
});

/**
 * GET /auth/tokens
 *
 * List all tokens for the current user. Never returns raw token or hash.
 */
tokensRouter.get('/', requireSessionAuth, listLimiter, async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  try {
    const session = req.session!;
    const db: Database = req.app.locals.db;

    const result = await db.getPool().query(
      `SELECT id, name, token_prefix, scopes, expires_at, last_used_at, created_at
       FROM api_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [session.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing tokens:', error);
    res.status(500).json({ error: 'Failed to list tokens' });
  }
});

/**
 * DELETE /auth/tokens/:id
 *
 * Revoke (hard delete) a token.
 */
tokensRouter.delete('/:id', requireSessionAuth, deleteLimiter, async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const session = req.session!;
    const tokenId = req.params.id;
    const db: Database = req.app.locals.db;

    if (!UUID_RE.test(tokenId)) {
      res.status(400).json({ error: 'Invalid token id' });
      return;
    }

    const result = await db.getPool().query(
      `DELETE FROM api_tokens WHERE id = $1 AND user_id = $2 RETURNING id`,
      [tokenId, session.user.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    res.json({ success: true, id: tokenId });
  } catch (error) {
    console.error('Error deleting token:', error);
    res.status(500).json({ error: 'Failed to delete token' });
  }
});
