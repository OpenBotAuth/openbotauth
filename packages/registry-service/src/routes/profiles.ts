/**
 * Profile API endpoints
 * 
 * User profile management
 */

import { Router, type Request, type Response } from 'express';
import { SAFE_PROFILE_COLUMNS, type Database } from '@openbotauth/github-connector';
import { requireScope } from '../middleware/require-scope.js';

export const profilesRouter: Router = Router();

/**
 * Middleware to check authentication
 */
const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

/**
 * GET /profiles
 * 
 * Get all profiles (public registry)
 */
profilesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const db: Database = req.app.locals.db;
    const pool = db.getPool();

    const result = await pool.query(
      `SELECT username, created_at 
       FROM profiles 
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing profiles:', error);
    res.status(500).json({ error: 'Failed to list profiles' });
  }
});

/**
 * GET /profiles/:username
 * 
 * Get profile by username (public)
 */
profilesRouter.get('/:username', async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.params.username;
    const db: Database = req.app.locals.db;

    const profile = await db.findProfileByUsername(username);

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json(profile);
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * PUT /profiles
 * 
 * Update current user's profile
 */
profilesRouter.put('/', requireAuth, requireScope('profile:write'), async (req: Request, res: Response): Promise<void> => {
  try {
    const session = req.session!;
    const db: Database = req.app.locals.db;

    const ARRAY_FIELDS = new Set(['contacts', 'known_urls', 'rfc9309_compliance']);
    const URI_FIELDS = new Set(['client_uri', 'logo_uri']);

    // Whitelist: only allow known safe profile columns
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (!SAFE_PROFILE_COLUMNS.has(key)) continue;

      // null is always acceptable (clears the field)
      if (value === null) {
        sanitized[key] = value;
        continue;
      }

      // Type validation for array fields
      if (ARRAY_FIELDS.has(key)) {
        if (!Array.isArray(value) || !value.every((v: unknown) => typeof v === 'string')) {
          res.status(400).json({ error: `${key} must be an array of strings or null` });
          return;
        }
        sanitized[key] = value;
        continue;
      }

      // Type validation for string fields
      if (typeof value !== 'string') {
        res.status(400).json({ error: `${key} must be a string or null` });
        return;
      }

      // URI length validation
      if (URI_FIELDS.has(key) && value.length > 2048) {
        res.status(400).json({ error: `${key} must be at most 2048 characters` });
        return;
      }

      sanitized[key] = value;
    }

    const updatedProfile = await db.updateProfile(session.user.id, sanitized);

    res.json(updatedProfile);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});
