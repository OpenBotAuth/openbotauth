/**
 * Mount A2A Card and Stub Endpoints
 * Provides Express middleware to mount agent card and A2A endpoints
 */

import type { Express, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import type { AgentCardConfig, TaskCreateResponse, ExperimentalResponse } from './types.js';
import { generateAgentCard } from './card-template.js';
import { agentCardCors, a2aStubCors } from './middleware/cors.js';
import { agentCardCache } from './middleware/cache.js';
import { rateLimit } from './middleware/rate-limit.js';

/**
 * Mount agent card and A2A endpoints
 */
export function mountAgentCard(app: Express, config: AgentCardConfig) {
  // Generate card from config
  const getCard = () => generateAgentCard(config);

  // Add Link header to root
  app.use((req, res, next) => {
    res.setHeader('Link', '</.well-known/agent-card.json>; rel="a2a-agent"');
    next();
  });

  // Agent Card endpoint
  app.get(
    '/.well-known/agent-card.json',
    agentCardCors,
    agentCardCache(getCard),
    (req: Request, res: Response) => {
      // Card is in res.locals from cache middleware
      const card = res.locals.card || getCard();
      res.json(card);
    }
  );

  // A2A stub endpoints
  if (config.enableA2A) {
    // Task creation endpoint
    app.post('/a2a/tasks/create', a2aStubCors, rateLimit, (req: Request, res: Response) => {
      const response: TaskCreateResponse = {
        task_id: `t_${randomUUID()}`,
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      res.status(202).json(response);
    });

    // Task events endpoint (SSE)
    app.get('/a2a/tasks/:id/events', a2aStubCors, rateLimit, (req: Request, res: Response) => {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send retry instruction
      res.write('retry: 1000\n\n');

      // Send heartbeat every 15 seconds
      const heartbeatInterval = setInterval(() => {
        const data = JSON.stringify({ ts: Date.now() });
        res.write(`event: heartbeat\ndata: ${data}\n\n`);
      }, 15000);

      // Timeout connection after 2 minutes
      const timeout = setTimeout(() => {
        clearInterval(heartbeatInterval);
        res.end();
      }, 2 * 60 * 1000);

      // Cleanup on client disconnect
      req.on('close', () => {
        clearInterval(heartbeatInterval);
        clearTimeout(timeout);
      });
    });
  } else {
    // Return 501 when A2A is disabled
    const notImplementedResponse: ExperimentalResponse = {
      experimental: true,
      message: 'A2A endpoints are experimental and currently disabled. Set ENABLE_A2A=true to enable.',
    };

    app.post('/a2a/tasks/create', a2aStubCors, rateLimit, (req: Request, res: Response) => {
      res.status(501).json(notImplementedResponse);
    });

    app.get('/a2a/tasks/:id/events', a2aStubCors, rateLimit, (req: Request, res: Response) => {
      res.status(501).json(notImplementedResponse);
    });
  }
}

