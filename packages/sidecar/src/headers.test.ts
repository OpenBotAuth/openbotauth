import { describe, it, expect } from 'vitest';
import {
  hasSignatureHeaders,
  parseCoveredHeaders,
  getSensitiveCoveredHeader,
  extractForwardedHeaders,
  filterHopByHopHeaders,
  getHeaderString,
  sanitizeHeaderValue,
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

  it('handles array signature header values', () => {
    const headers = {
      'signature-input': ['sig1=...', 'sig2=...'],
      signature: ['sig1=:...:, sig2=:...:'],
      'signature-agent': 'https://example.com/jwks.json',
    };
    const covered = ['@method'];
    const result = extractForwardedHeaders(headers, covered);

    expect(result['signature-input']).toBe('sig1=..., sig2=...');
    expect(result['signature']).toBe('sig1=:...:, sig2=:...:');
    expect(result['signature-agent']).toBe('https://example.com/jwks.json');
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

  it('removes trailer header', () => {
    const headers = { trailer: 'Expires', 'content-type': 'text/html' };
    const result = filterHopByHopHeaders(headers);
    expect(result['trailer']).toBeUndefined();
    expect(result['content-type']).toBe('text/html');
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

describe('getHeaderString', () => {
  it('returns string value as-is', () => {
    const headers = { 'content-type': 'application/json' };
    expect(getHeaderString(headers, 'content-type')).toBe('application/json');
  });

  it('joins array values with comma and space', () => {
    const headers = { 'x-custom': ['value1', 'value2'] };
    expect(getHeaderString(headers, 'x-custom')).toBe('value1, value2');
  });

  it('returns undefined for missing header', () => {
    const headers = { 'content-type': 'text/html' };
    expect(getHeaderString(headers, 'x-missing')).toBeUndefined();
  });

  it('is case insensitive for lookup name', () => {
    // Node.js HTTP headers are already lowercased in IncomingHttpHeaders
    const headers = { 'content-type': 'application/json' };
    expect(getHeaderString(headers, 'Content-Type')).toBe('application/json');
    expect(getHeaderString(headers, 'CONTENT-TYPE')).toBe('application/json');
  });

  it('handles signature-input header', () => {
    const headers = { 'signature-input': 'sig1=("@method");created=123' };
    expect(getHeaderString(headers, 'signature-input')).toBe('sig1=("@method");created=123');
  });

  it('handles signature-input as array', () => {
    const headers = { 'signature-input': ['sig1=...', 'sig2=...'] };
    expect(getHeaderString(headers, 'signature-input')).toBe('sig1=..., sig2=...');
  });
});

describe('sanitizeHeaderValue', () => {
  it('returns simple string unchanged', () => {
    expect(sanitizeHeaderValue('simple value')).toBe('simple value');
  });

  it('replaces CR/LF with spaces', () => {
    expect(sanitizeHeaderValue('line1\r\nline2')).toBe('line1 line2');
    expect(sanitizeHeaderValue('line1\nline2')).toBe('line1 line2');
    expect(sanitizeHeaderValue('line1\rline2')).toBe('line1 line2');
  });

  it('replaces multiple newlines with single space', () => {
    expect(sanitizeHeaderValue('a\r\n\r\nb')).toBe('a b');
  });

  it('trims whitespace', () => {
    expect(sanitizeHeaderValue('  value  ')).toBe('value');
  });

  it('clamps to 200 characters by default', () => {
    const longValue = 'a'.repeat(300);
    expect(sanitizeHeaderValue(longValue)).toBe('a'.repeat(200));
  });

  it('accepts custom max length', () => {
    const longValue = 'a'.repeat(100);
    expect(sanitizeHeaderValue(longValue, 50)).toBe('a'.repeat(50));
  });

  it('handles combined sanitization', () => {
    const value = '  error\r\nmessage  ';
    expect(sanitizeHeaderValue(value)).toBe('error message');
  });

  it('prevents header injection', () => {
    const malicious = 'value\r\nX-Injected: evil';
    expect(sanitizeHeaderValue(malicious)).toBe('value X-Injected: evil');
  });
});
