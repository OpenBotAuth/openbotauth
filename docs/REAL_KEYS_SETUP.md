# 🔑 Using Real Keys for Testing

## The Problem

When you generated keys in the portal, you got:
- ✅ Public key (registered in database)
- ✅ Private key (you copied it)

The bot CLI needs BOTH keys to work properly!

## The Solution

Configure the bot CLI to use the SAME keys you registered in the portal.

## 📋 Step-by-Step

### 1. Find Your Private Key

When you clicked "Generate New Key Pair" in the portal, you saw:

```
Private Key (PEM):
-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIE...
-----END PRIVATE KEY-----

⚠️ IMPORTANT: Copy this key now! It won't be shown again.
```

**Did you save it?**
- ✅ Yes → Go to step 2
- ❌ No → You need to generate new keys in the portal

### 2. Configure Bot CLI

**Option A: Automatic (Recommended)**

```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth

# Run setup script
node setup-bot-from-db.js
```

When prompted, paste your private key:
```
Please paste your PRIVATE KEY (from when you generated keys in the portal):
-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIE...
-----END PRIVATE KEY-----
```

Press `Ctrl+D` when done.

**Option B: Manual**

Create `~/.openbotauth/bot-config.json`:

```json
{
  "jwks_url": "http://localhost:8080/jwks/hammadtq.json",
  "kid": "3312fbbe-4e79-4b06-8d88-c6aa78b81d4a",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIE...\n-----END PRIVATE KEY-----",
  "public_key": "MCowBQYDK2VwAyEA..."
}
```

**Get your actual values:**

```bash
# Get your kid
curl http://localhost:8080/jwks/hammadtq.json | jq -r '.keys[0].kid'

# Get your public key
curl http://localhost:8080/jwks/hammadtq.json | jq -r '.keys[0].x'
```

### 3. Verify Configuration

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

### 4. Test It!

```bash
# Make sure services are running:
# Terminal 1: cd packages/registry-service && pnpm dev
# Terminal 2: cd packages/verifier-service && pnpm dev
# Terminal 3: node test-protected-endpoint.js

# Test signed request
cd packages/bot-cli
pnpm dev fetch http://localhost:3000/protected -v
```

Expected result:
```
Status: 200 OK

Body:
{
  "message": "🎉 Access granted! Your signature is valid.",
  "agent": {
    "jwks_url": "http://localhost:8080/jwks/hammadtq.json",
    "kid": "3312fbbe-4e79-4b06-8d88-c6aa78b81d4a",
    "client_name": "hammadtq"
  }
}
```

## 🔍 How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│ Portal (You)                                                     │
│                                                                   │
│ 1. Generate Keys                                                 │
│    ├─ Private Key (you save)                                     │
│    └─ Public Key (registered in DB)                              │
│                                                                   │
│ 2. Public key available at:                                      │
│    http://localhost:8080/jwks/hammadtq.json                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Bot CLI (Your Bot)                                               │
│                                                                   │
│ 1. Load private key from ~/.openbotauth/bot-config.json         │
│ 2. Sign request with private key                                │
│ 3. Add header: Signature-Agent: .../jwks/hammadtq.json         │
│ 4. Send request                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Verifier Service                                                 │
│                                                                   │
│ 1. Receive signed request                                        │
│ 2. Extract JWKS URL from Signature-Agent header                 │
│ 3. Fetch public key from: .../jwks/hammadtq.json               │
│ 4. Verify signature using public key                            │
│ 5. ✅ Valid! (because bot signed with matching private key)     │
└─────────────────────────────────────────────────────────────────┘
```

**Key Point:** The bot signs with YOUR private key, and the verifier checks with YOUR public key from the registry. They match! ✅

## 🚨 Troubleshooting

### "Signature verification failed"

**Check:**
1. Did you paste the correct private key?
2. Is the kid correct?
3. Is the JWKS URL correct?

**Debug:**
```bash
# Check your JWKS is accessible
curl http://localhost:8080/jwks/hammadtq.json | jq

# Check bot config
cat ~/.openbotauth/bot-config.json | jq

# Compare kid values
echo "JWKS kid:"
curl -s http://localhost:8080/jwks/hammadtq.json | jq -r '.keys[0].kid'
echo "Bot config kid:"
cat ~/.openbotauth/bot-config.json | jq -r '.kid'
```

### "No configuration found"

Run the setup script:
```bash
node setup-bot-from-db.js
```

### "Private key you saved when you generated keys"

If you didn't save your private key:
1. Go to http://localhost:5173/setup
2. Click "Generate New Key Pair"
3. **SAVE THE PRIVATE KEY THIS TIME!**
4. Click "Register My Key"
5. Run setup script again

## 📝 Summary

**What you need:**
- ✅ Private key (from portal, saved by you)
- ✅ Public key (in database, fetched automatically)
- ✅ Kid (in database, fetched automatically)
- ✅ JWKS URL (constructed automatically)

**What the setup script does:**
1. Connects to database
2. Finds your user and public key
3. Asks you for private key
4. Creates bot config file
5. Done!

**What the bot CLI does:**
1. Loads config from ~/.openbotauth/bot-config.json
2. Signs requests with private key
3. Adds Signature-Agent header with JWKS URL
4. Sends request

**What the verifier does:**
1. Extracts JWKS URL from header
2. Fetches public key from that URL
3. Verifies signature
4. Returns ✅ or ❌

🎉 **Now you're using real keys!**

