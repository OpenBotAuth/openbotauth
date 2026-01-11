import type { Request, Response, NextFunction } from 'express';
import type { MiddlewareOptions, RequestVerificationInfo } from './types.js';
import { VerifierClient } from './client.js';
import { hasSignatureHeaders } from './headers.js';

/**
 * Express middleware for OpenBotAuth signature verification.
 *
 * This middleware:
 * 1. Checks if the request contains signature headers
 * 2. If signed, calls the verifier service to validate
 * 3. Attaches verification info to the request object
 * 4. Optionally blocks unverified requests (in "require-verified" mode)
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { openBotAuthMiddleware } from '@openbotauth/verifier-client/express';
 *
 * const app = express();
 *
 * // Observe mode (default) - allows all requests, attaches verification info
 * app.use(openBotAuthMiddleware());
 *
 * // Require verified mode - blocks unverified signed requests with 401
 * app.use('/protected', openBotAuthMiddleware({ mode: 'require-verified' }));
 *
 * app.get('/api/resource', (req, res) => {
 *   const oba = (req as any).oba;
 *   if (oba.signed && oba.result?.verified) {
 *     res.json({ message: 'Hello verified bot!', agent: oba.result.agent });
 *   } else {
 *     res.json({ message: 'Hello anonymous!' });
 *   }
 * });
 * ```
 */
export function openBotAuthMiddleware(
  options: MiddlewareOptions = {}
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const {
    verifierUrl,
    mode = 'observe',
    attachProperty = 'oba',
    timeoutMs,
  } = options;

  const client = new VerifierClient({ verifierUrl, timeoutMs });

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Convert Express headers to Record<string, string>
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      }
    }

    // Check if request has signature headers
    if (!hasSignatureHeaders(headers)) {
      // Not a signed request
      const info: RequestVerificationInfo = { signed: false };
      (req as unknown as Record<string, unknown>)[attachProperty] = info;
      next();
      return;
    }

    // Build the full URL for verification
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost';
    const url = `${protocol}://${host}${req.originalUrl}`;

    // Serialize body for verification
    // Align with verifier-service /authorize behavior: stringify objects
    let body: string | undefined;
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') {
        body = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        body = req.body.toString('utf-8');
      } else if (typeof req.body === 'object') {
        body = JSON.stringify(req.body);
      }
    }

    // Verify the request
    const result = await client.verify({
      method: req.method,
      url,
      headers: headers as Record<string, string>,
      body,
    });

    // Attach verification info to request
    const info: RequestVerificationInfo = { signed: true, result };
    (req as unknown as Record<string, unknown>)[attachProperty] = info;

    // In require-verified mode, block unverified requests
    if (mode === 'require-verified' && !result.verified) {
      res.status(401).json({
        error: 'Signature verification failed',
        details: result.error,
      });
      return;
    }

    next();
  };
}
