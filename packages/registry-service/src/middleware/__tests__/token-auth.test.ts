import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashToken, tokenAuthMiddleware } from '../token-auth.js';

// --- Helpers ---

let ipCounter = 0;

function mockReq(overrides: Record<string, any> = {}) {
  // Unique IP per test to avoid shared rate-limit state
  const ip = overrides.ip ?? `10.0.0.${++ipCounter}`;
  return {
    headers: {},
    ip,
    socket: { remoteAddress: ip },
    app: { locals: { db: mockDb() } },
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    headersSent: false,
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
      return res;
    },
  };
  return res;
}

function mockDb(overrides: Record<string, any> = {}) {
  return {
    getPool: () => ({
      query: overrides.query ?? vi.fn().mockResolvedValue({ rows: [] }),
    }),
    findUserById: overrides.findUserById ?? vi.fn().mockResolvedValue(null),
    findProfileByUserId: overrides.findProfileByUserId ?? vi.fn().mockResolvedValue(null),
  };
}

const VALID_TOKEN = 'oba_' + 'a'.repeat(64);

// --- Tests ---

describe('hashToken', () => {
  it('returns consistent hex hash for same input', () => {
    const h1 = hashToken('test');
    const h2 = hashToken('test');
    expect(h1).toBe(h2);
  });

  it('returns different hashes for different inputs', () => {
    expect(hashToken('aaa')).not.toBe(hashToken('bbb'));
  });

  it('returns lowercase hex string of 64 chars (SHA-256)', () => {
    const h = hashToken('anything');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('tokenAuthMiddleware', () => {
  it('passes through when no Authorization header', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await tokenAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.session).toBeUndefined();
  });

  it('passes through for non-Bearer auth', async () => {
    const req = mockReq({ headers: { authorization: 'Basic abc123' } });
    const res = mockRes();
    const next = vi.fn();

    await tokenAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes through for non-oba_ Bearer token', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer some-jwt-token' } });
    const res = mockRes();
    const next = vi.fn();

    await tokenAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles lowercase "bearer" (case-insensitive)', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = mockReq({
      headers: { authorization: `bearer ${VALID_TOKEN}` },
      app: { locals: { db: mockDb({ query }) } },
    });
    const res = mockRes();
    const next = vi.fn();

    await tokenAuthMiddleware(req, res, next);

    // Should reach token validation, not pass through
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('handles extra whitespace after Bearer', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = mockReq({
      headers: { authorization: `Bearer   ${VALID_TOKEN}` },
      app: { locals: { db: mockDb({ query }) } },
    });
    const res = mockRes();
    const next = vi.fn();

    await tokenAuthMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed oba_ token with 401', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer oba_tooshort' } });
    const res = mockRes();
    const next = vi.fn();

    await tokenAuthMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Malformed token');
  });

  it('rejects token not found in DB with 401', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const req = mockReq({
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      app: { locals: { db: mockDb({ query }) } },
    });
    const res = mockRes();
    const next = vi.fn();

    await tokenAuthMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('rejects expired token with 401', async () => {
    const pastDate = new Date(Date.now() - 86400_000).toISOString();
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 'tok-1', user_id: 'u-1', scopes: [], expires_at: pastDate }],
    });
    const req = mockReq({
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      app: { locals: { db: mockDb({ query }) } },
    });
    const res = mockRes();
    const next = vi.fn();

    await tokenAuthMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Token expired');
  });

  it('populates session and authMethod on valid token', async () => {
    const futureDate = new Date(Date.now() + 86400_000).toISOString();
    const query = vi.fn()
      .mockResolvedValueOnce({
        // token lookup
        rows: [{ id: 'tok-1', user_id: 'u-1', scopes: ['agents:read'], expires_at: futureDate }],
      })
      .mockResolvedValue({ rows: [] }); // last_used_at update (fire and forget)

    const findUserById = vi.fn().mockResolvedValue({
      id: 'u-1',
      email: 'test@example.com',
      github_username: 'testuser',
      avatar_url: null,
    });
    const findProfileByUserId = vi.fn().mockResolvedValue({
      id: 'u-1',
      username: 'testuser',
      client_name: 'Test Bot',
    });

    const req = mockReq({
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      app: {
        locals: {
          db: mockDb({ query, findUserById, findProfileByUserId }),
        },
      },
    });
    const res = mockRes();
    const next = vi.fn();

    await tokenAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.session).toBeDefined();
    expect(req.session.user.id).toBe('u-1');
    expect(req.session.user.github_username).toBe('testuser');
    expect(req.session.profile.username).toBe('testuser');
    expect(req.authMethod).toBe('token');
    expect(req.authTokenId).toBe('tok-1');
    expect(req.authScopes).toEqual(['agents:read']);
  });

  it('returns 500 on unexpected DB error', async () => {
    const query = vi.fn().mockRejectedValue(new Error('connection lost'));
    const req = mockReq({
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      app: { locals: { db: mockDb({ query }) } },
    });
    const res = mockRes();
    const next = vi.fn();

    await tokenAuthMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});
