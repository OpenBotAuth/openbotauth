import { describe, it, expect, vi } from "vitest";
import { JWKSCacheManager } from "./jwks-cache.js";
import {
  generateKidFromJWK,
  generateLegacyKidFromJWK,
} from "@openbotauth/registry-signer";

describe("JWKSCacheManager.getKey", () => {
  const thumbprintInput = {
    kty: "OKP" as const,
    crv: "Ed25519" as const,
    x: Buffer.alloc(32, 7).toString("base64url"),
  };
  const fullKid = generateKidFromJWK(thumbprintInput);
  const legacyKid = generateLegacyKidFromJWK(thumbprintInput);

  const key = {
    ...thumbprintInput,
    kid: fullKid,
    use: "sig",
  };

  function createManagerWithJwks(jwks: any): JWKSCacheManager {
    const manager = new JWKSCacheManager({
      get: vi.fn(),
      setEx: vi.fn(),
      del: vi.fn(),
      keys: vi.fn(),
    } as any);
    vi.spyOn(manager, "getJWKS").mockResolvedValue(jwks);
    return manager;
  }

  it("returns exact kid match", async () => {
    const manager = createManagerWithJwks({ keys: [key] });
    await expect(manager.getKey("https://example.com/jwks.json", fullKid)).resolves.toEqual(
      key,
    );
  });

  it("matches legacy 16-char kid against full-thumbprint JWKS key", async () => {
    const manager = createManagerWithJwks({ keys: [key] });
    await expect(
      manager.getKey("https://example.com/jwks.json", legacyKid),
    ).resolves.toEqual(key);
  });

  it("matches full-thumbprint kid against legacy JWKS key", async () => {
    const manager = createManagerWithJwks({
      keys: [{ ...key, kid: legacyKid }],
    });
    await expect(
      manager.getKey("https://example.com/jwks.json", fullKid),
    ).resolves.toEqual({ ...key, kid: legacyKid });
  });

  it("throws when compatibility lookup is ambiguous", async () => {
    const manager = createManagerWithJwks({
      keys: [
        { ...key, kid: "legacy-a" },
        { ...key, kid: "legacy-b" },
      ],
    });

    await expect(
      manager.getKey("https://example.com/jwks.json", fullKid),
    ).rejects.toThrow(/Ambiguous kid/);
  });
});

