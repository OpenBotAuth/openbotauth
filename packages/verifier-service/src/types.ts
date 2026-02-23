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
  /** Signature label from Signature-Input (e.g., "sig1") */
  label: string;
  keyId: string;
  signature: string;
  algorithm: string;
  /** RFC 9421/WBA tag parameter from Signature-Input (e.g., web-bot-auth) */
  tag?: string;
  created?: number;
  expires?: number;
  nonce?: string;
  headers: string[];
  /** Raw @signature-params value from Signature-Input (after stripping label) */
  rawSignatureParams: string;
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
