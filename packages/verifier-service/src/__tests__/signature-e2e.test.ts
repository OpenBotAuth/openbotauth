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

function formatCoveredComponent(component: string): string {
  const separatorIndex = component.indexOf(";");
  if (separatorIndex === -1) {
    return `"${component}"`;
  }
  const name = component.slice(0, separatorIndex);
  const params = component.slice(separatorIndex + 1);
  return `"${name}";${params}`;
}

describe("E2E Signature Verification", () => {
  let keyPair: webcrypto.CryptoKeyPair;
  let publicJwk: any;

  beforeEach(async () => {
    // Generate fresh Ed25519 keypair for each test
    keyPair = (await webcrypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as webcrypto.CryptoKeyPair;

    // Export keys to JWK format
    publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
    publicJwk.kid = "test-key-e2e";
    publicJwk.use = "sig";

  });

  it("verifies a real RFC 9421 signature end-to-end", async () => {
    // 1. Set up test request
    const method = "GET";
    const url = "https://example.com/api/resource?query=value";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");
    const signatureAgentHeader = 'sig1="https://trusted.example.com/jwks.json"';

    // 2. Build Signature-Input header
    const coveredHeaders = ["@method", "@path", "@authority", 'signature-agent;key="sig1"'];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;
    const signatureInput = `sig1=${signatureParams}`;

    // 3. Parse signature input to get components
    const components = parseSignatureInput(signatureInput);
    expect(components).not.toBeNull();

    // 4. Build the signature base
    const requestHeaders: Record<string, string> = {
      "signature-agent": signatureAgentHeader,
    };
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
        "signature-agent": signatureAgentHeader,
      },
    });

    // 8. Assert verification succeeded
    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.agent?.kid).toBe(publicJwk.kid);
    expect(result.agent?.client_name).toBe("test-agent");
  });

  it("verifies when Signature-Agent is omitted but jwksUrl is provided out-of-band", async () => {
    const method = "GET";
    const url = "https://example.com/api/out-of-band";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(
      webcrypto.getRandomValues(new Uint8Array(16)),
    ).toString("base64url");

    const coveredHeaders = ["@method", "@path", "@authority"];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;
    const signatureInput = `sig1=${signatureParams}`;

    const components = parseSignatureInput(signatureInput);
    expect(components).not.toBeNull();

    const signatureBase = buildSignatureBase(components!, {
      method,
      url,
      headers: {},
    });

    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signatureBase),
    );
    const signatureHeader = `sig1=:${Buffer.from(signatureBytes).toString("base64")}:`;

    const mockJwksCache = createMockJwksCache(publicJwk);
    const mockNonceManager = createMockNonceManager();
    const verifier = new SignatureVerifier(
      mockJwksCache as any,
      mockNonceManager as any,
      ["trusted.example.com"],
    );

    const result = await verifier.verify({
      method,
      url,
      headers: {
        "signature-input": signatureInput,
        signature: signatureHeader,
      },
      jwksUrl: "https://trusted.example.com/jwks.json",
    });

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockJwksCache.getKey).toHaveBeenCalledWith(
      "https://trusted.example.com/jwks.json",
      publicJwk.kid,
    );
  });

  it("rejects signatures missing required expires parameter", async () => {
    const method = "GET";
    const url = "https://example.com/api/missing-expires";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(
      webcrypto.getRandomValues(new Uint8Array(16)),
    ).toString("base64url");
    const signatureAgentHeader = 'sig1="https://trusted.example.com/jwks.json"';
    const coveredHeaders = ["@method", "@path", "@authority", 'signature-agent;key="sig1"'];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;
    const signatureInput = `sig1=${signatureParams}`;

    const components = parseSignatureInput(signatureInput)!;
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {
        "signature-agent": signatureAgentHeader,
      },
    });

    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signatureBase),
    );
    const signatureHeader = `sig1=:${Buffer.from(signatureBytes).toString("base64")}:`;

    const verifier = new SignatureVerifier(
      createMockJwksCache(publicJwk) as any,
      createMockNonceManager() as any,
      ["trusted.example.com"],
    );

    const result = await verifier.verify({
      method,
      url,
      headers: {
        "signature-input": signatureInput,
        signature: signatureHeader,
        "signature-agent": signatureAgentHeader,
      },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("created and expires");
  });

  it("rejects signatures missing both @authority and @target-uri coverage", async () => {
    const method = "GET";
    const url = "https://example.com/api/missing-authority-binding";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(
      webcrypto.getRandomValues(new Uint8Array(16)),
    ).toString("base64url");
    const signatureAgentHeader = 'sig1="https://trusted.example.com/jwks.json"';
    const coveredHeaders = ["@method", "@path", 'signature-agent;key="sig1"'];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;
    const signatureInput = `sig1=${signatureParams}`;

    const components = parseSignatureInput(signatureInput)!;
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {
        "signature-agent": signatureAgentHeader,
      },
    });

    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signatureBase),
    );
    const signatureHeader = `sig1=:${Buffer.from(signatureBytes).toString("base64")}:`;

    const verifier = new SignatureVerifier(
      createMockJwksCache(publicJwk) as any,
      createMockNonceManager() as any,
      ["trusted.example.com"],
    );

    const result = await verifier.verify({
      method,
      url,
      headers: {
        "signature-input": signatureInput,
        signature: signatureHeader,
        "signature-agent": signatureAgentHeader,
      },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("@authority/@target-uri");
  });

  it("rejects signature with wrong key", async () => {
    // Generate a different keypair for signing (simulates attacker)
    const attackerKeyPair = (await webcrypto.subtle.generateKey(
      "Ed25519",
      true,
      ["sign", "verify"],
    )) as webcrypto.CryptoKeyPair;

    const method = "GET";
    const url = "https://example.com/api/resource";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");
    const signatureAgentHeader = 'sig1="https://trusted.example.com/jwks.json"';

    const coveredHeaders = ["@method", "@path", "@authority", 'signature-agent;key="sig1"'];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;
    const signatureInput = `sig1=${signatureParams}`;

    const components = parseSignatureInput(signatureInput)!;
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {
        "signature-agent": signatureAgentHeader,
      },
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
        "signature-agent": signatureAgentHeader,
      },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("Signature verification failed");
  });

  it("rejects signatures without web-bot-auth tag", async () => {
    const method = "GET";
    const url = "https://example.com/api/no-tag";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");
    const signatureAgentHeader = 'sig1="https://trusted.example.com/jwks.json"';
    const coveredHeaders = ["@method", "@path", "@authority", 'signature-agent;key="sig1"'];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519"`;
    const signatureInput = `sig1=${signatureParams}`;

    const components = parseSignatureInput(signatureInput)!;
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {
        "signature-agent": signatureAgentHeader,
      },
    });
    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signatureBase)
    );
    const signatureHeader = `sig1=:${Buffer.from(signatureBytes).toString("base64")}:`;

    const verifier = new SignatureVerifier(
      createMockJwksCache(publicJwk) as any,
      createMockNonceManager() as any,
      ["trusted.example.com"]
    );
    const result = await verifier.verify({
      method,
      url,
      headers: {
        "signature-input": signatureInput,
        "signature": signatureHeader,
        "signature-agent": signatureAgentHeader,
      },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain('tag="web-bot-auth"');
  });

  it("selects matching web-bot-auth member when multiple signatures are present", async () => {
    const method = "GET";
    const url = "https://example.com/api/multi";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");
    const signatureAgentHeader = 'sig1="https://trusted.example.com/jwks.json"';

    const badCovered = ["@method", "@path"];
    const badParams = `(${badCovered.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="other-kid";nonce="${nonce}";alg="ed25519"`;

    const goodCovered = ["@method", "@path", "@authority", 'signature-agent;key="sig1"'];
    const goodParams = `(${goodCovered.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;

    const signatureInput = `sig0=${badParams}, sig1=${goodParams}`;

    const components = parseSignatureInput(signatureInput, "sig1")!;
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {
        "signature-agent": signatureAgentHeader,
      },
    });

    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signatureBase)
    );
    const signatureHeader = `sig0=:ZmFrZQ==:, sig1=:${Buffer.from(signatureBytes).toString("base64")}:`;

    const verifier = new SignatureVerifier(
      createMockJwksCache(publicJwk) as any,
      createMockNonceManager() as any,
      ["trusted.example.com"]
    );
    const result = await verifier.verify({
      method,
      url,
      headers: {
        "signature-input": signatureInput,
        "signature": signatureHeader,
        "signature-agent": signatureAgentHeader,
      },
    });

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects signatures that do not cover signature-agent", async () => {
    const method = "GET";
    const url = "https://example.com/api/no-sig-agent-cover";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");
    const signatureAgentHeader = 'sig1="https://trusted.example.com/jwks.json"';
    const coveredHeaders = ["@method", "@path", "@authority"];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;
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
    const signatureHeader = `sig1=:${Buffer.from(signatureBytes).toString("base64")}:`;

    const verifier = new SignatureVerifier(
      createMockJwksCache(publicJwk) as any,
      createMockNonceManager() as any,
      ["trusted.example.com"]
    );
    const result = await verifier.verify({
      method,
      url,
      headers: {
        "signature-input": signatureInput,
        "signature": signatureHeader,
        "signature-agent": signatureAgentHeader,
      },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("covered signature-agent");
  });

  it("rejects tampered message", async () => {
    const method = "GET";
    const url = "https://example.com/api/resource";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");
    const signatureAgentHeader = 'sig1="https://trusted.example.com/jwks.json"';

    const coveredHeaders = ["@method", "@path", "@authority", 'signature-agent;key="sig1"'];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;
    const signatureInput = `sig1=${signatureParams}`;

    const components = parseSignatureInput(signatureInput)!;

    // Sign the original URL
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {
        "signature-agent": signatureAgentHeader,
      },
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
        "signature-agent": signatureAgentHeader,
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
    const signatureAgentHeader = 'sig1="https://trusted.example.com/jwks.json"';

    // Include content-type in covered headers
    const coveredHeaders = ["@method", "@path", "@authority", "content-type", 'signature-agent;key="sig1"'];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;
    const signatureInput = `sig1=${signatureParams}`;

    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      "signature-agent": signatureAgentHeader,
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
        "signature-agent": signatureAgentHeader,
      },
    });

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("supports relabeling by resolving Signature-Agent member from ;key parameter", async () => {
    const method = "GET";
    const url = "https://example.com/api/relabel";
    const created = Math.floor(Date.now() / 1000);
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url");
    const signatureLabel = "sig2";
    const signatureAgentHeader =
      'sig1="https://trusted.example.com/jwks.json", sig2="https://attacker.example/jwks.json"';
    const coveredHeaders = ["@method", "@path", "@authority", 'signature-agent;key="sig1"'];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;
    const signatureInput = `${signatureLabel}=${signatureParams}`;

    const components = parseSignatureInput(signatureInput)!;
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {
        "signature-agent": signatureAgentHeader,
      },
    });

    const signatureBytes = await webcrypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signatureBase)
    );
    const signatureB64 = Buffer.from(signatureBytes).toString("base64");
    const signatureHeader = `${signatureLabel}=:${signatureB64}:`;

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
        "signature-agent": signatureAgentHeader,
      },
    });

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockJwksCache.getKey).toHaveBeenCalledWith(
      "https://trusted.example.com/jwks.json",
      publicJwk.kid,
    );
  });

  it("rejects replay when nonce check fails", async () => {
    const method = "GET";
    const url = "https://example.com/api/resource";
    const created = Math.floor(Date.now() / 1000);
    const nonce = "replayed-nonce";
    const signatureAgentHeader = 'sig1="https://trusted.example.com/jwks.json"';

    const coveredHeaders = ["@method", "@path", "@authority", 'signature-agent;key="sig1"'];
    const signatureParams = `(${coveredHeaders.map(formatCoveredComponent).join(" ")});created=${created};expires=${created + 300};keyid="${publicJwk.kid}";nonce="${nonce}";alg="ed25519";tag="web-bot-auth"`;
    const signatureInput = `sig1=${signatureParams}`;

    const components = parseSignatureInput(signatureInput)!;
    const signatureBase = buildSignatureBase(components, {
      method,
      url,
      headers: {
        "signature-agent": signatureAgentHeader,
      },
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
        "signature-agent": signatureAgentHeader,
      },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("replay");
  });
});
