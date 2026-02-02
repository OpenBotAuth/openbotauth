/**
 * Agent Management API endpoints
 * 
 * CRUD operations for agents
 */

import { Router, type Request, type Response } from 'express';
import type { Database } from '@openbotauth/github-connector';
import { validateJWK } from '@openbotauth/registry-signer';
import { requireScope } from '../middleware/require-scope.js';

export const agentsAPIRouter: Router = Router();

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
 * GET /agents
 * 
 * List all agents for the current user
 */
agentsAPIRouter.get('/', requireAuth, requireScope('agents:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const session = req.session!;
    const db: Database = req.app.locals.db;

    const result = await db.getPool().query(
      `SELECT id, user_id, name, description, agent_type, status, public_key, created_at, updated_at
       FROM agents
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [session.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * GET /agents/:id
 * 
 * Get a specific agent
 */
agentsAPIRouter.get('/:id', requireAuth, requireScope('agents:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const session = req.session!;
    const agentId = req.params.id;
    const db: Database = req.app.locals.db;

    const result = await db.getPool().query(
      `SELECT id, user_id, name, description, agent_type, status, public_key, created_at, updated_at
       FROM agents
       WHERE id = $1 AND user_id = $2`,
      [agentId, session.user.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting agent:', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

/**
 * POST /agents
 * 
 * Create a new agent
 */
agentsAPIRouter.post('/', requireAuth, requireScope('agents:write'), async (req: Request, res: Response): Promise<void> => {
  try {
    const session = req.session!;
    const { name, description, agent_type, public_key } = req.body;
    const db: Database = req.app.locals.db;

    // Validate required fields
    if (!name || !agent_type || !public_key) {
      res.status(400).json({ error: 'Missing required fields: name, agent_type, public_key' });
      return;
    }

    // Validate JWK
    if (!validateJWK(public_key)) {
      res.status(400).json({ error: 'Invalid JWK format' });
      return;
    }

    const result = await db.getPool().query(
      `INSERT INTO agents (user_id, name, description, agent_type, public_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, name, description, agent_type, status, public_key, created_at, updated_at`,
      [session.user.id, name, description || null, agent_type, JSON.stringify(public_key)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

/**
 * PUT /agents/:id
 * 
 * Update an agent
 */
agentsAPIRouter.put('/:id', requireAuth, requireScope('agents:write'), async (req: Request, res: Response): Promise<void> => {
  try {
    const session = req.session!;
    const agentId = req.params.id;
    const { name, description, agent_type, public_key, status } = req.body;
    const db: Database = req.app.locals.db;

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [agentId, session.user.id];
    let paramIndex = 3;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(description);
      paramIndex++;
    }

    if (agent_type !== undefined) {
      updates.push(`agent_type = $${paramIndex}`);
      values.push(agent_type);
      paramIndex++;
    }

    if (public_key !== undefined) {
      if (!validateJWK(public_key)) {
        res.status(400).json({ error: 'Invalid JWK format' });
        return;
      }
      updates.push(`public_key = $${paramIndex}`);
      values.push(JSON.stringify(public_key));
      paramIndex++;
    }

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push('updated_at = now()');

    const result = await db.getPool().query(
      `UPDATE agents
       SET ${updates.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, name, description, agent_type, status, public_key, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

/**
 * DELETE /agents/:id
 * 
 * Delete an agent
 */
agentsAPIRouter.delete('/:id', requireAuth, requireScope('agents:write'), async (req: Request, res: Response): Promise<void> => {
  try {
    const session = req.session!;
    const agentId = req.params.id;
    const db: Database = req.app.locals.db;

    const result = await db.getPool().query(
      `DELETE FROM agents
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [agentId, session.user.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json({ success: true, id: agentId });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});
