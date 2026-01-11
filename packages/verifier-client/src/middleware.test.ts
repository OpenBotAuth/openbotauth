import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { Request, Response } from 'express';
import { openBotAuthMiddleware } from './middleware.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('openBotAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  function createMockRequest(options: {
    headers?: Record<string, string>;
    method?: string;
    originalUrl?: string;
    protocol?: string;
    host?: string;
  }): Partial<Request> {
    return {
      headers: options.headers || {},
      method: options.method || 'GET',
      originalUrl: options.originalUrl || '/api/test',
      protocol: options.protocol || 'https',
      get: vi.fn((name: string) => {
        if (name === 'host') return options.host || 'example.com';
        return options.headers?.[name];
      }),
    };
  }

  function createMockResponse(): Partial<Response> {
    const res: Partial<Response> = {
      status: vi.fn().mockReturnThis() as unknown as Response['status'],
      json: vi.fn().mockReturnThis() as unknown as Response['json'],
    };
    return res;
  }

  it('sets signed:false for unsigned requests', async () => {
    const middleware = openBotAuthMiddleware();
    const req = createMockRequest({
      headers: { 'content-type': 'application/json' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    expect((req as Record<string, unknown>).oba).toEqual({ signed: false });
    expect(next).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls verifier for signed requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        verified: true,
        agent: { jwks_url: 'https://example.com/jwks.json', kid: 'key1' },
        created: 1234567890,
      }),
    });

    const middleware = openBotAuthMiddleware({
      verifierUrl: 'https://test-verifier.com/verify',
    });

    const req = createMockRequest({
      headers: {
        'signature-input': 'sig1=("@method" "@target-uri");created=1234',
        signature: 'base64signature==',
        'signature-agent': 'https://example.com/jwks.json',
      },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://test-verifier.com/verify');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.method).toBe('GET');
    expect(body.url).toBe('https://example.com/api/test');
    expect(body.headers['signature-input']).toBeDefined();
    expect(body.headers['signature']).toBeDefined();
    expect(body.headers['signature-agent']).toBeDefined();

    const oba = (req as Record<string, unknown>).oba as { signed: boolean; result: unknown };
    expect(oba.signed).toBe(true);
    expect(oba.result).toEqual({
      verified: true,
      agent: { jwks_url: 'https://example.com/jwks.json', kid: 'key1' },
      created: 1234567890,
    });
    expect(next).toHaveBeenCalled();
  });

  it('uses custom attachProperty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ verified: true }),
    });

    const middleware = openBotAuthMiddleware({ attachProperty: 'botAuth' });

    const req = createMockRequest({
      headers: {
        'signature-input': 'sig1=("@method");created=1234',
        signature: 'base64signature==',
      },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    expect((req as Record<string, unknown>).botAuth).toBeDefined();
    expect((req as Record<string, unknown>).oba).toBeUndefined();
  });

  it('blocks unverified requests in require-verified mode', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        verified: false,
        error: 'Invalid signature',
      }),
    });

    const middleware = openBotAuthMiddleware({ mode: 'require-verified' });

    const req = createMockRequest({
      headers: {
        'signature-input': 'sig1=("@method");created=1234',
        signature: 'base64signature==',
      },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Signature verification failed',
      details: 'Invalid signature',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows verified requests in require-verified mode', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        verified: true,
        agent: { jwks_url: 'https://example.com/jwks.json', kid: 'key1' },
      }),
    });

    const middleware = openBotAuthMiddleware({ mode: 'require-verified' });

    const req = createMockRequest({
      headers: {
        'signature-input': 'sig1=("@method");created=1234',
        signature: 'base64signature==',
      },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows unsigned requests in require-verified mode', async () => {
    const middleware = openBotAuthMiddleware({ mode: 'require-verified' });

    const req = createMockRequest({
      headers: { 'content-type': 'application/json' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    expect((req as Record<string, unknown>).oba).toEqual({ signed: false });
    expect(next).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles verifier errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const middleware = openBotAuthMiddleware();

    const req = createMockRequest({
      headers: {
        'signature-input': 'sig1=("@method");created=1234',
        signature: 'base64signature==',
      },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    const oba = (req as Record<string, unknown>).oba as { signed: boolean; result: { verified: boolean; error: string } };
    expect(oba.signed).toBe(true);
    expect(oba.result.verified).toBe(false);
    expect(oba.result.error).toContain('500');
    expect(next).toHaveBeenCalled();
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const middleware = openBotAuthMiddleware();

    const req = createMockRequest({
      headers: {
        'signature-input': 'sig1=("@method");created=1234',
        signature: 'base64signature==',
      },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    const oba = (req as Record<string, unknown>).oba as { signed: boolean; result: { verified: boolean; error: string } };
    expect(oba.signed).toBe(true);
    expect(oba.result.verified).toBe(false);
    expect(oba.result.error).toContain('Network error');
    expect(next).toHaveBeenCalled();
  });

  it('blocks requests with sensitive covered headers', async () => {
    const middleware = openBotAuthMiddleware();

    const req = createMockRequest({
      headers: {
        'signature-input': 'sig1=("authorization");created=1234',
        signature: 'base64signature==',
        authorization: 'Bearer token',
      },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    const oba = (req as Record<string, unknown>).oba as { signed: boolean; result: { verified: boolean; error: string } };
    expect(oba.signed).toBe(true);
    expect(oba.result.verified).toBe(false);
    expect(oba.result.error).toContain('sensitive header');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('handles array header values', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ verified: true }),
    });

    const middleware = openBotAuthMiddleware();

    // Express can have array headers (rare but possible)
    const req = createMockRequest({}) as Request;
    req.headers = {
      'signature-input': 'sig1=("@method");created=1234',
      signature: 'base64signature==',
      'x-custom': ['value1', 'value2'] as unknown as string,
    };
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('treats partial signature headers as signed (only signature-agent)', async () => {
    const middleware = openBotAuthMiddleware();

    // Only signature-agent present - should be classified as signed but fail verification
    const req = createMockRequest({
      headers: {
        'signature-agent': 'https://example.com/jwks.json',
      },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    const oba = (req as Record<string, unknown>).oba as { signed: boolean; result: { verified: boolean; error: string } };
    expect(oba.signed).toBe(true);
    expect(oba.result.verified).toBe(false);
    expect(oba.result.error).toContain('Signature-Input');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('treats partial signature headers as signed (only signature)', async () => {
    const middleware = openBotAuthMiddleware();

    // Only signature present - should be classified as signed but fail verification
    const req = createMockRequest({
      headers: {
        signature: 'base64signature==',
      },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    const oba = (req as Record<string, unknown>).oba as { signed: boolean; result: { verified: boolean; error: string } };
    expect(oba.signed).toBe(true);
    expect(oba.result.verified).toBe(false);
    expect(oba.result.error).toContain('Signature-Input');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('returns helpful error when signature-input present but signature missing', async () => {
    const middleware = openBotAuthMiddleware();

    const req = createMockRequest({
      headers: {
        'signature-input': 'sig1=("@method");created=1234',
        // signature is missing
      },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as Request, res as Response, next);

    const oba = (req as Record<string, unknown>).oba as { signed: boolean; result: { verified: boolean; error: string } };
    expect(oba.signed).toBe(true);
    expect(oba.result.verified).toBe(false);
    expect(oba.result.error).toContain('Signature header');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
