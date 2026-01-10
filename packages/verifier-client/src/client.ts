import type {
  VerifierClientOptions,
  VerificationRequest,
  VerificationResult,
} from './types.js';
import { extractForwardedHeaders, hasSignatureHeaders } from './headers.js';

/**
 * Default verifier service URL (hosted)
 */
const DEFAULT_VERIFIER_URL = 'https://verifier.openbotauth.org/verify';

/**
 * Default timeout in milliseconds
 */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Client for verifying OpenBotAuth (RFC 9421) signed HTTP requests.
 *
 * This client calls a verifier service to validate signatures - it does NOT
 * perform cryptographic verification locally.
 *
 * @example
 * ```typescript
 * const client = new VerifierClient();
 *
 * const result = await client.verify({
 *   method: 'GET',
 *   url: 'https://example.com/api/resource',
 *   headers: {
 *     'signature-input': '...',
 *     'signature': '...',
 *     'signature-agent': '...',
 *   },
 * });
 *
 * if (result.verified) {
 *   console.log('Request verified from agent:', result.agent?.client_name);
 * }
 * ```
 */
export class VerifierClient {
  private readonly verifierUrl: string;
  private readonly timeoutMs: number;

  /**
   * Create a new VerifierClient instance.
   *
   * @param options - Configuration options
   * @param options.verifierUrl - URL of the verifier service (default: hosted verifier)
   * @param options.timeoutMs - Request timeout in milliseconds (default: 5000)
   */
  constructor(options: VerifierClientOptions = {}) {
    this.verifierUrl = options.verifierUrl ?? DEFAULT_VERIFIER_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Verify a signed HTTP request.
   *
   * @param input - The request to verify
   * @returns Verification result indicating success or failure
   */
  async verify(input: VerificationRequest): Promise<VerificationResult> {
    // Check if request has signature headers
    if (!hasSignatureHeaders(input.headers)) {
      return {
        verified: false,
        error: 'Missing required signature headers',
      };
    }

    // Get signature-input header value
    const signatureInput = this.getHeaderValue(input.headers, 'signature-input');
    if (!signatureInput) {
      return {
        verified: false,
        error: 'Missing Signature-Input header',
      };
    }

    // Extract headers to forward
    const extractResult = extractForwardedHeaders(input.headers, signatureInput);
    if (extractResult.error) {
      return {
        verified: false,
        error: extractResult.error,
      };
    }

    // Build verification payload
    const payload = {
      method: input.method,
      url: input.url,
      headers: extractResult.headers,
      ...(input.body && { body: input.body }),
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(this.verifierUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          verified: false,
          error: `Verifier returned ${response.status}: ${errorText}`,
        };
      }

      const result = await response.json() as VerificationResult;
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          verified: false,
          error: `Verification timed out after ${this.timeoutMs}ms`,
        };
      }

      return {
        verified: false,
        error: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get header value (case-insensitive lookup)
   */
  private getHeaderValue(
    headers: Record<string, string>,
    name: string
  ): string | undefined {
    const normalized = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === normalized) {
        return value;
      }
    }
    return undefined;
  }
}
