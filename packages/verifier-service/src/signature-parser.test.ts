/**
 * Tests for signature-parser.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseSignatureAgent,
  resolveJwksUrl,
  buildSignatureBase,
  parseSignatureInput,
  parseSignature,
  validateSafeUrl,
} from "./signature-parser.js";

describe("validateSafeUrl", () => {
  it("should allow valid https URLs", () => {
    expect(() =>
      validateSafeUrl("https://example.com/jwks.json"),
    ).not.toThrow();
  });

  it("should allow valid http URLs", () => {
    expect(() => validateSafeUrl("http://example.com/jwks.json")).not.toThrow();
  });

  it("should block file:// scheme", () => {
    expect(() => validateSafeUrl("file:///etc/passwd")).toThrow(
      "invalid scheme",
    );
  });

  it("should block ftp:// scheme", () => {
    expect(() => validateSafeUrl("ftp://example.com/file")).toThrow(
      "invalid scheme",
    );
  });

  it("should block localhost", () => {
    expect(() => validateSafeUrl("http://localhost:8080/jwks.json")).toThrow(
      "private address localhost",
    );
  });

  it("should block 127.0.0.1", () => {
    expect(() => validateSafeUrl("http://127.0.0.1:8080/jwks.json")).toThrow(
      "loopback address",
    );
  });

  it("should block entire 127.0.0.0/8 loopback range", () => {
    expect(() => validateSafeUrl("http://127.0.0.2/jwks.json")).toThrow(
      "loopback address",
    );
    expect(() => validateSafeUrl("http://127.1.2.3/jwks.json")).toThrow(
      "loopback address",
    );
    expect(() => validateSafeUrl("http://127.255.255.255/jwks.json")).toThrow(
      "loopback address",
    );
  });

  it("should block 0.0.0.0", () => {
    expect(() => validateSafeUrl("http://0.0.0.0/jwks.json")).toThrow(
      "private address",
    );
  });

  it("should block IPv6 loopback ::1", () => {
    expect(() => validateSafeUrl("http://[::1]/jwks.json")).toThrow(
      "private address",
    );
  });

  it("should block 10.x.x.x range", () => {
    expect(() => validateSafeUrl("http://10.0.0.1/jwks.json")).toThrow(
      "private IP range",
    );
  });

  it("should block 192.168.x.x range", () => {
    expect(() => validateSafeUrl("http://192.168.1.1/jwks.json")).toThrow(
      "private IP range",
    );
  });

  it("should block 172.16-31.x.x range", () => {
    expect(() => validateSafeUrl("http://172.16.0.1/jwks.json")).toThrow(
      "private IP range",
    );
    expect(() => validateSafeUrl("http://172.20.0.1/jwks.json")).toThrow(
      "private IP range",
    );
    expect(() => validateSafeUrl("http://172.31.255.255/jwks.json")).toThrow(
      "private IP range",
    );
  });

  it("should allow 172.15.x.x (not in private range)", () => {
    expect(() => validateSafeUrl("http://172.15.0.1/jwks.json")).not.toThrow();
  });

  it("should allow 172.32.x.x (not in private range)", () => {
    expect(() => validateSafeUrl("http://172.32.0.1/jwks.json")).not.toThrow();
  });

  it("should block 169.254.x.x link-local range", () => {
    expect(() => validateSafeUrl("http://169.254.0.1/jwks.json")).toThrow(
      "link-local address",
    );
    expect(() => validateSafeUrl("http://169.254.169.254/jwks.json")).toThrow(
      "link-local address",
    );
  });

  it("should block IPv6 fc00::/8 private range", () => {
    expect(() => validateSafeUrl("http://[fc00::1]/jwks.json")).toThrow(
      "IPv6 private range",
    );
    expect(() => validateSafeUrl("http://[fc12::1]/jwks.json")).toThrow(
      "IPv6 private range",
    );
  });

  it("should block IPv6 fd00::/8 private range", () => {
    expect(() => validateSafeUrl("http://[fd00::1]/jwks.json")).toThrow(
      "IPv6 private range",
    );
    expect(() => validateSafeUrl("http://[fd12:3456::1]/jwks.json")).toThrow(
      "IPv6 private range",
    );
  });

  it("should block IPv6 fe80::/10 link-local range", () => {
    expect(() => validateSafeUrl("http://[fe80::1]/jwks.json")).toThrow(
      "IPv6 link-local range",
    );
    // fe80::/10 covers fe80-febf, test edge cases
    expect(() => validateSafeUrl("http://[fe90::1]/jwks.json")).toThrow(
      "IPv6 link-local range",
    );
    expect(() => validateSafeUrl("http://[fea0::1]/jwks.json")).toThrow(
      "IPv6 link-local range",
    );
    expect(() => validateSafeUrl("http://[feb0::1]/jwks.json")).toThrow(
      "IPv6 link-local range",
    );
  });

  it("should allow fec0:: (not in link-local range)", () => {
    // fec0:: is outside fe80::/10
    expect(() => validateSafeUrl("http://[fec0::1]/jwks.json")).not.toThrow();
  });

  it("should throw on invalid URL", () => {
    expect(() => validateSafeUrl("not-a-valid-url")).toThrow("Invalid URL");
  });
});

describe("parseSignatureAgent", () => {
  it("should parse structured dictionary and select by label", () => {
    const result = parseSignatureAgent(
      'sig1="https://registry.example/agents/pete/.well-known/http-message-signatures-directory", sig2="https://example.com/jwks/alt.json"',
      "sig1",
    );
    expect(result).toEqual({
      url: "https://registry.example/agents/pete/.well-known/http-message-signatures-directory",
      isJwks: true,
    });
  });

  it("should fall back to first dictionary entry when label missing", () => {
    const result = parseSignatureAgent(
      'sig1="https://example.com/jwks/a.json", sig2="https://example.com/jwks/b.json"',
      "sigX",
    );
    expect(result).toEqual({
      url: "https://example.com/jwks/a.json",
      isJwks: true,
    });
  });

  it("should parse direct JWKS URL with .json extension", () => {
    const result = parseSignatureAgent("https://example.com/jwks/user.json");
    expect(result).toEqual({
      url: "https://example.com/jwks/user.json",
      isJwks: true,
    });
  });

  it("should parse direct JWKS URL with /jwks/ path", () => {
    const result = parseSignatureAgent(
      "https://example.com/jwks/hammadtq.json",
    );
    expect(result).toEqual({
      url: "https://example.com/jwks/hammadtq.json",
      isJwks: true,
    });
  });

  it("should parse identity URL without JWKS pattern", () => {
    const result = parseSignatureAgent("https://chatgpt.com");
    expect(result).toEqual({
      url: "https://chatgpt.com",
      isJwks: false,
    });
  });

  it("should handle quoted JWKS URL", () => {
    const result = parseSignatureAgent('"https://example.com/jwks/user.json"');
    expect(result).toEqual({
      url: "https://example.com/jwks/user.json",
      isJwks: true,
    });
  });

  it("should handle single-quoted JWKS URL", () => {
    const result = parseSignatureAgent("'https://example.com/jwks.json'");
    expect(result).toEqual({
      url: "https://example.com/jwks.json",
      isJwks: true,
    });
  });

  it("should handle angle-bracketed JWKS URL", () => {
    const result = parseSignatureAgent("<https://example.com/jwks/user.json>");
    expect(result).toEqual({
      url: "https://example.com/jwks/user.json",
      isJwks: true,
    });
  });

  it("should handle whitespace around URL", () => {
    const result = parseSignatureAgent("  https://example.com/jwks.json  ");
    expect(result).toEqual({
      url: "https://example.com/jwks.json",
      isJwks: true,
    });
  });

  it("should return null for invalid URL", () => {
    const result = parseSignatureAgent("not-a-url");
    expect(result).toBeNull();
  });
});

describe("parseSignatureInput", () => {
  it("should parse labels with dash and dot", () => {
    const parsed = parseSignatureInput(
      'sig-1.test=("@method" "@path");created=123;expires=124;nonce="n";keyid="k1";alg="ed25519"',
    );
    expect(parsed?.label).toBe("sig-1.test");
  });
});

describe("parseSignature", () => {
  it("should parse signature with dash/dot label", () => {
    const parsed = parseSignature("sig-1.test=:Zm9vYmFyOg==:");
    expect(parsed).toBe("Zm9vYmFyOg==");
  });
});

describe("resolveJwksUrl", () => {
  let fetchMock: any;

  beforeEach(() => {
    // Mock global fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should discover JWKS at /.well-known/jwks.json", async () => {
    const validJwks = { keys: [{ kid: "test", kty: "OKP" }] };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-length", "100"]]),
      json: async () => validJwks,
    });

    const result = await resolveJwksUrl("https://chatgpt.com");
    expect(result).toBe("https://chatgpt.com/.well-known/jwks.json");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://chatgpt.com/.well-known/jwks.json",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: expect.stringContaining("http-message-signatures-directory"),
        }),
      }),
    );
  });

  it("should try multiple paths in order", async () => {
    const validJwks = { keys: [{ kid: "test", kty: "OKP" }] };

    // First path fails
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Second path succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-length", "100"]]),
      json: async () => validJwks,
    });

    const result = await resolveJwksUrl("https://example.com");
    expect(result).toBe(
      "https://example.com/.well-known/openbotauth/jwks.json",
    );
  });

  it("should return null if no valid JWKS found", async () => {
    fetchMock.mockRejectedValue(new Error("Not found"));

    const result = await resolveJwksUrl("https://example.com");
    expect(result).toBeNull();
  });

  it("should reject invalid JWKS structure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-length", "50"]]),
      json: async () => ({ invalid: "structure" }),
    });

    const result = await resolveJwksUrl("https://example.com");
    expect(result).toBeNull();
  });

  it("should respect custom discovery paths", async () => {
    const validJwks = { keys: [{ kid: "test", kty: "OKP" }] };
    const customPaths = ["/custom/path.json", "/another/path.json"];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-length", "100"]]),
      json: async () => validJwks,
    });

    const result = await resolveJwksUrl("https://example.com", customPaths);
    expect(result).toBe("https://example.com/custom/path.json");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/custom/path.json",
      expect.anything(),
    );
  });

  it("should reject responses larger than 1MB", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-length", "2000000"]]), // 2MB
      json: async () => ({ keys: [] }),
    });

    const result = await resolveJwksUrl("https://example.com");
    expect(result).toBeNull();
  });

  it("should block localhost in discovery (SSRF protection)", async () => {
    const result = await resolveJwksUrl("http://localhost:8080");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should block 127.0.0.1 in discovery (SSRF protection)", async () => {
    const result = await resolveJwksUrl("http://127.0.0.1:8080");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should block private IP 10.x in discovery (SSRF protection)", async () => {
    const result = await resolveJwksUrl("http://10.0.0.1");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should block private IP 192.168.x in discovery (SSRF protection)", async () => {
    const result = await resolveJwksUrl("http://192.168.1.1");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should block private IP 172.16-31.x in discovery (SSRF protection)", async () => {
    const result = await resolveJwksUrl("http://172.16.0.1");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should block IPv6 loopback ::1 in discovery (SSRF protection)", async () => {
    const result = await resolveJwksUrl("http://[::1]:8080");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should block file:// scheme in discovery (SSRF protection)", async () => {
    const result = await resolveJwksUrl("file:///etc/passwd");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should block HTTP redirects (SSRF protection)", async () => {
    // Mock 302 redirect response
    fetchMock.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: new Map([["location", "http://127.0.0.1:6379/"]]),
    });

    const result = await resolveJwksUrl("https://example.com");
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3); // Tries all 3 default paths
  });

  it("should block 301 redirects (SSRF protection)", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 301,
      ok: false,
      headers: new Map([["location", "http://169.254.169.254/"]]),
    });

    const result = await resolveJwksUrl("https://example.com");
    expect(result).toBeNull();
  });

  it("should block 307 redirects (SSRF protection)", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 307,
      ok: false,
      headers: new Map([["location", "http://10.0.0.1/"]]),
    });

    const result = await resolveJwksUrl("https://example.com");
    expect(result).toBeNull();
  });

  it("should verify redirect: manual option is set", async () => {
    const validJwks = { keys: [{ kid: "test", kty: "OKP" }] };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([["content-length", "100"]]),
      json: async () => validJwks,
    });

    await resolveJwksUrl("https://example.com");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        redirect: "manual",
      }),
    );
  });
});

describe("buildSignatureBase", () => {
  it("should build signature base with derived components", () => {
    const components = {
      label: "sig1",
      keyId: "test-key",
      signature: "",
      algorithm: "ed25519",
      created: 1234567890,
      nonce: "abc123",
      headers: ["@method", "@path", "@authority"],
      rawSignatureParams: '("@method" "@path" "@authority");created=1234567890;nonce="abc123";keyid="test-key";alg="ed25519"',
    };

    const request = {
      method: "GET",
      url: "https://example.com/test?query=1",
      headers: {},
    };

    const result = buildSignatureBase(components, request);

    expect(result).toContain('"@method": GET');
    expect(result).toContain('"@path": /test');
    expect(result).toContain('"@authority": example.com');
    expect(result).toContain('"@signature-params":');
  });

  it("should include regular headers when present", () => {
    const components = {
      label: "sig1",
      keyId: "test-key",
      signature: "",
      algorithm: "ed25519",
      created: 1234567890,
      nonce: "abc123",
      headers: ["@method", "content-type", "accept"],
      rawSignatureParams: '("@method" "content-type" "accept");created=1234567890;nonce="abc123";keyid="test-key";alg="ed25519"',
    };

    const request = {
      method: "POST",
      url: "https://example.com/api",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
    };

    const result = buildSignatureBase(components, request);

    expect(result).toContain('"content-type": application/json');
    expect(result).toContain('"accept": application/json');
  });

  it("should throw error when covered header is missing", () => {
    const components = {
      label: "sig1",
      keyId: "test-key",
      signature: "",
      algorithm: "ed25519",
      created: 1234567890,
      nonce: "abc123",
      headers: ["@method", "accept", "user-agent"],
      rawSignatureParams: '("@method" "accept" "user-agent");created=1234567890;nonce="abc123";keyid="test-key";alg="ed25519"',
    };

    const request = {
      method: "GET",
      url: "https://example.com/test",
      headers: {
        accept: "application/json",
        // user-agent is missing
      },
    };

    expect(() => buildSignatureBase(components, request)).toThrow(
      "Missing covered header: user-agent",
    );
  });

  it("should handle empty string header values", () => {
    const components = {
      label: "sig1",
      keyId: "test-key",
      signature: "",
      algorithm: "ed25519",
      headers: ["@method", "custom-header"],
      rawSignatureParams: '("@method" "custom-header");keyid="test-key";alg="ed25519"',
    };

    const request = {
      method: "GET",
      url: "https://example.com/test",
      headers: {
        "custom-header": "",
      },
    };

    const result = buildSignatureBase(components, request);
    expect(result).toContain('"custom-header": ');
  });
});

describe("parseSignatureInput", () => {
  it("should parse valid Signature-Input header", () => {
    const input =
      'sig1=("@method" "@path" "content-type");created=1618884473;keyid="test-key-ed25519";nonce="abc123"';
    const result = parseSignatureInput(input);

    expect(result).toEqual({
      keyId: "test-key-ed25519",
      algorithm: "ed25519",
      created: 1618884473,
      nonce: "abc123",
      headers: ["@method", "@path", "content-type"],
      signature: "",
      expires: undefined,
      rawSignatureParams: '("@method" "@path" "content-type");created=1618884473;keyid="test-key-ed25519";nonce="abc123"',
    });
  });

  it("should parse Signature-Input with expires", () => {
    const input =
      'sig1=("@method" "@path");created=1618884473;expires=1618888073;keyid="key1"';
    const result = parseSignatureInput(input);

    expect(result?.created).toBe(1618884473);
    expect(result?.expires).toBe(1618888073);
  });

  it("should return null for invalid format", () => {
    const input = "invalid-format";
    const result = parseSignatureInput(input);

    expect(result).toBeNull();
  });
});
