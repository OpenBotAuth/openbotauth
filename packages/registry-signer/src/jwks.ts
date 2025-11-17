/**
 * JWKS (JSON Web Key Set) utilities
 */

import { createHash } from 'crypto';
import { pemToBase64, base64ToBase64Url } from './keygen.js';
import type { JWK, JWKS, WebBotAuthJWKS } from './types.js';

/**
 * Generate a key ID (kid) from a public key
 * Uses SHA-256 hash of the key material
 */
export function generateKid(publicKeyPem: string): string {
  const base64 = pemToBase64(publicKeyPem);
  const hash = createHash('sha256').update(base64).digest('base64');
  return base64ToBase64Url(hash).substring(0, 16);
}

/**
 * Generate a kid from JWK
 */
export function generateKidFromJWK(jwk: Partial<JWK>): string {
  const data = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x });
  const hash = createHash('sha256').update(data).digest('base64');
  return base64ToBase64Url(hash).substring(0, 16);
}

/**
 * Convert an Ed25519 public key (PEM) to JWK format
 */
export function publicKeyToJWK(
  publicKeyPem: string,
  kid?: string,
  options?: {
    nbf?: number;
    exp?: number;
    alg?: 'EdDSA';
  }
): JWK {
  const base64 = pemToBase64(publicKeyPem);
  const base64url = base64ToBase64Url(base64);
  
  const jwk: JWK = {
    kty: 'OKP',
    crv: 'Ed25519',
    kid: kid || generateKid(publicKeyPem),
    x: base64url,
    use: 'sig',
  };

  if (options?.alg) {
    jwk.alg = options.alg;
  }

  if (options?.nbf !== undefined) {
    jwk.nbf = options.nbf;
  }

  if (options?.exp !== undefined) {
    jwk.exp = options.exp;
  }

  return jwk;
}

/**
 * Extract raw Ed25519 public key from SPKI format
 * SPKI format is 44 bytes: 12 bytes header + 32 bytes raw key
 */
function extractRawEd25519PublicKey(spkiBase64: string): string {
  const buffer = Buffer.from(spkiBase64, 'base64');
  
  // Ed25519 SPKI format: 12 bytes header + 32 bytes raw key
  if (buffer.length === 44) {
    // Extract last 32 bytes (the raw public key)
    const rawKey = buffer.slice(12);
    return base64ToBase64Url(rawKey.toString('base64'));
  }
  
  // If it's already 32 bytes, it's the raw key
  if (buffer.length === 32) {
    return base64ToBase64Url(spkiBase64);
  }
  
  // Otherwise, just convert to base64url as-is
  return base64ToBase64Url(spkiBase64);
}

/**
 * Convert a base64-encoded public key to JWK format
 * (Used when reading from database)
 */
export function base64PublicKeyToJWK(
  publicKeyBase64: string,
  kid: string,
  createdAt?: Date
): JWK {
  // Extract raw Ed25519 key from SPKI format
  const rawKeyBase64Url = extractRawEd25519PublicKey(publicKeyBase64);
  
  const jwk: JWK = {
    kty: 'OKP',
    crv: 'Ed25519',
    kid,
    x: rawKeyBase64Url,
    use: 'sig',
  };

  if (createdAt) {
    const createdTimestamp = Math.floor(createdAt.getTime() / 1000);
    jwk.nbf = createdTimestamp;
    jwk.exp = createdTimestamp + (365 * 24 * 60 * 60); // 1 year
  }

  return jwk;
}

/**
 * Create a JWKS (JSON Web Key Set) from multiple JWKs
 */
export function createJWKS(keys: JWK[]): JWKS {
  return { keys };
}

/**
 * Create a Web Bot Auth compliant JWKS response
 */
export function createWebBotAuthJWKS(
  keys: JWK[],
  metadata: {
    client_name: string;
    client_uri?: string;
    logo_uri?: string;
    contacts?: string[];
    expected_user_agent?: string;
    rfc9309_product_token?: string;
    rfc9309_compliance?: string[];
    trigger?: string;
    purpose?: string;
    targeted_content?: string;
    rate_control?: string;
    rate_expectation?: string;
    known_urls?: string[];
    known_identities?: string;
    verified?: boolean;
  }
): WebBotAuthJWKS {
  const jwks: WebBotAuthJWKS = {
    client_name: metadata.client_name,
    keys,
  };

  // Add optional fields
  if (metadata.client_uri) jwks.client_uri = metadata.client_uri;
  if (metadata.logo_uri) jwks.logo_uri = metadata.logo_uri;
  if (metadata.contacts && metadata.contacts.length > 0) jwks.contacts = metadata.contacts;
  if (metadata.expected_user_agent) jwks['expected-user-agent'] = metadata.expected_user_agent;
  if (metadata.rfc9309_product_token) jwks['rfc9309-product-token'] = metadata.rfc9309_product_token;
  if (metadata.rfc9309_compliance && metadata.rfc9309_compliance.length > 0) {
    jwks['rfc9309-compliance'] = metadata.rfc9309_compliance;
  }
  if (metadata.trigger) jwks.trigger = metadata.trigger;
  if (metadata.purpose) jwks.purpose = metadata.purpose;
  if (metadata.targeted_content) jwks['targeted-content'] = metadata.targeted_content;
  if (metadata.rate_control) jwks['rate-control'] = metadata.rate_control;
  if (metadata.rate_expectation) jwks['rate-expectation'] = metadata.rate_expectation;
  if (metadata.known_urls && metadata.known_urls.length > 0) jwks['known-urls'] = metadata.known_urls;
  if (metadata.known_identities) jwks['known-identities'] = metadata.known_identities;
  if (metadata.verified !== undefined) jwks.Verified = metadata.verified;

  return jwks;
}

/**
 * Validate a JWK for Ed25519
 */
export function validateJWK(jwk: unknown): jwk is JWK {
  if (typeof jwk !== 'object' || jwk === null) {
    return false;
  }

  const key = jwk as Record<string, unknown>;

  return (
    key.kty === 'OKP' &&
    key.crv === 'Ed25519' &&
    typeof key.kid === 'string' &&
    typeof key.x === 'string' &&
    key.use === 'sig'
  );
}

