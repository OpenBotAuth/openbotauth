import type { HeaderExtractionResult } from './types.js';

/**
 * Headers that must never be forwarded to the verifier service
 * These are sensitive authentication/authorization headers
 */
const SENSITIVE_HEADERS = new Set([
  'cookie',
  'authorization',
  'proxy-authorization',
  'www-authenticate',
]);

/**
 * Required signature headers that must be present for a signed request
 */
const SIGNATURE_HEADERS = ['signature-input', 'signature'];

/**
 * Optional signature header for agent identity
 */
const SIGNATURE_AGENT_HEADER = 'signature-agent';

/**
 * Parse covered headers from Signature-Input header value.
 *
 * The Signature-Input header format (RFC 9421) is:
 *   sig1=("@method" "@target-uri" "content-type");created=...
 *
 * This extracts the list inside the first parentheses, splits by whitespace,
 * and trims quotes from each component.
 *
 * @param signatureInput - The Signature-Input header value
 * @returns Array of covered component/header names (lowercase, without quotes)
 *
 * @example
 * parseCoveredHeaders('sig1=("@method" "@target-uri" "content-type");created=1234')
 * // Returns: ["@method", "@target-uri", "content-type"]
 */
export function parseCoveredHeaders(signatureInput: string): string[] {
  // Find content between first ( and matching )
  const openParen = signatureInput.indexOf('(');
  if (openParen === -1) {
    return [];
  }

  const closeParen = signatureInput.indexOf(')', openParen);
  if (closeParen === -1) {
    return [];
  }

  const content = signatureInput.slice(openParen + 1, closeParen);

  // Split by whitespace and trim quotes
  return content
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .map((s) => {
      // Remove surrounding quotes
      if (s.startsWith('"') && s.endsWith('"')) {
        return s.slice(1, -1).toLowerCase();
      }
      return s.toLowerCase();
    });
}

/**
 * Normalize header name to lowercase
 */
function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

/**
 * Check if a header name is a derived component (starts with @)
 */
function isDerivedComponent(name: string): boolean {
  return name.startsWith('@');
}

/**
 * Extract headers to forward to the verifier service.
 *
 * This function:
 * 1. Always includes signature-input, signature, and signature-agent (if present)
 * 2. Includes all covered headers specified in Signature-Input (except derived components)
 * 3. Normalizes all header keys to lowercase
 * 4. Returns an error if any covered header is in the sensitive list
 *
 * @param rawHeaders - The original request headers
 * @param signatureInput - The Signature-Input header value
 * @returns Either extracted headers or an error
 *
 * @example
 * extractForwardedHeaders(
 *   { 'Signature-Input': '...', 'Signature': '...', 'Content-Type': 'application/json' },
 *   'sig1=("content-type");created=1234'
 * )
 * // Returns: { headers: { 'signature-input': '...', 'signature': '...', 'content-type': 'application/json' } }
 */
export function extractForwardedHeaders(
  rawHeaders: Record<string, string | undefined>,
  signatureInput: string
): HeaderExtractionResult {
  const result: Record<string, string> = {};

  // Helper to get header value (case-insensitive)
  const getHeader = (name: string): string | undefined => {
    const normalized = normalizeHeaderName(name);
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (normalizeHeaderName(key) === normalized && value !== undefined) {
        return value;
      }
    }
    return undefined;
  };

  // Always include required signature headers
  for (const headerName of SIGNATURE_HEADERS) {
    const value = getHeader(headerName);
    if (value !== undefined) {
      result[headerName] = value;
    }
  }

  // Include signature-agent if present
  const signatureAgent = getHeader(SIGNATURE_AGENT_HEADER);
  if (signatureAgent !== undefined) {
    result[SIGNATURE_AGENT_HEADER] = signatureAgent;
  }

  // Parse covered headers from Signature-Input
  const coveredHeaders = parseCoveredHeaders(signatureInput);

  // Check for sensitive headers and include non-derived covered headers
  for (const headerName of coveredHeaders) {
    // Skip derived components (e.g., @method, @target-uri)
    if (isDerivedComponent(headerName)) {
      continue;
    }

    // Check if this is a sensitive header
    if (SENSITIVE_HEADERS.has(headerName)) {
      return {
        error: `Signature covers sensitive header: ${headerName}`,
      };
    }

    // Include the header value if present
    const value = getHeader(headerName);
    if (value !== undefined) {
      result[headerName] = value;
    }
  }

  return { headers: result };
}

/**
 * Signature-related headers that indicate a signed request
 */
const SIGNATURE_RELATED_HEADERS = new Set([
  'signature-input',
  'signature',
  'signature-agent',
]);

/**
 * Check if headers contain any signature-related headers.
 *
 * Returns true if ANY of signature-input, signature, or signature-agent
 * is present. This matches verifier-service behavior for "signed lane"
 * classification.
 *
 * Note: Having any signature header present means the request is attempting
 * to be signed. The VerifierClient.verify() method will return appropriate
 * errors if required headers are missing.
 */
export function hasSignatureHeaders(
  headers: Record<string, string | undefined>
): boolean {
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (SIGNATURE_RELATED_HEADERS.has(normalizeHeaderName(key))) {
      return true;
    }
  }
  return false;
}
