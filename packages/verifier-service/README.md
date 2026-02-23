# OpenBotAuth Verifier Service

RFC 9421 HTTP Message Signatures verification service for OpenBotAuth.

## Features

- ✅ **RFC 9421 Signature Verification** - Verifies HTTP message signatures using Ed25519
- ✅ **JWKS Caching** - Caches public keys from registry with TTL
- ✅ **Nonce Replay Protection** - Prevents replay attacks using Redis
- ✅ **Timestamp Validation** - Checks signature creation and expiry times
- ✅ **Trusted Directories** - Optional whitelist of JWKS URLs
- ✅ **NGINX Integration** - Works as auth_request backend

## Installation

```bash
pnpm install
```

## Configuration

Environment variables (add to root `.env`):

```bash
# Verifier Service
VERIFIER_PORT=8081

# Redis for caching and nonce tracking
REDIS_URL=redis://localhost:6379

# Trusted JWKS directories (comma-separated, optional)
OB_TRUSTED_DIRECTORIES=localhost:8080,openbotregistry.example.com

# Clock skew tolerance (seconds)
OB_MAX_SKEW_SEC=300

# Nonce TTL (seconds)
OB_NONCE_TTL_SEC=600

# X.509 delegation validation (optional)
OBA_X509_ENABLED=false
OBA_X509_TRUST_ANCHORS=/path/to/ca.pem
```

## Usage

### Development

```bash
pnpm dev
```

### Production

```bash
pnpm build
pnpm start
```

## API Endpoints

### POST /authorize

Main verification endpoint for NGINX `auth_request`.

**Headers (from NGINX):**
- `X-Original-Method` - HTTP method
- `X-Original-Host` - Host header
- `X-Original-Uri` - Request URI
- `Signature-Input` - RFC 9421 signature input
- `Signature` - RFC 9421 signature
- `Signature-Agent` - Structured Dictionary entry pointing to JWKS (legacy URL also accepted)

**X.509 delegation notes:**
- `x5c` chains are validated to configured trust anchors when `OBA_X509_ENABLED=true`
- `x5u` currently fetches only the leaf certificate; without AIA chain building, validation succeeds only if the leaf chains directly to a trust anchor (or the anchor is an intermediate)
- Verifier enforces issuer CA constraints for chain signers; it does not currently enforce EKU on leaf certs or bind certificate identity to the Signature-Agent URL

**Signature parsing scope (MVP):**
- If multiple labels are present in `Signature-Input`/`Signature`, verifier currently validates the first parsable `Signature-Input` member and matches `Signature` by that label.

**Response:**

```json
{
  "verified": true,
  "agent": {
    "jwks_url": "http://localhost:8080/jwks/hammadtq.json",
    "kid": "3312fbbe-4e79-4b06-8d88-c6aa78b81d4a",
    "client_name": "hammadtq"
  },
  "created": 1763282275,
  "expires": 1794818275
}
```

**Error Response:**

```json
{
  "error": "Signature verification failed"
}
```

### POST /verify

Standalone verification endpoint.

**Request Body:**

```json
{
  "method": "GET",
  "url": "http://example.com/api/data",
  "headers": {
    "signature-input": "...",
    "signature": "...",
    "signature-agent": "..."
  }
}
```

**Response:** Same as `/authorize`

### POST /cache/jwks/clear

Clear all JWKS cache entries.

### POST /cache/nonces/clear

Clear all nonce entries (for testing).

### POST /cache/jwks/invalidate

Invalidate a specific JWKS cache entry.

**Request Body:**

```json
{
  "jwks_url": "http://localhost:8080/jwks/hammadtq.json"
}
```

### GET /health

Health check endpoint.

```json
{
  "status": "ok",
  "service": "verifier",
  "redis": "connected"
}
```

## NGINX Integration

Example NGINX configuration:

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    # Check signature before proxying
    auth_request /_oba_check;
    
    # Pass verification headers to backend
    auth_request_set $oba_verified $upstream_http_x_obauth_verified;
    auth_request_set $oba_agent $upstream_http_x_obauth_agent;
    auth_request_set $oba_jwks_url $upstream_http_x_obauth_jwks_url;
    auth_request_set $oba_kid $upstream_http_x_obauth_kid;
    
    proxy_set_header X-OBAuth-Verified $oba_verified;
    proxy_set_header X-OBAuth-Agent $oba_agent;
    proxy_set_header X-OBAuth-JWKS-URL $oba_jwks_url;
    proxy_set_header X-OBAuth-Kid $oba_kid;
    
    proxy_pass http://backend;
  }

  location = /_oba_check {
    internal;
    proxy_pass http://verifier:8081/authorize;
    proxy_set_header X-Original-Method $request_method;
    proxy_set_header X-Original-Host $host;
    proxy_set_header X-Original-Uri $request_uri;
    proxy_set_header Signature-Input $http_signature_input;
    proxy_set_header Signature $http_signature;
    proxy_set_header Signature-Agent $http_signature_agent;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
  }
}
```

## How It Works

1. **Request arrives** with RFC 9421 signature headers
2. **Parse headers** - Extract `Signature-Input`, `Signature`, `Signature-Agent`
3. **Validate JWKS URL** - Check against trusted directories (if configured)
4. **Fetch public key** - Get JWKS from cache or fetch from URL
5. **Check timestamp** - Validate `created` and `expires` within clock skew
6. **Check nonce** - Ensure nonce hasn't been used (replay protection)
7. **Build signature base** - Reconstruct the signed message per RFC 9421
8. **Verify signature** - Use Ed25519 to verify the signature
9. **Return result** - 200 OK with agent info, or 401 Unauthorized

## Security

- **Nonce replay protection** - Each nonce can only be used once
- **Timestamp validation** - Signatures must be within acceptable time window
- **Trusted directories** - Optional whitelist of JWKS sources
- **JWKS caching** - Reduces load on registry, with TTL expiry
- **Ed25519 signatures** - Modern, secure signature algorithm

## Testing

```bash
# Run tests
pnpm test

# Clear all caches
curl -X POST http://localhost:8081/cache/jwks/clear
curl -X POST http://localhost:8081/cache/nonces/clear
```

## Troubleshooting

### "Signature verification failed"

- Check that the signature was created correctly
- Verify the JWKS URL is accessible
- Ensure the `kid` matches a key in the JWKS

### "Nonce already used"

- This is a replay attack detection
- Each request must use a unique nonce
- Nonces expire after `OB_NONCE_TTL_SEC`

### "Signature created time is too old"

- Check system clocks are synchronized
- Adjust `OB_MAX_SKEW_SEC` if needed
- Ensure signature is created recently

## License

MIT
