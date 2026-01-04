/**
 * Tests for signature-parser.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSignatureAgent,
  resolveJwksUrl,
  buildSignatureBase,
  parseSignatureInput,
} from './signature-parser.js';

describe('parseSignatureAgent', () => {
  it('should parse direct JWKS URL with .json extension', () => {
    const result = parseSignatureAgent('https://example.com/jwks/user.json');
    expect(result).toEqual({
      url: 'https://example.com/jwks/user.json',
      isJwks: true,
    });
  });

  it('should parse direct JWKS URL with /jwks/ path', () => {
    const result = parseSignatureAgent('https://example.com/jwks/hammadtq.json');
    expect(result).toEqual({
      url: 'https://example.com/jwks/hammadtq.json',
      isJwks: true,
    });
  });

  it('should parse identity URL without JWKS pattern', () => {
    const result = parseSignatureAgent('https://chatgpt.com');
    expect(result).toEqual({
      url: 'https://chatgpt.com',
      isJwks: false,
    });
  });

  it('should handle quoted JWKS URL', () => {
    const result = parseSignatureAgent('"https://example.com/jwks/user.json"');
    expect(result).toEqual({
      url: 'https://example.com/jwks/user.json',
      isJwks: true,
    });
  });

  it('should handle single-quoted JWKS URL', () => {
    const result = parseSignatureAgent("'https://example.com/jwks.json'");
    expect(result).toEqual({
      url: 'https://example.com/jwks.json',
      isJwks: true,
    });
  });

  it('should handle angle-bracketed JWKS URL', () => {
    const result = parseSignatureAgent('<https://example.com/jwks/user.json>');
    expect(result).toEqual({
      url: 'https://example.com/jwks/user.json',
      isJwks: true,
    });
  });

  it('should handle whitespace around URL', () => {
    const result = parseSignatureAgent('  https://example.com/jwks.json  ');
    expect(result).toEqual({
      url: 'https://example.com/jwks.json',
      isJwks: true,
    });
  });

  it('should return null for invalid URL', () => {
    const result = parseSignatureAgent('not-a-url');
    expect(result).toBeNull();
  });
});

describe('resolveJwksUrl', () => {
  let fetchMock: any;

  beforeEach(() => {
    // Mock global fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should discover JWKS at /.well-known/jwks.json', async () => {
    const validJwks = { keys: [{ kid: 'test', kty: 'OKP' }] };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-length', '100']]),
      json: async () => validJwks,
    });

    const result = await resolveJwksUrl('https://chatgpt.com');
    expect(result).toBe('https://chatgpt.com/.well-known/jwks.json');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chatgpt.com/.well-known/jwks.json',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Accept': 'application/json',
        }),
      })
    );
  });

  it('should try multiple paths in order', async () => {
    const validJwks = { keys: [{ kid: 'test', kty: 'OKP' }] };

    // First path fails
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Second path succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-length', '100']]),
      json: async () => validJwks,
    });

    const result = await resolveJwksUrl('https://example.com');
    expect(result).toBe('https://example.com/.well-known/openbotauth/jwks.json');
  });

  it('should return null if no valid JWKS found', async () => {
    fetchMock.mockRejectedValue(new Error('Not found'));

    const result = await resolveJwksUrl('https://example.com');
    expect(result).toBeNull();
  });

  it('should reject invalid JWKS structure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-length', '50']]),
      json: async () => ({ invalid: 'structure' }),
    });

    const result = await resolveJwksUrl('https://example.com');
    expect(result).toBeNull();
  });

  it('should respect custom discovery paths', async () => {
    const validJwks = { keys: [{ kid: 'test', kty: 'OKP' }] };
    const customPaths = ['/custom/path.json', '/another/path.json'];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-length', '100']]),
      json: async () => validJwks,
    });

    const result = await resolveJwksUrl('https://example.com', customPaths);
    expect(result).toBe('https://example.com/custom/path.json');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/custom/path.json',
      expect.anything()
    );
  });

  it('should reject responses larger than 1MB', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-length', '2000000']]), // 2MB
      json: async () => ({ keys: [] }),
    });

    const result = await resolveJwksUrl('https://example.com');
    expect(result).toBeNull();
  });
});

describe('buildSignatureBase', () => {
  it('should build signature base with derived components', () => {
    const components = {
      keyId: 'test-key',
      signature: '',
      algorithm: 'ed25519',
      created: 1234567890,
      nonce: 'abc123',
      headers: ['@method', '@path', '@authority'],
    };

    const request = {
      method: 'GET',
      url: 'https://example.com/test?query=1',
      headers: {},
    };

    const result = buildSignatureBase(components, request);

    expect(result).toContain('"@method": GET');
    expect(result).toContain('"@path": /test');
    expect(result).toContain('"@authority": example.com');
    expect(result).toContain('"@signature-params":');
  });

  it('should include regular headers when present', () => {
    const components = {
      keyId: 'test-key',
      signature: '',
      algorithm: 'ed25519',
      created: 1234567890,
      nonce: 'abc123',
      headers: ['@method', 'content-type', 'accept'],
    };

    const request = {
      method: 'POST',
      url: 'https://example.com/api',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
      },
    };

    const result = buildSignatureBase(components, request);

    expect(result).toContain('"content-type": application/json');
    expect(result).toContain('"accept": application/json');
  });

  it('should throw error when covered header is missing', () => {
    const components = {
      keyId: 'test-key',
      signature: '',
      algorithm: 'ed25519',
      created: 1234567890,
      nonce: 'abc123',
      headers: ['@method', 'accept', 'user-agent'],
    };

    const request = {
      method: 'GET',
      url: 'https://example.com/test',
      headers: {
        'accept': 'application/json',
        // user-agent is missing
      },
    };

    expect(() => buildSignatureBase(components, request)).toThrow(
      'Missing covered header: user-agent'
    );
  });

  it('should handle empty string header values', () => {
    const components = {
      keyId: 'test-key',
      signature: '',
      algorithm: 'ed25519',
      headers: ['@method', 'custom-header'],
    };

    const request = {
      method: 'GET',
      url: 'https://example.com/test',
      headers: {
        'custom-header': '',
      },
    };

    const result = buildSignatureBase(components, request);
    expect(result).toContain('"custom-header": ');
  });
});

describe('parseSignatureInput', () => {
  it('should parse valid Signature-Input header', () => {
    const input = 'sig1=("@method" "@path" "content-type");created=1618884473;keyid="test-key-ed25519";nonce="abc123"';
    const result = parseSignatureInput(input);

    expect(result).toEqual({
      keyId: 'test-key-ed25519',
      algorithm: 'ed25519',
      created: 1618884473,
      nonce: 'abc123',
      headers: ['@method', '@path', 'content-type'],
      signature: '',
      expires: undefined,
    });
  });

  it('should parse Signature-Input with expires', () => {
    const input = 'sig1=("@method" "@path");created=1618884473;expires=1618888073;keyid="key1"';
    const result = parseSignatureInput(input);

    expect(result?.created).toBe(1618884473);
    expect(result?.expires).toBe(1618888073);
  });

  it('should return null for invalid format', () => {
    const input = 'invalid-format';
    const result = parseSignatureInput(input);

    expect(result).toBeNull();
  });
});
