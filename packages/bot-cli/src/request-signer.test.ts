import { generateKeyPairSync } from "node:crypto";
import { describe, it, expect } from "vitest";
import { RequestSigner } from "./request-signer.js";

function makeConfig() {
  const { privateKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    jwks_url: "https://example.com/jwks/test.json",
    kid: "test-kid",
    private_key: privatePem,
    public_key: "base64",
  };
}

describe("RequestSigner", () => {
  it("emits dictionary Signature-Agent by default", async () => {
    const signer = new RequestSigner(makeConfig());
    const signed = await signer.sign("GET", "https://example.com");
    expect(signed.headers["Signature-Agent"]).toBe(
      'sig1="https://example.com/jwks/test.json"',
    );
    // RFC 9421: covered component uses ;key= parameter for dictionary member selection
    expect(signed.headers["Signature-Input"]).toContain('"signature-agent";key="sig1"');
    // IETF draft: tag="web-bot-auth" is mandatory
    expect(signed.headers["Signature-Input"]).toContain('tag="web-bot-auth"');
  });

  it("emits legacy Signature-Agent when explicitly requested", async () => {
    const signer = new RequestSigner(makeConfig());
    const signed = await signer.sign("GET", "https://example.com", undefined, {
      signatureAgentFormat: "legacy",
    });
    expect(signed.headers["Signature-Agent"]).toBe(
      "https://example.com/jwks/test.json",
    );
    // Legacy mode covers the whole header field directly (no dictionary key selector)
    expect(signed.headers["Signature-Input"]).toContain('"signature-agent"');
    expect(signed.headers["Signature-Input"]).not.toContain('";key=');
    // IETF draft: tag="web-bot-auth" is mandatory
    expect(signed.headers["Signature-Input"]).toContain('tag="web-bot-auth"');
  });

  it("includes tag in signed @signature-params base", () => {
    const signer = new RequestSigner(makeConfig());
    const params = {
      created: 1700000000,
      expires: 1700000300,
      nonce: "nonce123",
      keyId: "test-kid",
      algorithm: "ed25519",
      tag: "web-bot-auth",
      headers: ["@method", "@path", "@authority"],
    };

    const signatureBase = (signer as any).buildSignatureBase(params, {
      method: "GET",
      path: "/v1/test",
      authority: "example.com",
    });

    expect(signatureBase).toContain(';tag="web-bot-auth"');
  });
});
