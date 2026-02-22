import { webcrypto, X509Certificate } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { issueCertificateForJwk } from "./ca.js";

describe("issueCertificateForJwk", () => {
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
});
