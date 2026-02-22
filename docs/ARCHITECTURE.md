# OpenBotAuth Architecture

## Overview

OpenBotAuth is a distributed system for bot authentication and policy enforcement using HTTP Message Signatures (RFC 9421) and JWKS (JSON Web Key Sets).

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
└────────────┬────────────────────────────────────┬────────────────┘
             │                                    │
             │ HTTP + Signature                   │ HTTPS
             │                                    │
        ┌────▼────┐                          ┌───▼────┐
        │   Bot   │                          │ GitHub │
        │   CLI   │                          │  OAuth │
        └────┬────┘                          └───┬────┘
             │                                   │
             │ Signed Request                    │ OAuth Flow
             │                                   │
        ┌────▼────────────────────────────────────▼─────┐
        │            NGINX (Reverse Proxy)              │
        │         with auth_request module              │
        └────┬──────────────────────────────────┬───────┘
             │                                  │
             │ Verify Request                   │ Forward Request
             │                                  │
        ┌────▼────────┐                    ┌───▼──────────┐
        │  Verifier   │◄───JWKS Cache─────┤   Registry   │
        │  Service    │                    │   Service    │
        │ (RFC 9421)  │                    │   (JWKS)     │
        └────┬────────┘                    └───┬──────────┘
             │                                  │
             │ Redis (nonce)                    │ Neon DB
             │                                  │
        ┌────▼────────┐                    ┌───▼──────────┐
        │    Redis    │                    │   Neon       │
        │   (Cache)   │                    │  Postgres    │
        └─────────────┘                    └──────────────┘
                                                │
                                           ┌────▼────────┐
                                           │  MCP Server │
                                           │  (Policy)   │
                                           └─────────────┘
```

## Data Flow

### 1. Agent Registration

```
User → GitHub OAuth → Registry Service → Neon DB
                    ↓
              Generate Session
                    ↓
              Return to Portal
```

1. User clicks "Login with GitHub" in portal
2. Registry service redirects to GitHub OAuth
3. GitHub returns with authorization code
4. Registry service exchanges code for user info
5. Creates/updates user and profile in Neon
6. Generates session token and sets cookie
7. Redirects to portal

### 2. Key Generation & Agent Creation

```
CLI/Portal → Generate Ed25519 KeyPair (client-side)
           ↓
       Extract Public Key
           ↓
       Convert to JWK
           ↓
       POST /agents → Registry Service → Neon DB
           ↓
       Return Agent ID + JWKS URL
```

1. Client generates Ed25519 keypair locally
2. Extracts public key and converts to JWK format
3. Sends public key to registry service
4. Registry stores in `agents` table with JSONB
5. Returns agent ID and JWKS endpoint URL
6. Client saves private key securely

### 3. Bot Request Flow

```
Bot → Sign Request (RFC 9421)
    ↓
    Add Headers:
    - Signature-Input
    - Signature
    - Signature-Agent (Structured Dictionary entry pointing to JWKS; legacy URL supported)
    ↓
    HTTP Request → NGINX
                    ↓
              auth_request → Verifier Service
                              ↓
                         Parse Signature
                              ↓
                         Check Nonce (Redis)
                              ↓
                         Fetch JWKS (cache/fresh)
                              ↓
                         Verify Signature
                              ↓
                         Check Directory Trust
                              ↓
                         Return Verdict + Headers
                              ↓
              NGINX adds X-OBAuth-* headers
                    ↓
              Forward to WordPress
                    ↓
              WordPress Plugin evaluates policy
                    ↓
              Allow / 402 Payment / 403 Deny
```

### 4. Payment Flow (402)

```
WordPress → 402 Payment Required
          ↓
    Headers:
    - OpenBotAuth-Price
    - OpenBotAuth-Request-Hash
    - Link: rel="payment"
          ↓
Bot → Follow payment link
    ↓
    Complete payment
    ↓
    Receive receipt token
    ↓
    Retry request with:
    - OpenBotAuth-Receipt header
          ↓
WordPress → Verify receipt
          ↓
    200 OK with full content
```

## Component Details

### Registry Service

**Purpose**: JWKS hosting, agent management, GitHub OAuth

**Technology**: Node.js + Express + Neon Postgres

**Endpoints**:
- `GET /jwks/{username}.json` - User JWKS
- `POST /agent-activity` - Log activity
- `GET /auth/github` - OAuth initiate
- `GET /auth/github/callback` - OAuth callback
- `GET /auth/session` - Session info
- `POST /auth/logout` - Logout

**Database Tables**:
- `users` - User accounts (GitHub OAuth)
- `profiles` - Extended profiles with Web Bot Auth metadata
- `public_keys` - Current public keys
- `key_history` - Historical keys (rotation)
- `agents` - Bot agents with JWK public keys
- `agent_activity` - HTTP activity logs
- `sessions` - OAuth sessions

**Security**:
- Session tokens: 32-byte cryptographically random
- Sessions expire after 30 days
- SQL injection prevention via parameterized queries
- HTTPS required in production

### Verifier Service

**Purpose**: RFC 9421 signature verification, nonce replay protection

**Technology**: Node.js + Express + Redis + `web-bot-auth` library

**Endpoints**:
- `POST /authorize` - Verify request signature

**Process**:
1. Extract signature headers from proxied request
2. Parse `Signature-Input` and `Signature` headers
3. Extract nonce and check for replay (Redis SET NX)
4. Fetch JWKS from `Signature-Agent` entry (dictionary member or legacy URL) with caching
5. Verify signature using public key
6. Check clock skew (±300s default)
7. Validate directory trust
8. Return verdict with X-OBAuth-* headers

**Caching**:
- JWKS: Redis with ETag/Cache-Control support (1 hour default)
- Nonce: Redis with TTL (10 minutes default)

**Headers Set**:
- `X-OBAuth-Verified: 1`
- `X-OBAuth-Agent-KID: {kid}`
- `X-OBAuth-Agent-JWKS: {jwks_url}`
- `X-OBAuth-Intent: {intent}`
- `X-OBAuth-Pay-State: {none|required|ok}`

### WordPress Plugin

**Purpose**: Policy engine, content gating, payment flow

**Technology**: PHP 8.2+

**Hooks**:
- `template_redirect` (priority 0) - Early gate
- `the_content` - Teaser shaping
- REST: `/wp-json/openbotauth/v1/policy` - Policy export

**Policy Evaluation**:
1. Check `X-OBAuth-Verified` header
2. Load policy from options (YAML)
3. Match rules against:
   - Post tags/categories
   - Date/time
   - Custom fields
4. Apply effect:
   - `allow` → 200 OK
   - `pay` → 402 with payment headers
   - `deny` → 403 Forbidden
   - `rate_limit` → 429 Too Many Requests
   - `teaser` → 200 with truncated content

**Payment Headers** (402 response):
```
OpenBotAuth-Price: 10.00 USD
OpenBotAuth-Request-Hash: sha256(method|path|created|kid)
Link: <https://pay.example.com/i/{hash}>; rel="payment"
```

**Receipt Verification**:
- Parse `OpenBotAuth-Receipt` header
- Verify JWT signature or call payment provider API
- Check request hash matches
- Set `X-OBAuth-Pay-State: ok`

### MCP Server

**Purpose**: Expose policy/payments/meter tools for agent interop

**Technology**: Node.js + MCP SDK + Express

**Tools**:
- `policy.apply(path, method, jwks_host, kid, time)` → effect/price/unlock
- `payments.create_intent(request_hash, amount, currency)` → pay_url/receipt
- `meter.ingest(event)` → ok

**Transport**: Streamable HTTP + SSE fallback

**Auth**: HTTP Message Signatures or static bearer token

### Bot CLI

**Purpose**: Demo crawler with RFC 9421 signing and 402 handling

**Technology**: Node.js + Commander + crypto

**Commands**:
- `oba-bot fetch <url>` - Fetch with signature
- `oba-bot keygen` - Generate keypair
- `oba-bot sign <url>` - Sign request (dry-run)

**Process**:
1. Load/generate Ed25519 keypair
2. Build signature base (RFC 9421)
3. Sign with private key
4. Add headers: Signature-Input, Signature, Signature-Agent (dictionary format preferred)
5. Send HTTP request
6. Handle 402:
   - Parse Link header
   - Follow payment URL
   - Obtain receipt
   - Retry with OpenBotAuth-Receipt

### A2A Card

**Purpose**: Agent discovery and A2A protocol stub

**Technology**: Node.js + Express (static files)

**Endpoints**:
- `GET /.well-known/agent-card.json` - Agent card
- `POST /a2a/tasks/create` - Create task (stub)
- `GET /a2a/tasks/{id}/events` - SSE events (stub)

**Agent Card Format**:
```json
{
  "agent": {
    "name": "OpenBotAuth Verifier",
    "version": "0.1.0"
  },
  "endpoints": {
    "a2a": "https://example.com/a2a",
    "mcp": "https://example.com/mcp"
  },
  "auth": {
    "http-signatures": {
      "signature-agent": "required",
      "alg": ["ed25519"]
    }
  },
  "capabilities": [
    "policy.apply",
    "payments.create_intent",
    "meter.ingest"
  ]
}
```

## Security Model

### Trust Model

```
GitHub (Identity Provider)
    ↓
User (Profile Owner)
    ↓
Agent (Bot with Keypair)
    ↓
Signature (Proof of Identity)
    ↓
Verifier (Trust Validation)
    ↓
Policy (Access Control)
```

### Key Rotation

1. User generates new keypair
2. Updates agent public key via CLI/portal
3. Old key moved to `key_history` with `is_active=false`
4. New key becomes active
5. JWKS endpoint serves new key
6. Old signatures fail verification
7. Bot updates to new private key

### Nonce Replay Protection

1. Bot generates unique nonce (32 bytes base64url)
2. Includes in `Signature-Input` header
3. Verifier checks Redis: `SET nonce:{nonce} 1 EX 600 NX`
4. If exists → reject (replay attack)
5. If new → accept and cache for 10 minutes

### Directory Trust

1. Verifier resolves JWKS URL from `Signature-Agent` (dictionary member or legacy URL)
2. Checks against `OB_TRUSTED_DIRECTORIES` env var
3. Only trusted directories allowed
4. Prevents rogue JWKS servers

## Deployment

### Local Development

```bash
# Start all services
docker-compose up

# Services:
# - Registry: http://localhost:8080
# - Verifier: http://localhost:8081
# - MCP: http://localhost:8082
# - A2A: http://localhost:8083
# - WordPress: http://localhost:8000
# - Redis: localhost:6379
```

### Production

**Registry Service**:
- Deploy to Fly.io, Railway, or Kubernetes
- Set environment variables
- Connect to Neon Postgres
- Use Redis for sessions (optional)

**Verifier Service**:
- Deploy as proxy sidecar or separate service
- Must have low latency to origin
- Requires Redis for nonce cache
- Set trusted directories

**WordPress**:
- Install plugin from [WordPress.org](https://wordpress.org/plugins/openbotauth/) or search "OpenBotAuth" in Plugins → Add New
- Configure verifier URL and policy via Settings → OpenBotAuth
- Optional: Configure NGINX auth_request for edge verification

## Monitoring

### Metrics to Track

- **Registry**:
  - JWKS endpoint response time
  - Agent creation rate
  - Session creation/expiration
  - Database query performance

- **Verifier**:
  - Signature verification success/failure rate
  - Nonce replay attempts
  - JWKS cache hit/miss ratio
  - Average verification latency

- **WordPress**:
  - Policy evaluation time
  - 402 response rate
  - Receipt verification success rate
  - Content access patterns

### Logging

All services use structured JSON logging:

```json
{
  "timestamp": "2025-11-16T12:00:00Z",
  "level": "info",
  "service": "verifier",
  "message": "Signature verified",
  "kid": "abc123",
  "agent": "https://registry.example.com/jwks/username.json",
  "duration_ms": 45
}
```

**Never log**:
- Full signatures
- Private keys
- Session tokens
- Payment receipts

**Always log**:
- KIDs (key IDs)
- JWKS URLs
- Request hashes
- Verification results

## Scalability

### Horizontal Scaling

- **Registry**: Stateless, scale behind load balancer
- **Verifier**: Stateless, share Redis for nonce cache
- **MCP**: Stateless, scale independently
- **WordPress**: Standard WP scaling (caching, CDN)

### Caching Strategy

- **JWKS**: 1 hour cache with ETag support
- **Nonce**: 10 minute TTL in Redis
- **Sessions**: 30 day expiration
- **Content**: Vary on Signature-Agent (dictionary/legacy) + Pay-State

### Database

- **Neon**: Auto-scaling Postgres
- **Indexes**: On user_id, agent_id, session_token, username
- **Partitioning**: Consider for agent_activity (by timestamp)

## Future Enhancements

1. **Edge Deployment**: Deploy verifier to edge (Cloudflare Workers, Fastly Compute)
2. **Payment Integration**: Stripe, x402, Locus
3. **Advanced Policy**: Rate limiting, quota management
4. **Analytics Dashboard**: Real-time bot activity monitoring
5. **Multi-directory**: Support multiple trusted registries
6. **Key Rotation Automation**: Automatic key rotation with overlap period
7. **Webhook Support**: Notify on agent activity, policy violations
8. **Audit Logs**: Immutable audit trail for compliance

## References

- [RFC 9421 - HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html)
- [RFC 7517 - JSON Web Key (JWK)](https://www.rfc-editor.org/rfc/rfc7517.html)
- [Web Bot Auth Draft](https://github.com/web-bot-auth/spec)
- [MCP Specification](https://modelcontextprotocol.io/)
- [A2A Protocol](https://github.com/a2a-protocol/spec)
