# OpenBotAuth Apache Sidecar

A reverse-proxy sidecar that sits in front of Apache (or any HTTP upstream), verifies OpenBotAuth RFC 9421 signatures, and injects `X-OBAuth-*` headers.

## Quick Start

### 1. Start the stack

```bash
cd infra/apache-sidecar
docker compose up --build
```

This starts:
- **Apache** on internal port 8080 (not exposed)
- **Sidecar** on port 8088 → proxies to Apache

### 2. Test public access

```bash
curl http://localhost:8088/public.html
```

Works for everyone. Check response headers:
```bash
curl -I http://localhost:8088/public.html
# X-OBAuth-Verified: false (no signature)
```

### 3. Test protected access (unsigned)

```bash
curl http://localhost:8088/protected.html
# Returns 401 Unauthorized
```

Protected paths require a valid OpenBotAuth signature.

### 4. Test with signed requests

From the repo root, use the bot-cli:

```bash
# Generate keys (one-time setup)
pnpm --filter @openbotauth/bot-cli dev keygen \
  --jwks-url https://YOUR_JWKS_URL/jwks.json \
  --kid my-key-1

# Fetch protected content
pnpm --filter @openbotauth/bot-cli dev fetch http://localhost:8088/protected.html -v
```

**Important**: For the hosted verifier to work, your JWKS URL must be publicly accessible. The verifier at `https://verifier.openbotauth.org` needs to fetch your public keys.

## Configuration

Environment variables for the sidecar:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8088` | Sidecar listen port |
| `UPSTREAM_URL` | `http://apache:8080` | Backend server URL |
| `OBA_VERIFIER_URL` | `https://verifier.openbotauth.org/verify` | Verifier service endpoint |
| `OBA_MODE` | `observe` (standalone) / `require-verified` (compose) | `observe` or `require-verified` |
| `OBA_TIMEOUT_MS` | `5000` | Verifier request timeout |
| `OBA_PROTECTED_PATHS` | `/protected` | Comma-separated paths requiring verification |

## Modes

### Observe Mode

All requests pass through to upstream. Signature verification is attempted for signed requests, and `X-OBAuth-*` headers are injected to inform the upstream of verification status.

This is the default mode when running the package standalone.

```bash
OBA_MODE=observe docker compose up
```

### Require-Verified Mode

Protected paths return 401 if the request is unsigned or verification fails.

The compose stack defaults to `require-verified` for `/protected` paths to provide a better demo experience.

```bash
OBA_MODE=require-verified docker compose up
```

## Headers Injected

These headers are injected to the upstream request and also echoed on the response (for client visibility):

| Header | Description | Echoed on Response |
|--------|-------------|-------------------|
| `X-OBAuth-Verified` | `true` or `false` | Yes |
| `X-OBAuth-Agent` | Bot client_name (or "unknown") | Yes |
| `X-OBAuth-JWKS-URL` | Bot's JWKS endpoint | No |
| `X-OBAuth-Kid` | Key ID used for signing | No |
| `X-OBAuth-Error` | Error message (on failure) | Yes |

## Local Development Stack

For development without internet access or to test against a local verifier:

```bash
docker compose -f docker-compose.yaml -f docker-compose.local.yaml up --build
```

This adds:
- **Redis** for nonce cache
- **Verifier service** at `http://verifier:8081`
- Overrides sidecar to use local verifier

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (browser or bot)                                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼ HTTP Request
┌─────────────────────────────────────────────────────────────────┐
│  OpenBotAuth Sidecar (:8088)                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 1. Extract signature headers                                ││
│  │ 2. Call verifier service                                    ││
│  │ 3. Inject X-OBAuth-* headers                                ││
│  │ 4. Proxy to upstream (or return 401)                        ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Apache httpd (:8080 internal)                                  │
│  • Serves /public.html, /protected.html                         │
│  • Reads X-OBAuth-* headers for logging/decisions               │
└─────────────────────────────────────────────────────────────────┘
```

## Using with Your Own Upstream

The sidecar works with any HTTP upstream, not just Apache:

```bash
# Point to your own server
UPSTREAM_URL=http://your-server:3000 docker compose up sidecar
```

Or build the Docker image directly:

```bash
docker build -t openbotauth-sidecar -f ../docker/Dockerfile.apache-sidecar ../..
docker run -p 8088:8088 \
  -e UPSTREAM_URL=http://your-server:3000 \
  -e OBA_MODE=require-verified \
  -e OBA_PROTECTED_PATHS=/api,/admin \
  openbotauth-sidecar
```

## Testing Workflow

1. **Public path (no auth needed)**:
   ```bash
   curl http://localhost:8088/public.html
   # Works, X-OBAuth-Verified: false
   ```

2. **Protected path (unsigned)**:
   ```bash
   curl http://localhost:8088/protected.html
   # 401 Unauthorized
   ```

3. **Protected path (signed)**:
   ```bash
   pnpm --filter @openbotauth/bot-cli dev fetch http://localhost:8088/protected.html -v
   # Works if JWKS URL is publicly reachable
   ```

## Troubleshooting

### "Verifier timeout" errors

The hosted verifier at `https://verifier.openbotauth.org` needs to reach your JWKS URL. Ensure it's publicly accessible.

### "JWKS fetch failed"

Your JWKS URL in `Signature-Agent` header must:
- Be a valid HTTPS URL
- Return valid JWKS JSON
- Be reachable from the verifier

### Testing locally without public JWKS

Use the local development stack which runs its own verifier:

```bash
docker compose -f docker-compose.yaml -f docker-compose.local.yaml up
```

Then register your JWKS URL in the local registry or configure the verifier to trust any JWKS URL.
