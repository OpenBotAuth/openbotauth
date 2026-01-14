import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { callVerifier } from './verifier.js';

describe('callVerifier', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('returns verified true on successful verification', async () => {
    const mockResponse = {
      verified: true,
      agent: {
        jwks_url: 'https://example.com/jwks.json',
        kid: 'key-1',
        client_name: 'TestBot',
      },
      created: 1618884473,
      expires: 1618884773,
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    }));

    const result = await callVerifier(
      'https://verifier.example.com/verify',
      {
        method: 'GET',
        url: 'https://target.com/page',
        headers: {
          'signature-input': 'sig1=...',
          signature: 'sig1=:...:',
          'signature-agent': 'https://example.com/jwks.json',
        },
      },
      5000
    );

    expect(result.verified).toBe(true);
    expect(result.agent?.client_name).toBe('TestBot');
    expect(result.agent?.jwks_url).toBe('https://example.com/jwks.json');
    expect(result.agent?.kid).toBe('key-1');
  });

  it('returns verified false on verification failure', async () => {
    const mockResponse = {
      verified: false,
      error: 'Invalid signature',
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    }));

    const result = await callVerifier(
      'https://verifier.example.com/verify',
      {
        method: 'GET',
        url: 'https://target.com/page',
        headers: {},
      },
      5000
    );

    expect(result.verified).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });

  it('handles timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        const error = new Error('AbortError');
        error.name = 'AbortError';
        setTimeout(() => reject(error), 100);
      });
    }));

    const result = await callVerifier(
      'https://verifier.example.com/verify',
      {
        method: 'GET',
        url: 'https://target.com/page',
        headers: {},
      },
      50 // Short timeout
    );

    expect(result.verified).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('handles network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await callVerifier(
      'https://verifier.example.com/verify',
      {
        method: 'GET',
        url: 'https://target.com/page',
        headers: {},
      },
      5000
    );

    expect(result.verified).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('handles non-Error exceptions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));

    const result = await callVerifier(
      'https://verifier.example.com/verify',
      {
        method: 'GET',
        url: 'https://target.com/page',
        headers: {},
      },
      5000
    );

    expect(result.verified).toBe(false);
    expect(result.error).toBe('Unknown verifier error');
  });

  it('handles non-JSON error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    }));

    const result = await callVerifier(
      'https://verifier.example.com/verify',
      {
        method: 'GET',
        url: 'https://target.com/page',
        headers: {},
      },
      5000
    );

    expect(result.verified).toBe(false);
    expect(result.error).toBe('Verifier 500: Internal Server Error');
  });

  it('handles text() failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.reject(new Error('Text read failed')),
    }));

    const result = await callVerifier(
      'https://verifier.example.com/verify',
      {
        method: 'GET',
        url: 'https://target.com/page',
        headers: {},
      },
      5000
    );

    expect(result.verified).toBe(false);
    expect(result.error).toBe('Text read failed');
  });

  it('sends correct request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ verified: true, agent: {} })),
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = {
      method: 'POST',
      url: 'https://target.com/api/data',
      headers: {
        'signature-input': 'sig1=...',
        signature: 'sig1=:...:',
        'signature-agent': 'https://example.com/jwks.json',
        'content-type': 'application/json',
      },
    };

    await callVerifier('https://verifier.example.com/verify', request, 5000);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://verifier.example.com/verify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
    );
  });

  it('truncates long error messages', async () => {
    const longError = 'x'.repeat(500);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(longError),
    }));

    const result = await callVerifier(
      'https://verifier.example.com/verify',
      {
        method: 'GET',
        url: 'https://target.com/page',
        headers: {},
      },
      5000
    );

    expect(result.verified).toBe(false);
    expect(result.error).toBe(`Verifier 500: ${'x'.repeat(200)}`);
  });
});
