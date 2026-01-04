/**
 * JWKS Cache with Redis backing
 * 
 * Fetches and caches JWKS from registry URLs
 */

import type { JWKSCache } from './types.js';

const JWKS_CACHE_TTL = 3600; // 1 hour default
const JWKS_CACHE_PREFIX = 'jwks:';

export class JWKSCacheManager {
  constructor(private redis: any) {}

  /**
   * Get JWKS from cache or fetch from URL
   */
  async getJWKS(jwksUrl: string): Promise<any> {
    const cacheKey = `${JWKS_CACHE_PREFIX}${jwksUrl}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        const cacheData: JWKSCache = JSON.parse(cached);
        const age = Date.now() - cacheData.fetched_at;
        
        // If cache is still valid, return it
        if (age < cacheData.ttl * 1000) {
          console.log(`JWKS cache hit for ${jwksUrl}`);
          return cacheData.jwks;
        }
      } catch (error) {
        console.error('Error parsing cached JWKS:', error);
      }
    }

    // Cache miss or expired, fetch from URL
    console.log(`JWKS cache miss for ${jwksUrl}, fetching...`);
    const jwks = await this.fetchJWKS(jwksUrl);

    // Store in cache
    const cacheData: JWKSCache = {
      jwks,
      fetched_at: Date.now(),
      ttl: JWKS_CACHE_TTL,
    };

    await this.redis.setEx(
      cacheKey,
      JWKS_CACHE_TTL,
      JSON.stringify(cacheData)
    );

    return jwks;
  }

  /**
   * Fetch JWKS from URL with SSRF protection
   */
  private async fetchJWKS(jwksUrl: string): Promise<any> {
    try {
      // SSRF protection: validate URL scheme and hostname
      const url = new URL(jwksUrl);

      // Only allow http/https schemes
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`Blocked JWKS fetch: invalid scheme ${url.protocol}`);
      }

      // Block localhost and private IP addresses
      const hostname = url.hostname.toLowerCase();
      const blockedHosts = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::1',
        '::',
        '[::1]',
      ];

      if (blockedHosts.includes(hostname)) {
        throw new Error(`Blocked JWKS fetch: private address ${hostname}`);
      }

      // Block private IP ranges (basic check)
      if (hostname.startsWith('10.') ||
          hostname.startsWith('192.168.') ||
          hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
        throw new Error(`Blocked JWKS fetch: private IP range ${hostname}`);
      }

      // Fetch with timeout and size limit
      const response = await fetch(jwksUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'OpenBotAuth-Verifier/0.1.0',
        },
        signal: AbortSignal.timeout(3000), // 3s timeout
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch JWKS: ${response.status} ${response.statusText}`);
      }

      // Limit response size to 1MB to prevent huge payloads
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 1024 * 1024) {
        throw new Error(`JWKS response too large: ${contentLength} bytes (max 1MB)`);
      }

      const jwks: any = await response.json();

      // Validate JWKS structure
      if (!jwks.keys || !Array.isArray(jwks.keys)) {
        throw new Error('Invalid JWKS format: missing keys array');
      }

      return jwks;
    } catch (error) {
      console.error(`Error fetching JWKS from ${jwksUrl}:`, error);
      throw error;
    }
  }

  /**
   * Find a specific key by kid in JWKS
   */
  async getKey(jwksUrl: string, kid: string): Promise<any> {
    const jwks: any = await this.getJWKS(jwksUrl);
    
    const key = jwks.keys?.find((k: any) => k.kid === kid);
    if (!key) {
      throw new Error(`Key with kid ${kid} not found in JWKS`);
    }

    return key;
  }

  /**
   * Invalidate cache for a specific JWKS URL
   */
  async invalidate(jwksUrl: string): Promise<void> {
    const cacheKey = `${JWKS_CACHE_PREFIX}${jwksUrl}`;
    await this.redis.del(cacheKey);
    console.log(`Invalidated JWKS cache for ${jwksUrl}`);
  }

  /**
   * Clear all JWKS cache
   */
  async clearAll(): Promise<void> {
    const keys = await this.redis.keys(`${JWKS_CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await this.redis.del(keys);
      console.log(`Cleared ${keys.length} JWKS cache entries`);
    }
  }
}

