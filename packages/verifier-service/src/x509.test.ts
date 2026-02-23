import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { validateJwkX509 } from "./x509.js";

const caPem = readFileSync(
  new URL("./__fixtures__/x509/ca.pem", import.meta.url),
  "utf-8",
);
const leafPem = readFileSync(
  new URL("./__fixtures__/x509/leaf.pem", import.meta.url),
  "utf-8",
);
const nonCaRootPem = readFileSync(
  new URL("./__fixtures__/x509/root-nonca-test.pem", import.meta.url),
  "utf-8",
);
const nonCaIntermediatePem = readFileSync(
  new URL("./__fixtures__/x509/intermediate-not-ca.pem", import.meta.url),
  "utf-8",
);
const nonCaLeafPem = readFileSync(
  new URL("./__fixtures__/x509/leaf-via-nonca-intermediate.pem", import.meta.url),
  "utf-8",
);

const caCert = new X509Certificate(caPem);
const leafCert = new X509Certificate(leafPem);
const nonCaIntermediateCert = new X509Certificate(nonCaIntermediatePem);
const nonCaLeafCert = new X509Certificate(nonCaLeafPem);

const leafDerBase64 = leafCert.raw.toString("base64");
const caDerBase64 = caCert.raw.toString("base64");
const nonCaIntermediateDerBase64 = nonCaIntermediateCert.raw.toString("base64");
const nonCaLeafDerBase64 = nonCaLeafCert.raw.toString("base64");

const leafJwk = leafCert.publicKey.export({ format: "jwk" });
const caJwk = caCert.publicKey.export({ format: "jwk" });
const nonCaLeafJwk = nonCaLeafCert.publicKey.export({ format: "jwk" });

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("rejects chain when intermediate certificate is not a CA", async () => {
    const result = await validateJwkX509(
      {
        ...nonCaLeafJwk,
        x5c: [nonCaLeafDerBase64, nonCaIntermediateDerBase64],
      },
      { trustAnchors: [nonCaRootPem] },
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not authorized");
  });

  it("rejects oversized x5u response without content-length", async () => {
    const chunk = new Uint8Array(256 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // 5 chunks => 1.25 MB > 1 MB cap
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: {
            "content-type": "application/pkix-cert",
          },
        }),
      ),
    );

    const result = await validateJwkX509(
      { ...leafJwk, x5u: "https://example.com/cert.der" },
      { trustAnchors: [caPem] },
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too large");
  });
});
