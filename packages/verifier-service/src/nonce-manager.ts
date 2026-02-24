/**
 * Nonce Manager for Replay Protection
 * 
 * Tracks used nonces to prevent replay attacks
 */

const NONCE_TTL = 600; // 10 minutes default
const NONCE_PREFIX = 'nonce:';

export class NonceManager {
  constructor(
    private redis: any,
    private ttl: number = NONCE_TTL
  ) {}

  /**
   * Check if a nonce has been used
   * Returns true if nonce is fresh (not used)
   */
  async checkNonce(
    nonce: string,
    jwksUrl: string,
    kid: string,
    ttlSec?: number,
  ): Promise<boolean> {
    const key = this.buildNonceKey(nonce, jwksUrl, kid);
    
    // Check if nonce exists
    const exists = await this.redis.exists(key);
    
    if (exists) {
      console.warn(`Replay attack detected: nonce ${nonce} already used`);
      return false;
    }

    // Mark nonce as used
    const effectiveTtl = Math.max(1, Math.ceil(ttlSec ?? this.ttl));
    await this.redis.setEx(key, effectiveTtl, '1');
    return true;
  }

  /**
   * Build a unique key for the nonce
   * Includes JWKS URL and kid to scope nonces per agent
   */
  private buildNonceKey(nonce: string, jwksUrl: string, kid: string): string {
    // Create a stable identifier for the agent
    const agentId = Buffer.from(`${jwksUrl}:${kid}`).toString('base64url');
    return `${NONCE_PREFIX}${agentId}:${nonce}`;
  }

  /**
   * Check if a timestamp is within acceptable skew
   */
  checkTimestamp(
    created: number,
    expires?: number,
    maxSkewSec: number = 300
  ): { valid: boolean; error?: string } {
    const now = Math.floor(Date.now() / 1000);

    // Check created time (not too far in past or future)
    if (created > now + maxSkewSec) {
      return {
        valid: false,
        error: `Signature created time is too far in the future (created: ${created}, now: ${now})`,
      };
    }

    if (created < now - maxSkewSec) {
      return {
        valid: false,
        error: `Signature created time is too old (created: ${created}, now: ${now})`,
      };
    }

    // Check expiry if present
    if (expires) {
      if (expires < now) {
        return {
          valid: false,
          error: `Signature has expired (expires: ${expires}, now: ${now})`,
        };
      }

      // Expires should be after created
      if (expires < created) {
        return {
          valid: false,
          error: `Signature expires before it was created`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Clear all nonces (for testing)
   */
  async clearAll(): Promise<void> {
    const keys = await this.redis.keys(`${NONCE_PREFIX}*`);
    if (keys.length > 0) {
      await this.redis.del(keys);
      console.log(`Cleared ${keys.length} nonce entries`);
    }
  }
}
