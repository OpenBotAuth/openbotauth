/**
 * OpenBotAuth Apache Sidecar
 *
 * A reverse-proxy sidecar that sits in front of Apache (or any upstream),
 * verifies OpenBotAuth signatures via the verifier service, and injects
 * standard X-OBAuth-* headers.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { loadConfig } from './config.js';
import {
  hasSignatureHeaders,
  parseCoveredHeaders,
  getSensitiveCoveredHeader,
  extractForwardedHeaders,
  getHeaderString,
  sanitizeHeaderValue,
} from './headers.js';
import { callVerifier } from './verifier.js';
import { proxyRequest, sendUnauthorized } from './proxy.js';
import { isProtectedPath } from './paths.js';
import type { OBAuthHeaders, VerifierRequest } from './types.js';

const config = loadConfig();

/**
 * Reconstruct the full URL from the incoming request
 */
function reconstructUrl(req: IncomingMessage): string {
  // Use X-Forwarded headers if present
  const protocol = (req.headers['x-forwarded-proto'] as string) || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';
  const path = req.url || '/';

  return `${protocol}://${host}${path}`;
}

/**
 * Main request handler
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Determine if this path requires verification
  const requiresVerification = config.mode === 'require-verified' && isProtectedPath(pathname, config.protectedPaths);

  // Check for signature headers
  const isSigned = hasSignatureHeaders(req.headers);

  // Case 1: Unsigned request
  if (!isSigned) {
    const obAuthHeaders: OBAuthHeaders = {
      'X-OBAuth-Verified': 'false',
    };

    if (requiresVerification) {
      // Protected path, no signature - reject
      sendUnauthorized(res, 'No signature headers present', obAuthHeaders);
      return;
    }

    // Observe mode or non-protected path - proxy through
    await proxyRequest(req, res, config.upstreamUrl, obAuthHeaders);
    return;
  }

  // Case 2: Signed request - verify
  // Normalize header values (handle arrays)
  const signatureInput = getHeaderString(req.headers, 'signature-input');
  const signature = getHeaderString(req.headers, 'signature');

  // Early validation: missing signature-input
  if (!signatureInput) {
    const obAuthHeaders: OBAuthHeaders = {
      'X-OBAuth-Verified': 'false',
      'X-OBAuth-Error': 'Missing Signature-Input',
    };

    if (requiresVerification) {
      sendUnauthorized(res, 'Missing Signature-Input header', obAuthHeaders);
      return;
    }

    await proxyRequest(req, res, config.upstreamUrl, obAuthHeaders);
    return;
  }

  // Early validation: missing signature
  if (!signature) {
    const obAuthHeaders: OBAuthHeaders = {
      'X-OBAuth-Verified': 'false',
      'X-OBAuth-Error': 'Missing Signature',
    };

    if (requiresVerification) {
      sendUnauthorized(res, 'Missing Signature header', obAuthHeaders);
      return;
    }

    await proxyRequest(req, res, config.upstreamUrl, obAuthHeaders);
    return;
  }

  // Parse covered headers
  const coveredHeaders = parseCoveredHeaders(signatureInput);

  // Security check: reject if sensitive headers are covered
  const sensitiveHeader = getSensitiveCoveredHeader(coveredHeaders);
  if (sensitiveHeader) {
    const errorMsg = `Sensitive header in signature scope: ${sensitiveHeader}`;
    const obAuthHeaders: OBAuthHeaders = {
      'X-OBAuth-Verified': 'false',
      'X-OBAuth-Error': sanitizeHeaderValue(errorMsg),
    };

    if (requiresVerification) {
      sendUnauthorized(res, errorMsg, obAuthHeaders);
      return;
    }

    await proxyRequest(req, res, config.upstreamUrl, obAuthHeaders);
    return;
  }

  // Extract headers for verification
  const forwardedHeaders = extractForwardedHeaders(req.headers, coveredHeaders);

  // Build verification request
  const verifierRequest: VerifierRequest = {
    method: req.method || 'GET',
    url: reconstructUrl(req),
    headers: forwardedHeaders,
  };

  // Call verifier
  const result = await callVerifier(config.verifierUrl, verifierRequest, config.timeoutMs);

  if (result.verified && result.agent) {
    // Verification succeeded
    const obAuthHeaders: OBAuthHeaders = {
      'X-OBAuth-Verified': 'true',
      'X-OBAuth-Agent': sanitizeHeaderValue(result.agent.client_name || 'unknown'),
      'X-OBAuth-JWKS-URL': result.agent.jwks_url,
      'X-OBAuth-Kid': result.agent.kid,
    };

    await proxyRequest(req, res, config.upstreamUrl, obAuthHeaders);
    return;
  }

  // Verification failed
  const errorMsg = result.error || 'Verification failed';
  const obAuthHeaders: OBAuthHeaders = {
    'X-OBAuth-Verified': 'false',
    'X-OBAuth-Error': sanitizeHeaderValue(errorMsg),
  };

  if (requiresVerification) {
    sendUnauthorized(res, errorMsg, obAuthHeaders);
    return;
  }

  // Observe mode - proxy through with error header
  await proxyRequest(req, res, config.upstreamUrl, obAuthHeaders);
}

/**
 * Main server request handler - routes health check and normal requests
 */
function serverRequestHandler(req: IncomingMessage, res: ServerResponse): void {
  // Health check endpoint
  if (req.method === 'GET' && req.url === '/.well-known/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'apache-sidecar',
      upstream: config.upstreamUrl,
      verifier: config.verifierUrl,
      mode: config.mode,
    }));
    return;
  }

  // Normal request handling
  handleRequest(req, res).catch((err) => {
    console.error('Request handling error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  });
}

// Create and start server
const server = createServer(serverRequestHandler);

server.listen(config.port, () => {
  console.log(`🛡️  OpenBotAuth Apache Sidecar running on port ${config.port}`);
  console.log(`   Upstream: ${config.upstreamUrl}`);
  console.log(`   Verifier: ${config.verifierUrl}`);
  console.log(`   Mode: ${config.mode}`);
  console.log(`   Protected paths: ${config.protectedPaths.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
