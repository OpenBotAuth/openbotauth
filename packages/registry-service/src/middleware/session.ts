/**
 * Session middleware
 * 
 * Attaches session data to request object
 */

import type { Request, Response, NextFunction } from 'express';
import { parseSessionCookie, Database } from '@openbotauth/github-connector';

declare global {
  namespace Express {
    interface Request {
      session?: {
        user: {
          id: string;
          email: string | null;
          github_username: string | null;
          avatar_url: string | null;
        };
        profile: {
          id: string;
          username: string;
          client_name: string | null;
        };
      };
      authMethod?: 'session' | 'token';
      authTokenId?: string;
      authScopes?: string[];
    }
  }
}

export async function sessionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // If token-auth middleware already authenticated, skip cookie parsing
    if (req.session) {
      next();
      return;
    }

    const sessionToken = parseSessionCookie(req.headers.cookie || null);

    if (!sessionToken) {
      next();
      return;
    }

    const db: Database = req.app.locals.db;
    const result = await db.getUserWithProfileBySession(sessionToken);

    if (result) {
      req.session = {
        user: {
          id: result.user.id,
          email: result.user.email,
          github_username: result.user.github_username,
          avatar_url: result.user.avatar_url,
        },
        profile: {
          id: result.profile.id,
          username: result.profile.username,
          client_name: result.profile.client_name,
        },
      };
      req.authMethod = 'session';
    }

    next();
  } catch (error) {
    console.error('Session middleware error:', error);
    next();
  }
}

