/**
 * RFC 9421 HTTP Message Signatures Parser
 * 
 * Parses Signature-Input and Signature headers according to RFC 9421
 */

import type { SignatureComponents } from './types.js';

/**
 * Parse RFC 9421 Signature-Input header
 * 
 * Example:
 *   Signature-Input: sig1=("@method" "@path" "@authority" "content-type");created=1618884473;keyid="test-key-ed25519"
 */
export function parseSignatureInput(signatureInput: string): SignatureComponents | null {
  try {
    // Extract the signature label and parameters
    const match = signatureInput.match(/^(\w+)=\(([^)]+)\);(.+)$/);
    if (!match) {
      return null;
    }

    const [, , headersList, paramsStr] = match;

    // Parse covered headers
    const headers = headersList
      .split(/\s+/)
      .map(h => h.replace(/"/g, '').trim())
      .filter(Boolean);

    // Parse parameters
    const params: Record<string, string | number> = {};
    const paramPairs = paramsStr.split(';');
    
    for (const pair of paramPairs) {
      const [key, value] = pair.split('=').map(s => s.trim());
      if (key && value) {
        // Remove quotes and parse numbers
        const cleanValue = value.replace(/"/g, '');
        params[key] = isNaN(Number(cleanValue)) ? cleanValue : Number(cleanValue);
      }
    }

    return {
      keyId: params.keyid as string,
      algorithm: params.alg as string || 'ed25519',
      created: params.created as number,
      expires: params.expires as number,
      nonce: params.nonce as string,
      headers,
      signature: '', // Will be filled from Signature header
    };
  } catch (error) {
    console.error('Error parsing Signature-Input:', error);
    return null;
  }
}

/**
 * Parse RFC 9421 Signature header
 * 
 * Example:
 *   Signature: sig1=:K2qGT5srn2OGbOIDzQ6kYT+ruaycnDAAUpKv+ePFfD0RAxn/1BUeZx/Kdrq32DrfakQ6bPsvB9aqZqognNT6be4olHROIkeV879RrsrObury8L9SCEibeoHyqU/yCjphSmEdd7WD+zrchK57quskKwRefy2iEC5S2uAH0EPyOZKWlvbKmKu5q4CaB8X/I5/+HLZLGvDiezqi6/7p2Gngf5hwZ0lSdy39vyNMaaAT0tKo6nuVw0S1MVg1Q7MpWYZs0soHjttq0uLIA3DIbQfLiIvK6/l0BdWTU7+2uQj7lBkQAsFZHoA96ZZgFquQrXRlmYOh+Hx5D4m8eNqsKzeDQg==:
 */
export function parseSignature(signature: string): string | null {
  try {
    // Extract base64 signature from sig1=:...:
    const match = signature.match(/^\w+=:([^:]+):$/);
    if (!match) {
      return null;
    }
    return match[1];
  } catch (error) {
    console.error('Error parsing Signature:', error);
    return null;
  }
}

/**
 * Build the signature base string according to RFC 9421
 * 
 * This is what gets signed by the client
 */
export function buildSignatureBase(
  components: SignatureComponents,
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
  }
): string {
  const lines: string[] = [];
  const url = new URL(request.url);

  for (const component of components.headers) {
    if (component.startsWith('@')) {
      // Derived components
      switch (component) {
        case '@method':
          lines.push(`"@method": ${request.method.toUpperCase()}`);
          break;
        case '@path':
          lines.push(`"@path": ${url.pathname}`);
          break;
        case '@authority':
          lines.push(`"@authority": ${url.host}`);
          break;
        case '@target-uri':
          lines.push(`"@target-uri": ${request.url}`);
          break;
        case '@request-target':
          lines.push(`"@request-target": ${request.method.toLowerCase()} ${url.pathname}${url.search}`);
          break;
        default:
          console.warn(`Unknown derived component: ${component}`);
      }
    } else {
      // Regular headers
      const headerValue = request.headers[component.toLowerCase()];
      if (headerValue) {
        lines.push(`"${component}": ${headerValue}`);
      }
    }
  }

  // Add signature parameters
  const params: string[] = [];
  params.push(`(${components.headers.map(h => `"${h}"`).join(' ')})`);
  
  if (components.created) {
    params.push(`created=${components.created}`);
  }
  if (components.expires) {
    params.push(`expires=${components.expires}`);
  }
  if (components.nonce) {
    params.push(`nonce="${components.nonce}"`);
  }
  if (components.keyId) {
    params.push(`keyid="${components.keyId}"`);
  }
  if (components.algorithm) {
    params.push(`alg="${components.algorithm}"`);
  }

  lines.push(`"@signature-params": ${params.join(';')}`);

  return lines.join('\n');
}

/**
 * Extract JWKS URL from Signature-Agent header
 * 
 * Example:
 *   Signature-Agent: https://openbotregistry.example.com/jwks/hammadtq.json
 */
export function parseSignatureAgent(signatureAgent: string): string | null {
  try {
    const url = new URL(signatureAgent);
    // Validate it's a proper JWKS URL
    if (url.pathname.endsWith('.json') || url.pathname.includes('/jwks/')) {
      return signatureAgent;
    }
    return null;
  } catch (error) {
    console.error('Invalid Signature-Agent URL:', error);
    return null;
  }
}

