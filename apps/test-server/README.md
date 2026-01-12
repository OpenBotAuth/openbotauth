# Test Server

Unified test server for verifying OpenBotAuth signature verification packages.

This test server provides identical endpoints for testing both:
- **npm package**: `@openbotauth/verifier-client` (Express.js)
- **Python package**: `openbotauth-verifier` (FastAPI)

## Structure

```
test-server/
├── npm/
│   └── server.js         # Express server using @openbotauth/verifier-client
├── python/
│   ├── server.py         # FastAPI server using openbotauth-verifier
│   └── requirements.txt  # Python dependencies
├── start-npm.sh          # Start npm server (port 3000)
├── start-python.sh       # Start Python server (port 3001)
├── package.json          # npm dependencies
└── README.md             # This file
```

## Quick Start

### npm Package Test Server

```bash
# From monorepo root
pnpm --filter @openbotauth/test-server dev

# Or from this directory
./start-npm.sh

# Or with custom verifier
VERIFIER_URL=https://verifier.openbotauth.org/verify ./start-npm.sh
```

Server runs on **port 3000** by default.

### Python Package Test Server

```bash
# From this directory
./start-python.sh

# Or manually
cd python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py

# With custom verifier
VERIFIER_URL=https://verifier.openbotauth.org/verify python server.py
```

Server runs on **port 3001** by default.

## Endpoints

Both servers expose identical endpoints:

| Endpoint | Auth Required | Description |
|----------|---------------|-------------|
| `GET /public` | No | Public endpoint, no signature needed |
| `GET /protected` | Yes | Protected endpoint, requires valid signature |
| `GET /api/secret` | Yes | Another protected endpoint with secret data |
| `GET /health` | No | Health check endpoint |

## Testing with bot-cli

Use the `@openbotauth/bot-cli` to make signed requests:

```bash
# Test npm server (port 3000)
cd packages/bot-cli
pnpm dev fetch http://localhost:3000/protected -v
pnpm dev fetch http://localhost:3000/api/secret -v

# Test Python server (port 3001)
pnpm dev fetch http://localhost:3001/protected -v
pnpm dev fetch http://localhost:3001/api/secret -v

# Test public endpoints (no signature)
curl http://localhost:3000/public
curl http://localhost:3001/public
```

## Configuration

Both servers accept the same environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VERIFIER_URL` | `http://localhost:8081/verify` | URL of the verifier service |
| `PORT` | `3000` (npm) / `3001` (Python) | Server port |

### Using Hosted Verifier

For testing with the hosted verifier (no local services required):

```bash
# npm server
VERIFIER_URL=https://verifier.openbotauth.org/verify ./start-npm.sh

# Python server
VERIFIER_URL=https://verifier.openbotauth.org/verify ./start-python.sh
```

## Response Format

Both servers return consistent response shapes:

### Successful Verification

```json
{
  "message": "🎉 Access granted! Your signature is valid.",
  "agent": {
    "kid": "key-id",
    "jwks_url": "https://registry.openbotauth.org/jwks/user.json",
    "client_name": "Bot Name"
  },
  "timestamp": "2026-01-11T12:00:00.000Z",
  "resource": "protected-data"
}
```

### Failed Verification

```json
{
  "error": "Unauthorized",
  "message": "Signature required"
}
```

### Public Endpoint

```json
{
  "message": "Public access - no signature required",
  "info": "Anyone can access this endpoint"
}
```

## Development

### npm Server

The npm server uses `@openbotauth/verifier-client` from the monorepo workspace:

```javascript
import { openBotAuthMiddleware } from '@openbotauth/verifier-client/express';

app.use(openBotAuthMiddleware({
  verifierUrl,
  mode: 'observe',
}));
```

### Python Server

The Python server uses `openbotauth-verifier` loaded from the SDK path:

```python
from openbotauth_verifier import OpenBotAuthASGIMiddleware

app.add_middleware(
    OpenBotAuthASGIMiddleware,
    verifier_url=VERIFIER_URL,
    require_verified=False,  # observe mode
)
```

Both servers operate in "observe mode" - they verify signatures and attach the result to the request, but don't block requests. The `requireVerified` helper/check enforces authentication for protected endpoints.
