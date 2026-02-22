/**
 * Type definitions for bot CLI
 */

export interface BotConfig {
  jwks_url: string;
  kid: string;
  private_key: string; // PEM format
  public_key: string;  // Base64 format
  signature_agent_format?: "legacy" | "dict";
}

export interface SignedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface FetchResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  payment?: PaymentInfo;
}

export interface PaymentInfo {
  price_cents: number;
  currency: string;
  pay_url: string;
  request_hash: string;
}

export interface SignatureParams {
  created: number;
  expires: number;
  nonce: string;
  keyId: string;
  algorithm: string;
  headers: string[];
}
