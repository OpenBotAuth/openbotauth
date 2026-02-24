/**
 * Input for verification request
 */
export interface VerificationRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  jwksUrl?: string;
}

/**
 * Agent information returned on successful verification
 */
export interface VerifiedAgent {
  jwks_url: string;
  kid: string;
  client_name?: string;
}

/**
 * Result of signature verification
 */
export interface VerificationResult {
  verified: boolean;
  agent?: VerifiedAgent;
  error?: string;
  created?: number;
  expires?: number;
}

/**
 * Options for VerifierClient constructor
 */
export interface VerifierClientOptions {
  /**
   * URL of the verifier service
   * @default "https://verifier.openbotauth.org/verify"
   */
  verifierUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 5000
   */
  timeoutMs?: number;
}

/**
 * Options for Express middleware
 */
export interface MiddlewareOptions {
  /**
   * URL of the verifier service
   * @default "https://verifier.openbotauth.org/verify"
   */
  verifierUrl?: string;

  /**
   * Middleware behavior mode
   * - "observe": Attach verification result but allow request to proceed
   * - "require-verified": Block requests that fail verification with 401
   * @default "observe"
   */
  mode?: 'observe' | 'require-verified';

  /**
   * Property name to attach verification result to request object
   * @default "oba"
   */
  attachProperty?: string;

  /**
   * Request timeout in milliseconds
   * @default 5000
   */
  timeoutMs?: number;
}

/**
 * Verification info attached to Express request
 */
export interface RequestVerificationInfo {
  signed: boolean;
  result?: VerificationResult;
}

/**
 * Result of header extraction
 */
export type HeaderExtractionResult =
  | { headers: Record<string, string>; error?: never }
  | { headers?: never; error: string };
