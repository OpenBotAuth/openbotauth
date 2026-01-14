# @openbotauth/proxy

Reverse proxy for verifying [Web Bot Auth](https://datatracker.ietf.org/doc/draft-meunier-web-bot-auth-architecture/) / [OpenBotAuth](https://openbotauth.org) signed HTTP requests. Works with any HTTP backend (Apache, Nginx, Node.js, Python, Go, Ruby, etc.).

Web Bot Auth is an IETF Internet-Draft for authenticating AI agents and bots using RFC 9421 HTTP Message Signatures. OpenBotAuth provides an open-source implementation aligned with the draft, along with a registry and hosted verifier service.

This proxy:
- **Verifies RFC 9421 signatures** on incoming HTTP requests
- **Injects X-OBAuth-* headers** with verification results for your backend
- **Protects any HTTP server** without code changes to your application
- **Supports observe and enforce modes** for gradual rollout

## Installation

```bash
# npm (global)
npm install -g @openbotauth/proxy

# npx (no install required)
npx @openbotauth/proxy

# pnpm
pnpm add -g @openbotauth/proxy

# Homebrew (coming soon)
brew install openbotauth/tap/openbotauth-proxy

# Docker (Docker Hub)
docker run -p 8088:8088 hammadtariq/openbotauth-proxy

# Docker (GitHub Container Registry)
docker run -p 8088:8088 ghcr.io/openbotauth/openbotauth-proxy
```

## Quick Start

```bash
# Start the proxy in front of your backend
UPSTREAM_URL=http://localhost:3000 npx @openbotauth/proxy
```

All requests to `localhost:8088` are proxied to your backend at `localhost:3000` with verification headers injected.

## Usage

```bash
# Basic usage (proxies to localhost:8080 by default)
npx @openbotauth/proxy

# Or if installed globally
openbotauth-proxy
# or
oba-proxy

# Production configuration
PORT=8088 \
UPSTREAM_URL=http://localhost:3000 \
OBA_VERIFIER_URL=https://verifier.openbotauth.org/verify \
OBA_MODE=require-verified \
OBA_PROTECTED_PATHS=/api,/protected \
openbotauth-proxy
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8088` | Proxy listen port |
| `UPSTREAM_URL` | `http://localhost:8080` | Backend server URL to proxy to |
| `OBA_VERIFIER_URL` | `https://verifier.openbotauth.org/verify` | OpenBotAuth verifier endpoint |
| `OBA_MODE` | `observe` | `observe` or `require-verified` |
| `OBA_TIMEOUT_MS` | `5000` | Verifier request timeout in ms |
| `OBA_PROTECTED_PATHS` | `/protected` | Comma-separated paths requiring verification |

## Modes

### Observe Mode (Default)

All requests pass through to your backend. The proxy adds `X-OBAuth-*` headers indicating verification status. Use this for:
- Logging and analytics
- Gradual rollout
- Understanding bot traffic before enforcing

```bash
OBA_MODE=observe openbotauth-proxy
```

### Require-Verified Mode

Protected paths return `401 Unauthorized` if the request is unsigned or verification fails. Unprotected paths still pass through.

```bash
OBA_MODE=require-verified \
OBA_PROTECTED_PATHS=/api,/protected \
openbotauth-proxy
```

## Headers Injected

Your backend receives these headers on every request:

| Header | Description |
|--------|-------------|
| `X-OBAuth-Verified` | `true` if signature verified, `false` otherwise |
| `X-OBAuth-Agent` | Bot's client_name (if verified) |
| `X-OBAuth-JWKS-URL` | Bot's JWKS URL for key lookup |
| `X-OBAuth-Kid` | Key ID used for signing |
| `X-OBAuth-Error` | Error message (on verification failure) |

### Example Backend Usage (Node.js)

```javascript
app.get('/api/data', (req, res) => {
  if (req.headers['x-obauth-verified'] === 'true') {
    // Verified bot request
    console.log('Bot:', req.headers['x-obauth-agent']);
    res.json({ data: 'full access' });
  } else {
    // Unverified or human request
    res.json({ data: 'limited access' });
  }
});
```

### Example Backend Usage (Python/Flask)

```python
@app.route('/api/data')
def api_data():
    if request.headers.get('X-OBAuth-Verified') == 'true':
        agent = request.headers.get('X-OBAuth-Agent')
        return jsonify({'data': 'full access', 'bot': agent})
    return jsonify({'data': 'limited access'})
```

## Health Check

The proxy exposes a health check endpoint:

```bash
curl http://localhost:8088/.well-known/health
```

Response:
```json
{
  "status": "ok",
  "service": "openbotauth-proxy",
  "upstream": "http://localhost:8080",
  "verifier": "https://verifier.openbotauth.org/verify",
  "mode": "observe"
}
```

## Docker

```bash
# Run with Docker
docker run -p 8088:8088 \
  -e UPSTREAM_URL=http://host.docker.internal:3000 \
  -e OBA_MODE=observe \
  hammadtariq/openbotauth-proxy
```

Docker Compose example:

```yaml
version: '3.8'
services:
  proxy:
    image: hammadtariq/openbotauth-proxy
    ports:
      - "8088:8088"
    environment:
      - UPSTREAM_URL=http://backend:3000
      - OBA_MODE=require-verified
      - OBA_PROTECTED_PATHS=/api

  backend:
    image: your-backend
    # No need to expose port - only proxy is public
```

See the [OpenBotAuth repository](https://github.com/OpenBotAuth/openbotauth) for more Docker Compose examples.

## Architecture

```
                         +----------------+
                         |    Verifier    |
                         |    Service     |
                         +-------^--------+
                                 |
+----------+    +----------+     |     +----------+
|  Client  |--->|   Proxy  |-----+---->|  Backend |
| (AI Bot) |    |          |           | (Your App)|
+----------+    +----------+           +----------+
```

1. Bot sends signed HTTP request to proxy
2. Proxy extracts RFC 9421 signature headers
3. Proxy calls verifier service to validate signature
4. Proxy injects `X-OBAuth-*` headers with results
5. Backend receives request with verification info

## Development

```bash
# Clone the repository
git clone https://github.com/OpenBotAuth/openbotauth.git
cd openbotauth/packages/proxy

# Install dependencies
pnpm install

# Start with hot reload
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## Standards & References

- [Web Bot Auth IETF Draft](https://datatracker.ietf.org/doc/draft-meunier-web-bot-auth-architecture/) - The IETF draft specification for bot authentication
- [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html) - HTTP Message Signatures
- [RFC 7517](https://www.rfc-editor.org/rfc/rfc7517.html) - JSON Web Key (JWK)
- [OpenBotAuth](https://openbotauth.org) - Reference implementation and hosted services
- [OpenBotAuth GitHub](https://github.com/OpenBotAuth/openbotauth) - Source code and documentation

## Related Packages

- [@openbotauth/verifier-client](https://www.npmjs.com/package/@openbotauth/verifier-client) - Client library for Node.js/Express/Next.js integration
- [@openbotauth/bot-cli](https://www.npmjs.com/package/@openbotauth/bot-cli) - CLI for testing signed requests

## License

Apache-2.0
