import * as crypto from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import {
  issueCertificateForJwk,
  resetCertificateAuthorityCacheForTests,
} from "./ca.js";

const { webcrypto, X509Certificate } = crypto;

describe("issueCertificateForJwk", () => {
  beforeEach(() => {
    resetCertificateAuthorityCacheForTests();
  });

  it("encodes SAN URI when subjectAltUri is provided", async () => {
    const baseDir = join(tmpdir(), `oba-ca-test-${Date.now()}`);
    process.env.OBA_CA_MODE = "local";
    process.env.OBA_CA_DIR = baseDir;
    process.env.OBA_CA_KEY_PATH = join(baseDir, "ca.key.json");
    process.env.OBA_CA_CERT_PATH = join(baseDir, "ca.pem");

    const keyPair = (await webcrypto.subtle.generateKey(
      { name: "Ed25519" } as any,
      true,
      ["sign", "verify"],
    )) as any;
    const publicJwk = await webcrypto.subtle.exportKey(
      "jwk",
      keyPair.publicKey,
    );

    const subjectAltUri = "agent:tester@example.com/voice";
    const issued = await issueCertificateForJwk(
      publicJwk as any,
      "CN=OBA Test Leaf",
      1,
      subjectAltUri,
    );

    const cert = new X509Certificate(issued.certPem);
    expect(cert.subjectAltName).toContain(`URI:${subjectAltUri}`);
  });

  it("does not include SAN URI when subjectAltUri is omitted", async () => {
    const baseDir = join(tmpdir(), `oba-ca-test-${Date.now()}-nosan`);
    process.env.OBA_CA_MODE = "local";
    process.env.OBA_CA_DIR = baseDir;
    process.env.OBA_CA_KEY_PATH = join(baseDir, "ca.key.json");
    process.env.OBA_CA_CERT_PATH = join(baseDir, "ca.pem");

    const keyPair = (await webcrypto.subtle.generateKey(
      { name: "Ed25519" } as any,
      true,
      ["sign", "verify"],
    )) as any;
    const publicJwk = await webcrypto.subtle.exportKey(
      "jwk",
      keyPair.publicKey,
    );

    const issued = await issueCertificateForJwk(
      publicJwk as any,
      "CN=OBA Test Leaf",
      1,
      null,
    );

    const cert = new X509Certificate(issued.certPem);
    expect(cert.subjectAltName ?? "").not.toContain("URI:");
  });

  it("regenerates CA cert when persisted key and cert are mismatched", async () => {
    const baseDir = join(tmpdir(), `oba-ca-test-${Date.now()}-mismatch`);
    const keyPath = join(baseDir, "ca.key.json");
    const certPath = join(baseDir, "ca.pem");
    process.env.OBA_CA_MODE = "local";
    process.env.OBA_CA_DIR = baseDir;
    process.env.OBA_CA_KEY_PATH = keyPath;
    process.env.OBA_CA_CERT_PATH = certPath;

    const keyPair = (await webcrypto.subtle.generateKey(
      { name: "Ed25519" } as any,
      true,
      ["sign", "verify"],
    )) as any;
    const publicJwk = await webcrypto.subtle.exportKey(
      "jwk",
      keyPair.publicKey,
    );

    await issueCertificateForJwk(
      publicJwk as any,
      "CN=OBA Test Leaf",
      1,
      null,
    );
    const originalCaPem = readFileSync(certPath, "utf-8").trim();

    // Simulate partial state loss: key is removed while stale cert remains.
    unlinkSync(keyPath);
    resetCertificateAuthorityCacheForTests();

    const secondIssued = await issueCertificateForJwk(
      publicJwk as any,
      "CN=OBA Test Leaf",
      1,
      null,
    );
    const regeneratedCaPem = readFileSync(certPath, "utf-8").trim();
    expect(regeneratedCaPem).not.toBe(originalCaPem);

    const certsInChain =
      secondIssued.chainPem.match(
        /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
      ) ?? [];
    expect(certsInChain).toHaveLength(2);
    expect(certsInChain[1].trim()).toBe(regeneratedCaPem);
  });
});
