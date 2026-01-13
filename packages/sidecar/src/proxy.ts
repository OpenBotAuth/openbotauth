import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import type { OBAuthHeaders } from './types.js';
import { filterHopByHopHeaders, getHeaderString } from './headers.js';

/**
 * Proxy a request to the upstream server
 */
export async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamUrl: string,
  obAuthHeaders: OBAuthHeaders
): Promise<void> {
  const upstream = new URL(upstreamUrl);
  const targetUrl = new URL(req.url || '/', upstream);

  const isHttps = upstream.protocol === 'https:';
  const requestFn = isHttps ? httpsRequest : httpRequest;

  // Filter and prepare headers
  const forwardHeaders = filterHopByHopHeaders(req.headers);

  // Add OBAuth headers
  for (const [key, value] of Object.entries(obAuthHeaders)) {
    if (value !== undefined) {
      forwardHeaders[key] = value;
    }
  }

  // Set proper host header for upstream
  forwardHeaders['host'] = upstream.host;

  // Add X-Forwarded headers (preserve incoming if present)
  const clientIp = req.socket.remoteAddress || 'unknown';
  forwardHeaders['x-forwarded-for'] = forwardHeaders['x-forwarded-for']
    ? `${forwardHeaders['x-forwarded-for']}, ${clientIp}`
    : clientIp;
  // Preserve incoming x-forwarded-proto, else default to 'http' (sidecar listens on HTTP)
  if (!forwardHeaders['x-forwarded-proto']) {
    forwardHeaders['x-forwarded-proto'] = 'http';
  }
  // Preserve incoming x-forwarded-host if present
  if (!forwardHeaders['x-forwarded-host']) {
    forwardHeaders['x-forwarded-host'] = getHeaderString(req.headers, 'host') || upstream.host;
  }

  return new Promise((resolve, reject) => {
    const proxyReq = requestFn(
      {
        hostname: upstream.hostname,
        port: upstream.port || (isHttps ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: forwardHeaders,
      },
      (proxyRes) => {
        // Filter response headers
        const responseHeaders = filterHopByHopHeaders(proxyRes.headers);

        // Echo key OBAuth headers on response for client visibility
        // Only include minimal set: Verified, Agent (if present), Error (if present)
        if (obAuthHeaders['X-OBAuth-Verified']) {
          responseHeaders['X-OBAuth-Verified'] = obAuthHeaders['X-OBAuth-Verified'];
        }
        if (obAuthHeaders['X-OBAuth-Agent']) {
          responseHeaders['X-OBAuth-Agent'] = obAuthHeaders['X-OBAuth-Agent'];
        }
        if (obAuthHeaders['X-OBAuth-Error']) {
          responseHeaders['X-OBAuth-Error'] = obAuthHeaders['X-OBAuth-Error'];
        }

        // Send response status and headers
        res.writeHead(proxyRes.statusCode || 500, responseHeaders);

        // Attach event listeners BEFORE pipe() to avoid race conditions
        // where the stream completes before listeners are registered
        proxyRes.on('end', () => {
          resolve();
        });

        proxyRes.on('error', (err) => {
          // Clean up upstream request to prevent resource leaks
          proxyReq.destroy();
          reject(err);
        });

        // Handle downstream client errors (e.g., client closes connection abruptly)
        res.on('error', () => {
          // Clean up both streams to prevent resource leaks
          proxyRes.destroy();
          proxyReq.destroy();
          // Resolve instead of reject - client disconnect is not a server error
          resolve();
        });

        // Pipe the response body
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      // Connection error to upstream
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
      }
      resolve(); // Don't reject, we handled it
    });

    // Handle incoming request errors (e.g., client disconnects during upload)
    req.on('error', () => {
      proxyReq.destroy();
      resolve();
    });

    // Pipe the request body to upstream
    req.pipe(proxyReq);
  });
}

/**
 * Send a 401 Unauthorized response
 */
export function sendUnauthorized(
  res: ServerResponse,
  error: string,
  obAuthHeaders: OBAuthHeaders
): void {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...obAuthHeaders,
  };

  res.writeHead(401, headers);
  res.end(JSON.stringify({
    error: 'Unauthorized',
    message: 'Valid OpenBotAuth signature required',
    detail: error,
  }));
}
