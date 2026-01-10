import { describe, it, expect } from 'vitest';
import {
  parseCoveredHeaders,
  extractForwardedHeaders,
  hasSignatureHeaders,
} from './headers.js';

describe('parseCoveredHeaders', () => {
  it('parses basic covered headers', () => {
    const input = 'sig1=("@method" "@target-uri" "content-type");created=1234';
    const result = parseCoveredHeaders(input);
    expect(result).toEqual(['@method', '@target-uri', 'content-type']);
  });

  it('handles single header', () => {
    const input = 'sig=("content-type");created=1234';
    const result = parseCoveredHeaders(input);
    expect(result).toEqual(['content-type']);
  });

  it('handles multiple whitespace', () => {
    const input = 'sig1=("@method"   "content-type"  "accept");created=1234';
    const result = parseCoveredHeaders(input);
    expect(result).toEqual(['@method', 'content-type', 'accept']);
  });

  it('lowercases header names', () => {
    const input = 'sig1=("Content-Type" "Accept");created=1234';
    const result = parseCoveredHeaders(input);
    expect(result).toEqual(['content-type', 'accept']);
  });

  it('returns empty array for missing parentheses', () => {
    const input = 'sig1=;created=1234';
    const result = parseCoveredHeaders(input);
    expect(result).toEqual([]);
  });

  it('returns empty array for unclosed parentheses', () => {
    const input = 'sig1=("content-type";created=1234';
    const result = parseCoveredHeaders(input);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty parentheses', () => {
    const input = 'sig1=();created=1234';
    const result = parseCoveredHeaders(input);
    expect(result).toEqual([]);
  });

  it('handles headers without quotes', () => {
    const input = 'sig1=(content-type accept);created=1234';
    const result = parseCoveredHeaders(input);
    expect(result).toEqual(['content-type', 'accept']);
  });
});

describe('extractForwardedHeaders', () => {
  it('includes signature headers', () => {
    const headers = {
      'Signature-Input': 'sig1=("@method");created=1234',
      'Signature': 'base64signature==',
      'Content-Type': 'application/json',
    };
    const signatureInput = 'sig1=("@method");created=1234';

    const result = extractForwardedHeaders(headers, signatureInput);

    expect(result.error).toBeUndefined();
    expect(result.headers).toBeDefined();
    expect(result.headers!['signature-input']).toBe('sig1=("@method");created=1234');
    expect(result.headers!['signature']).toBe('base64signature==');
  });

  it('includes signature-agent if present', () => {
    const headers = {
      'Signature-Input': 'sig1=("@method");created=1234',
      'Signature': 'base64signature==',
      'Signature-Agent': 'https://example.com/.well-known/jwks.json',
    };
    const signatureInput = 'sig1=("@method");created=1234';

    const result = extractForwardedHeaders(headers, signatureInput);

    expect(result.error).toBeUndefined();
    expect(result.headers!['signature-agent']).toBe('https://example.com/.well-known/jwks.json');
  });

  it('includes covered headers', () => {
    const headers = {
      'Signature-Input': 'sig1=("content-type" "accept");created=1234',
      'Signature': 'base64signature==',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    const signatureInput = 'sig1=("content-type" "accept");created=1234';

    const result = extractForwardedHeaders(headers, signatureInput);

    expect(result.error).toBeUndefined();
    expect(result.headers!['content-type']).toBe('application/json');
    expect(result.headers!['accept']).toBe('application/json');
  });

  it('skips derived components (starting with @)', () => {
    const headers = {
      'Signature-Input': 'sig1=("@method" "@target-uri" "content-type");created=1234',
      'Signature': 'base64signature==',
      'Content-Type': 'application/json',
    };
    const signatureInput = 'sig1=("@method" "@target-uri" "content-type");created=1234';

    const result = extractForwardedHeaders(headers, signatureInput);

    expect(result.error).toBeUndefined();
    expect(result.headers).toBeDefined();
    // Should only have signature headers and content-type, not @method/@target-uri
    expect(Object.keys(result.headers!)).toEqual(['signature-input', 'signature', 'content-type']);
  });

  it('lowercases all header keys', () => {
    const headers = {
      'SIGNATURE-INPUT': 'sig1=("Content-Type");created=1234',
      'SIGNATURE': 'base64signature==',
      'Content-Type': 'application/json',
    };
    const signatureInput = 'sig1=("Content-Type");created=1234';

    const result = extractForwardedHeaders(headers, signatureInput);

    expect(result.error).toBeUndefined();
    const keys = Object.keys(result.headers!);
    expect(keys.every((k) => k === k.toLowerCase())).toBe(true);
  });

  it('blocks sensitive header: cookie', () => {
    const headers = {
      'Signature-Input': 'sig1=("cookie");created=1234',
      'Signature': 'base64signature==',
      'Cookie': 'session=abc123',
    };
    const signatureInput = 'sig1=("cookie");created=1234';

    const result = extractForwardedHeaders(headers, signatureInput);

    expect(result.error).toBe('Signature covers sensitive header: cookie');
    expect(result.headers).toBeUndefined();
  });

  it('blocks sensitive header: authorization', () => {
    const headers = {
      'Signature-Input': 'sig1=("authorization");created=1234',
      'Signature': 'base64signature==',
      'Authorization': 'Bearer token123',
    };
    const signatureInput = 'sig1=("authorization");created=1234';

    const result = extractForwardedHeaders(headers, signatureInput);

    expect(result.error).toBe('Signature covers sensitive header: authorization');
  });

  it('blocks sensitive header: proxy-authorization', () => {
    const headers = {
      'Signature-Input': 'sig1=("proxy-authorization");created=1234',
      'Signature': 'base64signature==',
      'Proxy-Authorization': 'Basic abc123',
    };
    const signatureInput = 'sig1=("proxy-authorization");created=1234';

    const result = extractForwardedHeaders(headers, signatureInput);

    expect(result.error).toBe('Signature covers sensitive header: proxy-authorization');
  });

  it('blocks sensitive header: www-authenticate', () => {
    const headers = {
      'Signature-Input': 'sig1=("www-authenticate");created=1234',
      'Signature': 'base64signature==',
      'WWW-Authenticate': 'Bearer realm="example"',
    };
    const signatureInput = 'sig1=("www-authenticate");created=1234';

    const result = extractForwardedHeaders(headers, signatureInput);

    expect(result.error).toBe('Signature covers sensitive header: www-authenticate');
  });

  it('handles missing covered headers gracefully', () => {
    const headers = {
      'Signature-Input': 'sig1=("content-type" "x-custom");created=1234',
      'Signature': 'base64signature==',
      'Content-Type': 'application/json',
      // x-custom is missing
    };
    const signatureInput = 'sig1=("content-type" "x-custom");created=1234';

    const result = extractForwardedHeaders(headers, signatureInput);

    expect(result.error).toBeUndefined();
    expect(result.headers!['content-type']).toBe('application/json');
    expect(result.headers!['x-custom']).toBeUndefined();
  });
});

describe('hasSignatureHeaders', () => {
  it('returns true when signature headers present', () => {
    const headers = {
      'Signature-Input': 'sig1=("@method");created=1234',
      'Signature': 'base64signature==',
    };

    expect(hasSignatureHeaders(headers)).toBe(true);
  });

  it('returns true with case-insensitive headers', () => {
    const headers = {
      'signature-input': 'sig1=("@method");created=1234',
      'SIGNATURE': 'base64signature==',
    };

    expect(hasSignatureHeaders(headers)).toBe(true);
  });

  it('returns false when signature-input missing', () => {
    const headers = {
      'Signature': 'base64signature==',
    };

    expect(hasSignatureHeaders(headers)).toBe(false);
  });

  it('returns false when signature missing', () => {
    const headers = {
      'Signature-Input': 'sig1=("@method");created=1234',
    };

    expect(hasSignatureHeaders(headers)).toBe(false);
  });

  it('returns false for empty headers', () => {
    const headers = {};

    expect(hasSignatureHeaders(headers)).toBe(false);
  });

  it('handles undefined values', () => {
    const headers: Record<string, string | undefined> = {
      'Signature-Input': 'sig1=("@method");created=1234',
      'Signature': undefined,
    };

    expect(hasSignatureHeaders(headers)).toBe(false);
  });
});
