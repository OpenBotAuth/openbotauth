import type { IncomingHttpHeaders } from 'node:http';

/**
 * Signature-related headers
 */
const SIGNATURE_HEADERS = ['signature-input', 'signature', 'signature-agent'];

/**
 * Sensitive headers that should not be covered/forwarded
 * Matches canonical policy used elsewhere in OpenBotAuth
 */
const SENSITIVE_HEADERS = [
  'cookie',
  'authorization',
  'proxy-authorization',
  'www-authenticate',
];

/**
 * Derived components (RFC 9421) - start with @
 */
const DERIVED_COMPONENT_PREFIX = '@';

/**
 * Check if a request has any signature headers
 */
export function hasSignatureHeaders(headers: IncomingHttpHeaders): boolean {
  return SIGNATURE_HEADERS.some(h => headers[h] !== undefined);
}

/**
 * Parse covered headers from Signature-Input
 *
 * Example input: sig1=("@method" "@path" "@authority" "content-type");created=1618884473;...
 * Returns: ['@method', '@path', '@authority', 'content-type']
 *
 * Handles both quoted and unquoted tokens, extra whitespace, and invalid input.
 */
export function parseCoveredHeaders(signatureInput: string): string[] {
  // Extract the content between parentheses
  const match = signatureInput.match(/\(([^)]*)\)/);
  if (!match) {
    return [];
  }

  const content = match[1].trim();
  if (!content) {
    return [];
  }

  const result: string[] = [];

  // Match both quoted ("header") and unquoted (header) tokens
  // Quoted: "header-name"
  // Unquoted: header-name (letters, digits, hyphens, @)
  const tokenRegex = /"([^"]+)"|([a-zA-Z@][a-zA-Z0-9-]*)/g;
  let tokenMatch;

  while ((tokenMatch = tokenRegex.exec(content)) !== null) {
    // Group 1 is quoted content, group 2 is unquoted
    const token = tokenMatch[1] || tokenMatch[2];
    if (token) {
      result.push(token.toLowerCase());
    }
  }

  return result;
}

/**
 * Get the first sensitive header that is covered, if any.
 * Returns the header name or null if none are sensitive.
 */
export function getSensitiveCoveredHeader(coveredHeaders: string[]): string | null {
  for (const header of coveredHeaders) {
    const lower = header.toLowerCase();
    if (SENSITIVE_HEADERS.includes(lower)) {
      return lower;
    }
  }
  return null;
}

/**
 * Extract headers to forward to verifier
 * - Excludes derived components (@method, @path, etc - verifier reconstructs these)
 * - Excludes sensitive headers if they are covered (security check)
 * - Lowercases all keys
 */
export function extractForwardedHeaders(
  incomingHeaders: IncomingHttpHeaders,
  coveredHeaders: string[]
): Record<string, string> {
  const result: Record<string, string> = {};

  // Always include signature headers
  for (const sigHeader of SIGNATURE_HEADERS) {
    const value = incomingHeaders[sigHeader];
    if (typeof value === 'string') {
      result[sigHeader] = value;
    } else if (Array.isArray(value)) {
      result[sigHeader] = value.join(', ');
    }
  }

  // Include covered headers that are not derived components
  for (const header of coveredHeaders) {
    // Skip derived components - verifier reconstructs these from method/url
    if (header.startsWith(DERIVED_COMPONENT_PREFIX)) {
      continue;
    }

    const lowerHeader = header.toLowerCase();
    const value = incomingHeaders[lowerHeader];
    if (typeof value === 'string') {
      result[lowerHeader] = value;
    } else if (Array.isArray(value)) {
      // For repeated headers, join with comma
      result[lowerHeader] = value.join(', ');
    }
  }

  // Add host if present (commonly used)
  if (incomingHeaders.host && !result.host) {
    result.host = incomingHeaders.host;
  }

  return result;
}

/**
 * Headers to remove from upstream request/response
 */
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

/**
 * Filter out hop-by-hop headers for proxying
 */
export function filterHopByHopHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.includes(lowerKey)) {
      continue;
    }
    if (typeof value === 'string') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.join(', ');
    }
  }

  return result;
}
