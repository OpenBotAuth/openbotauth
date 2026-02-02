/**
 * Scope enforcement middleware for token-authenticated requests.
 *
 * Session-authenticated requests are allowed by default.
 */

import type { Request, Response, NextFunction } from 'express';

export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (req.authMethod === 'token') {
      const scopes = req.authScopes ?? [];
      if (!scopes.includes(scope)) {
        res.status(403).json({ error: 'Insufficient token scope' });
        return;
      }
    }

    next();
  };
}
