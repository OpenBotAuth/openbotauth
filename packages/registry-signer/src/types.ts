/**
 * Type definitions for key management and JWKS
 */

export interface Ed25519KeyPair {
  publicKey: string;   // PEM format
  privateKey: string;  // PEM format
}

export interface Ed25519KeyPairRaw {
  publicKey: Buffer;
  privateKey: Buffer;
}

export interface JWK {
  kty: 'OKP';
  crv: 'Ed25519';
  kid: string;
  x: string;  // base64url encoded public key
  use: 'sig';
  alg?: 'EdDSA';
  nbf?: number;  // not before (unix timestamp)
  exp?: number;  // expiration (unix timestamp)
}

export interface JWKS {
  keys: JWK[];
}

export interface WebBotAuthJWKS extends JWKS {
  client_name: string;
  client_uri?: string;
  logo_uri?: string;
  contacts?: string[];
  'expected-user-agent'?: string;
  'rfc9309-product-token'?: string;
  'rfc9309-compliance'?: string[];
  trigger?: string;
  purpose?: string;
  'targeted-content'?: string;
  'rate-control'?: string;
  'rate-expectation'?: string;
  'known-urls'?: string[];
  'known-identities'?: string;
  Verified?: boolean;
}

