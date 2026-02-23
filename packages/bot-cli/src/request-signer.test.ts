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
    expect(signed.headers["Signature-Input"]).toContain('"signature-agent"');
  });

  it("emits legacy Signature-Agent when explicitly requested", async () => {
    const signer = new RequestSigner(makeConfig());
    const signed = await signer.sign("GET", "https://example.com", undefined, {
      signatureAgentFormat: "legacy",
    });
    expect(signed.headers["Signature-Agent"]).toBe(
      "https://example.com/jwks/test.json",
    );
    expect(signed.headers["Signature-Input"]).toContain('"signature-agent"');
  });
});
