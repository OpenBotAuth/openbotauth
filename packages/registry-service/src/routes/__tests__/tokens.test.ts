import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

/**
 * We test the route handlers by importing the router and invoking the
 * underlying handler functions extracted via the route stack.
 *
 * This avoids needing supertest while still testing real validation logic.
 */

// --- Helpers ---

function mockReq(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    session: {
      user: { id: 'u-1', email: 'a@b.com', github_username: 'gh', avatar_url: null },
      profile: { id: 'u-1', username: 'gh', client_name: null },
    },
    authMethod: 'session',
    params: {},
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
  };
  return res;
}

function mockDb(queryFn?: (...args: any[]) => any) {
  return {
    getPool: () => ({
      query: queryFn ?? vi.fn().mockResolvedValue({ rows: [] }),
    }),
  };
}

/**
 * Extracts route handler(s) from an express Router stack entry.
 * Express routers store layers with route.stack containing the middleware chain.
 * We call each middleware in sequence, stopping if the response was sent.
 */
async function callRoute(
  router: any,
  method: string,
  path: string,
  req: any,
  res: any,
) {
  // Find matching layer
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    const methodHandlers = layer.route.methods;
    if (!methodHandlers[method.toLowerCase()]) continue;

    // Run each handler in the chain (guards + main handler)
    for (const stackLayer of layer.route.stack) {
      if (res.headersSent) break;
      await new Promise<void>((resolve, reject) => {
        // If the handler sends a response without calling next(), resolve via _onSend
        res._onSend = resolve;
        try {
          const result = stackLayer.handle(req, res, (err?: any) => {
            res._onSend = null;
            if (err) reject(err);
            else resolve();
          });
          // Handle async handlers that return a Promise (and may send response internally)
          if (result && typeof result.then === 'function') {
            result.then(() => {
              // If the handler resolved its promise, resolve ours too
              // (response may already be sent, or handler just completed)
              resolve();
            }).catch(reject);
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

// Dynamically import so vitest can handle ESM
let tokensRouter: any;

beforeEach(async () => {
  const mod = await import('../tokens.js');
  tokensRouter = mod.tokensRouter;
});

// --- requireSessionAuth guard ---

describe('requireSessionAuth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const req = mockReq({ session: undefined, authMethod: undefined });
    const res = mockRes();

    await callRoute(tokensRouter, 'GET', '/', req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('rejects token-authed requests with 403', async () => {
    const req = mockReq({ authMethod: 'token' });
    const res = mockRes();

    await callRoute(tokensRouter, 'GET', '/', req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/session authentication/);
  });
});

// --- POST /auth/tokens (create) ---

describe('POST /auth/tokens', () => {
  it('rejects empty name', async () => {
    const req = mockReq({ body: { name: '' } });
    const res = mockRes();
    await callRoute(tokensRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects name exceeding max length', async () => {
    const req = mockReq({ body: { name: 'a'.repeat(101) } });
    const res = mockRes();
    await callRoute(tokensRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects name with control characters', async () => {
    const req = mockReq({ body: { name: 'bad\x00name' } });
    const res = mockRes();
    await callRoute(tokensRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/printable ASCII/);
  });

  it('rejects non-string scope entries', async () => {
    const req = mockReq({ body: { name: 'test', scopes: [123] } });
    const res = mockRes();
    await callRoute(tokensRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/must be a string/);
  });

  it('rejects invalid scope', async () => {
    const req = mockReq({ body: { name: 'test', scopes: ['admin:nuke'] } });
    const res = mockRes();
    await callRoute(tokensRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid scope/);
  });

  it('rejects non-integer expires_in_days', async () => {
    const req = mockReq({ body: { name: 'test', expires_in_days: 1.5 } });
    const res = mockRes();
    await callRoute(tokensRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects expires_in_days out of range', async () => {
    const req = mockReq({ body: { name: 'test', expires_in_days: 999 } });
    const res = mockRes();
    await callRoute(tokensRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
  });

  it('creates token and returns raw token with 201', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] }) // count check
      .mockResolvedValueOnce({
        rows: [{
          id: 'tok-1',
          name: 'my-token',
          token_prefix: 'oba_abcd',
          scopes: ['agents:read'],
          expires_at: '2025-12-31T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
        }],
      }); // insert

    const req = mockReq({
      body: { name: 'my-token', scopes: ['agents:read'], expires_in_days: 30 },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(tokensRouter, 'POST', '/', req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.token).toMatch(/^oba_[0-9a-f]{64}$/);
    expect(res.body.id).toBe('tok-1');
    expect(res.body.name).toBe('my-token');
  });

  it('rejects when user has too many tokens', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ cnt: 25 }] }); // count check

    const req = mockReq({
      body: { name: 'another-token' },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(tokensRouter, 'POST', '/', req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Maximum/);
  });
});

// --- GET /auth/tokens (list) ---

describe('GET /auth/tokens', () => {
  it('returns list of tokens without raw token or hash', async () => {
    const rows = [
      {
        id: 'tok-1',
        name: 'my-token',
        token_prefix: 'oba_abcd',
        scopes: [],
        expires_at: null,
        last_used_at: null,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const req = mockReq({ app: { locals: { db: mockDb(query) } } });
    const res = mockRes();

    await callRoute(tokensRouter, 'GET', '/', req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].token_prefix).toBe('oba_abcd');
    expect(res.body[0]).not.toHaveProperty('token');
    expect(res.body[0]).not.toHaveProperty('token_hash');
  });
});

// --- DELETE /auth/tokens/:id ---

describe('DELETE /auth/tokens/:id', () => {
  it('rejects invalid UUID', async () => {
    const req = mockReq({ params: { id: 'not-a-uuid' } });
    const res = mockRes();

    await callRoute(tokensRouter, 'DELETE', '/:id', req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid token id/);
  });

  it('returns 404 when token does not belong to user', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = mockReq({
      params: { id: '00000000-0000-0000-0000-000000000001' },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(tokensRouter, 'DELETE', '/:id', req, res);

    expect(res.statusCode).toBe(404);
  });

  it('deletes token and returns success', async () => {
    const tokenId = '00000000-0000-0000-0000-000000000001';
    const query = vi.fn().mockResolvedValue({ rows: [{ id: tokenId }] });
    const req = mockReq({
      params: { id: tokenId },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();

    await callRoute(tokensRouter, 'DELETE', '/:id', req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, id: tokenId });
  });
});
