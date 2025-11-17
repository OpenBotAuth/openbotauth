# ✅ Bot CLI Complete!

The OpenBotAuth Bot CLI has been successfully implemented!

## 🤖 What Was Built

### Core Components

1. **Request Signer** (`request-signer.ts`)
   - RFC 9421 signature generation
   - Ed25519 signing using Web Crypto API
   - Automatic nonce generation
   - Timestamp management (created, expires)
   - Signature base string construction

2. **HTTP Client** (`http-client.ts`)
   - Signed request execution
   - 402 Payment Required handling
   - Payment info extraction from Link headers
   - Response formatting

3. **Key Storage** (`key-storage.ts`)
   - Local configuration storage (`~/.openbotauth/bot-config.json`)
   - Secure private key storage
   - Configuration management

4. **CLI Commands**
   - `keygen` - Generate Ed25519 key pairs
   - `fetch` - Fetch URLs with signed requests
   - `config` - Display configuration

## 🚀 How to Use

### 1. Generate a Key Pair

```bash
cd packages/bot-cli

# Generate keys
pnpm dev keygen \
  --jwks-url http://localhost:8080/jwks/mybot.json \
  --kid my-key-123
```

This creates `~/.openbotauth/bot-config.json` with your keys.

### 2. Register Public Key

The `keygen` command outputs your public key. Register it in the registry:

1. Go to http://localhost:5173/setup
2. Paste the public key
3. Click "Register My Key"

### 3. Test Signed Request

```bash
# Simple fetch
pnpm dev fetch http://localhost:8080/health

# Verbose mode
pnpm dev fetch http://localhost:8080/health -v

# POST with body
pnpm dev fetch http://localhost:8080/api/test \
  -m POST \
  -d '{"test":"data"}'
```

## 🔐 How Signing Works

### Signature Flow

1. **Load Config** - Read private key from `~/.openbotauth/bot-config.json`
2. **Generate Nonce** - Create unique random nonce (16 bytes, base64url)
3. **Build Signature Base**:
   ```
   "@method": GET
   "@path": /api/data
   "@authority": example.com
   "@signature-params": ("@method" "@path" "@authority");created=1763282275;expires=1763282575;nonce="abc123";keyid="my-key-123";alg="ed25519"
   ```
4. **Sign** - Sign base string with Ed25519 private key
5. **Add Headers**:
   - `Signature-Input: sig1=("@method" "@path" "@authority");created=...`
   - `Signature: sig1=:K2qGT5srn2OGbOIDzQ6kYT+ruaycnDAAUpKv+ePFfD0=:`
   - `Signature-Agent: http://localhost:8080/jwks/mybot.json`
6. **Send Request**

### Example Headers

```http
GET /api/data HTTP/1.1
Host: example.com
Signature-Input: sig1=("@method" "@path" "@authority");created=1763282275;expires=1763282575;nonce="abc123";keyid="my-key-123";alg="ed25519"
Signature: sig1=:K2qGT5srn2OGbOIDzQ6kYT+ruaycnDAAUpKv+ePFfD0=:
Signature-Agent: http://localhost:8080/jwks/mybot.json
User-Agent: OpenBotAuth-CLI/0.1.0
```

## 🧪 End-to-End Testing

Now you can test the complete flow!

### Setup

1. **Start Redis**:
   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

2. **Start Registry Service** (Terminal 1):
   ```bash
   cd packages/registry-service
   pnpm dev
   ```

3. **Start Verifier Service** (Terminal 2):
   ```bash
   cd packages/verifier-service
   pnpm dev
   ```

4. **Start Portal** (Terminal 3):
   ```bash
   cd apps/registry-portal
   pnpm dev
   ```

### Test Flow

1. **Register User & Keys**:
   - Go to http://localhost:5173
   - Sign in with GitHub
   - Generate and register keys

2. **Generate Bot Keys**:
   ```bash
   cd packages/bot-cli
   pnpm dev keygen \
     --jwks-url http://localhost:8080/jwks/hammadtq.json \
     --kid test-key-123
   ```

3. **Make Signed Request**:
   ```bash
   pnpm dev fetch http://localhost:8080/health -v
   ```

4. **Verify Signature** (in another terminal):
   ```bash
   # The verifier will automatically verify the signature
   # Check verifier logs for verification details
   ```

## 📋 CLI Commands

### `keygen`

Generate Ed25519 key pair and save configuration.

```bash
oba-bot keygen --jwks-url <url> --kid <id>
```

**Example:**
```bash
pnpm dev keygen \
  --jwks-url http://localhost:8080/jwks/mybot.json \
  --kid my-key-123
```

**Output:**
```
🔑 Generating Ed25519 key pair...

✅ Key pair generated successfully!

Configuration:
  JWKS URL: http://localhost:8080/jwks/mybot.json
  Key ID: my-key-123
  Config file: /Users/you/.openbotauth/bot-config.json

Public Key (Base64):
MCowBQYDK2VwAyEAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

⚠️  IMPORTANT:
  1. Register this public key in your OpenBotAuth registry
  2. Keep your private key secure (stored in config file)
  3. Never share your private key with anyone
```

### `fetch`

Fetch a URL with signed HTTP request.

```bash
oba-bot fetch <url> [options]
```

**Options:**
- `-m, --method <method>` - HTTP method (default: GET)
- `-d, --body <data>` - Request body (JSON)
- `-v, --verbose` - Verbose output

**Examples:**
```bash
# Simple GET
pnpm dev fetch http://localhost:8080/health

# With verbose output
pnpm dev fetch http://localhost:8080/health -v

# POST with JSON body
pnpm dev fetch http://localhost:8080/api/create \
  -m POST \
  -d '{"name":"test","value":123}'
```

**Verbose Output:**
```
🤖 Fetching http://localhost:8080/health with signed request...

Configuration:
  JWKS URL: http://localhost:8080/jwks/mybot.json
  Key ID: my-key-123

Signature Headers:
  Signature-Input: sig1=("@method" "@path" "@authority");created=1763282275;expires=1763282575;nonce="abc123";keyid="my-key-123";alg="ed25519"
  Signature: sig1=:K2qGT5srn2OGbOIDzQ6kYT+ruaycnDAAUpKv+ePFfD0=:
  Signature-Agent: http://localhost:8080/jwks/mybot.json

📡 Sending request...

Status: 200 OK

Headers:
  content-type: application/json
  x-obauth-verified: true

Body:
{"status":"ok","service":"registry"}
```

### `config`

Display current bot configuration.

```bash
oba-bot config
```

**Output:**
```
🔧 Bot Configuration

Configuration File: /Users/you/.openbotauth/bot-config.json

Settings:
  JWKS URL: http://localhost:8080/jwks/mybot.json
  Key ID: my-key-123

Public Key (Base64):
  MCowBQYDK2VwAyEAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

Private Key: ✓ (stored securely)
```

## 💳 402 Payment Flow

When a server returns `402 Payment Required`:

```bash
$ pnpm dev fetch https://example.com/premium/article

🤖 Fetching https://example.com/premium/article with signed request...

📡 Sending request...

Status: 402 Payment Required

Headers:
  content-type: application/json
  link: <https://pay.example.com/intent/123>; rel="payment"

Payment Required:
  Price: 10.00 USD
  Pay URL: https://pay.example.com/intent/123
  Request Hash: abc123...

Body:
{"error":"Payment required","price_cents":1000,"currency":"USD"}

💳 Payment Required!
To complete this request:
  1. Visit: https://pay.example.com/intent/123
  2. Complete payment
  3. Retry with receipt: oba-bot fetch --receipt <receipt> https://example.com/premium/article
```

## 📁 File Structure

```
packages/bot-cli/
├── src/
│   ├── cli.ts                    # Main CLI entry point
│   ├── types.ts                  # TypeScript types
│   ├── key-storage.ts            # Configuration storage
│   ├── request-signer.ts         # RFC 9421 signing
│   ├── http-client.ts            # HTTP client
│   └── commands/
│       ├── keygen.ts             # Key generation command
│       ├── fetch.ts              # Fetch command
│       └── config.ts             # Config command
├── package.json
├── tsconfig.json
└── README.md
```

## 🎯 What's Working

✅ Ed25519 key pair generation
✅ RFC 9421 request signing
✅ Automatic nonce generation
✅ Timestamp management
✅ Signature base construction
✅ HTTP client with signed requests
✅ 402 payment flow detection
✅ Configuration storage
✅ CLI commands (keygen, fetch, config)
✅ Verbose mode
✅ Documentation

## 🔒 Security Features

1. **Private Key Storage** - Keys stored locally in `~/.openbotauth/`
2. **Unique Nonces** - Each request gets a unique nonce
3. **Timestamp Expiry** - Signatures expire after 5 minutes
4. **Ed25519 Signatures** - Modern, secure cryptography
5. **No Key Transmission** - Private keys never leave your machine

## 🧪 Testing the Complete System

### Test 1: Health Check (No Verification)

```bash
pnpm dev fetch http://localhost:8080/health
```

Expected: 200 OK (no signature verification needed)

### Test 2: Signed Request to Verifier

Create a test endpoint that requires verification, then:

```bash
pnpm dev fetch http://localhost:8081/verify \
  -m POST \
  -d '{"method":"GET","url":"http://example.com/test","headers":{}}'
```

### Test 3: End-to-End with NGINX

Once NGINX is configured with auth_request:

```bash
pnpm dev fetch http://localhost/protected/resource -v
```

Expected: Verifier checks signature, NGINX allows/denies request

## 📚 Next Steps

Now that we have Registry, Verifier, and Bot CLI, we can:

1. **WordPress Plugin** - Policy engine and 402 payment flow
2. **MCP Server** - Interop tools for agents
3. **A2A Card** - Agent discovery and capabilities
4. **Integration Tests** - End-to-end testing
5. **NGINX Configuration** - Production deployment

## 🎉 Success!

The Bot CLI is complete and can:
- Generate Ed25519 key pairs
- Sign HTTP requests per RFC 9421
- Handle 402 payment flows
- Store configuration securely
- Provide verbose debugging output

Ready to test the complete flow! 🚀

### Quick Start

```bash
# 1. Generate keys
cd packages/bot-cli
pnpm dev keygen --jwks-url http://localhost:8080/jwks/test.json --kid test-123

# 2. Test signed request
pnpm dev fetch http://localhost:8080/health -v

# 3. View config
pnpm dev config
```

Enjoy! 🤖

