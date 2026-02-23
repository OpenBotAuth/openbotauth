/**
 * End-to-end tests for RFC 9421 signature verification
 *
 * These tests construct real signatures and verify them through
 * SignatureVerifier.verify() to ensure the full pipeline works correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { webcrypto } from "node:crypto";
import { SignatureVerifier } from "../signature-verifier.js";
import { buildSignatureBase, parseSignatureInput } from "../signature-parser.js";

// Mock JWKS cache that returns keys we control
function createMockJwksCache(publicJwk: any) {
  return {
    getKey: vi.fn().mockResolvedValue(publicJwk),
    getJWKS: vi.fn().mockResolvedValue({
      keys: [publicJwk],
      client_name: "test-agent",
    }),
  };
}

// Mock nonce manager that always accepts
function createMockNonceManager() {
  return {
    checkTimestamp: vi.fn().mockReturnValue({ valid: true }),
    checkNonce: vi.fn().mockResolvedValue(true),
  };
}

describe("E2E Signature Verification", () => {
  let keyPair: CryptoKeyPair;
  let publicJwk: any;
  let privateJwk: any;

  beforeEach(async () => {
    // Generate fresh Ed25519 keypair for each test
    keyPair = await webcrypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ]);

    // Export keys to JWK format
    publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
    publicJwk.kid = "test-key-e2e";
    publicJwk.use = "sig";

    privateJwk = await webcrypto.subtle.exportKey("jwk", keyPair.privateKey);
  });

  it("verifies a real RFC 9421 signature end-to-end", async () => {
    // 1. Set up test request
    const method = "GET";
    const url = "https://example.com/api/resource?query=value";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");

    // 2. Build Signature-Input header
    const coveredHeaders = ["@method", "@path", "@authority"];
    const signatureParams = `("${coveredHeaders.join('" "')}");created=${created};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519"`;
    const signatureInput = `sig1=${signatureParams}`;

    // 3. Parse signature input to get components
    const components = parseSignatureInput(signatureInput);
    expect(components).not.toBeNull();

    // 4. Build the signature base
    const requestHeaders: Record<string, string> = {};
    const signatureBase = buildSignatureBase(components!, {
      method,
      url,
      headers: requestHeaders,
    });

    // 5. Sign the signature base
    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signatureBase)
    );
    const signatureB64 = Buffer.from(signatureBytes).toString("base64");
    const signatureHeader = `sig1=:${signatureB64}:`;

    // 6. Set up verifier with mocks
    const jwksUrl = "https://trusted.example.com/jwks.json";
    const mockJwksCache = createMockJwksCache(publicJwk);
    const mockNonceManager = createMockNonceManager();

    const verifier = new SignatureVerifier(
      mockJwksCache as any,
      mockNonceManager as any,
      ["trusted.example.com"],
      300 // maxSkewSec
    );

    // 7. Verify the signature
    const result = await verifier.verify({
      method,
      url,
      headers: {
        "signature-input": signatureInput,
        "signature": signatureHeader,
        "signature-agent": jwksUrl,
      },
    });

    // 8. Assert verification succeeded
    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.agent?.kid).toBe(publicJwk.kid);
    expect(result.agent?.client_name).toBe("test-agent");
  });

  it("rejects signature with wrong key", async () => {
    // Generate a different keypair for signing (simulates attacker)
    const attackerKeyPair = await webcrypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ]);

    const method = "GET";
    const url = "https://example.com/api/resource";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");

    const coveredHeaders = ["@method", "@path"];
    const signatureParams = `("${coveredHeaders.join('" "')}");created=${created};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519"`;
    const signatureInput = `sig1=${signatureParams}`;

    const components = parseSignatureInput(signatureInput)!;
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {},
    });

    // Sign with attacker's key
    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      attackerKeyPair.privateKey,
      new TextEncoder().encode(signatureBase)
    );
    const signatureB64 = Buffer.from(signatureBytes).toString("base64");
    const signatureHeader = `sig1=:${signatureB64}:`;

    // Verifier has the legitimate public key
    const mockJwksCache = createMockJwksCache(publicJwk);
    const mockNonceManager = createMockNonceManager();

    const verifier = new SignatureVerifier(
      mockJwksCache as any,
      mockNonceManager as any,
      ["trusted.example.com"]
    );

    const result = await verifier.verify({
      method,
      url,
      headers: {
        "signature-input": signatureInput,
        "signature": signatureHeader,
        "signature-agent": "https://trusted.example.com/jwks.json",
      },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("Signature verification failed");
  });

  it("rejects tampered message", async () => {
    const method = "GET";
    const url = "https://example.com/api/resource";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");

    const coveredHeaders = ["@method", "@path"];
    const signatureParams = `("${coveredHeaders.join('" "')}");created=${created};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519"`;
    const signatureInput = `sig1=${signatureParams}`;

    const components = parseSignatureInput(signatureInput)!;

    // Sign the original URL
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {},
    });

    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signatureBase)
    );
    const signatureB64 = Buffer.from(signatureBytes).toString("base64");
    const signatureHeader = `sig1=:${signatureB64}:`;

    const mockJwksCache = createMockJwksCache(publicJwk);
    const mockNonceManager = createMockNonceManager();

    const verifier = new SignatureVerifier(
      mockJwksCache as any,
      mockNonceManager as any,
      ["trusted.example.com"]
    );

    // Verify with a DIFFERENT URL (tampered)
    const result = await verifier.verify({
      method,
      url: "https://example.com/api/TAMPERED",
      headers: {
        "signature-input": signatureInput,
        "signature": signatureHeader,
        "signature-agent": "https://trusted.example.com/jwks.json",
      },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("Signature verification failed");
  });

  it("verifies signature with content-type header", async () => {
    const method = "POST";
    const url = "https://example.com/api/submit";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");

    // Include content-type in covered headers
    const coveredHeaders = ["@method", "@path", "@authority", "content-type"];
    const signatureParams = `("${coveredHeaders.join('" "')}");created=${created};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519"`;
    const signatureInput = `sig1=${signatureParams}`;

    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
    };

    const components = parseSignatureInput(signatureInput)!;
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: requestHeaders,
    });

    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signatureBase)
    );
    const signatureB64 = Buffer.from(signatureBytes).toString("base64");
    const signatureHeader = `sig1=:${signatureB64}:`;

    const mockJwksCache = createMockJwksCache(publicJwk);
    const mockNonceManager = createMockNonceManager();

    const verifier = new SignatureVerifier(
      mockJwksCache as any,
      mockNonceManager as any,
      ["trusted.example.com"]
    );

    const result = await verifier.verify({
      method,
      url,
      headers: {
        ...requestHeaders,
        "signature-input": signatureInput,
        "signature": signatureHeader,
        "signature-agent": "https://trusted.example.com/jwks.json",
      },
    });

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects replay when nonce check fails", async () => {
    const method = "GET";
    const url = "https://example.com/api/resource";
    const created = Math.floor(Date.now() / 1000);
    const nonce = "replayed-nonce";

    const coveredHeaders = ["@method", "@path"];
    const signatureParams = `("${coveredHeaders.join('" "')}");created=${created};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519"`;
    const signatureInput = `sig1=${signatureParams}`;

    const components = parseSignatureInput(signatureInput)!;
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {},
    });

    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signatureBase)
    );
    const signatureB64 = Buffer.from(signatureBytes).toString("base64");
    const signatureHeader = `sig1=:${signatureB64}:`;

    const mockJwksCache = createMockJwksCache(publicJwk);
    const mockNonceManager = {
      checkTimestamp: vi.fn().mockReturnValue({ valid: true }),
      checkNonce: vi.fn().mockResolvedValue(false), // Nonce already used
    };

    const verifier = new SignatureVerifier(
      mockJwksCache as any,
      mockNonceManager as any,
      ["trusted.example.com"]
    );

    const result = await verifier.verify({
      method,
      url,
      headers: {
        "signature-input": signatureInput,
        "signature": signatureHeader,
        "signature-agent": "https://trusted.example.com/jwks.json",
      },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("replay");
  });
});
