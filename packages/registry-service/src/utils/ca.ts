/**
 * Local Certificate Authority helper (dev/MVP)
 */

import { webcrypto, randomBytes, createHash, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as x509 from "@peculiar/x509";

const {
  X509CertificateGenerator,
  PemConverter,
  BasicConstraintsExtension,
  KeyUsagesExtension,
  ExtendedKeyUsageExtension,
  ExtendedKeyUsage,
  SubjectAlternativeNameExtension,
  KeyUsageFlags,
  URL: GENERAL_NAME_URL,
} = x509 as any;

export interface CertificateAuthority {
  subject: string;
  privateKey: any;
  publicKey: any;
  certPem: string;
  certDer: Buffer;
}

export interface IssuedCertificate {
  certPem: string;
  chainPem: string;
  x5c: string[];
  serial: string;
  notBefore: Date;
  notAfter: Date;
  fingerprintSha256: string;
}

let cachedCa: CertificateAuthority | null = null;

// Test helper: allows deterministic reloading from disk across scenarios.
export function resetCertificateAuthorityCacheForTests(): void {
  cachedCa = null;
}

function ensureCryptoProvider(): void {
  if (!(globalThis as any).crypto) {
    (globalThis as any).crypto = webcrypto as any;
  }
  if (x509?.cryptoProvider?.set) {
    x509.cryptoProvider.set(webcrypto as any);
  }
}

function getCaPaths() {
  const baseDir =
    process.env.OBA_CA_DIR || join(process.cwd(), ".local", "ca");
  const keyPath = process.env.OBA_CA_KEY_PATH || join(baseDir, "ca.key.json");
  const certPath = process.env.OBA_CA_CERT_PATH || join(baseDir, "ca.pem");
  return { baseDir, keyPath, certPath };
}

async function generateCaKeyPair(): Promise<any> {
  return (await webcrypto.subtle.generateKey(
    { name: "Ed25519" } as any,
    true,
    ["sign", "verify"],
  )) as any;
}

function randomSerial(): string {
  return randomBytes(16).toString("hex");
}

function encodeCertPem(cert: any): string {
  if (typeof cert?.toString === "function") {
    const maybePem = cert.toString();
    if (typeof maybePem === "string" && maybePem.includes("BEGIN CERTIFICATE")) {
      return maybePem;
    }
  }
  if (cert?.rawData && PemConverter?.encode) {
    return PemConverter.encode(cert.rawData, "CERTIFICATE");
  }
  throw new Error("Unable to encode certificate to PEM");
}

function certDerBuffer(cert: any): Buffer {
  if (cert?.rawData) {
    return Buffer.from(cert.rawData);
  }
  const pem = encodeCertPem(cert);
  return Buffer.from(
    pem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s+/g, ""),
    "base64",
  );
}

async function createSelfSignedCa(
  keys: { publicKey: any; privateKey: any },
  subject: string,
  validDays: number,
): Promise<{ certPem: string; certDer: Buffer }> {
  const notBefore = new Date();
  const notAfter = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
  const serialNumber = randomSerial();

  const extensions: any[] = [];
  if (BasicConstraintsExtension) {
    extensions.push(new BasicConstraintsExtension(true, undefined, true));
  }
  if (KeyUsagesExtension && KeyUsageFlags) {
    const usage =
      (KeyUsageFlags.keyCertSign || 0) | (KeyUsageFlags.cRLSign || 0);
    if (usage > 0) {
      extensions.push(new KeyUsagesExtension(usage, true));
    }
  }

  const cert = await X509CertificateGenerator.create({
    serialNumber,
    subject,
    issuer: subject,
    notBefore,
    notAfter,
    publicKey: keys.publicKey,
    signingKey: keys.privateKey,
    signingAlgorithm: { name: "Ed25519" },
    extensions,
  });

  const pem = encodeCertPem(cert);
  const der = certDerBuffer(cert);
  return { certPem: pem, certDer: der };
}

async function certMatchesPublicKey(certPem: string, publicKey: any): Promise<boolean> {
  try {
    const cert = new X509Certificate(certPem);
    const certSpki = cert.publicKey.export({ type: "spki", format: "der" }) as Buffer;
    const keySpki = Buffer.from(await webcrypto.subtle.exportKey("spki", publicKey));
    return certSpki.equals(keySpki);
  } catch {
    return false;
  }
}

async function loadOrCreateCa(): Promise<CertificateAuthority> {
  const mode = process.env.OBA_CA_MODE || "local";
  if (mode !== "local") {
    throw new Error("CA mode not supported (set OBA_CA_MODE=local)");
  }

  if (cachedCa) {
    return cachedCa;
  }

  ensureCryptoProvider();
  const { baseDir, keyPath, certPath } = getCaPaths();
  mkdirSync(baseDir, { recursive: true, mode: 0o700 });

  let privateKey: any;
  let publicKey: any;
  const subject = process.env.OBA_CA_SUBJECT || "CN=OpenBotAuth Dev CA";
  const validDays = parseInt(process.env.OBA_CA_VALID_DAYS || "3650", 10);

  if (existsSync(keyPath)) {
    const content = JSON.parse(readFileSync(keyPath, "utf-8"));
    privateKey = await webcrypto.subtle.importKey(
      "jwk",
      content.privateKeyJwk,
      { name: "Ed25519" } as any,
      true,
      ["sign"],
    );
    publicKey = await webcrypto.subtle.importKey(
      "jwk",
      content.publicKeyJwk,
      { name: "Ed25519" } as any,
      true,
      ["verify"],
    );
  } else {
    const keys = await generateCaKeyPair();
    privateKey = keys.privateKey;
    publicKey = keys.publicKey;
    const privateKeyJwk = await webcrypto.subtle.exportKey(
      "jwk",
      privateKey,
    );
    const publicKeyJwk = await webcrypto.subtle.exportKey("jwk", publicKey);
    writeFileSync(
      keyPath,
      JSON.stringify({ privateKeyJwk, publicKeyJwk }, null, 2),
      { mode: 0o600 },
    );
  }

  let certPem: string;
  let certDer: Buffer;
  if (existsSync(certPath)) {
    certPem = readFileSync(certPath, "utf-8");
    const certIsMatching = await certMatchesPublicKey(certPem, publicKey);
    if (!certIsMatching) {
      const regenerated = await createSelfSignedCa(
        { publicKey, privateKey },
        subject,
        validDays,
      );
      certPem = regenerated.certPem;
      certDer = regenerated.certDer;
      writeFileSync(certPath, certPem, { mode: 0o644 });
    } else {
      certDer = Buffer.from(
        certPem
          .replace(/-----BEGIN CERTIFICATE-----/g, "")
          .replace(/-----END CERTIFICATE-----/g, "")
          .replace(/\s+/g, ""),
        "base64",
      );
    }
  } else {
    const cert = await createSelfSignedCa(
      { publicKey, privateKey },
      subject,
      validDays,
    );
    certPem = cert.certPem;
    certDer = cert.certDer;
    writeFileSync(certPath, certPem, { mode: 0o644 });
  }

  cachedCa = {
    subject,
    privateKey,
    publicKey,
    certPem,
    certDer,
  };

  return cachedCa;
}

export async function getCertificateAuthority(): Promise<CertificateAuthority> {
  return await loadOrCreateCa();
}

export async function issueCertificateForJwk(
  jwk: Record<string, unknown>,
  subject: string,
  validityDays: number,
  subjectAltUri?: string | null,
): Promise<IssuedCertificate> {
  ensureCryptoProvider();
  const ca = await getCertificateAuthority();

  const publicKey = await webcrypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "Ed25519" } as any,
    true,
    ["verify"],
  );

  const notBefore = new Date();
  const notAfter = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
  const serialNumber = randomSerial();

  const extensions: any[] = [];
  if (BasicConstraintsExtension) {
    extensions.push(new BasicConstraintsExtension(false, undefined, true));
  }
  if (KeyUsagesExtension && KeyUsageFlags) {
    const usage = KeyUsageFlags.digitalSignature || 0;
    if (usage > 0) {
      extensions.push(new KeyUsagesExtension(usage, true));
    }
  }
  if (ExtendedKeyUsageExtension) {
    const clientAuthUsage =
      ExtendedKeyUsage?.clientAuth || "1.3.6.1.5.5.7.3.2";
    extensions.push(new ExtendedKeyUsageExtension([clientAuthUsage], false));
  }
  if (subjectAltUri && SubjectAlternativeNameExtension) {
    const sanType =
      typeof GENERAL_NAME_URL === "string" ? GENERAL_NAME_URL : "url";
    extensions.push(
      new SubjectAlternativeNameExtension(
        [{ type: sanType, value: subjectAltUri }],
        false,
      ),
    );
  }

  const cert = await X509CertificateGenerator.create({
    serialNumber,
    subject,
    issuer: ca.subject,
    notBefore,
    notAfter,
    publicKey,
    signingKey: ca.privateKey,
    signingAlgorithm: { name: "Ed25519" },
    extensions,
  });

  const certPem = encodeCertPem(cert);
  const certDer = certDerBuffer(cert);
  const caPem = ca.certPem;
  const caDer = ca.certDer;

  const fingerprintSha256 = createHash("sha256")
    .update(certDer)
    .digest("hex");

  return {
    certPem,
    chainPem: `${certPem}\n${caPem}`,
    x5c: [certDer.toString("base64"), caDer.toString("base64")],
    serial: serialNumber,
    notBefore,
    notAfter,
    fingerprintSha256,
  };
}
