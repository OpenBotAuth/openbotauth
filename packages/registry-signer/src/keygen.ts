/**
 * Ed25519 key generation utilities
 */

import { generateKeyPairSync } from 'crypto';
import type { Ed25519KeyPair, Ed25519KeyPairRaw } from './types.js';

/**
 * Generate an Ed25519 key pair in PEM format
 */
export function generateKeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return {
    publicKey,
    privateKey,
  };
}

/**
 * Generate an Ed25519 key pair as raw buffers
 */
export function generateKeyPairRaw(): Ed25519KeyPairRaw {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'der',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'der',
    },
  });

  return {
    publicKey,
    privateKey,
  };
}

/**
 * Extract base64 from PEM format
 */
export function pemToBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
    .trim();
}

/**
 * Convert base64 to base64url format (RFC 4648)
 */
export function base64ToBase64Url(base64: string): string {
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Convert base64url to base64 format
 */
export function base64UrlToBase64(base64url: string): string {
  let base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  // Add padding if needed
  const padding = (4 - (base64.length % 4)) % 4;
  base64 += '='.repeat(padding);
  
  return base64;
}

/**
 * Extract raw Ed25519 public key bytes from SPKI DER format
 * SPKI format has a 12-byte header, then 32 bytes of Ed25519 public key
 */
export function extractEd25519PublicKeyFromSPKI(spkiDer: Buffer): Buffer {
  // Ed25519 public keys in SPKI format:
  // - Total length: 44 bytes
  // - Header: 12 bytes
  // - Public key: 32 bytes
  if (spkiDer.length !== 44) {
    throw new Error(`Invalid SPKI length: expected 44, got ${spkiDer.length}`);
  }
  
  return spkiDer.slice(12, 44);
}

/**
 * Extract raw Ed25519 private key bytes from PKCS8 DER format
 * PKCS8 format has a 16-byte header, then 32 bytes of Ed25519 private key
 */
export function extractEd25519PrivateKeyFromPKCS8(pkcs8Der: Buffer): Buffer {
  // Ed25519 private keys in PKCS8 format:
  // - Total length: 48 bytes
  // - Header: 16 bytes
  // - Private key: 32 bytes
  if (pkcs8Der.length !== 48) {
    throw new Error(`Invalid PKCS8 length: expected 48, got ${pkcs8Der.length}`);
  }
  
  return pkcs8Der.slice(16, 48);
}

