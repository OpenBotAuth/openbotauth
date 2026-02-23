import { describe, it, expect } from 'vitest';
import {
  // Key generation
  generateKeyPair,
  generateKeyPairRaw,
  pemToBase64,
  base64ToBase64Url,
  base64UrlToBase64,
  extractEd25519PublicKeyFromSPKI,
  extractEd25519PrivateKeyFromPKCS8,
  // JWKS
  generateKid,
  generateKidFromJWK,
  generateLegacyKid,
  generateLegacyKidFromJWK,
  publicKeyToJWK,
  base64PublicKeyToJWK,
  createJWKS,
  createWebBotAuthJWKS,
  validateJWK,
  // Types
  type JWK,
} from './index.js';

describe('Key Generation', () => {
  describe('generateKeyPair', () => {
    it('should generate a valid Ed25519 key pair in PEM format', () => {
      const keyPair = generateKeyPair();

      expect(keyPair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keyPair.publicKey).toContain('-----END PUBLIC KEY-----');
      expect(keyPair.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
      expect(keyPair.privateKey).toContain('-----END PRIVATE KEY-----');
    });

    it('should generate unique key pairs on each call', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();

      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
    });
  });

  describe('generateKeyPairRaw', () => {
    it('should generate a valid Ed25519 key pair as DER buffers', () => {
      const keyPair = generateKeyPairRaw();

      expect(Buffer.isBuffer(keyPair.publicKey)).toBe(true);
      expect(Buffer.isBuffer(keyPair.privateKey)).toBe(true);
      // Ed25519 SPKI format is 44 bytes
      expect(keyPair.publicKey.length).toBe(44);
      // Ed25519 PKCS8 format is 48 bytes
      expect(keyPair.privateKey.length).toBe(48);
    });
  });
});

describe('Format Conversions', () => {
  describe('pemToBase64', () => {
    it('should extract base64 from public key PEM', () => {
      const pem = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAtest1234567890abcdefghijklmnopqrs=
-----END PUBLIC KEY-----`;

      const result = pemToBase64(pem);
      expect(result).toBe('MCowBQYDK2VwAyEAtest1234567890abcdefghijklmnopqrs=');
    });

    it('should extract base64 from private key PEM', () => {
      const pem = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIAtest1234567890abcdefghijklm=
-----END PRIVATE KEY-----`;

      const result = pemToBase64(pem);
      expect(result).toBe('MC4CAQAwBQYDK2VwBCIEIAtest1234567890abcdefghijklm=');
    });
  });

  describe('base64ToBase64Url', () => {
    it('should convert base64 to base64url format', () => {
      expect(base64ToBase64Url('abc+def/ghi=')).toBe('abc-def_ghi');
      expect(base64ToBase64Url('test==')).toBe('test');
    });

    it('should handle strings without special characters', () => {
      expect(base64ToBase64Url('abcdef')).toBe('abcdef');
    });
  });

  describe('base64UrlToBase64', () => {
    it('should convert base64url to base64 format', () => {
      expect(base64UrlToBase64('abc-def_ghi')).toBe('abc+def/ghi=');
    });

    it('should add correct padding', () => {
      expect(base64UrlToBase64('ab')).toBe('ab==');
      expect(base64UrlToBase64('abc')).toBe('abc=');
      expect(base64UrlToBase64('abcd')).toBe('abcd');
    });
  });

  describe('base64 roundtrip', () => {
    it('should roundtrip base64 <-> base64url', () => {
      // Note: padding is normalized (minimal padding added)
      const original = 'abc+def/ghi=';
      const base64url = base64ToBase64Url(original);
      const roundtrip = base64UrlToBase64(base64url);
      expect(roundtrip).toBe(original);
    });
  });
});

describe('Key Extraction', () => {
  describe('extractEd25519PublicKeyFromSPKI', () => {
    it('should extract 32-byte public key from 44-byte SPKI', () => {
      const keyPair = generateKeyPairRaw();
      const rawPublicKey = extractEd25519PublicKeyFromSPKI(keyPair.publicKey);

      expect(rawPublicKey.length).toBe(32);
    });

    it('should throw for invalid SPKI length', () => {
      const invalidBuffer = Buffer.alloc(30);
      expect(() => extractEd25519PublicKeyFromSPKI(invalidBuffer)).toThrow('Invalid SPKI length');
    });
  });

  describe('extractEd25519PrivateKeyFromPKCS8', () => {
    it('should extract 32-byte private key from 48-byte PKCS8', () => {
      const keyPair = generateKeyPairRaw();
      const rawPrivateKey = extractEd25519PrivateKeyFromPKCS8(keyPair.privateKey);

      expect(rawPrivateKey.length).toBe(32);
    });

    it('should throw for invalid PKCS8 length', () => {
      const invalidBuffer = Buffer.alloc(30);
      expect(() => extractEd25519PrivateKeyFromPKCS8(invalidBuffer)).toThrow('Invalid PKCS8 length');
    });
  });
});

describe('JWK Functions', () => {
  describe('generateKid', () => {
    it('should generate a full RFC 7638 thumbprint kid', () => {
      const keyPair = generateKeyPair();
      const kid = generateKid(keyPair.publicKey);

      expect(kid.length).toBe(43);
      // Should be base64url safe
      expect(kid).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate consistent kid for same key', () => {
      const keyPair = generateKeyPair();
      const kid1 = generateKid(keyPair.publicKey);
      const kid2 = generateKid(keyPair.publicKey);

      expect(kid1).toBe(kid2);
    });

    it('should generate different kids for different keys', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();

      expect(generateKid(keyPair1.publicKey)).not.toBe(generateKid(keyPair2.publicKey));
    });
  });

  describe('generateKidFromJWK', () => {
    it('should generate a full RFC 7638 thumbprint kid from JWK', () => {
      const keyPair = generateKeyPair();
      const jwk = publicKeyToJWK(keyPair.publicKey);
      const kid = generateKidFromJWK(jwk);

      expect(kid.length).toBe(43);
      expect(kid).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('legacy kid helpers', () => {
    it('should derive 16-char legacy kid from public key', () => {
      const keyPair = generateKeyPair();
      const fullKid = generateKid(keyPair.publicKey);
      const legacyKid = generateLegacyKid(keyPair.publicKey);

      expect(legacyKid).toBe(fullKid.slice(0, 16));
      expect(legacyKid.length).toBe(16);
    });

    it('should derive 16-char legacy kid from JWK', () => {
      const keyPair = generateKeyPair();
      const jwk = publicKeyToJWK(keyPair.publicKey);
      const fullKid = generateKidFromJWK(jwk);
      const legacyKid = generateLegacyKidFromJWK(jwk);

      expect(legacyKid).toBe(fullKid.slice(0, 16));
      expect(legacyKid.length).toBe(16);
    });
  });

  describe('publicKeyToJWK', () => {
    it('should create a valid JWK from public key PEM', () => {
      const keyPair = generateKeyPair();
      const jwk = publicKeyToJWK(keyPair.publicKey);

      expect(jwk.kty).toBe('OKP');
      expect(jwk.crv).toBe('Ed25519');
      expect(jwk.use).toBe('sig');
      expect(jwk.kid).toBeDefined();
      expect(jwk.x).toBeDefined();
    });

    it('should accept custom kid', () => {
      const keyPair = generateKeyPair();
      const customKid = 'my-custom-key-id';
      const jwk = publicKeyToJWK(keyPair.publicKey, customKid);

      expect(jwk.kid).toBe(customKid);
    });

    it('should accept options for nbf and exp', () => {
      const keyPair = generateKeyPair();
      const now = Math.floor(Date.now() / 1000);
      const jwk = publicKeyToJWK(keyPair.publicKey, undefined, {
        nbf: now,
        exp: now + 3600,
        alg: 'EdDSA',
      });

      expect(jwk.nbf).toBe(now);
      expect(jwk.exp).toBe(now + 3600);
      expect(jwk.alg).toBe('EdDSA');
    });
  });

  describe('base64PublicKeyToJWK', () => {
    it('should create a valid JWK from base64 public key', () => {
      const keyPair = generateKeyPair();
      const base64Key = pemToBase64(keyPair.publicKey);
      const jwk = base64PublicKeyToJWK(base64Key, 'test-kid');

      expect(jwk.kty).toBe('OKP');
      expect(jwk.crv).toBe('Ed25519');
      expect(jwk.kid).toBe('test-kid');
      expect(jwk.x).toBeDefined();
      expect(jwk.x.length).toBe(43); // 32 bytes = 43 chars in base64url without padding
    });

    it('should add nbf and exp when createdAt is provided', () => {
      const keyPair = generateKeyPair();
      const base64Key = pemToBase64(keyPair.publicKey);
      const createdAt = new Date('2024-01-01T00:00:00Z');
      const jwk = base64PublicKeyToJWK(base64Key, 'test-kid', createdAt);

      expect(jwk.nbf).toBe(Math.floor(createdAt.getTime() / 1000));
      expect(jwk.exp).toBe(jwk.nbf! + 365 * 24 * 60 * 60);
    });
  });

  describe('validateJWK', () => {
    it('should return true for valid JWK', () => {
      const keyPair = generateKeyPair();
      const jwk = publicKeyToJWK(keyPair.publicKey);

      expect(validateJWK(jwk)).toBe(true);
    });

    it('should return false for invalid inputs', () => {
      expect(validateJWK(null)).toBe(false);
      expect(validateJWK(undefined)).toBe(false);
      expect(validateJWK('string')).toBe(false);
      expect(validateJWK(123)).toBe(false);
      expect(validateJWK({})).toBe(false);
    });

    it('should return false for JWK with wrong kty', () => {
      const jwk = { kty: 'RSA', crv: 'Ed25519', kid: 'test', x: 'abc', use: 'sig' };
      expect(validateJWK(jwk)).toBe(false);
    });

    it('should return false for JWK with wrong crv', () => {
      const jwk = { kty: 'OKP', crv: 'P-256', kid: 'test', x: 'abc', use: 'sig' };
      expect(validateJWK(jwk)).toBe(false);
    });

    it('should return false for JWK missing required fields', () => {
      expect(validateJWK({ kty: 'OKP', crv: 'Ed25519' })).toBe(false);
      expect(validateJWK({ kty: 'OKP', crv: 'Ed25519', kid: 'test' })).toBe(false);
    });
  });
});

describe('JWKS Functions', () => {
  describe('createJWKS', () => {
    it('should create a JWKS from an array of JWKs', () => {
      const keyPair = generateKeyPair();
      const jwk = publicKeyToJWK(keyPair.publicKey);
      const jwks = createJWKS([jwk]);

      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0]).toBe(jwk);
    });

    it('should handle empty array', () => {
      const jwks = createJWKS([]);
      expect(jwks.keys).toHaveLength(0);
    });

    it('should handle multiple keys', () => {
      const keys: JWK[] = [];
      for (let i = 0; i < 3; i++) {
        const keyPair = generateKeyPair();
        keys.push(publicKeyToJWK(keyPair.publicKey));
      }

      const jwks = createJWKS(keys);
      expect(jwks.keys).toHaveLength(3);
    });
  });

  describe('createWebBotAuthJWKS', () => {
    it('should create a Web Bot Auth compliant JWKS', () => {
      const keyPair = generateKeyPair();
      const jwk = publicKeyToJWK(keyPair.publicKey);

      const jwks = createWebBotAuthJWKS([jwk], {
        client_name: 'TestBot',
      });

      expect(jwks.client_name).toBe('TestBot');
      expect(jwks.keys).toHaveLength(1);
    });

    it('should include optional metadata fields', () => {
      const keyPair = generateKeyPair();
      const jwk = publicKeyToJWK(keyPair.publicKey);

      const jwks = createWebBotAuthJWKS([jwk], {
        client_name: 'TestBot',
        client_uri: 'https://example.com',
        logo_uri: 'https://example.com/logo.png',
        contacts: ['admin@example.com'],
        expected_user_agent: 'TestBot/1.0',
        rfc9309_product_token: 'testbot',
        rfc9309_compliance: ['indexer', 'archiver'],
        trigger: 'scheduled',
        purpose: 'indexing',
        targeted_content: 'text/*',
        rate_control: 'crawl-delay',
        rate_expectation: '1r/s',
        known_urls: ['https://example.com/sitemap.xml'],
        known_identities: 'https://example.com/.well-known/jwks.json',
        verified: true,
      });

      expect(jwks.client_name).toBe('TestBot');
      expect(jwks.client_uri).toBe('https://example.com');
      expect(jwks.logo_uri).toBe('https://example.com/logo.png');
      expect(jwks.contacts).toEqual(['admin@example.com']);
      expect(jwks['expected-user-agent']).toBe('TestBot/1.0');
      expect(jwks['rfc9309-product-token']).toBe('testbot');
      expect(jwks['rfc9309-compliance']).toEqual(['indexer', 'archiver']);
      expect(jwks.trigger).toBe('scheduled');
      expect(jwks.purpose).toBe('indexing');
      expect(jwks['targeted-content']).toBe('text/*');
      expect(jwks['rate-control']).toBe('crawl-delay');
      expect(jwks['rate-expectation']).toBe('1r/s');
      expect(jwks['known-urls']).toEqual(['https://example.com/sitemap.xml']);
      expect(jwks['known-identities']).toBe('https://example.com/.well-known/jwks.json');
      expect(jwks.Verified).toBe(true);
    });

    it('should not include undefined optional fields', () => {
      const keyPair = generateKeyPair();
      const jwk = publicKeyToJWK(keyPair.publicKey);

      const jwks = createWebBotAuthJWKS([jwk], {
        client_name: 'TestBot',
      });

      expect(jwks).not.toHaveProperty('client_uri');
      expect(jwks).not.toHaveProperty('logo_uri');
      expect(jwks).not.toHaveProperty('contacts');
    });
  });
});
