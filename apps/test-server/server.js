/**
 * Test Protected Endpoint
 * 
 * Simple Express server with a protected endpoint that requires signature verification
 */

import express from 'express';

const app = express();
app.use(express.json());

// Middleware to verify signature via verifier service
async function verifySignature(req, res, next) {
  try {
    console.log('\n🔍 Verifying signature...');
    console.log('Headers:', {
      'signature-input': req.headers['signature-input'],
      'signature': req.headers['signature'],
      'signature-agent': req.headers['signature-agent'],
    });

    // Forward to verifier
    const verifyResponse = await fetch('http://localhost:8081/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: req.method,
        url: `http://localhost:3000${req.path}`,
        headers: {
          'signature-input': req.headers['signature-input'],
          'signature': req.headers['signature'],
          'signature-agent': req.headers['signature-agent'],
        },
      }),
    });

    const result = await verifyResponse.json();
    console.log('Verification result:', result);

    if (!result.verified) {
      console.log('❌ Signature verification failed:', result.error);
      return res.status(401).json({ 
        error: result.error || 'Unauthorized',
        message: 'Signature verification failed'
      });
    }

    console.log('✅ Signature verified!');
    console.log('Agent:', result.agent);

    // Add verification info to request
    req.verifiedAgent = result.agent;
    next();
  } catch (error) {
    console.error('❌ Verification error:', error.message);
    res.status(500).json({ 
      error: 'Verification failed',
      message: error.message 
    });
  }
}

// Protected endpoint - requires signature
app.get('/protected', verifySignature, (req, res) => {
  console.log('✅ Access granted to protected resource');
  res.json({
    message: '🎉 Access granted! Your signature is valid.',
    agent: req.verifiedAgent,
    timestamp: new Date().toISOString(),
    resource: 'protected-data',
  });
});

// Protected API endpoint
app.get('/api/secret', verifySignature, (req, res) => {
  res.json({
    message: 'Secret data',
    agent: req.verifiedAgent,
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

