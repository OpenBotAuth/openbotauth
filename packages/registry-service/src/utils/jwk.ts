import { createHash } from "node:crypto";

function base64Url(input: string): string {
  return input.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// RFC 7638 OKP thumbprint over the canonical {crv,kty,x} members
export function jwkThumbprint(jwk: { kty: string; crv: string; x: string }): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  const hash = createHash("sha256").update(canonical).digest("base64");
  return base64Url(hash);
}
