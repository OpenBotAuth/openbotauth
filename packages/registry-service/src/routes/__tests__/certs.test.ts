import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the CA module to avoid actual certificate issuance in tests
vi.mock("../../utils/ca.js", () => ({
  issueCertificateForJwk: vi.fn().mockResolvedValue({
    serial: "test-serial-123",
    certPem: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
    chainPem: "-----BEGIN CERTIFICATE-----\nchain\n-----END CERTIFICATE-----",
    x5c: ["dGVzdA=="],
    notBefore: new Date().toISOString(),
    notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    fingerprintSha256: "a".repeat(64),
  }),
  getCertificateAuthority: vi.fn(),
}));

function mockDb(queryFn?: (...args: any[]) => any) {
  return {
    getPool: () => ({
      query: queryFn ?? vi.fn().mockResolvedValue({ rows: [] }),
    }),
  };
}

function mockReq(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    session: {
      user: {
        id: "u-1",
        email: "a@b.com",
        github_username: "gh",
        avatar_url: null,
      },
      profile: { id: "u-1", username: "testuser", client_name: null },
    },
    authMethod: "token",
    authScopes: ["agents:read", "agents:write"],
    params: {},
    query: {},
    body: {},
    app: { locals: { db: mockDb() } },
    ...overrides,
  };
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    headersSent: false,
    _onSend: null as (() => void) | null,
    setHeader(key: string, val: string) {
      res.headers[key] = val;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      res.headersSent = true;
      if (res._onSend) res._onSend();
      return res;
    },
    send(data: any) {
      res.body = data;
      res.headersSent = true;
      if (res._onSend) res._onSend();
      return res;
    },
  };
  return res;
}

async function callRoute(
  router: any,
  method: string,
  path: string,
  req: any,
  res: any,
) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    const methodHandlers = layer.route.methods;
    if (!methodHandlers[method.toLowerCase()]) continue;

    for (const stackLayer of layer.route.stack) {
      if (res.headersSent) break;
      await new Promise<void>((resolve, reject) => {
        res._onSend = resolve;
        try {
          const result = stackLayer.handle(req, res, (err?: any) => {
            res._onSend = null;
            if (err) reject(err);
            else resolve();
          });
          if (result && typeof result.then === "function") {
            result.then(() => resolve()).catch(reject);
          }
        } catch (err) {
          reject(err);
        }
      });
    }
    return;
  }

  throw new Error(`No route found: ${method} ${path}`);
}

let certsRouter: any;

beforeEach(async () => {
  const mod = await import("../certs.js");
  certsRouter = mod.certsRouter;
});

describe("GET /v1/certs", () => {
  it("enforces owner scoping and returns no-store metadata", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "c-1",
            agent_id: "a-1",
            kid: "kid-1",
            serial: "serial-1",
            fingerprint_sha256: "fp-1",
            not_before: "2026-01-01T00:00:00.000Z",
            not_after: "2026-03-01T00:00:00.000Z",
            revoked_at: null,
            revoked_reason: null,
            created_at: "2026-01-01T00:00:00.000Z",
            is_active: true,
          },
        ],
      });

    const req = mockReq({
      query: { agent_id: "a-1", limit: "50", offset: "0" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(query).toHaveBeenCalledTimes(2);

    const [countSql, countParams] = query.mock.calls[0];
    expect(countSql).toContain("SELECT COUNT(*)::int AS total");
    expect(countSql).toContain("JOIN agents a ON a.id = c.agent_id");
    expect(countSql).toContain("a.user_id = $1");
    expect(countParams[0]).toBe("u-1");

    const [pageSql, pageParams] = query.mock.calls[1];
    expect(pageSql).toContain("ORDER BY c.created_at DESC");
    expect(pageSql).toContain("LIMIT $3");
    expect(pageSql).toContain("OFFSET $4");
    expect(pageParams).toEqual(["u-1", "a-1", 50, 0]);

    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
  });

  it("applies status=active filter", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const req = mockReq({
      query: { status: "active" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs", req, res);

    expect(res.statusCode).toBe(200);
    const [countSql] = query.mock.calls[0];
    expect(countSql).toContain("c.revoked_at IS NULL AND c.not_before <= now() AND c.not_after > now()");
    const [pageSql] = query.mock.calls[1];
    expect(pageSql).toContain("c.revoked_at IS NULL AND c.not_before <= now() AND c.not_after > now()");
  });

  it("applies status=revoked filter", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const req = mockReq({
      query: { status: "revoked" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs", req, res);

    expect(res.statusCode).toBe(200);
    const [countSql] = query.mock.calls[0];
    expect(countSql).toContain("c.revoked_at IS NOT NULL");
    const [pageSql] = query.mock.calls[1];
    expect(pageSql).toContain("c.revoked_at IS NOT NULL");
  });

  it("returns non-zero total when requested page is empty", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: 3 }] })
      .mockResolvedValueOnce({ rows: [] });
    const req = mockReq({
      query: { limit: "2", offset: "10" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toEqual([]);
  });
});

describe("POST /v1/certs/issue - PoP validation", () => {
  const mockAgentQuery = vi.fn().mockResolvedValue({
    rows: [
      {
        id: "agent-123",
        user_id: "u-1",
        name: "Test Agent",
        public_key: {
          kty: "OKP",
          crv: "Ed25519",
          x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
        },
      },
    ],
  });

  it("rejects missing proof", async () => {
    const req = mockReq({
      body: { agent_id: "agent-123" },
      app: { locals: { db: mockDb(mockAgentQuery) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "POST", "/v1/certs/issue", req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("proof-of-possession");
  });

  it("rejects invalid proof message format", async () => {
    const req = mockReq({
      body: {
        agent_id: "agent-123",
        proof: { message: "invalid-format", signature: "abc" },
      },
      app: { locals: { db: mockDb(mockAgentQuery) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "POST", "/v1/certs/issue", req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("Invalid proof message format");
  });

  it("rejects expired timestamp", async () => {
    const expiredTs = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
    const req = mockReq({
      body: {
        agent_id: "agent-123",
        proof: {
          message: `cert-issue:agent-123:${expiredTs}`,
          signature: Buffer.alloc(64).toString("base64"),
        },
      },
      app: { locals: { db: mockDb(mockAgentQuery) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "POST", "/v1/certs/issue", req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("expired");
  });

  it("rejects future timestamp beyond drift tolerance", async () => {
    const futureTs = Math.floor(Date.now() / 1000) + 120; // 2 minutes in future
    const req = mockReq({
      body: {
        agent_id: "agent-123",
        proof: {
          message: `cert-issue:agent-123:${futureTs}`,
          signature: Buffer.alloc(64).toString("base64"),
        },
      },
      app: { locals: { db: mockDb(mockAgentQuery) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "POST", "/v1/certs/issue", req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("future");
  });

  it("rejects agent_id mismatch in proof", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const req = mockReq({
      body: {
        agent_id: "agent-123",
        proof: {
          message: `cert-issue:different-agent:${ts}`,
          signature: Buffer.alloc(64).toString("base64"),
        },
      },
      app: { locals: { db: mockDb(mockAgentQuery) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "POST", "/v1/certs/issue", req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("does not match");
  });

  it("rejects invalid signature length", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const req = mockReq({
      body: {
        agent_id: "agent-123",
        proof: {
          message: `cert-issue:agent-123:${ts}`,
          signature: Buffer.alloc(32).toString("base64"), // wrong length
        },
      },
      app: { locals: { db: mockDb(mockAgentQuery) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "POST", "/v1/certs/issue", req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("64 bytes");
  });

  it("accepts valid proof and issues certificate", async () => {
    // Generate a real Ed25519 keypair
    const keyPair = await webcrypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    );

    // Export public key as JWK
    const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);

    // Create proof message and sign it
    const agentId = "agent-real-123";
    const ts = Math.floor(Date.now() / 1000);
    const message = `cert-issue:${agentId}:${ts}`;
    const messageBuffer = new TextEncoder().encode(message);
    const signatureBuffer = await webcrypto.subtle.sign(
      { name: "Ed25519" },
      keyPair.privateKey,
      messageBuffer,
    );
    const signature = Buffer.from(signatureBuffer).toString("base64");

    // Mock agent query to return our generated public key
    const agentQuery = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: agentId,
            user_id: "u-1",
            name: "Test Agent",
            public_key: {
              kty: "OKP",
              crv: "Ed25519",
              x: publicJwk.x,
            },
          },
        ],
      })
      // Mock the nonce check (new nonce, not a replay)
      .mockResolvedValueOnce({ rows: [{ is_new: true }] })
      // Mock the INSERT query for certificate
      .mockResolvedValueOnce({ rows: [] });

    const req = mockReq({
      body: {
        agent_id: agentId,
        proof: { message, signature },
      },
      app: { locals: { db: mockDb(agentQuery) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "POST", "/v1/certs/issue", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.serial).toBe("test-serial-123");
    expect(res.body.fingerprint_sha256).toBeDefined();
  });

  it("rejects replayed proof (same message used twice)", async () => {
    // Generate a real Ed25519 keypair
    const keyPair = await webcrypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    );

    const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);

    const agentId = "agent-replay-test";
    const ts = Math.floor(Date.now() / 1000);
    const message = `cert-issue:${agentId}:${ts}`;
    const messageBuffer = new TextEncoder().encode(message);
    const signatureBuffer = await webcrypto.subtle.sign(
      { name: "Ed25519" },
      keyPair.privateKey,
      messageBuffer,
    );
    const signature = Buffer.from(signatureBuffer).toString("base64");

    // Mock: agent query succeeds, nonce check returns false (already used)
    const agentQuery = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: agentId,
            user_id: "u-1",
            name: "Test Agent",
            public_key: {
              kty: "OKP",
              crv: "Ed25519",
              x: publicJwk.x,
            },
          },
        ],
      })
      // Nonce check returns false (replay)
      .mockResolvedValueOnce({ rows: [{ is_new: false }] });

    const req = mockReq({
      body: {
        agent_id: agentId,
        proof: { message, signature },
      },
      app: { locals: { db: mockDb(agentQuery) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "POST", "/v1/certs/issue", req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("replay");
  });
});

describe("POST /v1/certs/revoke", () => {
  it("only updates certs that are not already revoked", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "c-1" }] });
    const req = mockReq({
      body: { serial: "serial-1", reason: "key-compromise" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "POST", "/v1/certs/revoke", req, res);

    expect(res.statusCode).toBe(200);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("AND c.revoked_at IS NULL");
  });
});

describe("GET /v1/certs/status", () => {
  it("includes not_before and reports valid only within not_before/not_after window", async () => {
    const now = Date.now();
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          serial: "serial-1",
          fingerprint_sha256: "fp-1",
          not_before: new Date(now - 60_000).toISOString(),
          not_after: new Date(now + 60_000).toISOString(),
          revoked_at: null,
          revoked_reason: null,
        },
      ],
    });
    const req = mockReq({
      query: { serial: "serial-1" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/status", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.body.valid).toBe(true);
    expect(res.body.revoked).toBe(false);
    expect(res.body.not_before).toBeDefined();

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("c.not_before");
    expect(params).toEqual(["u-1", "serial-1"]);
  });

  it("returns valid=false when cert is not yet valid", async () => {
    const now = Date.now();
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          serial: "serial-future",
          fingerprint_sha256: "fp-future",
          not_before: new Date(now + 3_600_000).toISOString(),
          not_after: new Date(now + 7_200_000).toISOString(),
          revoked_at: null,
          revoked_reason: null,
        },
      ],
    });
    const req = mockReq({
      query: { fingerprint_sha256: "fp-future" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/status", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.revoked).toBe(false);
    expect(res.body.not_before).toBeDefined();
  });
});

describe("GET /v1/certs/public-status", () => {
  it("is registered before /v1/certs/:serial to avoid route shadowing", () => {
    const routePaths = certsRouter.stack
      .filter((layer: any) => Boolean(layer.route))
      .map((layer: any) => layer.route.path);

    const publicStatusIndex = routePaths.indexOf("/v1/certs/public-status");
    const serialIndex = routePaths.indexOf("/v1/certs/:serial");

    expect(publicStatusIndex).toBeGreaterThanOrEqual(0);
    expect(serialIndex).toBeGreaterThanOrEqual(0);
    expect(publicStatusIndex).toBeLessThan(serialIndex);
  });

  it("requires fingerprint_sha256 parameter", async () => {
    const req = mockReq({ query: {} });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/public-status", req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("fingerprint_sha256");
  });

  it("rejects invalid fingerprint format", async () => {
    const req = mockReq({ query: { fingerprint_sha256: "not-valid-hex" } });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/public-status", req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("64 hex characters");
  });

  it("rejects fingerprint with wrong length", async () => {
    const req = mockReq({ query: { fingerprint_sha256: "abcd1234" } });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/public-status", req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("64 hex characters");
  });

  it("normalizes uppercase fingerprint to lowercase", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = {
      headers: {},
      query: { fingerprint_sha256: "A".repeat(64) },
      app: { locals: { db: mockDb(query) } },
    } as any;
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/public-status", req, res);

    // Should reach DB query (not rejected as invalid format)
    expect(query).toHaveBeenCalled();
    const [, params] = query.mock.calls[0];
    expect(params[0]).toBe("a".repeat(64)); // lowercased
  });

  it("returns validity status without authentication", async () => {
    const now = Date.now();
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          not_before: new Date(now - 60_000).toISOString(),
          not_after: new Date(now + 60_000).toISOString(),
          revoked_at: null,
          revoked_reason: null,
        },
      ],
    });
    // Create request without session (public endpoint)
    // Use valid 64-char hex fingerprint
    const req = {
      headers: {},
      query: { fingerprint_sha256: "a".repeat(64) },
      app: { locals: { db: mockDb(query) } },
    } as any;
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/public-status", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.body.valid).toBe(true);
    expect(res.body.revoked).toBe(false);
    expect(res.body.not_before).toBeDefined();
    expect(res.body.not_after).toBeDefined();

    // Verify query does NOT include user_id filter
    const [sql] = query.mock.calls[0];
    expect(sql).not.toContain("user_id");
    expect(sql).toContain("fingerprint_sha256 = $1");
  });

  it("returns valid=false for future not_before", async () => {
    const now = Date.now();
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          not_before: new Date(now + 3_600_000).toISOString(),
          not_after: new Date(now + 7_200_000).toISOString(),
          revoked_at: null,
          revoked_reason: null,
        },
      ],
    });
    // Use valid 64-char hex fingerprint
    const req = {
      headers: {},
      query: { fingerprint_sha256: "b".repeat(64) },
      app: { locals: { db: mockDb(query) } },
    } as any;
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/public-status", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.revoked).toBe(false);
  });

  it("returns valid=false for revoked certs", async () => {
    const now = Date.now();
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          not_before: new Date(now - 60_000).toISOString(),
          not_after: new Date(now + 60_000).toISOString(),
          revoked_at: new Date(now - 30_000).toISOString(),
          revoked_reason: "key-compromise",
        },
      ],
    });
    const req = {
      headers: {},
      query: { fingerprint_sha256: "c".repeat(64) },
      app: { locals: { db: mockDb(query) } },
    } as any;
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/public-status", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.revoked).toBe(true);
    expect(res.body.revoked_at).toBeDefined();
    expect(res.body.revoked_reason).toBe("key-compromise");
  });

  it("returns valid=false for expired certs", async () => {
    const now = Date.now();
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          not_before: new Date(now - 7_200_000).toISOString(),
          not_after: new Date(now - 3_600_000).toISOString(), // expired 1 hour ago
          revoked_at: null,
          revoked_reason: null,
        },
      ],
    });
    const req = {
      headers: {},
      query: { fingerprint_sha256: "d".repeat(64) },
      app: { locals: { db: mockDb(query) } },
    } as any;
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/public-status", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.revoked).toBe(false);
  });

  it("returns 404 when cert not found", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = {
      headers: {},
      query: { fingerprint_sha256: "e".repeat(64) },
      app: { locals: { db: mockDb(query) } },
    } as any;
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/public-status", req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("GET /v1/certs/:serial", () => {
  it("does not leak certs outside owner scope", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = mockReq({
      params: { serial: "serial-other-user" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/:serial", req, res);

    expect(res.statusCode).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("JOIN agents a ON a.id = c.agent_id");
    expect(sql).toContain("a.user_id = $1 AND c.serial = $2");
    expect(params).toEqual(["u-1", "serial-other-user"]);
  });

  it("returns cert metadata and PEM data for owned cert", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "c-1",
          agent_id: "a-1",
          kid: "kid-1",
          serial: "serial-1",
          fingerprint_sha256: "fp-1",
          not_before: "2026-01-01T00:00:00.000Z",
          not_after: "2026-03-01T00:00:00.000Z",
          revoked_at: null,
          revoked_reason: null,
          created_at: "2026-01-01T00:00:00.000Z",
          cert_pem: "-----BEGIN CERTIFICATE-----...",
          chain_pem: "-----BEGIN CERTIFICATE-----...",
          x5c: ["abc", "def"],
          is_active: true,
        },
      ],
    });

    const req = mockReq({
      params: { serial: "serial-1" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs/:serial", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.body.serial).toBe("serial-1");
    expect(res.body.chain_pem).toContain("BEGIN CERTIFICATE");
  });
});
