/**
 * Type definitions for the verifier service
 */

export interface VerificationRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface VerificationResult {
  verified: boolean;
  agent?: {
    jwks_url: string;
    kid: string;
    client_name?: string;
  };
  error?: string;
  created?: number;
  expires?: number;
}

export interface SignatureComponents {
  keyId: string;
  signature: string;
  algorithm: string;
  created?: number;
  expires?: number;
  nonce?: string;
  headers: string[];
}

export interface JWKSCache {
  jwks: any;
  fetched_at: number;
  ttl: number;
}

export interface PolicyVerdict {
  effect: 'allow' | 'pay' | 'deny' | 'rate_limit';
  price_cents?: number;
  request_hash?: string;
  pay_url?: string;
  retry_after?: number;
}

