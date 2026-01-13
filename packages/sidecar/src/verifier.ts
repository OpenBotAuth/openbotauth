import type { VerifierRequest, VerifierResponse } from './types.js';

/**
 * Call the OpenBotAuth verifier service
 */
export async function callVerifier(
  verifierUrl: string,
  request: VerifierRequest,
  timeoutMs: number
): Promise<VerifierResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(verifierUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    // Try to parse JSON response
    let data: VerifierResponse;
    try {
      data = await response.json() as VerifierResponse;
    } catch {
      // Non-JSON response - get text for error message
      const text = await response.text().catch(() => 'Unable to read response');
      return {
        verified: false,
        error: `Verifier ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    // 200 with verified=true or 401 with verified=false
    if (response.ok) {
      return data;
    }

    // Error response with JSON body
    return {
      verified: false,
      error: data.error || `Verifier ${response.status}: Unknown error`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        verified: false,
        error: `Verifier timeout after ${timeoutMs}ms`,
      };
    }

    return {
      verified: false,
      error: error instanceof Error ? error.message : 'Unknown verifier error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
