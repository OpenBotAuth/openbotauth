/**
 * Agent JWKS endpoints
 * 
 * Serves JWKS for specific agents.
 * Implements the behavior from supabase/functions/agent-jwks/index.ts
 */

import { Router, type Request, type Response } from 'express';
import type { Database } from '@openbotauth/github-connector';
import { validateJWK, type JWK } from '@openbotauth/registry-signer';

export const agentRouter: Router = Router();

/**
 * GET /agent-jwks/{agent_id}
 * 
 * Serve JWKS for a specific agent
 */
agentRouter.get('/:agent_id', async (req: Request, res: Response): Promise<void> => {
  try {
    const agentId = req.params.agent_id;
    const db: Database = req.app.locals.db;

    // Get agent data
    const agentResult = await db.getPool().query(
      `SELECT id, user_id, name, description, agent_type, status, public_key, created_at
       FROM agents
       WHERE id = $1`,
      [agentId]
    );

    if (agentResult.rows.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const agent = agentResult.rows[0];

    // Get user profile for additional metadata
    const profile = await db.findProfileByUserId(agent.user_id);

    // Build response
    const response: Record<string, unknown> = {
      client_name: agent.name,
      agent_type: agent.agent_type,
      status: agent.status,
      created_at: agent.created_at,
    };

    // Add description if exists
    if (agent.description) {
      response.description = agent.description;
    }

    // Add profile metadata if exists
    if (profile) {
      if (profile.client_uri) response.client_uri = profile.client_uri;
      if (profile.logo_uri) response.logo_uri = profile.logo_uri;
      if (profile.contacts) response.contacts = profile.contacts;
      if (profile.expected_user_agent) response['expected-user-agent'] = profile.expected_user_agent;
      if (profile.rfc9309_product_token) response['rfc9309-product-token'] = profile.rfc9309_product_token;
      if (profile.rfc9309_compliance) response['rfc9309-compliance'] = profile.rfc9309_compliance;
      if (profile.trigger) response.trigger = profile.trigger;
      if (profile.purpose) response.purpose = profile.purpose;
      if (profile.targeted_content) response['targeted-content'] = profile.targeted_content;
      if (profile.rate_control) response['rate-control'] = profile.rate_control;
      if (profile.rate_expectation) response['rate-expectation'] = profile.rate_expectation;
      if (profile.known_urls) response['known-urls'] = profile.known_urls;
      if (profile.github_username) {
        response['known-identities'] = 'Github';
        response.Verified = true;
      }
    }

    // Add keys array (agent.public_key is already in JWK format from JSONB)
    const publicKey = agent.public_key as JWK;
    
    if (validateJWK(publicKey)) {
      response.keys = [publicKey];
    } else {
      console.error('Invalid JWK format for agent:', agentId);
      res.status(500).json({ error: 'Invalid key format' });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.json(response);
  } catch (error) {
    console.error('Error in agent JWKS endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch agent JWKS' });
  }
});

