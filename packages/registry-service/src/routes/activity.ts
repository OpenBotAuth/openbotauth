/**
 * Agent activity endpoints
 *
 * Logs agent HTTP activity.
 * Implements the behavior from supabase/functions/agent-activity/index.ts
 */

import { Router, type Request, type Response } from 'express';
import type { Database } from '@openbotauth/github-connector';
import { requireScope } from '../middleware/scopes.js';

export const activityRouter: Router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

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
 * POST /agent-activity
 *
 * Log agent HTTP activity
 */
activityRouter.post(
  '/',
  requireAuth,
  requireScope('agents:write'),
  async (req: Request, res: Response): Promise<void> => {
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

      // Validate agent_id format
      if (typeof agent_id !== 'string' || !UUID_RE.test(agent_id)) {
        res.status(400).json({ error: 'agent_id must be a valid UUID' });
        return;
      }

      // Validate method
      const upperMethod = typeof method === 'string' ? method.toUpperCase() : '';
      if (!VALID_METHODS.has(upperMethod)) {
        res.status(400).json({ error: `method must be one of: ${[...VALID_METHODS].join(', ')}` });
        return;
      }

      // Validate status_code
      const code = Number(status_code);
      if (!Number.isInteger(code) || code < 100 || code > 599) {
        res.status(400).json({ error: 'status_code must be an integer between 100 and 599' });
        return;
      }

      // Validate target_url
      if (typeof target_url !== 'string' || target_url.length > 2048) {
        res.status(400).json({ error: 'target_url must be a string of at most 2048 characters' });
        return;
      }
      try {
        new URL(target_url);
      } catch {
        res.status(400).json({ error: 'target_url must be a valid URL' });
        return;
      }

      // Validate response_time_ms if provided
      if (response_time_ms !== undefined && response_time_ms !== null) {
        const rt = Number(response_time_ms);
        if (isNaN(rt) || rt < 0) {
          res.status(400).json({ error: 'response_time_ms must be a non-negative number' });
          return;
        }
      }

      // Verify agent ownership
      const ownerCheck = await db.getPool().query(
        `SELECT id FROM agents WHERE id = $1 AND user_id = $2`,
        [agent_id, req.session!.user.id]
      );
      if (ownerCheck.rows.length === 0) {
        res.status(403).json({ error: 'Agent not found or not owned by you' });
        return;
      }

      // Insert activity log
      const result = await db.getPool().query(
        `INSERT INTO agent_activity (agent_id, target_url, method, status_code, response_time_ms)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [agent_id, target_url, upperMethod, code, response_time_ms || null]
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
  }
);

/**
 * GET /agent-activity/:agent_id
 *
 * Get activity logs for an agent.
 * Public (no auth): returns redacted data (origin only, no response_time_ms).
 * Authenticated owner: returns full data.
 */
activityRouter.get(
  '/:agent_id',
  requireScope('agents:read'),
  async (req, res) => {
    try {
      const agentId = req.params.agent_id;
      const db: Database = req.app.locals.db;

      // Validate agent_id format
      if (!UUID_RE.test(agentId)) {
        res.status(400).json({ error: 'agent_id must be a valid UUID' });
        return;
      }

      // Determine if requester is the agent owner
      let isOwner = false;
      if (req.session) {
        const ownerCheck = await db.getPool().query(
          `SELECT id FROM agents WHERE id = $1 AND user_id = $2`,
          [agentId, req.session.user.id]
        );
        isOwner = ownerCheck.rows.length > 0;
      }

      // Cap limit to prevent abuse
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const result = await db.getPool().query(
        `SELECT id, target_url, method, status_code, response_time_ms, timestamp
         FROM agent_activity
         WHERE agent_id = $1
         ORDER BY timestamp DESC
         LIMIT $2 OFFSET $3`,
        [agentId, limit, offset]
      );

      // Redact for public view
      if (!isOwner) {
        const redacted = result.rows.map(row => {
          let origin: string;
          try { origin = new URL(row.target_url).origin; }
          catch { origin = 'unknown'; }
          return {
            id: row.id,
            origin,
            method: row.method,
            status_code: row.status_code,
            timestamp: row.timestamp,
          };
        });
        res.json({ activity: redacted, count: redacted.length, limit, offset });
        return;
      }

      // Full view for owner
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
  }
);
