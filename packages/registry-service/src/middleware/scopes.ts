import type { Request, Response, NextFunction } from 'express';

export type TokenScope =
  | 'agents:read'
  | 'agents:write'
  | 'keys:read'
  | 'keys:write'
  | 'profile:read'
  | 'profile:write';

const WRITE_IMPLIES_READ: Record<TokenScope, TokenScope | null> = {
  'agents:read': 'agents:write',
  'keys:read': 'keys:write',
  'profile:read': 'profile:write',
  'agents:write': null,
  'keys:write': null,
  'profile:write': null,
};

function hasScope(scopes: readonly string[], required: TokenScope): boolean {
  if (scopes.includes(required)) return true;
  const writeScope = WRITE_IMPLIES_READ[required];
  return Boolean(writeScope && scopes.includes(writeScope));
}

export function requireScope(required: TokenScope) {
  return function scopeMiddleware(req: Request, res: Response, next: NextFunction) {
    if (req.authMethod !== 'token') {
      next();
      return;
    }

    const scopes = req.authScopes ?? [];
    if (hasScope(scopes, required)) {
      next();
      return;
    }

    res.status(403).json({ error: 'Insufficient token scope', required });
  };
}
