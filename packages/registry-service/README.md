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

#### GET `/agent-jwks/{agent_id}`

Serve JWKS for a specific agent.

**Response:**
```json
{
  "client_name": "My Web Scraper",
  "agent_type": "web_scraper",
  "status": "active",
  "created_at": "2025-11-15T00:00:00Z",
  "keys": [...]
}
```

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

