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
