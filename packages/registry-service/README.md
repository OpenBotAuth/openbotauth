# @openbotauth/registry-service

Registry service for OpenBotAuth - provides JWKS hosting, agent management, and GitHub OAuth integration.

## Features

- **JWKS Endpoints**: Serve JSON Web Key Sets for users and agents
- **Agent Management**: Create, update, and manage bot agents
- **GitHub OAuth**: Complete OAuth flow with session management
- **Activity Logging**: Track agent HTTP activity
- **Neon-backed**: All data stored in Neon Postgres

## Installation

```bash
pnpm install
```

## Environment Variables

```bash
PORT=8080
NEON_DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:8080/auth/github/callback
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
OBA_CA_MODE=local
OBA_CA_DIR=./.local/ca
OBA_CA_KEY_PATH=./.local/ca/ca.key.json
OBA_CA_CERT_PATH=./.local/ca/ca.pem
OBA_CA_SUBJECT="CN=OpenBotAuth Dev CA"
OBA_CA_VALID_DAYS=3650
OBA_LEAF_CERT_VALID_DAYS=90
```

## Development

```bash
# Start in development mode with hot reload
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## API Endpoints

### JWKS Endpoints

#### GET `/jwks/{username}.json`

Serve JWKS for a user's public keys.

**Response:**
```json
{
  "client_name": "mybot",
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "abc123",
      "x": "base64url-encoded-key",
      "use": "sig",
      "nbf": 1700000000,
      "exp": 1731536000
    }
  ],
  "rfc9309-compliance": ["User-Agent"],
  "trigger": "fetcher",
  "purpose": "tdm"
}
```

### Signature Agent Card

#### GET `/.well-known/signature-agent-card`

Serves a Signature Agent Card with optional `oba_*` fields and embedded JWKS.

Query parameters:
- `agent_id` (optional)
- `username` (optional)

### Certificate Endpoints (MVP)

Scope note:
- In current middleware, `agents:write` satisfies `agents:read`.

#### POST `/v1/certs/issue`

Issue an X.509 certificate for an agent key.

Auth:
- Requires authenticated session or Bearer PAT.
- Required scope: `agents:write`.

**Proof-of-Possession Required:**

To prevent certificate issuance for keys you don't control, you must provide a signed proof:

1. Generate a message: `cert-issue:{agent_id}:{unix_timestamp}`
2. Sign the message with your Ed25519 private key
3. Include the proof in the request body

The timestamp must be within 5 minutes in the past (up to 30 seconds future drift is tolerated for clock skew).

**Replay Protection:** Each proof message can only be used once. The server tracks used proofs for 5 minutes to prevent replay attacks. Clients must generate a fresh timestamp for each issuance request.

Note: if the agent has `oba_agent_id`, it is included as a SAN URI in the leaf
certificate as an informational hint. This value is user-supplied unless you
enforce registry-side issuance rules.

**Request:**
```json
{
  "agent_id": "uuid",
  "proof": {
    "message": "cert-issue:550e8400-e29b-41d4-a716-446655440000:1709251200",
    "signature": "<base64-encoded-ed25519-signature>"
  }
}
```

**CLI Usage (recommended):**

Certificate issuance is best done via CLI to keep private keys secure:

```bash
# Using the JWK JSON file downloaded when creating the agent in the portal
oba-bot cert issue --agent-id <uuid> --private-key-path ./agent-<uuid>-private-key.json --token <pat>

# Or using a PEM file (from Setup page or other tooling)
oba-bot cert issue --agent-id <uuid> --private-key-path /path/to/private-key.pem --token <pat>

# With OPENBOTAUTH_TOKEN env var
OPENBOTAUTH_TOKEN=<pat> oba-bot cert issue --agent-id <uuid> --private-key-path ./agent-<uuid>-private-key.json
```

The CLI auto-detects the key format (JWK JSON or PEM) and generates the proof-of-possession signature.

#### POST `/v1/certs/revoke`

Revoke an issued certificate.

Auth:
- Requires authenticated session or Bearer PAT.
- Required scope: `agents:write`.

**Request:**
```json
{
  "serial": "hex-serial",
  "reason": "key-rotation"
}
```

#### GET `/v1/certs`

List issued certificates owned by the authenticated user.

Auth:
- Requires authenticated session or Bearer PAT.
- Required scope: `agents:read` (or `agents:write`).

Query parameters:
- `agent_id` (optional)
- `kid` (optional)
- `status` (optional: `active` | `revoked` | `all`, default `all`)
- `limit` (optional, default `50`, max `200`)
- `offset` (optional, default `0`)

#### GET `/v1/certs/{serial}`

Fetch one certificate by serial, including PEM and chain data.

Auth:
- Requires authenticated session or Bearer PAT.
- Required scope: `agents:read` (or `agents:write`).

Response includes metadata fields plus:
- `cert_pem`
- `chain_pem`
- `x5c`

#### GET `/v1/certs/status`

Check certificate validity metadata by one identifier:
- `serial` **or**
- `fingerprint_sha256`

Auth:
- Requires authenticated session or Bearer PAT.
- Required scope: `agents:read` (or `agents:write`).

Response shape:
```json
{
  "valid": true,
  "revoked": false,
  "not_before": "2026-02-01T00:00:00.000Z",
  "not_after": "2026-05-01T00:00:00.000Z",
  "revoked_at": null,
  "revoked_reason": null
}
```

Note: `valid` is true only when the certificate is not revoked AND the current time is within the `not_before`/`not_after` validity window.

#### GET `/v1/certs/public-status`

Public endpoint for relying parties (e.g., ClawAuth) to check certificate revocation status.

**No authentication required.**

Query parameters:
- `fingerprint_sha256` (required) - SHA-256 fingerprint of the certificate (64 lowercase hex characters)

**Computing the fingerprint:**

For mTLS integration, compute the SHA-256 fingerprint over the **DER-encoded** client certificate (not PEM text). Example in Node.js:

```javascript
const { createHash, X509Certificate } = require("node:crypto");

// From PEM string
const pem = "-----BEGIN CERTIFICATE-----...";
const cert = new X509Certificate(pem);
const fingerprint = createHash("sha256").update(cert.raw).digest("hex");
// fingerprint is 64 lowercase hex chars
```

Response shape:
```json
{
  "valid": true,
  "revoked": false,
  "not_before": "2026-02-01T00:00:00.000Z",
  "not_after": "2026-05-01T00:00:00.000Z",
  "revoked_at": null,
  "revoked_reason": null
}
```

#### GET `/.well-known/ca.pem`

Fetch the registry CA certificate (PEM).

### mTLS Integration Notes (ClawAuth / relying parties)

For OpenBotAuth-issued client certificates in mTLS:

1. Fetch and trust OBA CA:
   - `GET /.well-known/ca.pem`
   - Configure your TLS server trust store with this CA (or intermediate, depending on deployment).
2. Provision agent certificate:
   - Call `POST /v1/certs/issue` for the target `agent_id`.
   - Store `cert_pem` / `chain_pem` alongside the agent private key.
3. Revoke when needed:
   - Call `POST /v1/certs/revoke`.
4. Optional status checks:
   - Call `GET /v1/certs/status` to evaluate revoked + validity window metadata (`not_before`/`not_after`).

Current limitation:
- TLS stacks do not automatically consult OpenBotAuth revocation status in this MVP.
- Use short-lived certs and/or explicit status checks if you need revocation awareness.

### Activity Endpoints

#### POST `/agent-activity`

Log agent HTTP activity.

**Request:**
```json
{
  "agent_id": "uuid",
  "target_url": "https://example.com/page",
  "method": "GET",
  "status_code": 200,
  "response_time_ms": 150
}
```

**Response:**
```json
{
  "success": true,
  "activity_id": "uuid"
}
```

#### GET `/agent-activity/{agent_id}?limit=100&offset=0`

Get activity logs for an agent.

**Response:**
```json
{
  "activity": [
    {
      "id": "uuid",
      "target_url": "https://example.com",
      "method": "GET",
      "status_code": 200,
      "response_time_ms": 150,
      "timestamp": "2025-11-15T12:00:00Z"
    }
  ],
  "count": 1,
  "limit": 100,
  "offset": 0
}
```

### Authentication Endpoints

#### GET `/auth/github`

Initiate GitHub OAuth flow. Redirects to GitHub authorization page.

#### GET `/auth/github/callback`

Handle GitHub OAuth callback. Creates session and redirects to frontend.

#### GET `/auth/session`

Get current session information.

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "github_username": "username",
    "avatar_url": "https://..."
  },
  "profile": {
    "username": "mybot",
    "client_name": "My Bot"
  }
}
```

#### POST `/auth/logout`

Logout and delete session.

**Response:**
```json
{
  "success": true
}
```

### Health Check

#### GET `/health`

Check service health.

**Response:**
```json
{
  "status": "ok",
  "service": "registry"
}
```

## CORS

All endpoints support CORS with `Access-Control-Allow-Origin: *` for development.

In production, configure specific origins as needed.

## Caching

JWKS endpoints include `Cache-Control: public, max-age=3600` headers (1 hour cache).

## Error Responses

All errors return JSON:

```json
{
  "error": "Error message"
}
```

With appropriate HTTP status codes:
- `400`: Bad Request
- `401`: Unauthorized
- `404`: Not Found
- `500`: Internal Server Error

## Database Schema

See `infra/neon/migrations/001_initial_schema.sql` for the complete schema.

Key tables:
- `users`: User accounts
- `profiles`: Extended user profiles
- `public_keys`: Current public keys
- `key_history`: Historical keys
- `agents`: Bot agents
- `agent_activity`: Activity logs
- `sessions`: OAuth sessions

## Security

- Sessions expire after 30 days
- Session tokens are cryptographically secure (32 bytes)
- HTTPS required in production
- State parameter for CSRF protection in OAuth
- SQL injection prevention via parameterized queries

## License

MIT
