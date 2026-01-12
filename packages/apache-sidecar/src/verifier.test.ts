import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callVerifier } from './verifier.js';

describe('callVerifier', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      json: () => Promise.resolve(mockResponse),
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
      json: () => Promise.resolve(mockResponse),
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

  it('sends correct request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ verified: true, agent: {} }),
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
});
