/**
 * Reusable rate limiter factory
 *
 * In-memory sliding-window counter. Suitable for single-instance deployments.
 */

import type { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Maximum requests per window */
  max: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Extracts the key used to bucket requests (default: IP) */
  keyExtractor?: (req: Request) => string;
  /** Error message returned on 429 */
  message?: string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    max,
    windowMs,
    keyExtractor = (req) => req.ip || req.socket.remoteAddress || 'unknown',
    message = 'Too many requests',
  } = options;

  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup so the map doesn't grow unbounded
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 60_000);
  timer.unref();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = keyExtractor(req);
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      res.status(429).json({ error: message, retry_after: retryAfter });
      return;
    }

    res.setHeader('X-RateLimit-Limit', max.toString());
    res.setHeader('X-RateLimit-Remaining', (max - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000).toString());

    next();
  };
}
