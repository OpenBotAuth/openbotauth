/**
 * Profile API endpoints
 * 
 * User profile management
 */

import { Router, type Request, type Response } from 'express';
import type { Database } from '@openbotauth/github-connector';

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
profilesRouter.put('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const session = req.session!;
    const updates = req.body;
    const db: Database = req.app.locals.db;

    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.created_at;
    delete updates.updated_at;

    const updatedProfile = await db.updateProfile(session.user.id, updates);

    res.json(updatedProfile);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

