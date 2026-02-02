import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for auth, privacy, and input-validation fixes on:
 *   - PUT  /telemetry/:username/visibility  (auth + ownership)
 *   - GET  /telemetry/:username             (server-side privacy)
 *   - POST /agent-activity                  (auth + validation)
 *   - GET  /agent-activity/:agent_id        (redaction + limit cap)
 *   - PUT  /profiles                        (field whitelist)
 *
 * Uses the same mock req/res/callRoute pattern as tokens.test.ts.
 */

// --- Helpers ---

function mockReq(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    session: {
      user: { id: 'u-1', email: 'a@b.com', github_username: 'gh', avatar_url: null },
      profile: { id: 'u-1', username: 'testuser', client_name: null },
    },
    authMethod: 'session',
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
  };
  return res;
}

function mockDb(queryFn?: (...args: any[]) => any) {
  return {
    getPool: () => ({
      query: queryFn ?? vi.fn().mockResolvedValue({ rows: [] }),
    }),
    findProfileByUsername: vi.fn().mockResolvedValue(null),
    updateProfile: vi.fn().mockResolvedValue({
      id: 'u-1',
      username: 'testuser',
      client_name: 'updated',
    }),
  };
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
          if (result && typeof result.then === 'function') {
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

// --- Dynamic imports ---

let activityRouter: any;
let profilesRouter: any;

beforeEach(async () => {
  const actMod = await import('../activity.js');
  activityRouter = actMod.activityRouter;

  const profMod = await import('../profiles.js');
  profilesRouter = profMod.profilesRouter;
});

// =============================================================================
// POST /agent-activity
// =============================================================================

describe('POST /agent-activity', () => {
  const VALID_UUID = '00000000-0000-0000-0000-000000000001';

  it('returns 401 without session', async () => {
    const req = mockReq({ session: undefined });
    const res = mockRes();
    await callRoute(activityRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 400 for missing required fields', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await callRoute(activityRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields/);
  });

  it('returns 400 for invalid agent_id format', async () => {
    const req = mockReq({
      body: { agent_id: 'not-a-uuid', target_url: 'https://example.com', method: 'GET', status_code: 200 },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/UUID/);
  });

  it('returns 400 for invalid HTTP method', async () => {
    const req = mockReq({
      body: { agent_id: VALID_UUID, target_url: 'https://example.com', method: 'HACK', status_code: 200 },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/method must be one of/);
  });

  it('returns 400 for status_code outside range', async () => {
    const req = mockReq({
      body: { agent_id: VALID_UUID, target_url: 'https://example.com', method: 'GET', status_code: 999 },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/status_code/);
  });

  it('returns 400 for non-numeric status_code', async () => {
    const req = mockReq({
      body: { agent_id: VALID_UUID, target_url: 'https://example.com', method: 'GET', status_code: 'abc' },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/status_code/);
  });

  it('returns 400 for invalid target_url', async () => {
    const req = mockReq({
      body: { agent_id: VALID_UUID, target_url: 'not a url', method: 'GET', status_code: 200 },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/target_url/);
  });

  it('returns 400 for negative response_time_ms', async () => {
    const req = mockReq({
      body: {
        agent_id: VALID_UUID,
        target_url: 'https://example.com',
        method: 'GET',
        status_code: 200,
        response_time_ms: -5,
      },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/response_time_ms/);
  });

  it('returns 403 when agent not owned by user', async () => {
    // ownership query returns empty
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = mockReq({
      body: {
        agent_id: VALID_UUID,
        target_url: 'https://example.com',
        method: 'GET',
        status_code: 200,
      },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/not owned/);
  });

  it('succeeds with valid data and owned agent', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] }) // ownership check
      .mockResolvedValueOnce({ rows: [{ id: 'act-1' }] }); // insert

    const req = mockReq({
      body: {
        agent_id: VALID_UUID,
        target_url: 'https://example.com/page',
        method: 'get', // lowercase should be accepted
        status_code: '200', // string should be coerced
      },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'POST', '/', req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.activity_id).toBe('act-1');
  });
});

// =============================================================================
// GET /agent-activity/:agent_id
// =============================================================================

describe('GET /agent-activity/:agent_id', () => {
  const VALID_UUID = '00000000-0000-0000-0000-000000000001';

  it('returns 400 for invalid UUID', async () => {
    const req = mockReq({ params: { agent_id: 'bad' }, session: undefined });
    const res = mockRes();
    await callRoute(activityRouter, 'GET', '/:agent_id', req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/UUID/);
  });

  it('returns redacted data (origin only) for public (no session)', async () => {
    const rows = [
      {
        id: '1',
        target_url: 'https://example.com/secret/path?token=abc',
        method: 'GET',
        status_code: 200,
        response_time_ms: 42,
        timestamp: '2025-01-01T00:00:00Z',
      },
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const req = mockReq({
      params: { agent_id: VALID_UUID },
      session: undefined,
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'GET', '/:agent_id', req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.activity).toHaveLength(1);
    const item = res.body.activity[0];
    expect(item.origin).toBe('https://example.com');
    expect(item).not.toHaveProperty('target_url');
    expect(item).not.toHaveProperty('response_time_ms');
  });

  it('returns full data for owner', async () => {
    const activityRows = [
      {
        id: '1',
        target_url: 'https://example.com/secret/path?token=abc',
        method: 'GET',
        status_code: 200,
        response_time_ms: 42,
        timestamp: '2025-01-01T00:00:00Z',
      },
    ];
    // First query: ownership check → found
    // Second query: activity rows
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] }) // owner check
      .mockResolvedValueOnce({ rows: activityRows }); // activity

    const req = mockReq({
      params: { agent_id: VALID_UUID },
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'GET', '/:agent_id', req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.activity).toHaveLength(1);
    expect(res.body.activity[0].target_url).toBe('https://example.com/secret/path?token=abc');
    expect(res.body.activity[0].response_time_ms).toBe(42);
  });

  it('caps limit at 200', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = mockReq({
      params: { agent_id: VALID_UUID },
      query: { limit: '9999' },
      session: undefined,
      app: { locals: { db: mockDb(query) } },
    });
    const res = mockRes();
    await callRoute(activityRouter, 'GET', '/:agent_id', req, res);

    // The query call should have limit = 200
    const queryCall = query.mock.calls[0];
    expect(queryCall[1][1]).toBe(200); // limit param
  });
});

// =============================================================================
// PUT /profiles (field whitelist)
// =============================================================================

describe('PUT /profiles', () => {
  it('silently ignores username in body', async () => {
    const updateProfile = vi.fn().mockResolvedValue({
      id: 'u-1',
      username: 'testuser',
      client_name: 'legit',
    });
    const db = {
      getPool: () => ({ query: vi.fn() }),
      updateProfile,
    };
    const req = mockReq({
      body: { username: 'hacked', client_name: 'legit' },
      app: { locals: { db } },
    });
    const res = mockRes();
    await callRoute(profilesRouter, 'PUT', '/', req, res);

    expect(res.statusCode).toBe(200);
    // updateProfile should have been called without 'username'
    const passedUpdates = updateProfile.mock.calls[0][1];
    expect(passedUpdates).not.toHaveProperty('username');
    expect(passedUpdates.client_name).toBe('legit');
  });

  it('silently ignores github_username in body', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ id: 'u-1' });
    const db = {
      getPool: () => ({ query: vi.fn() }),
      updateProfile,
    };
    const req = mockReq({
      body: { github_username: 'evil', client_name: 'ok' },
      app: { locals: { db } },
    });
    const res = mockRes();
    await callRoute(profilesRouter, 'PUT', '/', req, res);

    expect(res.statusCode).toBe(200);
    const passedUpdates = updateProfile.mock.calls[0][1];
    expect(passedUpdates).not.toHaveProperty('github_username');
  });

  it('silently ignores arbitrary unknown fields', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ id: 'u-1' });
    const db = {
      getPool: () => ({ query: vi.fn() }),
      updateProfile,
    };
    const req = mockReq({
      body: { is_admin: true, sql_inject: 'DROP TABLE', client_name: 'ok' },
      app: { locals: { db } },
    });
    const res = mockRes();
    await callRoute(profilesRouter, 'PUT', '/', req, res);

    expect(res.statusCode).toBe(200);
    const passedUpdates = updateProfile.mock.calls[0][1];
    expect(passedUpdates).not.toHaveProperty('is_admin');
    expect(passedUpdates).not.toHaveProperty('sql_inject');
    expect(passedUpdates.client_name).toBe('ok');
  });

  it('accepts valid safe fields', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ id: 'u-1' });
    const db = {
      getPool: () => ({ query: vi.fn() }),
      updateProfile,
    };
    const req = mockReq({
      body: {
        client_name: 'MyBot',
        client_uri: 'https://example.com',
        contacts: ['admin@example.com'],
        trigger: 'fetcher',
      },
      app: { locals: { db } },
    });
    const res = mockRes();
    await callRoute(profilesRouter, 'PUT', '/', req, res);

    expect(res.statusCode).toBe(200);
    const passedUpdates = updateProfile.mock.calls[0][1];
    expect(passedUpdates.client_name).toBe('MyBot');
    expect(passedUpdates.client_uri).toBe('https://example.com');
    expect(passedUpdates.contacts).toEqual(['admin@example.com']);
    expect(passedUpdates.trigger).toBe('fetcher');
  });

  it('returns 400 when array field gets non-array value', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ id: 'u-1' });
    const db = {
      getPool: () => ({ query: vi.fn() }),
      updateProfile,
    };
    const req = mockReq({
      body: { contacts: 'not-an-array' },
      app: { locals: { db } },
    });
    const res = mockRes();
    await callRoute(profilesRouter, 'PUT', '/', req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/contacts/);
  });

  it('returns 400 when string field gets non-string value', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ id: 'u-1' });
    const db = {
      getPool: () => ({ query: vi.fn() }),
      updateProfile,
    };
    const req = mockReq({
      body: { client_name: 12345 },
      app: { locals: { db } },
    });
    const res = mockRes();
    await callRoute(profilesRouter, 'PUT', '/', req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/client_name/);
  });

  it('returns 400 when URI field exceeds 2048 chars', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ id: 'u-1' });
    const db = {
      getPool: () => ({ query: vi.fn() }),
      updateProfile,
    };
    const req = mockReq({
      body: { client_uri: 'https://example.com/' + 'a'.repeat(2048) },
      app: { locals: { db } },
    });
    const res = mockRes();
    await callRoute(profilesRouter, 'PUT', '/', req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/client_uri/);
  });

  it('returns 401 without session', async () => {
    const req = mockReq({ session: undefined });
    const res = mockRes();
    await callRoute(profilesRouter, 'PUT', '/', req, res);
    expect(res.statusCode).toBe(401);
  });
});
