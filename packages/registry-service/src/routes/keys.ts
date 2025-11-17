/**
 * Public Keys API endpoints
 * 
 * Manage user public keys and key history
 */

import { Router, type Request, type Response } from 'express';
import type { Database } from '@openbotauth/github-connector';

export const keysRouter: Router = Router();

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
 * POST /keys
 * 
 * Register or update user's public key
 */
keysRouter.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const session = req.session!;
    const { public_key, is_update } = req.body;
    const db: Database = req.app.locals.db;

    if (!public_key) {
      res.status(400).json({ error: 'public_key is required' });
      return;
    }

    if (is_update) {
      // Update mode: deactivate old keys and add new one to history
      await db.getPool().query(
        `UPDATE key_history SET is_active = false WHERE user_id = $1 AND is_active = true`,
        [session.user.id]
      );

      // Add new key to history
      await db.getPool().query(
        `INSERT INTO key_history (user_id, public_key, is_active) VALUES ($1, $2, true)`,
        [session.user.id, public_key]
      );

      // Update public_keys table
      await db.getPool().query(
        `UPDATE public_keys SET public_key = $1 WHERE user_id = $2`,
        [public_key, session.user.id]
      );

      res.json({ success: true, message: 'Public key updated successfully' });
    } else {
      // Initial registration - insert or upsert
      const result = await db.getPool().query(
        `INSERT INTO public_keys (user_id, public_key)
         VALUES ($1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET public_key = $2
         RETURNING *`,
        [session.user.id, public_key]
      );

      // Also add to key history
      await db.getPool().query(
        `INSERT INTO key_history (user_id, public_key, is_active) VALUES ($1, $2, true)`,
        [session.user.id, public_key]
      );

      res.status(201).json({ 
        success: true, 
        message: 'Public key registered successfully',
        data: result.rows[0]
      });
    }
  } catch (error) {
    console.error('Error registering public key:', error);
    res.status(500).json({ error: 'Failed to register public key' });
  }
});

/**
 * GET /keys
 * 
 * Get current user's public key
 */
keysRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const session = req.session!;
    const db: Database = req.app.locals.db;

    const result = await db.getPool().query(
      `SELECT * FROM public_keys WHERE user_id = $1`,
      [session.user.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No public key found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching public key:', error);
    res.status(500).json({ error: 'Failed to fetch public key' });
  }
});

/**
 * GET /keys/history
 * 
 * Get key history for current user
 */
keysRouter.get('/history', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const session = req.session!;
    const db: Database = req.app.locals.db;

    const result = await db.getPool().query(
      `SELECT * FROM key_history WHERE user_id = $1 ORDER BY created_at DESC`,
      [session.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching key history:', error);
    res.status(500).json({ error: 'Failed to fetch key history' });
  }
});

