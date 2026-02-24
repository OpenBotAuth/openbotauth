/**
 * Tests for SignatureVerifier - specifically trusted directory validation
 */

import { describe, it, expect, vi } from "vitest";
import { SignatureVerifier } from "./signature-verifier.js";

// Mock dependencies
const mockJwksCache = {
  getKey: vi.fn(),
  getJWKS: vi.fn(),
};

const mockNonceManager = {
  checkTimestamp: vi.fn(),
  checkNonce: vi.fn(),
};

describe("SignatureVerifier - Trusted Directory Validation", () => {
  // Access the private method via prototype for testing
  function isTrustedDirectory(
    trustedDirectories: string[],
    jwksUrl: string
  ): boolean {
    const verifier = new SignatureVerifier(
      mockJwksCache as any,
      mockNonceManager as any,
      trustedDirectories
    );
    // Access private method for testing
    return (verifier as any).isTrustedDirectory(jwksUrl);
  }

  describe("exact hostname matching", () => {
    it("should accept exact hostname match", () => {
      expect(
        isTrustedDirectory(
          ["openbotregistry.example.com"],
          "https://openbotregistry.example.com/jwks.json"
        )
      ).toBe(true);
    });

    it("should accept exact match with different path", () => {
      expect(
        isTrustedDirectory(
          ["openbotregistry.example.com"],
          "https://openbotregistry.example.com/.well-known/jwks.json"
        )
      ).toBe(true);
    });

    it("should accept exact match with port", () => {
      expect(
        isTrustedDirectory(
          ["openbotregistry.example.com"],
          "https://openbotregistry.example.com:443/jwks.json"
        )
      ).toBe(true);
    });

    it("should be case insensitive", () => {
      expect(
        isTrustedDirectory(
          ["OpenBotRegistry.Example.COM"],
          "https://openbotregistry.example.com/jwks.json"
        )
      ).toBe(true);
    });
  });

  describe("subdomain matching", () => {
    it("should accept subdomain of trusted directory", () => {
      expect(
        isTrustedDirectory(
          ["example.com"],
          "https://openbotregistry.example.com/jwks.json"
        )
      ).toBe(true);
    });

    it("should accept nested subdomain", () => {
      expect(
        isTrustedDirectory(
          ["example.com"],
          "https://api.registry.example.com/jwks.json"
        )
      ).toBe(true);
    });
  });

  describe("security: substring bypass prevention", () => {
    it("should reject URL with trusted string in path", () => {
      expect(
        isTrustedDirectory(
          ["openbotregistry.example.com"],
          "https://attacker.com/openbotregistry.example.com/fake.json"
        )
      ).toBe(false);
    });

    it("should reject URL with trusted string in query parameter", () => {
      expect(
        isTrustedDirectory(
          ["openbotregistry.example.com"],
          "https://attacker.com/jwks.json?domain=openbotregistry.example.com"
        )
      ).toBe(false);
    });

    it("should reject hostname containing trusted string as suffix", () => {
      expect(
        isTrustedDirectory(
          ["openbotregistry.example.com"],
          "https://evil-openbotregistry.example.com.attacker.com/jwks.json"
        )
      ).toBe(false);
    });

    it("should reject hostname containing trusted string as prefix", () => {
      expect(
        isTrustedDirectory(
          ["example.com"],
          "https://example.com.attacker.com/jwks.json"
        )
      ).toBe(false);
    });

    it("should reject partial hostname match without dot boundary", () => {
      expect(
        isTrustedDirectory(
          ["example.com"],
          "https://notexample.com/jwks.json"
        )
      ).toBe(false);
    });

    it("should reject completely different domain", () => {
      expect(
        isTrustedDirectory(
          ["openbotregistry.example.com"],
          "https://attacker.com/jwks.json"
        )
      ).toBe(false);
    });
  });

  describe("trusted directory format handling", () => {
    it("should handle trusted directory with https:// prefix", () => {
      expect(
        isTrustedDirectory(
          ["https://openbotregistry.example.com"],
          "https://openbotregistry.example.com/jwks.json"
        )
      ).toBe(true);
    });

    it("should enforce scheme when trusted directory includes scheme", () => {
      expect(
        isTrustedDirectory(
          ["https://openbotregistry.example.com"],
          "http://openbotregistry.example.com/jwks.json"
        )
      ).toBe(false);
    });

    it("should enforce default port when scheme is pinned", () => {
      expect(
        isTrustedDirectory(
          ["https://openbotregistry.example.com"],
          "https://openbotregistry.example.com:8443/jwks.json"
        )
      ).toBe(false);
    });

    it("should handle trusted directory with http:// prefix", () => {
      expect(
        isTrustedDirectory(
          ["http://localhost:8080"],
          "http://localhost:8080/jwks.json"
        )
      ).toBe(true);
    });

    it("should handle trusted directory without scheme", () => {
      expect(
        isTrustedDirectory(
          ["openbotregistry.example.com"],
          "https://openbotregistry.example.com/jwks.json"
        )
      ).toBe(true);
    });

    it("should handle multiple trusted directories", () => {
      const trustedDirs = [
        "registry.openbotauth.com",
        "chatgpt.com",
        "localhost:8080",
      ];

      expect(
        isTrustedDirectory(trustedDirs, "https://registry.openbotauth.com/jwks.json")
      ).toBe(true);

      expect(
        isTrustedDirectory(trustedDirs, "https://chatgpt.com/.well-known/jwks.json")
      ).toBe(true);

      expect(
        isTrustedDirectory(trustedDirs, "https://localhost:8080/jwks.json")
      ).toBe(true);

      expect(
        isTrustedDirectory(trustedDirs, "https://localhost:9999/jwks.json")
      ).toBe(false);

      expect(
        isTrustedDirectory(trustedDirs, "https://attacker.com/jwks.json")
      ).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should return false for invalid JWKS URL", () => {
      expect(
        isTrustedDirectory(
          ["example.com"],
          "not-a-valid-url"
        )
      ).toBe(false);
    });

    it("should handle empty trusted directories array", () => {
      // When there are no trusted directories, the check in verify() is skipped
      // but isTrustedDirectory itself should return false for empty array
      const verifier = new SignatureVerifier(
        mockJwksCache as any,
        mockNonceManager as any,
        []
      );
      expect((verifier as any).isTrustedDirectory("https://example.com/jwks.json")).toBe(false);
    });
  });
});

describe("SignatureVerifier - Algorithm Validation", () => {
  it("should reject unsupported signature algorithm in Signature-Input", async () => {
    const mockJwksCacheForAlg = {
      getKey: vi.fn().mockResolvedValue({ kty: "OKP", crv: "Ed25519", x: "abc" }),
      getJWKS: vi.fn().mockResolvedValue({ keys: [] }),
    };
    const mockNonceManagerForAlg = {
      checkTimestamp: vi.fn().mockReturnValue({ valid: true }),
      checkNonce: vi.fn().mockResolvedValue(true),
    };

    const verifier = new SignatureVerifier(
      mockJwksCacheForAlg as any,
      mockNonceManagerForAlg as any,
      []
    );

    // This test checks that verify() rejects non-ed25519 algorithms
    // We need to construct a request that would get past header parsing
    const result = await verifier.verify({
      method: "GET",
      url: "https://example.com/test",
      headers: {
        "signature-input": 'sig1=("@method" "@authority");created=1700000000;expires=1700000300;keyid="k1";alg="rsa-sha256";tag="web-bot-auth"',
        "signature": "sig1=:dGVzdA==:",
      },
      jwksUrl: "https://example.com/jwks.json",
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("Unsupported signature algorithm");
    expect(result.error).toContain("rsa-sha256");
  });

  it("should accept ed25519 algorithm (case insensitive)", async () => {
    const mockJwksCacheForAlg = {
      getKey: vi.fn().mockResolvedValue({ kty: "OKP", crv: "Ed25519", x: "abc" }),
      getJWKS: vi.fn().mockResolvedValue({ keys: [] }),
    };
    const mockNonceManagerForAlg = {
      checkTimestamp: vi.fn().mockReturnValue({ valid: true }),
      checkNonce: vi.fn().mockResolvedValue(true),
    };

    const verifier = new SignatureVerifier(
      mockJwksCacheForAlg as any,
      mockNonceManagerForAlg as any,
      []
    );

    // This should pass algorithm validation (Ed25519 uppercase)
    const result = await verifier.verify({
      method: "GET",
      url: "https://example.com/test",
      headers: {
        "signature-input": 'sig1=("@method" "@authority");created=1700000000;expires=1700000300;keyid="k1";alg="Ed25519";tag="web-bot-auth"',
        "signature": "sig1=:dGVzdA==:",
      },
      jwksUrl: "https://example.com/jwks.json",
    });

    // It should fail later (signature verification) but not on algorithm check
    expect(result.error).not.toContain("Unsupported signature algorithm");
  });

  it("should reject JWK with non-Ed25519 key type", async () => {
    const mockJwksCacheForAlg = {
      getKey: vi.fn().mockResolvedValue({ kty: "RSA", n: "abc", e: "AQAB" }),
      getJWKS: vi.fn().mockResolvedValue({ keys: [] }),
    };
    const mockNonceManagerForAlg = {
      checkTimestamp: vi.fn().mockReturnValue({ valid: true }),
      checkNonce: vi.fn().mockResolvedValue(true),
    };

    const verifier = new SignatureVerifier(
      mockJwksCacheForAlg as any,
      mockNonceManagerForAlg as any,
      []
    );

    const result = await verifier.verify({
      method: "GET",
      url: "https://example.com/test",
      headers: {
        "signature-input": 'sig1=("@method" "@authority");created=1700000000;expires=1700000300;keyid="k1";alg="ed25519";tag="web-bot-auth"',
        "signature": "sig1=:dGVzdA==:",
      },
      jwksUrl: "https://example.com/jwks.json",
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("JWK must be Ed25519");
    expect(result.error).toContain("kty=RSA");
  });

  it("should reject JWK with wrong curve", async () => {
    const mockJwksCacheForAlg = {
      getKey: vi.fn().mockResolvedValue({ kty: "OKP", crv: "Ed448", x: "abc" }),
      getJWKS: vi.fn().mockResolvedValue({ keys: [] }),
    };
    const mockNonceManagerForAlg = {
      checkTimestamp: vi.fn().mockReturnValue({ valid: true }),
      checkNonce: vi.fn().mockResolvedValue(true),
    };

    const verifier = new SignatureVerifier(
      mockJwksCacheForAlg as any,
      mockNonceManagerForAlg as any,
      []
    );

    const result = await verifier.verify({
      method: "GET",
      url: "https://example.com/test",
      headers: {
        "signature-input": 'sig1=("@method" "@authority");created=1700000000;expires=1700000300;keyid="k1";alg="ed25519";tag="web-bot-auth"',
        "signature": "sig1=:dGVzdA==:",
      },
      jwksUrl: "https://example.com/jwks.json",
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("JWK must be Ed25519");
    expect(result.error).toContain("crv=Ed448");
  });

  it("should return error when key not found in JWKS", async () => {
    const mockJwksCacheForAlg = {
      getKey: vi.fn().mockResolvedValue(null),
      getJWKS: vi.fn().mockResolvedValue({ keys: [] }),
    };
    const mockNonceManagerForAlg = {
      checkTimestamp: vi.fn().mockReturnValue({ valid: true }),
      checkNonce: vi.fn().mockResolvedValue(true),
    };

    const verifier = new SignatureVerifier(
      mockJwksCacheForAlg as any,
      mockNonceManagerForAlg as any,
      []
    );

    const result = await verifier.verify({
      method: "GET",
      url: "https://example.com/test",
      headers: {
        "signature-input": 'sig1=("@method" "@authority");created=1700000000;expires=1700000300;keyid="unknown-key";alg="ed25519";tag="web-bot-auth"',
        "signature": "sig1=:dGVzdA==:",
      },
      jwksUrl: "https://example.com/jwks.json",
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("Key not found in JWKS");
    expect(result.error).toContain("unknown-key");
  });
});
