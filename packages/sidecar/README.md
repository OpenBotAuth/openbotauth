# @openbotauth/sidecar

A reverse-proxy sidecar that verifies OpenBotAuth RFC 9421 HTTP signatures and injects `X-OBAuth-*` headers. Works with any HTTP backend (Apache, Nginx, Node.js, Python, Go, etc.).

## Installation

```bash
# From npm
npm install -g @openbotauth/sidecar

# Or use npx
npx @openbotauth/sidecar

# Or from source
pnpm install
pnpm build
```

## Usage

```bash
# Start the sidecar
PORT=8088 \
UPSTREAM_URL=http://localhost:3000 \
OBA_VERIFIER_URL=https://verifier.openbotauth.org/verify \
OBA_MODE=require-verified \
OBA_PROTECTED_PATHS=/api,/protected \
oba-sidecar
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8088` | Sidecar listen port |
| `UPSTREAM_URL` | `http://localhost:8080` | Backend server URL |
| `OBA_VERIFIER_URL` | `https://verifier.openbotauth.org/verify` | Verifier endpoint |
| `OBA_MODE` | `observe` | `observe` or `require-verified` |
| `OBA_TIMEOUT_MS` | `5000` | Verifier timeout in ms |
| `OBA_PROTECTED_PATHS` | `/protected` | Comma-separated protected paths |

## Modes

- **observe**: All requests pass through; headers indicate verification status
- **require-verified**: Protected paths return 401 if unsigned or verification fails

## Headers Injected

| Header | Description |
|--------|-------------|
| `X-OBAuth-Verified` | `true` or `false` |
| `X-OBAuth-Agent` | Bot client_name |
| `X-OBAuth-JWKS-URL` | Bot's JWKS URL |
| `X-OBAuth-Kid` | Key ID |
| `X-OBAuth-Error` | Error message (on failure) |

## Development

```bash
pnpm dev      # Start with hot reload
pnpm test     # Run tests
pnpm build    # Build for production
```

## Docker

See `infra/sidecar/` for Docker Compose examples.

## License

Apache-2.0
