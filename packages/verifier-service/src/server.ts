/**
 * OpenBotAuth Verifier Service
 * 
 * RFC 9421 HTTP Message Signatures verification service
 */

import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createClient } from 'redis';
import { Pool } from 'pg';
import { JWKSCacheManager } from './jwks-cache.js';
import { NonceManager } from './nonce-manager.js';
import { SignatureVerifier } from './signature-verifier.js';
import { TelemetryLogger } from './telemetry.js';
import type { VerificationRequest } from './types.js';

const app = express();
const port = parseInt(process.env.VERIFIER_PORT || '8081', 10);

// Middleware
app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

// CORS for development
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Signature-Input, Signature, Signature-Agent');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

// Initialize Redis
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Connected to Redis');
});

await redisClient.connect();

// Initialize PostgreSQL pool (optional for telemetry)
const dbPool = process.env.NEON_DATABASE_URL 
  ? new Pool({
      connectionString: process.env.NEON_DATABASE_URL,
      ssl: process.env.NEON_DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
    })
  : null;

if (dbPool) {
  dbPool.on('error', (err: Error) => {
    console.error('PostgreSQL pool error:', err);
  });
  console.log('✅ PostgreSQL pool initialized');
}

// Initialize services
const jwksCache = new JWKSCacheManager(redisClient);
const nonceManager = new NonceManager(
  redisClient,
  parseInt(process.env.OB_NONCE_TTL_SEC || '600', 10)
);

const trustedDirectories = process.env.OB_TRUSTED_DIRECTORIES
  ? process.env.OB_TRUSTED_DIRECTORIES.split(',').map(d => d.trim())
  : [];

const maxSkewSec = parseInt(process.env.OB_MAX_SKEW_SEC || '300', 10);

const discoveryPaths = process.env.OB_JWKS_DISCOVERY_PATHS
  ? process.env.OB_JWKS_DISCOVERY_PATHS.split(',').map(p => p.trim())
  : undefined;

const x509Enabled = process.env.OBA_X509_ENABLED === 'true';

const parsePemBundle = (pem: string): string[] => {
  const matches = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  return matches ? matches.map((m) => m.trim()) : [];
};

const trustAnchorRefs = process.env.OBA_X509_TRUST_ANCHORS
  ? process.env.OBA_X509_TRUST_ANCHORS.split(',').map((p) => p.trim()).filter(Boolean)
  : [];

const trustAnchors: string[] = [];
for (const ref of trustAnchorRefs) {
  if (ref.includes('BEGIN CERTIFICATE')) {
    trustAnchors.push(...parsePemBundle(ref));
    continue;
  }
  try {
    const pem = readFileSync(ref, 'utf-8');
    trustAnchors.push(...parsePemBundle(pem));
  } catch (error) {
    console.warn(`Failed to read trust anchor file: ${ref}`);
  }
}

const verifier = new SignatureVerifier(
  jwksCache,
  nonceManager,
  trustedDirectories,
  maxSkewSec,
  discoveryPaths,
  x509Enabled,
  trustAnchors
);

// Initialize telemetry logger (only if DB is configured)
const telemetryEnabled = process.env.ENABLE_TELEMETRY !== 'false' && dbPool !== null;
const telemetryLogger = telemetryEnabled ? new TelemetryLogger(redisClient as any, dbPool!) : null;

if (telemetryLogger) {
  console.log('✅ Telemetry logging enabled');
}

// Store in app locals for access in routes
app.locals.verifier = verifier;
app.locals.jwksCache = jwksCache;
app.locals.nonceManager = nonceManager;
app.locals.telemetryLogger = telemetryLogger;

/**
 * Check if request has any signature headers (signed lane)
 */
function hasSignatureHeaders(headers: Record<string, string | undefined>): boolean {
  return !!(headers['signature-input'] || headers['signature'] || headers['signature-agent']);
}

/**
 * Map verification error to coarse failure reason
 */
function mapErrorToFailureReason(error: string | undefined): string {
  if (!error) return 'unknown';

  const errorLower = error.toLowerCase();

  if (errorLower.includes('missing required signature headers')) {
    return 'missing_headers';
  }
  if (errorLower.includes('invalid signature-agent')) {
    return 'invalid_signature_agent';
  }
  if (errorLower.includes('missing covered header')) {
    return 'missing_signed_component';
  }
  if (errorLower.includes('jwks discovery failed')) {
    return 'jwks_discovery_failed';
  }
  if (errorLower.includes('not from trusted directory')) {
    return 'untrusted_directory';
  }
  if (errorLower.includes('nonce already used') || errorLower.includes('replay')) {
    return 'nonce_reuse';
  }
  if (errorLower.includes('expired') || errorLower.includes('timestamp') || errorLower.includes('clock skew')) {
    return 'expired';
  }
  if (errorLower.includes('failed to fetch') || errorLower.includes('jwks')) {
    return 'jwks_fetch_failed';
  }
  // Default: signature parsing/verification failed
  return 'bad_signature';
}

/**
 * Extract username from JWKS URL pattern /jwks/{username}.json
 */
function extractUsernameFromJwksUrl(jwksUrl: string | null | undefined): string | null {
  if (!jwksUrl) return null;
  const match = jwksUrl.match(/\/jwks\/([^.]+)\.json/);
  return match ? match[1] : null;
}

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'verifier',
    redis: redisClient.isOpen ? 'connected' : 'disconnected',
  });
});

/**
 * Main verification endpoint
 * 
 * Used by NGINX auth_request or as a standalone verification service
 */
app.post('/authorize', async (req, res) => {
  try {
    // Extract request details from headers (for NGINX auth_request)
    const method = req.headers['x-original-method'] as string || req.method;
    const host = req.headers['x-original-host'] as string || req.headers.host || 'localhost';
    const uri = req.headers['x-original-uri'] as string || req.path;
    const protocol = req.headers['x-forwarded-proto'] as string || 'http';
    
    const url = `${protocol}://${host}${uri}`;
    const signatureAgent = req.headers['signature-agent'] as string | undefined;

    // Check if this is a signed request (for Radar telemetry)
    const isSigned = hasSignatureHeaders({
      'signature-input': req.headers['signature-input'] as string,
      'signature': req.headers['signature'] as string,
      'signature-agent': signatureAgent,
    });

    // Build verification request - forward all headers (lowercased)
    const headers: Record<string, string> = {
      'signature-input': req.headers['signature-input'] as string,
      'signature': req.headers['signature'] as string,
      'signature-agent': signatureAgent as string,
    };

    // Forward additional headers that may be signed
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key.toLowerCase()] = value;
      }
    }

    const verificationRequest: VerificationRequest = {
      method: method.toUpperCase(),
      url,
      headers,
      body: req.body ? JSON.stringify(req.body) : undefined,
    };

    // Verify signature
    const result = await verifier.verify(verificationRequest);
    
    // Compute values for telemetry
    const targetOrigin = new URL(url).origin;
    const jwksUrl = result.agent?.jwks_url || signatureAgent || null;
    const username = extractUsernameFromJwksUrl(jwksUrl);

    // Log signed attempt for Radar (both success and failure)
    if (isSigned && app.locals.telemetryLogger) {
      app.locals.telemetryLogger.logSignedAttempt({
        signatureAgent: signatureAgent || null,
        targetOrigin,
        method: method.toUpperCase(),
        verified: result.verified,
        failureReason: result.verified ? null : mapErrorToFailureReason(result.error),
        username,
        jwksUrl,
        clientName: result.agent?.client_name || null,
      }).catch((err: Error) => {
        console.error('Signed attempt logging failed:', err);
      });
    }

    if (!result.verified) {
      res.status(401).json({
        error: result.error || 'Signature verification failed',
      });
      return;
    }

    // Set headers for NGINX to pass downstream (must be before json())
    res.setHeader('X-OBAuth-Verified', 'true');
    res.setHeader('X-OBAuth-Agent', result.agent?.client_name || 'unknown');
    res.setHeader('X-OBAuth-JWKS-URL', result.agent?.jwks_url || '');
    res.setHeader('X-OBAuth-Kid', result.agent?.kid || '');

    // Success - return verification details
    // These can be used by downstream services
    res.status(200).json({
      verified: true,
      agent: result.agent,
      created: result.created,
      expires: result.expires,
    });

    // Log to per-user karma telemetry (verified successes only)
    if (result.verified && result.agent && username && app.locals.telemetryLogger) {
      app.locals.telemetryLogger.logVerification({
        username,
        jwksUrl: result.agent.jwks_url,
        targetOrigin,
        method: method.toUpperCase(),
        verified: true,
      }).catch((err: Error) => {
        console.error('Karma telemetry logging failed:', err);
      });
    }
  } catch (error: any) {
    console.error('Authorization error:', error);
    res.status(500).json({
      error: 'Internal verification error',
      message: error.message,
    });
  }
});

/**
 * Verify endpoint (alternative to /authorize)
 * Accepts full request details in body
 */
app.post('/verify', async (req, res) => {
  try {
    const { method, url, headers, body } = req.body;

    if (!method || !url || !headers) {
      res.status(400).json({
        error: 'Missing required fields: method, url, headers',
      });
      return;
    }

    const signatureAgent = headers['signature-agent'] as string | undefined;

    // Check if this is a signed request (for Radar telemetry)
    const isSigned = hasSignatureHeaders({
      'signature-input': headers['signature-input'],
      'signature': headers['signature'],
      'signature-agent': signatureAgent,
    });

    const verificationRequest: VerificationRequest = {
      method: method.toUpperCase(),
      url,
      headers,
      body,
    };

    const result = await verifier.verify(verificationRequest);

    // Compute values for telemetry
    const targetOrigin = new URL(url).origin;
    const jwksUrl = result.agent?.jwks_url || signatureAgent || null;
    const username = extractUsernameFromJwksUrl(jwksUrl);

    // Log signed attempt for Radar (both success and failure)
    if (isSigned && app.locals.telemetryLogger) {
      app.locals.telemetryLogger.logSignedAttempt({
        signatureAgent: signatureAgent || null,
        targetOrigin,
        method: method.toUpperCase(),
        verified: result.verified,
        failureReason: result.verified ? null : mapErrorToFailureReason(result.error),
        username,
        jwksUrl,
        clientName: result.agent?.client_name || null,
      }).catch((err: Error) => {
        console.error('Signed attempt logging failed:', err);
      });
    }

    // Log to per-user karma telemetry (verified successes only)
    if (result.verified && result.agent && username && app.locals.telemetryLogger) {
      app.locals.telemetryLogger.logVerification({
        username,
        jwksUrl: result.agent.jwks_url,
        targetOrigin,
        method: method.toUpperCase(),
        verified: true,
      }).catch((err: Error) => {
        console.error('Karma telemetry logging failed:', err);
      });
    }

    res.json(result);
  } catch (error: any) {
    console.error('Verification error:', error);
    res.status(500).json({
      error: 'Internal verification error',
      message: error.message,
    });
  }
});

/**
 * Cache management endpoints
 */

// Clear JWKS cache
app.post('/cache/jwks/clear', async (_req, res) => {
  try {
    await jwksCache.clearAll();
    res.json({ success: true, message: 'JWKS cache cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear nonce cache
app.post('/cache/nonces/clear', async (_req, res) => {
  try {
    await nonceManager.clearAll();
    res.json({ success: true, message: 'Nonce cache cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Invalidate specific JWKS
app.post('/cache/jwks/invalidate', async (req, res) => {
  try {
    const { jwks_url } = req.body;
    if (!jwks_url) {
      res.status(400).json({ error: 'Missing jwks_url' });
      return;
    }
    await jwksCache.invalidate(jwks_url);
    res.json({ success: true, message: `Invalidated cache for ${jwks_url}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
app.listen(port, () => {
  console.log(`🔐 OpenBotAuth Verifier Service running on port ${port}`);
  console.log(`   Trusted directories: ${trustedDirectories.length > 0 ? trustedDirectories.join(', ') : 'none (all allowed)'}`);
  console.log(`   Max clock skew: ${maxSkewSec}s`);
  console.log(`   Nonce TTL: ${process.env.OB_NONCE_TTL_SEC || '600'}s`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await redisClient.quit();
  if (dbPool) {
    await dbPool.end();
  }
  process.exit(0);
});
