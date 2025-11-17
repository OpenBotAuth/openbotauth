/**
 * CORS Middleware
 * Agent card: Allow cross-origin GET
 * A2A stubs: No CORS (prevent accidental use)
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * CORS middleware for agent card (allow cross-origin)
 */
export function agentCardCors(req: Request, res: Response, next: NextFunction) {
  // Allow cross-origin GET for discovery
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

/**
 * No CORS middleware for A2A stubs (prevent accidental use)
 */
export function a2aStubCors(req: Request, res: Response, next: NextFunction) {
  // No CORS headers - same-origin only
  // This prevents accidental cross-origin use of experimental endpoints
  next();
}

