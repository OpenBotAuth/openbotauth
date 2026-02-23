import { readFileSync } from "node:fs";
import { X509Certificate, webcrypto } from "node:crypto";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { validateJwkX509 } from "./x509.js";
import * as x509Lib from "@peculiar/x509";

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
    expect(result.error).toMatch(/not authorized|not a valid CA/);
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

  it("passes when leaf cert has no EKU (not constrained)", async () => {
    // Existing leaf cert has no EKU extension
    const result = await validateJwkX509(
      { ...leafJwk, x5c: [leafDerBase64, caDerBase64] },
      { trustAnchors: [caPem], requireClientAuthEku: true },
    );
    expect(result.valid).toBe(true);
  });

  it("passes when EKU check is explicitly disabled", async () => {
    const result = await validateJwkX509(
      { ...leafJwk, x5c: [leafDerBase64, caDerBase64] },
      { trustAnchors: [caPem], requireClientAuthEku: false },
    );
    expect(result.valid).toBe(true);
  });
});

describe("validateJwkX509 EKU and SAN validation", () => {
  let testCaKeyPair: CryptoKeyPair;
  let testCaCert: any;
  let testCaPem: string;

  beforeAll(async () => {
    // Set up crypto provider for @peculiar/x509
    if ((x509Lib as any).cryptoProvider?.set) {
      (x509Lib as any).cryptoProvider.set(webcrypto as any);
    }

    // Generate test CA
    testCaKeyPair = await webcrypto.subtle.generateKey(
      { name: "Ed25519" } as any,
      true,
      ["sign", "verify"],
    ) as CryptoKeyPair;

    const notBefore = new Date();
    const notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    testCaCert = await (x509Lib as any).X509CertificateGenerator.create({
      serialNumber: "01",
      subject: "CN=Test CA for EKU/SAN",
      issuer: "CN=Test CA for EKU/SAN",
      notBefore,
      notAfter,
      publicKey: testCaKeyPair.publicKey,
      signingKey: testCaKeyPair.privateKey,
      signingAlgorithm: { name: "Ed25519" },
      extensions: [
        new (x509Lib as any).BasicConstraintsExtension(true, undefined, true),
        new (x509Lib as any).KeyUsagesExtension(
          (x509Lib as any).KeyUsageFlags.keyCertSign |
            (x509Lib as any).KeyUsageFlags.cRLSign,
          true,
        ),
      ],
    });

    testCaPem = testCaCert.toString();
  });

  async function generateLeafCert(options: {
    includeClientAuthEku?: boolean;
    includeServerAuthEku?: boolean;
    sanUri?: string;
  }): Promise<{ cert: any; keyPair: CryptoKeyPair; jwk: any }> {
    const keyPair = await webcrypto.subtle.generateKey(
      { name: "Ed25519" } as any,
      true,
      ["sign", "verify"],
    ) as CryptoKeyPair;

    const extensions: any[] = [
      new (x509Lib as any).BasicConstraintsExtension(false, undefined, true),
      new (x509Lib as any).KeyUsagesExtension(
        (x509Lib as any).KeyUsageFlags.digitalSignature,
        true,
      ),
    ];

    // Add EKU if specified
    const ekuOids: string[] = [];
    if (options.includeClientAuthEku) {
      ekuOids.push("1.3.6.1.5.5.7.3.2"); // clientAuth
    }
    if (options.includeServerAuthEku) {
      ekuOids.push("1.3.6.1.5.5.7.3.1"); // serverAuth
    }
    if (ekuOids.length > 0) {
      extensions.push(
        new (x509Lib as any).ExtendedKeyUsageExtension(ekuOids, false),
      );
    }

    // Add SAN URI if specified
    if (options.sanUri) {
      extensions.push(
        new (x509Lib as any).SubjectAlternativeNameExtension(
          [{ type: "url", value: options.sanUri }],
          false,
        ),
      );
    }

    const notBefore = new Date();
    const notAfter = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const cert = await (x509Lib as any).X509CertificateGenerator.create({
      serialNumber: Math.floor(Math.random() * 1000000).toString(16),
      subject: "CN=Test Leaf",
      issuer: "CN=Test CA for EKU/SAN",
      notBefore,
      notAfter,
      publicKey: keyPair.publicKey,
      signingKey: testCaKeyPair.privateKey,
      signingAlgorithm: { name: "Ed25519" },
      extensions,
    });

    const jwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);

    return { cert, keyPair, jwk };
  }

  it("passes when leaf cert has clientAuth EKU", async () => {
    const { cert, jwk } = await generateLeafCert({ includeClientAuthEku: true });
    const leafDer = Buffer.from(cert.rawData).toString("base64");
    const caDer = Buffer.from(testCaCert.rawData).toString("base64");

    const result = await validateJwkX509(
      { ...jwk, x5c: [leafDer, caDer] },
      { trustAnchors: [testCaPem], requireClientAuthEku: true },
    );

    expect(result.valid).toBe(true);
  });

  it("rejects when leaf cert has EKU but not clientAuth", async () => {
    const { cert, jwk } = await generateLeafCert({
      includeServerAuthEku: true,
      includeClientAuthEku: false,
    });
    const leafDer = Buffer.from(cert.rawData).toString("base64");
    const caDer = Buffer.from(testCaCert.rawData).toString("base64");

    const result = await validateJwkX509(
      { ...jwk, x5c: [leafDer, caDer] },
      { trustAnchors: [testCaPem], requireClientAuthEku: true },
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("clientAuth");
  });

  it("passes SAN URI binding when URIs match", async () => {
    const expectedUri = "agent:test-agent@example.com";
    const { cert, jwk } = await generateLeafCert({
      includeClientAuthEku: true,
      sanUri: expectedUri,
    });
    const leafDer = Buffer.from(cert.rawData).toString("base64");
    const caDer = Buffer.from(testCaCert.rawData).toString("base64");

    const result = await validateJwkX509(
      { ...jwk, x5c: [leafDer, caDer] },
      {
        trustAnchors: [testCaPem],
        requireClientAuthEku: true,
        expectedSanUri: expectedUri,
      },
    );

    expect(result.valid).toBe(true);
  });

  it("rejects SAN URI binding when URIs do not match", async () => {
    const { cert, jwk } = await generateLeafCert({
      includeClientAuthEku: true,
      sanUri: "agent:wrong-agent@example.com",
    });
    const leafDer = Buffer.from(cert.rawData).toString("base64");
    const caDer = Buffer.from(testCaCert.rawData).toString("base64");

    const result = await validateJwkX509(
      { ...jwk, x5c: [leafDer, caDer] },
      {
        trustAnchors: [testCaPem],
        requireClientAuthEku: true,
        expectedSanUri: "agent:expected-agent@example.com",
      },
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("SAN URI mismatch");
  });

  it("rejects SAN URI binding when cert has no SAN URI", async () => {
    const { cert, jwk } = await generateLeafCert({
      includeClientAuthEku: true,
      // No SAN URI
    });
    const leafDer = Buffer.from(cert.rawData).toString("base64");
    const caDer = Buffer.from(testCaCert.rawData).toString("base64");

    const result = await validateJwkX509(
      { ...jwk, x5c: [leafDer, caDer] },
      {
        trustAnchors: [testCaPem],
        expectedSanUri: "agent:expected-agent@example.com",
      },
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("no SAN URI");
  });
});
