import type { VerificationRequest } from './types.js';

/**
 * Extract headers from Next.js Headers object to a plain Record.
 *
 * @param nextHeaders - Next.js Headers object (from next/headers)
 * @returns Plain object with header key-value pairs
 *
 * @example
 * ```typescript
 * // In a Next.js Server Component or Route Handler
 * import { headers } from 'next/headers';
 * import { extractFromNextHeaders, VerifierClient } from '@openbotauth/verifier-client';
 *
 * export async function GET(request: Request) {
 *   const headersList = headers();
 *   const headersObj = extractFromNextHeaders(headersList);
 *   // Use headersObj with VerifierClient
 * }
 * ```
 */
export function extractFromNextHeaders(nextHeaders: Headers): Record<string, string> {
  const result: Record<string, string> = {};

  nextHeaders.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });

  return result;
}

/**
 * Build a verification request from a Next.js Request object.
 *
 * This helper extracts the method, URL, and headers from a Next.js Request
 * to create a properly formatted verification request.
 *
 * @param request - Next.js Request object
 * @returns Object suitable for VerifierClient.verify()
 *
 * @example
 * ```typescript
 * // In a Next.js Route Handler (app/api/protected/route.ts)
 * import { NextRequest, NextResponse } from 'next/server';
 * import { buildVerifyRequestForNext, VerifierClient } from '@openbotauth/verifier-client';
 *
 * const client = new VerifierClient();
 *
 * export async function GET(request: NextRequest) {
 *   const verifyRequest = buildVerifyRequestForNext(request);
 *   const result = await client.verify(verifyRequest);
 *
 *   if (result.verified) {
 *     return NextResponse.json({
 *       message: 'Hello verified bot!',
 *       agent: result.agent,
 *     });
 *   }
 *
 *   return NextResponse.json(
 *     { error: 'Verification failed', details: result.error },
 *     { status: 401 }
 *   );
 * }
 * ```
 */
export function buildVerifyRequestForNext(
  request: Request
): Omit<VerificationRequest, 'body'> {
  const headers = extractFromNextHeaders(request.headers);

  return {
    method: request.method,
    url: request.url,
    headers,
  };
}

/**
 * Build a verification request from Next.js Request including body.
 *
 * Note: This consumes the request body, so it can only be called once.
 * Use this when your endpoint needs to verify requests with body content
 * that is covered by the signature.
 *
 * @param request - Next.js Request object
 * @returns Object suitable for VerifierClient.verify()
 *
 * @example
 * ```typescript
 * // In a Next.js Route Handler
 * import { NextRequest, NextResponse } from 'next/server';
 * import { buildVerifyRequestForNextWithBody, VerifierClient } from '@openbotauth/verifier-client';
 *
 * const client = new VerifierClient();
 *
 * export async function POST(request: NextRequest) {
 *   const verifyRequest = await buildVerifyRequestForNextWithBody(request);
 *   const result = await client.verify(verifyRequest);
 *   // ...
 * }
 * ```
 */
export async function buildVerifyRequestForNextWithBody(
  request: Request
): Promise<VerificationRequest> {
  const headers = extractFromNextHeaders(request.headers);
  const body = await request.text();

  return {
    method: request.method,
    url: request.url,
    headers,
    body: body || undefined,
  };
}
