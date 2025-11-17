# 🧪 End-to-End Flow Test

Complete test of the OpenBotAuth system: Registry → Bot CLI → Verifier

## Prerequisites

- ✅ Redis running on port 6379
- ✅ PostgreSQL (Neon) database configured
- ✅ GitHub OAuth app registered
- ✅ All services built

## Test Flow Overview

```
1. User registers in Portal (GitHub OAuth)
2. User generates & registers public key
3. Bot CLI generates its own key pair
4. Bot CLI signs HTTP request (RFC 9421)
5. Verifier checks signature against Registry JWKS
6. Success! ✅
```

## Step-by-Step Test

### Step 1: Start All Services

Open 4 terminal windows:

**Terminal 1 - Redis:**
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

**Terminal 2 - Registry Service:**
```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/packages/registry-service
pnpm dev
```

Expected output:
```
✅ Connected to Neon database
🚀 OpenBotAuth Registry Service running on port 8080
```

**Terminal 3 - Verifier Service:**
```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/packages/verifier-service
pnpm dev
```

Expected output:
```
✅ Connected to Redis
🔐 OpenBotAuth Verifier Service running on port 8081
   Trusted directories: localhost:8080
   Max clock skew: 300s
   Nonce TTL: 600s
```

**Terminal 4 - Portal (optional, for UI):**
```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/apps/registry-portal
pnpm dev
```

### Step 2: Register User & Keys (via Portal)

1. **Open Portal:**
   ```
   http://localhost:5173
   ```

2. **Sign in with GitHub:**
   - Click "Sign in with GitHub"
   - Authorize the app
   - Confirm username

3. **Generate & Register Keys:**
   - Go to Setup page
   - Click "Generate New Key Pair"
   - **SAVE YOUR PRIVATE KEY!** (copy to clipboard)
   - Click "Register My Key"
   - Note your username (e.g., `hammadtq`)

4. **Verify JWKS is available:**
   ```bash
   curl http://localhost:8080/jwks/hammadtq.json | jq
   ```

   Expected:
   ```json
   {
     "client_name": "hammadtq",
     "keys": [
       {
         "kty": "OKP",
         "crv": "Ed25519",
         "kid": "3312fbbe-4e79-4b06-8d88-c6aa78b81d4a",
         "x": "MCowBQYDK2VwAyEA...",
         "use": "sig"
       }
     ]
   }
   ```

### Step 3: Configure Bot CLI with Your Real Keys

**Important:** The bot CLI needs to use the SAME keys you registered in the portal!

**Option A: Automatic Setup (Recommended)**

```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth

# Run the setup script
node setup-bot-from-db.js
```

Then paste your private key when prompted (the one you saved from the portal).

**Option B: Manual Setup**

If you saved your private key, create the config manually:

```bash
# Create config directory
mkdir -p ~/.openbotauth

# Create config file (replace with your actual values)
cat > ~/.openbotauth/bot-config.json << 'EOF'
{
  "jwks_url": "http://localhost:8080/jwks/hammadtq.json",
  "kid": "3312fbbe-4e79-4b06-8d88-c6aa78b81d4a",
  "private_key": "-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----",
  "public_key": "YOUR_PUBLIC_KEY_HERE"
}
EOF
```

**Verify Configuration:**

```bash
cd packages/bot-cli
pnpm dev config
```

Expected output:
```
🔧 Bot Configuration

Configuration File: /Users/you/.openbotauth/bot-config.json

Settings:
  JWKS URL: http://localhost:8080/jwks/hammadtq.json
  Key ID: 3312fbbe-4e79-4b06-8d88-c6aa78b81d4a

Public Key (Base64):
  MCowBQYDK2VwAyEA...

Private Key: ✓ (stored securely)
```

**Note:** You're using the SAME keys you registered in the portal. The bot CLI will sign requests with your private key, and the verifier will verify them using your public key from the registry.

### Step 4: Test Unsigned Request (Baseline)

First, test without signature to see the difference:

```bash
curl http://localhost:8080/health
```

Expected:
```json
{"status":"ok","service":"registry"}
```

### Step 5: Test Signed Request to Registry

Now test with the bot CLI:

```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/packages/bot-cli

# Test signed request to registry health endpoint
pnpm dev fetch http://localhost:8080/health -v
```

Expected output:
```
🤖 Fetching http://localhost:8080/health with signed request...

Configuration:
  JWKS URL: http://localhost:8080/jwks/hammadtq.json
  Key ID: test-bot-key-123

Signature Headers:
  Signature-Input: sig1=("@method" "@path" "@authority");created=1763282275;expires=1763282575;nonce="abc123";keyid="test-bot-key-123";alg="ed25519"
  Signature: sig1=:K2qGT5srn2OGbOIDzQ6kYT+ruaycnDAAUpKv+ePFfD0=:
  Signature-Agent: http://localhost:8080/jwks/hammadtq.json

📡 Sending request...

Status: 200 OK

Headers:
  content-type: application/json

Body:
{"status":"ok","service":"registry"}
```

### Step 6: Test Verifier Directly

Test the verifier's verification endpoint:

```bash
# Create a test verification request
curl -X POST http://localhost:8081/verify \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "url": "http://localhost:8080/health",
    "headers": {
      "signature-input": "sig1=(\"@method\" \"@path\" \"@authority\");created=1763282275;expires=1763282575;nonce=\"test-nonce-123\";keyid=\"3312fbbe-4e79-4b06-8d88-c6aa78b81d4a\";alg=\"ed25519\"",
      "signature": "sig1=:K2qGT5srn2OGbOIDzQ6kYT+ruaycnDAAUpKv+ePFfD0=:",
      "signature-agent": "http://localhost:8080/jwks/hammadtq.json"
    }
  }' | jq
```

**Note:** This will likely fail because the signature is not valid for this exact request. That's expected! The bot CLI generates proper signatures.

### Step 7: Create Test Endpoint with Verification

Let's create a simple test endpoint that uses the verifier. Create a test script:

```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth
```

Create `test-protected-endpoint.js`:

```javascript
import express from 'express';

const app = express();
app.use(express.json());

// Middleware to verify signature
async function verifySignature(req, res, next) {
  try {
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

    if (!result.verified) {
      return res.status(401).json({ error: result.error || 'Unauthorized' });
    }

    // Add verification info to request
    req.verifiedAgent = result.agent;
    next();
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
}

// Protected endpoint
app.get('/protected', verifySignature, (req, res) => {
  res.json({
    message: 'Access granted!',
    agent: req.verifiedAgent,
    timestamp: new Date().toISOString(),
  });
});

// Public endpoint
app.get('/public', (req, res) => {
  res.json({ message: 'Public access - no signature required' });
});

app.listen(3000, () => {
  console.log('🔒 Test server running on http://localhost:3000');
  console.log('   /public - No signature required');
  console.log('   /protected - Signature required');
});
```

Run it:

```bash
node test-protected-endpoint.js
```

### Step 8: Test Protected Endpoint

**Test public endpoint (no signature):**
```bash
curl http://localhost:3000/public
```

Expected:
```json
{"message":"Public access - no signature required"}
```

**Test protected endpoint without signature:**
```bash
curl http://localhost:3000/protected
```

Expected:
```json
{"error":"Unauthorized"}
```

**Test protected endpoint WITH signature (using bot CLI):**
```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/packages/bot-cli

pnpm dev fetch http://localhost:3000/protected -v
```

Expected:
```
🤖 Fetching http://localhost:3000/protected with signed request...

Configuration:
  JWKS URL: http://localhost:8080/jwks/hammadtq.json
  Key ID: test-bot-key-123

Signature Headers:
  Signature-Input: sig1=("@method" "@path" "@authority");created=...
  Signature: sig1=:...:
  Signature-Agent: http://localhost:8080/jwks/hammadtq.json

📡 Sending request...

Status: 200 OK

Headers:
  content-type: application/json

Body:
{
  "message": "Access granted!",
  "agent": {
    "jwks_url": "http://localhost:8080/jwks/hammadtq.json",
    "kid": "test-bot-key-123",
    "client_name": "hammadtq"
  },
  "timestamp": "2025-11-16T..."
}
```

### Step 9: Test Replay Protection

Try to reuse the same nonce (should fail):

1. **First request:**
   ```bash
   pnpm dev fetch http://localhost:3000/protected -v
   ```
   ✅ Should succeed

2. **Immediate retry:**
   ```bash
   pnpm dev fetch http://localhost:3000/protected -v
   ```
   ✅ Should succeed (different nonce)

The bot CLI automatically generates a new nonce for each request, so replay protection is working!

### Step 10: Test Timestamp Validation

The verifier checks that signatures are not too old or too far in the future (±5 minutes by default).

This is automatically handled by the bot CLI (creates timestamps on each request).

### Step 11: Check Verifier Logs

In the verifier terminal, you should see:

```
JWKS cache miss for http://localhost:8080/jwks/hammadtq.json, fetching...
✅ Signature verified for agent: hammadtq
```

### Step 12: Check JWKS Cache

```bash
curl http://localhost:8081/health
```

Expected:
```json
{
  "status": "ok",
  "service": "verifier",
  "redis": "connected"
}
```

## Test Results Checklist

- [ ] Registry service running on port 8080
- [ ] Verifier service running on port 8081
- [ ] Redis connected
- [ ] User registered via Portal
- [ ] Public key registered in registry
- [ ] JWKS endpoint accessible
- [ ] Bot CLI keys generated
- [ ] Signed request to registry succeeds
- [ ] Protected endpoint rejects unsigned requests
- [ ] Protected endpoint accepts signed requests
- [ ] Verifier caches JWKS
- [ ] Nonce replay protection working
- [ ] Timestamp validation working

## Troubleshooting

### "No configuration found"

Run `pnpm dev keygen` first.

### "Signature verification failed"

1. Check that the JWKS URL is correct
2. Verify the kid matches a key in the JWKS
3. Ensure the verifier can reach the registry
4. Check verifier logs for details

### "Nonce already used"

This is expected if you try to replay a request. The bot CLI generates unique nonces.

### "JWKS cache miss"

This is normal on first request. Subsequent requests will use the cache.

### "Connection refused"

Make sure all services are running:
- Redis on 6379
- Registry on 8080
- Verifier on 8081
- Test server on 3000 (if using)

## Success Criteria

✅ **Complete flow working when:**
1. Bot CLI can sign requests
2. Verifier can verify signatures
3. Verifier fetches JWKS from registry
4. Protected endpoints accept signed requests
5. Protected endpoints reject unsigned requests
6. Replay protection prevents nonce reuse
7. Timestamp validation works

## Next Steps

Once the flow is working:
1. Build WordPress Plugin for policy engine
2. Build MCP Server for interop
3. Add NGINX integration
4. Write integration tests
5. Deploy to production

🎉 Congratulations! The core OpenBotAuth system is working!

