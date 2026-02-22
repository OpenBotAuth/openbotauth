# OpenBotAuth Bot CLI

Demo bot CLI for signing HTTP requests with RFC 9421 signatures.

## Features

- ✅ **Ed25519 Key Generation** - Generate and store key pairs locally
- ✅ **RFC 9421 Request Signing** - Sign HTTP requests per RFC 9421 spec
- ✅ **Automatic Nonce Generation** - Unique nonce for each request
- ✅ **Timestamp Management** - Created and expires timestamps
- ✅ **402 Payment Flow** - Handles payment required responses
- ✅ **Configuration Storage** - Stores keys in `~/.openbotauth/bot-config.json`

## Installation

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Link for global use (optional)
pnpm link --global
```

## Usage

### 1. Generate Key Pair

First, generate an Ed25519 key pair:

```bash
oba-bot keygen \
  --jwks-url http://localhost:8080/jwks/mybot.json \
  --kid my-key-123
```

This will:
- Generate an Ed25519 key pair
- Save configuration to `~/.openbotauth/bot-config.json`
- Display the public key (register this in your registry)

### 2. Fetch a URL

Fetch a URL with a signed request:

```bash
# Simple GET request
oba-bot fetch https://example.com/api/data

# With verbose output
oba-bot fetch https://example.com/api/data -v

# POST request with body
oba-bot fetch https://example.com/api/create \
  -m POST \
  -d '{"name":"test","value":123}'
```

### 3. View Configuration

Display your current configuration:

```bash
oba-bot config
```

## How It Works

### Request Signing Flow

1. **Load Configuration** - Read private key and JWKS URL from config file
2. **Generate Nonce** - Create unique nonce for replay protection
3. **Build Signature Base** - Construct signature base per RFC 9421:
   ```
   "@method": GET
   "@path": /api/data
   "@authority": example.com
   "@signature-params": ("@method" "@path" "@authority");created=1763282275;expires=1763282575;nonce="abc123";keyid="my-key-123";alg="ed25519"
   ```
4. **Sign** - Sign the base string with Ed25519 private key
5. **Add Headers** - Add signature headers to request:
   - `Signature-Input` - Signature parameters
   - `Signature` - Base64-encoded signature
  - `Signature-Agent` - Structured Dictionary entry pointing to JWKS (legacy URL also accepted)
6. **Send Request** - Execute HTTP request with signature headers

### Signature Headers

Example headers added to each request:

```
Signature-Input: sig1=("@method" "@path" "@authority");created=1763282275;expires=1763282575;nonce="abc123";keyid="my-key-123";alg="ed25519"
Signature: sig1=:K2qGT5srn2OGbOIDzQ6kYT+ruaycnDAAUpKv+ePFfD0=:
Signature-Agent: sig1="http://localhost:8080/jwks/mybot.json"
User-Agent: OpenBotAuth-CLI/0.1.0
```

## 402 Payment Flow

When a server returns `402 Payment Required`:

```bash
$ oba-bot fetch https://example.com/premium/article

Status: 402 Payment Required

Payment Required:
  Price: 10.00 USD
  Pay URL: https://pay.example.com/intent/123
  Request Hash: abc123...

💳 Payment Required!
To complete this request:
  1. Visit: https://pay.example.com/intent/123
  2. Complete payment
  3. Retry with receipt: oba-bot fetch --receipt <receipt> https://example.com/premium/article
```

## Configuration File

Configuration is stored in `~/.openbotauth/bot-config.json`:

```json
{
  "jwks_url": "http://localhost:8080/jwks/mybot.json",
  "kid": "my-key-123",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
  "public_key": "MC4CAQAwBQYDK2VwBCIEIE..."
}
```

⚠️ **Keep this file secure!** It contains your private key.

## Testing with Local Services

### 1. Start Registry Service

```bash
cd packages/registry-service
pnpm dev
```

### 2. Start Verifier Service

```bash
cd packages/verifier-service
pnpm dev
```

### 3. Register Your Bot

Register the public key from `oba-bot keygen` in the registry.

### 4. Test Signed Request

```bash
# Fetch with signature
oba-bot fetch http://localhost:8080/api/test -v
```

The verifier will:
- Verify the signature
- Check the nonce (replay protection)
- Validate timestamps
- Return verification result

## Commands

### `keygen`

Generate Ed25519 key pair and save configuration.

```bash
oba-bot keygen --jwks-url <url> --kid <id>
```

**Options:**
- `--jwks-url <url>` - JWKS URL for this bot (required)
- `--kid <id>` - Key ID (kid) for this bot (required)

### `fetch`

Fetch a URL with signed HTTP request.

```bash
oba-bot fetch <url> [options]
```

**Arguments:**
- `<url>` - URL to fetch

**Options:**
- `-m, --method <method>` - HTTP method (default: GET)
- `-d, --body <data>` - Request body (JSON)
- `-v, --verbose` - Verbose output
- `--signature-agent-format <format>` - Signature-Agent format (`legacy` or `dict`)

### `config`

Display current bot configuration.

```bash
oba-bot config
```

## Development

```bash
# Run in development mode
pnpm dev keygen --jwks-url http://localhost:8080/jwks/test.json --kid test-123

# Build
pnpm build

# Run built version
pnpm start config
```

## Security Notes

1. **Private Key Storage** - Private keys are stored in `~/.openbotauth/bot-config.json`
2. **Never Share Private Keys** - Keep your private key secure
3. **Nonce Uniqueness** - Each request uses a unique nonce
4. **Timestamp Validation** - Signatures expire after 5 minutes
5. **HTTPS Recommended** - Use HTTPS in production

## Examples

### Basic GET Request

```bash
oba-bot fetch https://api.example.com/data
```

### POST with JSON Body

```bash
oba-bot fetch https://api.example.com/create \
  -m POST \
  -d '{"title":"Hello","content":"World"}'
```

### Verbose Mode

```bash
oba-bot fetch https://api.example.com/data -v
```

Output:
```
🤖 Fetching https://api.example.com/data with signed request...

Configuration:
  JWKS URL: http://localhost:8080/jwks/mybot.json
  Key ID: my-key-123

Signature Headers:
  Signature-Input: sig1=("@method" "@path" "@authority");created=1763282275;...
  Signature: sig1=:K2qGT5srn2OGbOIDzQ6kYT+ruaycnDAAUpKv+ePFfD0=:
  Signature-Agent: sig1="http://localhost:8080/jwks/mybot.json"

📡 Sending request...

Status: 200 OK

Headers:
  content-type: application/json
  x-obauth-verified: true
  x-obauth-agent: mybot

Body:
{"message":"Success","data":[...]}
```

## Troubleshooting

### "No configuration found"

Run `oba-bot keygen` first to generate a key pair.

### "Signature verification failed"

- Check that your public key is registered in the registry
- Verify the JWKS URL is correct
- Ensure the verifier service is running

### "Nonce already used"

Each request must use a unique nonce. This error indicates a replay attack was detected.

### "Signature has expired"

Signatures expire after 5 minutes. Generate a new request.

## License

MIT
