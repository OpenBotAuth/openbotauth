import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MAX_TOKENS_PER_USER } from '../tokens.js';

/**
 * Auth CLI flow tests (no supertest).
 * We invoke router handlers directly and validate responses.
 */

// --- Helpers ---

function mockOAuth(overrides: Record<string, any> = {}) {
  return {
    generateState: vi.fn().mockReturnValue('oauth-state'),
    getAuthorizationUrl: vi.fn((state: string) => `https://github.com/login/oauth?state=${state}`),
    handleCallback: vi.fn().mockResolvedValue({
      id: 123,
      login: 'octo',
      email: 'octo@example.com',
      avatar_url: 'https://avatars.example.com/u/123',
    }),
    ...overrides,
  };
}

function mockDb(overrides: Record<string, any> = {}) {
  return {
    findUserByGitHubId: vi.fn().mockResolvedValue({
      id: 'u-1',
      email: 'octo@example.com',
      github_username: 'octo',
      avatar_url: 'https://avatars.example.com/u/123',
    }),
    updateUser: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue(undefined),
    findProfileByUserId: vi.fn().mockResolvedValue({
      id: 'p-1',
      username: 'octo',
      client_name: null,
    }),
    getPool: () => ({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
    }),
    ...overrides,
  };
}

function mockReq(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    query: {},
    params: {},
    body: {},
    app: { locals: { db: mockDb(), oauth: mockOAuth() } },
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
    redirect(url: string) {
      res.statusCode = 302;
      res.headers.Location = url;
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

let authRouter: any;

beforeAll(() => {
  vi.useFakeTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../auth.js');
  authRouter = mod.authRouter;
});

afterEach(() => {
  vi.clearAllTimers();
});

describe('GET /auth/cli', () => {
  it('rejects invalid port', async () => {
    const req = mockReq({ query: { port: '80', state: '0123456789abcdef' } });
    const res = mockRes();

    await callRoute(authRouter, 'GET', '/cli', req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid port/);
  });

  it('rejects invalid state', async () => {
    const req = mockReq({ query: { port: '4321', state: 'short' } });
    const res = mockRes();

    await callRoute(authRouter, 'GET', '/cli', req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid state/);
  });

  it('redirects to GitHub OAuth for valid input', async () => {
    const oauth = mockOAuth({ generateState: vi.fn().mockReturnValue('state-123') });
    const req = mockReq({
      query: { port: '4321', state: '0123456789abcdef' },
      app: { locals: { db: mockDb(), oauth } },
    });
    const res = mockRes();

    await callRoute(authRouter, 'GET', '/cli', req, res);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('https://github.com/login/oauth?state=state-123');
  });
});

describe('GET /auth/github/callback (cli mode)', () => {
  it('redirects with token_limit error when user has too many tokens', async () => {
    const oauth = mockOAuth({ generateState: vi.fn().mockReturnValue('oauth-state') });
    const query = vi.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // DELETE
      .mockResolvedValueOnce({ rows: [{ cnt: MAX_TOKENS_PER_USER }] }) // COUNT
      .mockResolvedValueOnce({}); // ROLLBACK
    const client = { query, release: vi.fn() };
    const db = mockDb({
      getPool: () => ({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        connect: vi.fn().mockResolvedValue(client),
      }),
    });

    // Seed OAuth state via /auth/cli
    const cliReq = mockReq({
      query: { port: '4321', state: 'cli-state-0123456789' },
      app: { locals: { db, oauth } },
    });
    const cliRes = mockRes();
    await callRoute(authRouter, 'GET', '/cli', cliReq, cliRes);

    const oauthState = new URL(cliRes.headers.Location).searchParams.get('state');

    const cbReq = mockReq({
      query: { code: 'code-1', state: oauthState },
      app: { locals: { db, oauth } },
    });
    const cbRes = mockRes();
    await callRoute(authRouter, 'GET', '/github/callback', cbReq, cbRes);

    expect(cbRes.statusCode).toBe(302);
    const url = new URL(cbRes.headers.Location);
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.searchParams.get('error')).toBe('token_limit');
    expect(url.searchParams.get('state')).toBe('cli-state-0123456789');
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('COMMIT'))).toBe(false);
  });

  it('redirects with token on success', async () => {
    const oauth = mockOAuth({ generateState: vi.fn().mockReturnValue('oauth-state') });
    const query = vi.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // DELETE
      .mockResolvedValueOnce({ rows: [{ cnt: MAX_TOKENS_PER_USER - 1 }] }) // COUNT
      .mockResolvedValueOnce({}) // INSERT
      .mockResolvedValueOnce({}); // COMMIT
    const client = { query, release: vi.fn() };
    const db = mockDb({
      getPool: () => ({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        connect: vi.fn().mockResolvedValue(client),
      }),
    });

    const cliReq = mockReq({
      query: { port: '4321', state: 'cli-state-0123456789' },
      app: { locals: { db, oauth } },
    });
    const cliRes = mockRes();
    await callRoute(authRouter, 'GET', '/cli', cliReq, cliRes);

    const oauthState = new URL(cliRes.headers.Location).searchParams.get('state');

    const cbReq = mockReq({
      query: { code: 'code-1', state: oauthState },
      app: { locals: { db, oauth } },
    });
    const cbRes = mockRes();
    await callRoute(authRouter, 'GET', '/github/callback', cbReq, cbRes);

    expect(cbRes.statusCode).toBe(302);
    const url = new URL(cbRes.headers.Location);
    expect(url.hostname).toBe('127.0.0.1');
    const token = url.searchParams.get('token');
    expect(token).toMatch(/^oba_[0-9a-f]{64}$/);
    expect(url.searchParams.get('state')).toBe('cli-state-0123456789');
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('COMMIT'))).toBe(true);
    // CLI flow should NOT set a session cookie — only a PAT is returned
    expect(cbRes.headers['Set-Cookie']).toBeFalsy();
  });
});
