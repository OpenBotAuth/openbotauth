import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { describe, it, expect } from "vitest";
import { validateJwkX509 } from "./x509.js";

const caPem = readFileSync(
  new URL("./__fixtures__/x509/ca.pem", import.meta.url),
  "utf-8",
);
const leafPem = readFileSync(
  new URL("./__fixtures__/x509/leaf.pem", import.meta.url),
  "utf-8",
);

const caCert = new X509Certificate(caPem);
const leafCert = new X509Certificate(leafPem);

const leafDerBase64 = leafCert.raw.toString("base64");
const caDerBase64 = caCert.raw.toString("base64");

const leafJwk = leafCert.publicKey.export({ format: "jwk" });
const caJwk = caCert.publicKey.export({ format: "jwk" });

describe("validateJwkX509", () => {
  it("validates a proper x5c chain", async () => {
    const result = await validateJwkX509(
      { ...leafJwk, x5c: [leafDerBase64, caDerBase64] },
      { trustAnchors: [caPem] },
    );
    expect(result.valid).toBe(true);
  });

  it("rejects when leaf cert does not match JWK", async () => {
    const result = await validateJwkX509(
      { ...caJwk, x5c: [leafDerBase64, caDerBase64] },
      { trustAnchors: [caPem] },
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("key mismatch");
  });

  it("rejects when trust anchors are missing", async () => {
    const result = await validateJwkX509(
      { ...leafJwk, x5c: [leafDerBase64, caDerBase64] },
      { trustAnchors: [] },
    );
    expect(result.valid).toBe(false);
  });
});
