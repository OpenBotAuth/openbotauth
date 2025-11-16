/**
 * Agent activity endpoints
 * 
 * Logs agent HTTP activity.
 * Implements the behavior from supabase/functions/agent-activity/index.ts
 */

import { Router, type Request, type Response } from 'express';
import type { Database } from '@openbotauth/github-connector';

export const activityRouter: Router = Router();

/**
 * POST /agent-activity
 * 
 * Log agent HTTP activity
 */
activityRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { agent_id, target_url, method, status_code, response_time_ms } = req.body;
    const db: Database = req.app.locals.db;

    // Validate required fields
    if (!agent_id || !target_url || !method || status_code === undefined) {
      res.status(400).json({
        error: 'Missing required fields: agent_id, target_url, method, status_code',
      });
      return;
    }

    // Insert activity log
    const result = await db.getPool().query(
      `INSERT INTO agent_activity (agent_id, target_url, method, status_code, response_time_ms)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [agent_id, target_url, method, status_code, response_time_ms || null]
    );

    const activityId = result.rows[0].id;

    res.json({
      success: true,
      activity_id: activityId,
    });
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

/**
 * GET /agent-activity/:agent_id
 * 
 * Get activity logs for an agent
 */
activityRouter.get('/:agent_id', async (req, res) => {
  try {
    const agentId = req.params.agent_id;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const db: Database = req.app.locals.db;

    const result = await db.getPool().query(
      `SELECT id, target_url, method, status_code, response_time_ms, timestamp
       FROM agent_activity
       WHERE agent_id = $1
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      [agentId, limit, offset]
    );

    res.json({
      activity: result.rows,
      count: result.rows.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

