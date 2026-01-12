import { describe, it, expect } from 'vitest';
import {
  hasSignatureHeaders,
  parseCoveredHeaders,
  getSensitiveCoveredHeader,
  extractForwardedHeaders,
  filterHopByHopHeaders,
} from './headers.js';

describe('hasSignatureHeaders', () => {
  it('returns true when signature-input is present', () => {
    expect(hasSignatureHeaders({ 'signature-input': 'sig1=...' })).toBe(true);
  });

  it('returns true when signature is present', () => {
    expect(hasSignatureHeaders({ signature: 'sig1=:...:' })).toBe(true);
  });

  it('returns true when signature-agent is present', () => {
    expect(hasSignatureHeaders({ 'signature-agent': 'https://example.com/jwks.json' })).toBe(true);
  });

  it('returns true when all signature headers are present', () => {
    expect(hasSignatureHeaders({
      'signature-input': 'sig1=...',
      signature: 'sig1=:...:',
      'signature-agent': 'https://example.com/jwks.json',
    })).toBe(true);
  });

  it('returns false when no signature headers are present', () => {
    expect(hasSignatureHeaders({ 'content-type': 'text/html' })).toBe(false);
  });

  it('returns false for empty headers', () => {
    expect(hasSignatureHeaders({})).toBe(false);
  });
});

describe('parseCoveredHeaders', () => {
  it('parses simple covered headers', () => {
    const input = 'sig1=("@method" "@path" "@authority");created=1618884473';
    expect(parseCoveredHeaders(input)).toEqual(['@method', '@path', '@authority']);
  });

  it('parses covered headers with content-type', () => {
    const input = 'sig1=("@method" "@path" "@authority" "content-type");created=1618884473;nonce="abc"';
    expect(parseCoveredHeaders(input)).toEqual(['@method', '@path', '@authority', 'content-type']);
  });

  it('parses covered headers with multiple headers', () => {
    const input = 'sig1=("@method" "@path" "@authority" "accept" "user-agent");created=1618884473';
    expect(parseCoveredHeaders(input)).toEqual(['@method', '@path', '@authority', 'accept', 'user-agent']);
  });

  it('lowercases header names', () => {
    const input = 'sig1=("@Method" "@PATH" "Content-Type");created=1618884473';
    expect(parseCoveredHeaders(input)).toEqual(['@method', '@path', 'content-type']);
  });

  it('returns empty array for invalid input', () => {
    expect(parseCoveredHeaders('invalid')).toEqual([]);
    expect(parseCoveredHeaders('')).toEqual([]);
  });

  it('handles empty parentheses', () => {
    expect(parseCoveredHeaders('sig1=();created=1618884473')).toEqual([]);
  });

  it('parses unquoted tokens', () => {
    const input = 'sig1=(@method @path content-type);created=1618884473';
    expect(parseCoveredHeaders(input)).toEqual(['@method', '@path', 'content-type']);
  });

  it('handles mixed quoted and unquoted tokens', () => {
    const input = 'sig1=("@method" @path "content-type" accept);created=1618884473';
    expect(parseCoveredHeaders(input)).toEqual(['@method', '@path', 'content-type', 'accept']);
  });

  it('handles extra whitespace', () => {
    const input = 'sig1=(  "@method"   "@path"  );created=1618884473';
    expect(parseCoveredHeaders(input)).toEqual(['@method', '@path']);
  });
});

describe('getSensitiveCoveredHeader', () => {
  it('returns header name when authorization is covered', () => {
    expect(getSensitiveCoveredHeader(['@method', 'authorization'])).toBe('authorization');
  });

  it('returns header name when cookie is covered', () => {
    expect(getSensitiveCoveredHeader(['@method', 'cookie'])).toBe('cookie');
  });

  it('returns header name when proxy-authorization is covered', () => {
    expect(getSensitiveCoveredHeader(['proxy-authorization'])).toBe('proxy-authorization');
  });

  it('returns header name when www-authenticate is covered', () => {
    expect(getSensitiveCoveredHeader(['www-authenticate'])).toBe('www-authenticate');
  });

  it('returns null for safe headers', () => {
    expect(getSensitiveCoveredHeader(['@method', '@path', 'content-type', 'accept'])).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(getSensitiveCoveredHeader([])).toBeNull();
  });

  it('is case insensitive', () => {
    expect(getSensitiveCoveredHeader(['AUTHORIZATION'])).toBe('authorization');
    expect(getSensitiveCoveredHeader(['Authorization'])).toBe('authorization');
  });

  it('returns the first sensitive header found', () => {
    expect(getSensitiveCoveredHeader(['cookie', 'authorization'])).toBe('cookie');
  });
});

describe('extractForwardedHeaders', () => {
  it('includes signature headers', () => {
    const headers = {
      'signature-input': 'sig1=...',
      signature: 'sig1=:...:',
      'signature-agent': 'https://example.com/jwks.json',
    };
    const covered = ['@method', '@path'];
    const result = extractForwardedHeaders(headers, covered);

    expect(result['signature-input']).toBe('sig1=...');
    expect(result['signature']).toBe('sig1=:...:');
    expect(result['signature-agent']).toBe('https://example.com/jwks.json');
  });

  it('includes covered non-derived headers', () => {
    const headers = {
      'signature-input': 'sig1=...',
      signature: 'sig1=:...:',
      'signature-agent': 'https://example.com/jwks.json',
      'content-type': 'application/json',
      accept: 'text/html',
    };
    const covered = ['@method', '@path', 'content-type', 'accept'];
    const result = extractForwardedHeaders(headers, covered);

    expect(result['content-type']).toBe('application/json');
    expect(result['accept']).toBe('text/html');
  });

  it('excludes derived components (@ prefixed)', () => {
    const headers = {
      'signature-input': 'sig1=...',
      signature: 'sig1=:...:',
      'signature-agent': 'https://example.com/jwks.json',
    };
    const covered = ['@method', '@path', '@authority'];
    const result = extractForwardedHeaders(headers, covered);

    // Should not have any @-prefixed keys
    expect(Object.keys(result).some(k => k.startsWith('@'))).toBe(false);
  });

  it('includes host header if present', () => {
    const headers = {
      'signature-input': 'sig1=...',
      signature: 'sig1=:...:',
      'signature-agent': 'https://example.com/jwks.json',
      host: 'example.com',
    };
    const covered = ['@method'];
    const result = extractForwardedHeaders(headers, covered);

    expect(result['host']).toBe('example.com');
  });

  it('handles array header values', () => {
    const headers = {
      'signature-input': 'sig1=...',
      signature: 'sig1=:...:',
      'signature-agent': 'https://example.com/jwks.json',
      'x-custom': ['value1', 'value2'],
    };
    const covered = ['x-custom'];
    const result = extractForwardedHeaders(headers, covered);

    expect(result['x-custom']).toBe('value1, value2');
  });
});

describe('filterHopByHopHeaders', () => {
  it('removes connection header', () => {
    const headers = { connection: 'keep-alive', 'content-type': 'text/html' };
    const result = filterHopByHopHeaders(headers);
    expect(result['connection']).toBeUndefined();
    expect(result['content-type']).toBe('text/html');
  });

  it('removes transfer-encoding header', () => {
    const headers = { 'transfer-encoding': 'chunked', 'content-type': 'text/html' };
    const result = filterHopByHopHeaders(headers);
    expect(result['transfer-encoding']).toBeUndefined();
  });

  it('removes keep-alive header', () => {
    const headers = { 'keep-alive': 'timeout=5', host: 'example.com' };
    const result = filterHopByHopHeaders(headers);
    expect(result['keep-alive']).toBeUndefined();
  });

  it('preserves normal headers', () => {
    const headers = {
      'content-type': 'application/json',
      'accept': 'text/html',
      'user-agent': 'bot/1.0',
    };
    const result = filterHopByHopHeaders(headers);
    expect(result['content-type']).toBe('application/json');
    expect(result['accept']).toBe('text/html');
    expect(result['user-agent']).toBe('bot/1.0');
  });

  it('handles array values by joining', () => {
    const headers = { 'x-custom': ['a', 'b'] };
    const result = filterHopByHopHeaders(headers);
    expect(result['x-custom']).toBe('a, b');
  });

  it('handles undefined values', () => {
    const headers = { 'x-custom': undefined, 'content-type': 'text/html' };
    const result = filterHopByHopHeaders(headers);
    expect(result['x-custom']).toBeUndefined();
  });
});
