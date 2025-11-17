# OpenBotAuth — Minimal Defensible Surface (v0.1)

**Goal:** Ship a production-lean MVP that proves:

1. **Agent identity over HTTP** (RFC 9421 + Signature-Agent → JWKS via OpenBotRegistry)
2. **Origin-side verification** (sidecar) + **granular policy & pricing** (WordPress plugin)
3. **Interop hooks** via a minimal **MCP server** (policy/meter/payments) and **A2A Agent Card** (discovery stub)

> We intentionally **do not** ship a CDN dependency. The sidecar + plugin work with any origin behind NGINX/Caddy/Envoy.

## Architecture

```
openbotauth/
├─ packages/
│  ├─ verifier-service/        # Node/TS service; verifies RFC 9421 + JWKS; nonce cache
│  ├─ registry-service/         # JWKS hosting, agent management (Neon-backed)
│  ├─ registry-signer/          # Shared Ed25519 keygen & JWKS utilities
│  ├─ github-connector/         # GitHub OAuth flow for registry
│  ├─ registry-cli/             # CLI for agent/key management
│  ├─ mcp-server/               # MCP server exposing policy/meter/payments tools
│  ├─ a2a-card/                 # Static/.well-known agent-card + tiny A2A stub endpoint
│  └─ bot-cli/                  # Demo crawler: signs requests, handles 402 + receipt retry
├─ apps/
│  └─ registry-portal/          # Vite UI for agent/key management
├─ plugins/
│  └─ wordpress-openbotauth/    # WP plugin (PHP) for policy, pricing, analytics, receipts
├─ infra/
│  ├─ docker/                   # Dockerfiles, docker-compose.yaml
│  ├─ neon/                     # Neon migrations
│  └─ k8s/                      # (optional) Helm/k8s manifests
└─ docs/
   ├─ ARCHITECTURE.md
   ├─ REGISTRY.md
   ├─ POLICY_SCHEMA.md
   ├─ API.md
   └─ DEPLOYMENT.md
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Redis
- Neon Postgres (or local Postgres)
- Docker (for demo environment)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
cd infra/neon
# Apply migrations to your Neon database

# Start services in development
pnpm dev
```

### Docker Demo

```bash
# Start full demo environment
cd infra/docker
docker-compose up

# The demo includes:
# - Redis (cache)
# - Verifier service (port 8081)
# - Registry service (port 8080)
# - MCP server (port 8082)
# - A2A card (port 8083)
# - WordPress with plugin (port 80)
```

## Components

### Verifier Service

Validates RFC 9421 HTTP Message Signatures with:
- JWKS resolution and caching
- Nonce replay protection
- Clock skew validation
- Directory trust validation

### Registry Service

Provides:
- JWKS endpoints for agents
- Agent and key management APIs
- GitHub OAuth integration
- Activity logging

### WordPress Plugin

**[📖 Full Documentation →](plugins/wordpress-openbotauth/README.md)**

Implements:
- RFC 9421 signature verification
- Granular policy engine (allow/deny/teaser)
- 402 payment flow
- Content teaser/gating
- Rate limiting per agent
- Whitelist/blacklist support
- Per-post policy overrides
- Admin UI for policy management
- Bot analytics ready

**Quick Install:**
```bash
cp -r plugins/wordpress-openbotauth /path/to/wordpress/wp-content/plugins/
# Activate in WordPress Admin → Plugins
# Configure in Settings → OpenBotAuth
```

See [plugins/wordpress-openbotauth/README.md](plugins/wordpress-openbotauth/README.md) for detailed setup, configuration, and examples.

### MCP Server

**[📖 Full Documentation →](packages/mcp-server/README.md)**

Exposes tools for AI agents (Claude, etc.):
- `policy_apply` - Evaluate access policies
- `payments_create_intent` - Create payment intents
- `meter_ingest` - Track usage events

**Quick Setup:**
```bash
cd packages/mcp-server
pnpm install && pnpm build

# Add to Claude Desktop config
# See packages/mcp-server/README.md for details
```

**Features:**
- ✅ Policy evaluation (whitelist/blacklist/rate limits)
- 💰 Payment intent creation
- 📊 Usage metering and analytics
- 🤖 Claude Desktop integration
- 🔄 Real-time counters (Redis)
- 📈 Historical data (PostgreSQL)

See [packages/mcp-server/README.md](packages/mcp-server/README.md) for Claude Desktop integration and usage examples.

### Bot CLI

Demo crawler that:
- Signs HTTP requests per RFC 9421
- Handles 402 payment flow
- Manages Ed25519 keypairs
- References registry JWKS

## Development

```bash
# Install dependencies
pnpm install

# Run linter
pnpm lint

# Run tests
pnpm test

# Build all packages
pnpm build

# Clean build artifacts
pnpm clean
```

## Documentation

See the `docs/` directory for detailed documentation:

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture and data flow
- [REGISTRY.md](docs/REGISTRY.md) - Registry setup and Neon configuration
- [POLICY_SCHEMA.md](docs/POLICY_SCHEMA.md) - Policy rule format
- [API.md](docs/API.md) - API reference
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide

## License

MIT

