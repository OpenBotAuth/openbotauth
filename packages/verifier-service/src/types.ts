/**
 * Type definitions for the verifier service
 *
 * Implements types per RFC 9421 (HTTP Message Signatures) and the
 * IETF Web Bot Auth draft specification.
 *
 * References:
 * - RFC 9421: https://www.rfc-editor.org/rfc/rfc9421.html
 * - IETF Web Bot Auth: https://datatracker.ietf.org/doc/draft-meunier-web-bot-auth/
 */

export interface VerificationRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  /**
   * Optional out-of-band JWKS reference used when Signature-Agent is omitted.
   * Can be a direct directory/JWKS URL or an origin that supports discovery.
   */
  jwksUrl?: string;
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
