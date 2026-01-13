/**
 * Sidecar configuration from environment
 */
export interface SidecarConfig {
  port: number;
  upstreamUrl: string;
  verifierUrl: string;
  mode: 'observe' | 'require-verified';
  timeoutMs: number;
  protectedPaths: string[];
}

/**
 * Request sent to the verifier service
 */
export interface VerifierRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Agent details from successful verification
 */
export interface AgentDetails {
  jwks_url: string;
  kid: string;
  client_name?: string;
}

/**
 * Response from the verifier service
 */
export interface VerifierResponse {
  verified: boolean;
  agent?: AgentDetails;
  error?: string;
  created?: number;
  expires?: number;
}

/**
 * Headers injected to upstream
 */
export interface OBAuthHeaders {
  'X-OBAuth-Verified': string;
  'X-OBAuth-Agent'?: string;
  'X-OBAuth-JWKS-URL'?: string;
  'X-OBAuth-Kid'?: string;
  'X-OBAuth-Error'?: string;
}
