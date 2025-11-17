/**
 * Cache Middleware
 * Handles ETag generation, If-None-Match, and in-process caching
 */

import type { Request, Response, NextFunction } from 'express';
import type { AgentCard } from '../types.js';
import { generateETag, getCacheControl, getContentType } from '../card-template.js';

// In-process cache
let cachedCard: AgentCard | null = null;
let cachedETag: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Cache agent card in process
 */
export function cacheAgentCard(card: AgentCard) {
  cachedCard = card;
  cachedETag = generateETag(card);
  cacheTimestamp = Date.now();
}

/**
 * Get cached agent card if valid
 */
export function getCachedCard(): { card: AgentCard; etag: string } | null {
  if (!cachedCard || !cachedETag) {
    return null;
  }

  // Check if cache is still valid
  if (Date.now() - cacheTimestamp > CACHE_TTL) {
    cachedCard = null;
    cachedETag = null;
    return null;
  }

  return { card: cachedCard, etag: cachedETag };
}

/**
 * Cache middleware for agent card
 */
export function agentCardCache(getCard: () => AgentCard) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Try to get from cache
    let cached = getCachedCard();

    // If not cached, generate and cache
    if (!cached) {
      const card = getCard();
      cacheAgentCard(card);
      cached = getCachedCard();
    }

    if (!cached) {
      // Fallback if caching fails
      next();
      return;
    }

    const { card, etag } = cached;

    // Check If-None-Match
    const clientETag = req.headers['if-none-match'];
    if (clientETag === etag) {
      res.status(304).end();
      return;
    }

    // Set cache headers
    res.setHeader('Content-Type', getContentType());
    res.setHeader('Cache-Control', getCacheControl());
    res.setHeader('ETag', etag);

    // Attach card to response locals for handler
    res.locals.card = card;
    res.locals.etag = etag;

    next();
  };
}

