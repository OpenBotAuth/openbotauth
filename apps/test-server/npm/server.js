/**
 * npm Package Test Server (Express.js)
 *
 * Test server for @openbotauth/verifier-client npm package.
 * Uses Express.js with the openBotAuthMiddleware for signature verification.
 *
 * This server is part of the unified test-server that supports both:
 * - npm package testing (this file) - port 3000
 * - Python package testing (python/server.py) - port 3001
 */

import express from 'express';
import { openBotAuthMiddleware } from '@openbotauth/verifier-client/express';

const app = express();
app.use(express.json());

// Verifier URL can be configured via environment variable
// Default to local verifier for development, override with VERIFIER_URL for hosted
const verifierUrl = process.env.VERIFIER_URL || 'http://localhost:8081/verify';

// Add OpenBotAuth middleware in observe mode (verifies but doesn't block)
app.use(openBotAuthMiddleware({
  verifierUrl,
  mode: 'observe',
}));

// Middleware to require verified signature for protected routes
function requireVerified(req, res, next) {
  const oba = req.oba;
  
  console.log('\n🔍 Checking signature...');
  console.log('Signed:', oba.signed);
  
  if (!oba.signed) {
    console.log('❌ No signature found');
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Signature required'
    });
  }
  
  if (!oba.result?.verified) {
    console.log('❌ Signature verification failed:', oba.result?.error);
    return res.status(401).json({ 
      error: oba.result?.error || 'Unauthorized',
      message: 'Signature verification failed'
    });
  }
  
  console.log('✅ Signature verified!');
  console.log('Agent:', oba.result.agent);
  
  next();
}

// Protected endpoint - requires signature
app.get('/protected', requireVerified, (req, res) => {
  console.log('✅ Access granted to protected resource');
  res.json({
    message: '🎉 Access granted! Your signature is valid.',
    agent: req.oba.result.agent,
    timestamp: new Date().toISOString(),
    resource: 'protected-data',
  });
});

// Protected API endpoint
app.get('/api/secret', requireVerified, (req, res) => {
  res.json({
    message: 'Secret data',
    agent: req.oba.result.agent,
    data: {
      secret: 'This is protected information',
      value: 42,
    },
  });
});

// Public endpoint - no signature required
app.get('/public', (req, res) => {
  console.log('📖 Public access');
  res.json({ 
    message: 'Public access - no signature required',
    info: 'Anyone can access this endpoint'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'test-server-npm' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('📦 npm Package Test Server (@openbotauth/verifier-client)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   Verifier: ${verifierUrl}`);
  console.log('');
  console.log('Endpoints:');
  console.log('   GET /public      - No signature required');
  console.log('   GET /protected   - Signature required ✓');
  console.log('   GET /api/secret  - Signature required ✓');
  console.log('   GET /health      - Health check');
  console.log('');
  console.log('Test with bot CLI:');
  console.log('   cd packages/bot-cli');
  console.log(`   pnpm dev fetch http://localhost:${PORT}/protected -v`);
  console.log('');
  console.log('To use hosted verifier:');
  console.log('   VERIFIER_URL=https://verifier.openbotauth.org/verify pnpm start:npm');
  console.log('');
});
