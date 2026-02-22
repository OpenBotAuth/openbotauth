import { beforeEach, describe, expect, it, vi } from "vitest";

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
    authMethod: "session",
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
          is_active: true,
          total_count: "1",
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
    expect(query).toHaveBeenCalledTimes(1);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("JOIN agents a ON a.id = c.agent_id");
    expect(sql).toContain("a.user_id = $1");
    expect(params[0]).toBe("u-1");

    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).not.toHaveProperty("total_count");
  });

  it("applies status=active filter", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = mockReq({
      query: { status: "active" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs", req, res);

    expect(res.statusCode).toBe(200);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("c.revoked_at IS NULL AND c.not_after > now()");
  });

  it("applies status=revoked filter", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = mockReq({
      query: { status: "revoked" },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(certsRouter, "GET", "/v1/certs", req, res);

    expect(res.statusCode).toBe(200);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("c.revoked_at IS NOT NULL");
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
