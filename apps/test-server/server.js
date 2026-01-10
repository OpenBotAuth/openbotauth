/**
 * Test Protected Endpoint
 * 
 * Simple Express server with a protected endpoint that requires signature verification
 * Now using @openbotauth/verifier-client middleware
 */

import express from 'express';
import { openBotAuthMiddleware } from '@openbotauth/verifier-client';

const app = express();
app.use(express.json());

// Add OpenBotAuth middleware in observe mode (verifies but doesn't block)
// Using hosted verifier since local Redis is not available
app.use(openBotAuthMiddleware({
  verifierUrl: 'https://verifier.openbotauth.org/verify',
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
  res.json({ status: 'ok', service: 'test-server' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log('🔒 Test Protected Endpoint Server');
  console.log(`   Running on http://localhost:${PORT}`);
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
});

