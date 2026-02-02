/**
 * Cryptographic utilities for token handling
 */

import crypto from 'node:crypto';

/**
 * SHA-256 hash a raw token string. Returns lowercase hex.
 */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
