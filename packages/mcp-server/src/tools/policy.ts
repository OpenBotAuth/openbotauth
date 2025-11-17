/**
 * Policy Tool
 * Evaluates access policies for agents
 */

import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import { z } from 'zod';
import type { PolicyRequest, PolicyResult, PolicyRule } from '../types/index.js';

const PolicyRequestSchema = z.object({
  agent_id: z.string().describe('Agent identifier (JWKS URL or kid)'),
  resource_url: z.string().url().describe('URL of the resource being accessed'),
  resource_type: z.string().optional().describe('Type of resource (post, page, api, etc.)'),
  context: z.record(z.any()).optional().describe('Additional context for policy evaluation'),
});

export class PolicyTool {
  constructor(
    private db: Pool,
    private redis: RedisClientType
  ) {}

  /**
   * Get tool definition for MCP
   */
  getDefinition() {
    return {
      name: 'policy_apply',
      description: 'Evaluate access policy for an agent and resource. Returns whether access is allowed, denied, requires payment, or shows teaser.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id: {
            type: 'string',
            description: 'Agent identifier (JWKS URL or kid)',
          },
          resource_url: {
            type: 'string',
            description: 'URL of the resource being accessed',
          },
          resource_type: {
            type: 'string',
            description: 'Type of resource (post, page, api, etc.)',
          },
          context: {
            type: 'object',
            description: 'Additional context for policy evaluation',
          },
        },
        required: ['agent_id', 'resource_url'],
      },
    };
  }

  /**
   * Apply policy for an agent and resource
   */
  async apply(input: unknown): Promise<PolicyResult> {
    // Validate input
    const request = PolicyRequestSchema.parse(input);

    // Get policy for resource
    const policy = await this.getPolicy(request.resource_url);

    // Check whitelist
    if (policy.whitelist && this.matchesPattern(request.agent_id, policy.whitelist)) {
      await this.logAccess(request, 'allow', 'whitelisted');
      return { effect: 'allow', reason: 'Agent whitelisted' };
    }

    // Check blacklist
    if (policy.blacklist && this.matchesPattern(request.agent_id, policy.blacklist)) {
      await this.logAccess(request, 'deny', 'blacklisted');
      return { effect: 'deny', reason: 'Agent blacklisted' };
    }

    // Check rate limit
    if (policy.rate_limit) {
      const rateLimitResult = await this.checkRateLimit(request.agent_id, policy.rate_limit);
      if (!rateLimitResult.allowed) {
        await this.logAccess(request, 'rate_limit', 'exceeded');
        return {
          effect: 'rate_limit',
          reason: 'Rate limit exceeded',
          retry_after: rateLimitResult.retry_after,
        };
      }
    }

    // Check payment requirement
    if (policy.price_cents && policy.price_cents > 0) {
      const hasPaid = await this.checkPayment(request.agent_id, request.resource_url);
      if (!hasPaid) {
        await this.logAccess(request, 'pay', 'payment_required');
        return {
          effect: 'pay',
          price_cents: policy.price_cents,
          currency: policy.currency || 'USD',
          reason: 'Payment required',
        };
      }
    }

    // Apply default effect
    switch (policy.effect) {
      case 'deny':
        await this.logAccess(request, 'deny', 'policy_deny');
        return { effect: 'deny', reason: 'Policy denies access' };

      case 'teaser':
        await this.logAccess(request, 'teaser', 'policy_teaser');
        return {
          effect: 'teaser',
          teaser_words: policy.teaser_words || 100,
          reason: 'Teaser content only',
        };

      case 'allow':
      default:
        await this.logAccess(request, 'allow', 'policy_allow');
        return { effect: 'allow' };
    }
  }

  /**
   * Get policy for a resource
   */
  private async getPolicy(resourceUrl: string): Promise<PolicyRule> {
    // Try to get from cache
    const cacheKey = `policy:${resourceUrl}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get from database (simplified - in production, parse URL and query by domain/path)
    const result = await this.db.query(
      `SELECT policy FROM resource_policies WHERE resource_url = $1`,
      [resourceUrl]
    );

    let policy: PolicyRule;
    if (result.rows.length > 0) {
      policy = result.rows[0].policy;
    } else {
      // Default policy
      policy = {
        effect: 'allow',
        teaser_words: 0,
      };
    }

    // Cache for 5 minutes
    await this.redis.setEx(cacheKey, 300, JSON.stringify(policy));

    return policy;
  }

  /**
   * Check if agent matches any pattern
   */
  private matchesPattern(agentId: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      // Exact match
      if (pattern === agentId) {
        return true;
      }

      // Wildcard match
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(agentId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check rate limit for agent
   */
  private async checkRateLimit(
    agentId: string,
    rateLimit: { max_requests: number; window_seconds: number }
  ): Promise<{ allowed: boolean; retry_after?: number }> {
    const key = `rate:${agentId}`;
    const now = Date.now();
    const windowMs = rateLimit.window_seconds * 1000;

    // Get request timestamps
    const requests = await this.redis.zRangeByScore(key, now - windowMs, now);

    if (requests.length >= rateLimit.max_requests) {
      // Rate limit exceeded
      const oldestRequest = parseInt(requests[0]);
      const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
      return { allowed: false, retry_after: retryAfter };
    }

    // Add current request
    await this.redis.zAdd(key, { score: now, value: now.toString() });
    await this.redis.expire(key, rateLimit.window_seconds);

    // Clean old requests
    await this.redis.zRemRangeByScore(key, 0, now - windowMs);

    return { allowed: true };
  }

  /**
   * Check if agent has paid for resource
   */
  private async checkPayment(agentId: string, resourceUrl: string): Promise<boolean> {
    const key = `payment:${agentId}:${resourceUrl}`;
    const paid = await this.redis.get(key);
    return paid === 'paid';
  }

  /**
   * Log access attempt
   */
  private async logAccess(
    request: PolicyRequest,
    effect: string,
    reason: string
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO policy_logs (agent_id, resource_url, effect, reason, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [request.agent_id, request.resource_url, effect, reason]
      );
    } catch (error) {
      console.error('Failed to log access:', error);
      // Don't throw - logging failure shouldn't block policy evaluation
    }
  }
}

