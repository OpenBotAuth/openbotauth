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

    const data = await response.json() as VerifierResponse;

    // 200 with verified=true or 401 with verified=false
    if (response.ok) {
      return data;
    }

    // Error response
    return {
      verified: false,
      error: data.error || `Verifier returned ${response.status}`,
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
