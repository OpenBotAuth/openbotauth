/**
 * X.509 delegation validation for JWKS keys (x5c / x5u)
 */

import { X509Certificate, createPublicKey } from "node:crypto";
import { validateSafeUrl } from "./signature-parser.js";

export interface X509ValidationOptions {
  trustAnchors: string[];
}

export interface X509ValidationResult {
  valid: boolean;
  error?: string;
}

function parseCertificate(input: Buffer | string): X509Certificate {
  return new X509Certificate(input);
}

function isPem(data: Buffer): boolean {
  const text = data.toString("utf-8");
  return text.includes("-----BEGIN CERTIFICATE-----");
}

function normalizePem(input: string): string {
  return input.includes("-----BEGIN CERTIFICATE-----")
    ? input
    : `-----BEGIN CERTIFICATE-----\n${input}\n-----END CERTIFICATE-----`;
}

function jwkMatchesCertPublicKey(jwk: any, cert: X509Certificate): boolean {
  const jwkKey = createPublicKey({ key: jwk, format: "jwk" });
  const jwkSpki = jwkKey.export({ type: "spki", format: "der" }) as Buffer;
  const certSpki = cert.publicKey.export({ type: "spki", format: "der" }) as Buffer;
  return jwkSpki.equals(certSpki);
}

function parseTrustAnchors(pems: string[]): X509Certificate[] {
  return pems
    .map((pem) => normalizePem(pem))
    .map((pem) => parseCertificate(pem));
}

function validateCertificateTimes(certs: X509Certificate[]): string | null {
  const now = Date.now();
  for (const cert of certs) {
    const notBefore = Date.parse(cert.validFrom);
    const notAfter = Date.parse(cert.validTo);
    if (Number.isNaN(notBefore) || Number.isNaN(notAfter)) {
      return "X.509 validation failed: invalid certificate validity window";
    }
    if (now < notBefore || now > notAfter) {
      return "X.509 validation failed: certificate expired or not yet valid";
    }
  }
  return null;
}

function validateChain(
  certs: X509Certificate[],
  trustAnchors: X509Certificate[],
): string | null {
  if (certs.length === 0) {
    return "X.509 validation failed: empty certificate chain";
  }

  const timeError = validateCertificateTimes(certs);
  if (timeError) return timeError;

  // Verify each cert is signed by its issuer (next cert in chain)
  for (let i = 0; i < certs.length - 1; i++) {
    const cert = certs[i];
    const issuer = certs[i + 1];
    if (!cert.verify(issuer.publicKey)) {
      return "X.509 validation failed: certificate chain signature mismatch";
    }
  }

  // Verify last cert against trust anchors
  const last = certs[certs.length - 1];
  for (const anchor of trustAnchors) {
    if (anchor.fingerprint256 === last.fingerprint256) {
      return null;
    }
    if (last.verify(anchor.publicKey)) {
      return null;
    }
  }

  return "X.509 validation failed: chain does not terminate at a trusted anchor";
}

async function fetchX5uCert(x5u: string): Promise<X509Certificate> {
  validateSafeUrl(x5u);

  const response = await fetch(x5u, {
    method: "GET",
    headers: {
      Accept:
        "application/pkix-cert, application/x-x509-ca-cert, application/octet-stream, application/x-pem-file",
    },
    signal: AbortSignal.timeout(3000),
    redirect: "manual",
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("Redirect not allowed for x5u");
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch x5u certificate: ${response.status}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 1024 * 1024) {
    throw new Error("x5u certificate too large");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (isPem(buffer)) {
    return parseCertificate(buffer.toString("utf-8"));
  }
  return parseCertificate(buffer);
}

export async function validateJwkX509(
  jwk: any,
  options: X509ValidationOptions,
): Promise<X509ValidationResult> {
  try {
    if (!options.trustAnchors || options.trustAnchors.length === 0) {
      return {
        valid: false,
        error: "X.509 validation failed: trust anchors not configured",
      };
    }

    let certs: X509Certificate[] = [];
    if (Array.isArray(jwk?.x5c) && jwk.x5c.length > 0) {
      certs = jwk.x5c
        .filter((entry: any) => typeof entry === "string" && entry.length > 0)
        .map((entry: string) =>
          parseCertificate(Buffer.from(entry, "base64")),
        );
    } else if (typeof jwk?.x5u === "string" && jwk.x5u.length > 0) {
      const cert = await fetchX5uCert(jwk.x5u);
      certs = [cert];
    } else {
      return { valid: true };
    }

    if (certs.length === 0) {
      return {
        valid: false,
        error: "X.509 validation failed: no certificates provided",
      };
    }

    // Bind leaf cert public key to JWK
    if (!jwkMatchesCertPublicKey(jwk, certs[0])) {
      return {
        valid: false,
        error: "X.509 validation failed: leaf certificate key mismatch",
      };
    }

    const trustAnchors = parseTrustAnchors(options.trustAnchors);
    const chainError = validateChain(certs, trustAnchors);
    if (chainError) {
      return { valid: false, error: chainError };
    }

    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: error?.message || "X.509 validation failed",
    };
  }
}
