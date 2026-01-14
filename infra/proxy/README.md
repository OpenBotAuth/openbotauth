# OpenBotAuth Proxy

A reverse proxy that sits in front of **any HTTP server** (Apache, Nginx, Node.js, Python, Go, etc.), verifies OpenBotAuth RFC 9421 signatures, and injects `X-OBAuth-*` headers.

## Quick Start

### 1. Start the stack

```bash
cd infra/proxy
docker compose up --build
```

This starts:
- **Demo backend** on internal port 8080 (not exposed)
- **Proxy** on port 8088 → proxies to backend

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

Environment variables for the proxy:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8088` | Proxy listen port |
| `UPSTREAM_URL` | `http://demo-backend:8080` | Backend server URL |
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
- Overrides proxy to use local verifier

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (browser or bot)                                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼ HTTP Request
┌─────────────────────────────────────────────────────────────────┐
│  OpenBotAuth Proxy (:8088)                                      │
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
│  Backend Server (:8080 internal)                                │
│  • Serves /public.html, /protected.html                         │
│  • Reads X-OBAuth-* headers for logging/decisions               │
└─────────────────────────────────────────────────────────────────┘
```

### How Traffic Blocking Works

The proxy is a **reverse proxy** that sits IN FRONT of your backend—it's not a companion process running alongside. This is how protection is enforced:

```
                    ┌─────────────────────────────────────────────────┐
                    │                   Your Server                    │
                    │                                                  │
Internet ──────────►│  Proxy (:8088)  ──────────►  Backend (:8080)    │
                    │     PUBLIC              INTERNAL ONLY            │
                    │                                                  │
                    │  ✓ Verifies signatures                          │
                    │  ✓ Blocks bad requests (returns 401)            │
                    │  ✓ Only forwards verified requests              │
                    └─────────────────────────────────────────────────┘

         Backend is NOT directly accessible from the internet!
```

**Key points:**
1. **Backend listens on an internal port** (8080) that is NOT exposed to the public
2. **Proxy listens on the public port** (8088) and is the ONLY entry point
3. When a request arrives at the proxy:
   - If the path requires verification (`require-verified` mode) and the signature is missing/invalid → **returns 401 immediately, request NEVER reaches backend**
   - If the signature is valid → forwards the request to backend with `X-OBAuth-*` headers

### Is This Pattern Safe?

**Yes!** This is a standard, battle-tested architecture used by:

- **Nginx** as a reverse proxy in front of application servers
- **HAProxy** for load balancing and SSL termination
- **Envoy** (used by Istio/Kubernetes service mesh)
- **Traefik** for container routing
- **AWS ALB/CloudFront** for edge protection

The proxy approach is actually **safer** than running authentication inside your backend because:
1. **Small attack surface** - The proxy is a focused, minimal codebase (~500 lines) that's easy to audit
2. **Defense in depth** - Bad requests are rejected before reaching your application server
3. **Separation of concerns** - Your backend handles content serving; the proxy handles authentication
4. **No backend modifications** - Your existing config remains unchanged

### Production Deployment

For a production server, you need to ensure your backend is only accessible through the proxy:

#### Option 1: Firewall Rules

```bash
# Block direct access to backend (port 80/8080)
iptables -A INPUT -p tcp --dport 80 -j DROP
iptables -A INPUT -p tcp --dport 8080 -j DROP

# Allow access to proxy (port 8088)
iptables -A INPUT -p tcp --dport 8088 -j ACCEPT
```

#### Option 2: Bind backend to localhost only

In your server config:
```apache
# Only listen on localhost - proxy can reach it, internet cannot
Listen 127.0.0.1:8080
```

#### Option 3: Docker/Container networking (recommended)

Use Docker's internal networking (as shown in the demo):
```yaml
# docker-compose.yaml
backend:
  expose:
    - "8080"      # Internal only - not published to host

proxy:
  ports:
    - "8088:8088"  # Public - this is what clients connect to
```

#### Option 4: Load Balancer

Route all traffic through your load balancer to the proxy:
```
Internet → Load Balancer → Proxy (:8088) → Backend (:8080 internal)
```

### Optional Backend Configuration

Your backend requires **no changes** to work with the proxy. However, you can optionally:

#### Log verification status (Apache example)

```apache
# Add to httpd.conf to log X-OBAuth-* headers
LogFormat "%h %t \"%r\" %>s \"%{X-OBAuth-Verified}i\" \"%{X-OBAuth-Agent}i\"" obauth
CustomLog logs/bot_access.log obauth
```

#### Use headers for access control

```apache
# Example: additional Apache-level enforcement
<Location /premium-content>
    <If "%{HTTP:X-OBAuth-Verified} != 'true'">
        Require all denied
    </If>
</Location>
```

#### Conditional content based on bot identity

```apache
# Serve different content to verified bots
<If "%{HTTP:X-OBAuth-Agent} == 'GoogleBot'">
    # Special handling for Google
</If>
```

## Supported Backends

This proxy works with **any HTTP server**. It's backend-agnostic—it just needs an `UPSTREAM_URL` to proxy to.

### Tested Backends

| Backend | Example UPSTREAM_URL | Notes |
|---------|---------------------|-------|
| **Apache** | `http://apache:8080` | Default in demo |
| **Nginx** | `http://nginx:80` | Works perfectly |
| **Node.js/Express** | `http://node-app:3000` | Great for APIs |
| **Next.js** | `http://nextjs:3000` | SSR apps |
| **Python/FastAPI** | `http://fastapi:8000` | Via Uvicorn |
| **Python/Django** | `http://django:8000` | Via Gunicorn |
| **Go** | `http://go-app:8080` | Native HTTP servers |
| **PHP-FPM + Nginx** | `http://nginx:80` | Point to Nginx |
| **Ruby/Rails** | `http://rails:3000` | Via Puma |
| **Static files** | `http://nginx:80` | Nginx/Apache serving files |

### Example: Nginx Backend

```yaml
# docker-compose.yaml
services:
  nginx:
    image: nginx:alpine
    volumes:
      - ./html:/usr/share/nginx/html:ro
    expose:
      - "80"

  proxy:
    image: openbotauth/proxy
    ports:
      - "8088:8088"
    environment:
      - UPSTREAM_URL=http://nginx:80
      - OBA_MODE=require-verified
      - OBA_PROTECTED_PATHS=/api,/protected
```

### Example: Node.js/Express Backend

```yaml
# docker-compose.yaml
services:
  api:
    build: ./my-express-app
    expose:
      - "3000"

  proxy:
    image: openbotauth/proxy
    ports:
      - "8088:8088"
    environment:
      - UPSTREAM_URL=http://api:3000
      - OBA_MODE=require-verified
      - OBA_PROTECTED_PATHS=/api/v1
```

### Example: Python/FastAPI Backend

```yaml
# docker-compose.yaml
services:
  fastapi:
    build: ./my-fastapi-app
    expose:
      - "8000"

  proxy:
    image: openbotauth/proxy
    ports:
      - "8088:8088"
    environment:
      - UPSTREAM_URL=http://fastapi:8000
      - OBA_MODE=require-verified
      - OBA_PROTECTED_PATHS=/api
```

### Example: Existing Server (non-Docker)

If your server is already running (not in Docker), run the proxy standalone:

```bash
# Using npx
npx @openbotauth/proxy \
  --upstream http://localhost:3000 \
  --mode require-verified \
  --paths /api,/admin

# Or with Docker
docker run -p 8088:8088 \
  -e UPSTREAM_URL=http://host.docker.internal:3000 \
  -e OBA_MODE=require-verified \
  -e OBA_PROTECTED_PATHS=/api,/admin \
  openbotauth/proxy
```

> **Note**: Use `host.docker.internal` to reach services running on your host machine from inside Docker.

### Chaining with Existing Nginx

If you already have Nginx handling SSL, add the proxy between Nginx and your app:

```
Internet → Nginx (SSL :443) → Proxy (:8088) → Your App (:3000)
```

Nginx config:
```nginx
upstream openbotauth_proxy {
    server 127.0.0.1:8088;
}

server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    location / {
        proxy_pass http://openbotauth_proxy;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
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
