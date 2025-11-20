/**
 * OpenBotAuth Verifier Service
 * 
 * RFC 9421 HTTP Message Signatures verification service
 */

import 'dotenv/config';
import express from 'express';
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

const verifier = new SignatureVerifier(
  jwksCache,
  nonceManager,
  trustedDirectories,
  maxSkewSec
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

    // Build verification request
    const verificationRequest: VerificationRequest = {
      method: method.toUpperCase(),
      url,
      headers: {
        'signature-input': req.headers['signature-input'] as string,
        'signature': req.headers['signature'] as string,
        'signature-agent': req.headers['signature-agent'] as string,
        'content-type': req.headers['content-type'] as string,
      },
      body: req.body ? JSON.stringify(req.body) : undefined,
    };

    // Verify signature
    const result = await verifier.verify(verificationRequest);

    if (!result.verified) {
      res.status(401).json({
        error: result.error || 'Signature verification failed',
      });
      return;
    }

    // Success - return verification details
    // These can be used by downstream services
    res.status(200).json({
      verified: true,
      agent: result.agent,
      created: result.created,
      expires: result.expires,
    });

    // Also set headers for NGINX to pass downstream
    res.setHeader('X-OBAuth-Verified', 'true');
    res.setHeader('X-OBAuth-Agent', result.agent?.client_name || 'unknown');
    res.setHeader('X-OBAuth-JWKS-URL', result.agent?.jwks_url || '');
    res.setHeader('X-OBAuth-Kid', result.agent?.kid || '');

    // Log telemetry (non-blocking)
    if (result.verified && result.agent && app.locals.telemetryLogger) {
      const jwksUrl = result.agent.jwks_url;
      const usernameMatch = jwksUrl.match(/\/jwks\/([^.]+)\.json/);
      
      if (usernameMatch) {
        const username = usernameMatch[1];
        const targetOrigin = new URL(url).origin;
        
        // Log to telemetry system (fire and forget)
        app.locals.telemetryLogger.logVerification({
          username,
          jwksUrl,
          targetOrigin,
          method: method.toUpperCase(),
          verified: true,
        }).catch((err: Error) => {
          console.error('Telemetry logging failed:', err);
        });
      }
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

    const verificationRequest: VerificationRequest = {
      method: method.toUpperCase(),
      url,
      headers,
      body,
    };

    const result = await verifier.verify(verificationRequest);

    // Log telemetry (non-blocking) - same as /authorize
    if (result.verified && result.agent && app.locals.telemetryLogger) {
      const jwksUrl = result.agent.jwks_url;
      const usernameMatch = jwksUrl.match(/\/jwks\/([^.]+)\.json/);
      
      if (usernameMatch) {
        const username = usernameMatch[1];
        const targetOrigin = new URL(url).origin;
        
        // Log to telemetry system (fire and forget)
        app.locals.telemetryLogger.logVerification({
          username,
          jwksUrl,
          targetOrigin,
          method: method.toUpperCase(),
          verified: true,
        }).catch((err: Error) => {
          console.error('Telemetry logging failed:', err);
        });
      }
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

