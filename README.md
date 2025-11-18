# OpenBotAuth — Agent Identity & Policy for HTTP

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

**Production-lean system for bot authentication, policy enforcement, and usage metering over HTTP.**

OpenBotAuth provides:
1. **Agent identity over HTTP** — RFC 9421 HTTP Message Signatures + JWKS
2. **Origin-side verification** — Node.js verifier service with nonce replay protection
3. **Granular policy & pricing** — WordPress plugin for content gating, 402 payment flow
4. **Interop hooks** — MCP server (Claude Desktop integration) + A2A discovery card

> **No CDN dependency.** Works with any origin behind NGINX/Caddy/Envoy.

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/OpenBotAuth/openbotauth.git
cd openbotauth

# Install dependencies
pnpm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your credentials (Neon DB, GitHub OAuth, Redis)

# Build all packages
pnpm build

# Start development services
pnpm dev:service    # Registry service (port 8080)
pnpm dev:portal     # Portal UI (port 5173)
```

See [SETUP.md](SETUP.md) for detailed setup instructions.

---

## Architecture

```
openbotauth/
├─ packages/
│  ├─ registry-service/         ✅ JWKS hosting, agent management (Neon-backed)
│  ├─ registry-signer/          ✅ Shared Ed25519 keygen & JWKS utilities
│  ├─ github-connector/         ✅ GitHub OAuth flow for registry
│  ├─ registry-cli/             ✅ CLI for agent/key management
│  ├─ verifier-service/         ✅ RFC 9421 signature verification, nonce cache
│  ├─ bot-cli/                  ✅ Demo crawler: signs requests, handles 402
│  ├─ mcp-server/               ✅ MCP server (policy/meter/payments tools)
│  └─ a2a-card/                 ✅ Static agent card + A2A stub endpoints
├─ apps/
│  ├─ registry-portal/          ✅ Marketing website + Portal UI
│  └─ test-server/              ✅ Test server for signature verification
├─ plugins/
│  └─ wordpress-openbotauth/    ✅ WP plugin for policy, pricing, analytics
├─ infra/
│  ├─ docker/                   🚧 Dockerfiles, docker-compose.yaml
│  └─ neon/                     ✅ Neon migrations
└─ docs/
   ├─ ARCHITECTURE.md           ✅ System architecture
   └─ A2A_CARD.md               ✅ A2A discovery documentation
```

---

## Components

### 🔐 Registry Service

JWKS hosting and agent identity management.

**Features:**
- User-level and agent-level JWKS endpoints
- GitHub OAuth authentication
- Ed25519 key management
- Activity logging
- Session management

**Endpoints:**
- `GET /jwks/{username}.json` — User JWKS
- `GET /agent-jwks/{agent_id}` — Agent JWKS
- `POST /auth/github` — GitHub OAuth login
- `GET /agents` — List user agents
- `POST /keys` — Register public key

**Tech:** Node.js, Express, Neon Postgres

---

### ✅ Verifier Service

RFC 9421 HTTP Message Signature verification.

**Features:**
- Ed25519 signature verification
- JWKS resolution and caching (Redis)
- Nonce replay protection
- Clock skew validation
- Directory trust validation

**Endpoints:**
- `POST /verify` — Verify signed request
- `POST /authorize` — Check signature + policy
- `GET /health` — Health check

**Tech:** Node.js, Express, Redis, node-jose

---

### 🤖 Bot CLI

Demo crawler that signs HTTP requests per RFC 9421.

**Features:**
- Ed25519 keypair generation
- RFC 9421 request signing
- 402 Payment Required handling
- JWKS reference
- Local key storage

**Usage:**
```bash
# Generate keypair
oba-bot keygen

# Fetch signed request
oba-bot fetch https://example.com/protected -v
```

**Tech:** Node.js, Commander.js

---

### 🌐 WordPress Plugin

**[📖 Full Documentation →](plugins/wordpress-openbotauth/README.md)**

Policy engine and content gating for WordPress.

**Features:**
- ✅ RFC 9421 signature verification
- ✅ Granular policy engine (allow/deny/teaser)
- ✅ 402 payment flow
- ✅ Content teaser/gating
- ✅ Rate limiting per agent
- ✅ Whitelist/blacklist support
- ✅ Per-post policy overrides
- ✅ Admin UI for policy management
- ✅ Bot analytics ready

**Installation:**
```bash
cp -r plugins/wordpress-openbotauth /path/to/wordpress/wp-content/plugins/
# Activate in WordPress Admin → Plugins
# Configure in Settings → OpenBotAuth
```

**Configuration:**
- **Verifier URL (Production):** `https://verifier.openbotauth.org/verify`
- **Verifier URL (Local):** `http://localhost:8081/verify`

**Tech:** PHP, WordPress API

---

### 🤖 MCP Server

**[📖 Full Documentation →](packages/mcp-server/README.md)**

Model Context Protocol server for AI agent integration.

**Tools:**
- `policy_apply` — Evaluate access policies
- `payments_create_intent` — Create payment intents
- `meter_ingest` — Track usage events

**Integration:**
```bash
cd packages/mcp-server
pnpm install && pnpm build

# Add to Claude Desktop config
# See packages/mcp-server/README.md for details
```

**Features:**
- ✅ Policy evaluation (whitelist/blacklist/rate limits)
- ✅ Payment intent creation
- ✅ Usage metering and analytics
- ✅ Claude Desktop integration
- ✅ Real-time counters (Redis)
- ✅ Historical data (PostgreSQL)

**Tech:** Node.js, Express, MCP SDK

---

### 🔍 A2A Card (Experimental)

**[📖 Full Documentation →](packages/a2a-card/README.md)** | **[A2A Overview →](docs/A2A_CARD.md)**

Discovery layer for agent-to-agent interoperability.

**Status:** Discovery-only, experimental

**Features:**
- 🔍 Static agent card at `/.well-known/agent-card.json`
- 🚫 Stubbed A2A endpoints (501 by default)
- 🔄 CORS-aware (card: allow, stubs: deny)
- ⚡ Cached with ETag support
- 🛡️ Rate-limited endpoints
- 📦 Portable (mount or serve standalone)

**Setup:**
```bash
# A2A is disabled by default
# Agent card is served automatically by registry

# To enable experimental A2A endpoints:
export ENABLE_A2A=true
```

**Why experimental?** The A2A protocol is still evolving. This package reserves URLs and provides discovery without over-promising protocol semantics. **Use MCP for real interop today.**

**Tech:** Node.js, Express

---

### 🎨 Registry Portal

**[📖 Full Documentation →](apps/registry-portal/README.md)**

**Location**: `apps/registry-portal/`

Unified application serving:
- **Marketing website** (openbotauth.org) - Public pages for publishers and crawlers
- **Portal UI** - Authenticated agent and key management

Runs on http://localhost:5173 in development.

**Marketing Pages:**
- `/` - Home page with hero section
- `/publishers` - Intent-based pricing for publishers
- `/crawlers` - Open registration for crawlers
- `/contact` - Contact information

**Portal Features:**
- GitHub OAuth login
- Ed25519 keypair generation
- Public key registration
- Agent management
- Profile viewing
- Key history

**Tech:** React, Vite, TypeScript, shadcn/ui, react-helmet-async

---

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run linter
pnpm lint

# Clean build artifacts
pnpm clean

# Start development servers
pnpm dev:service    # Registry service (port 8080)
pnpm dev:portal     # Portal UI (port 5173)
```

### Running Services

**Registry Service:**
```bash
cd packages/registry-service
pnpm dev
# Runs on http://localhost:8080
```

**Verifier Service:**
```bash
cd packages/verifier-service
pnpm dev
# Runs on http://localhost:8081
```

**Portal UI:**
```bash
cd apps/registry-portal
pnpm dev
# Runs on http://localhost:5173
```

**MCP Server:**
```bash
cd packages/mcp-server
pnpm dev
# Runs on http://localhost:8082
```

---

## Testing

### End-to-End Flow

1. **Start services:**
   ```bash
   # Terminal 1: Registry
   cd packages/registry-service && pnpm dev
   
   # Terminal 2: Verifier
   cd packages/verifier-service && pnpm dev
   
   # Terminal 3: Test server
   cd apps/test-server && pnpm dev
   ```

2. **Register keys via portal:**
   ```bash
   # Terminal 4: Portal
   cd apps/registry-portal && pnpm dev
   # Open http://localhost:5173
   # Login with GitHub
   # Generate and register keys
   ```

3. **Test with Bot CLI:**
   ```bash
   # Configure bot with your keys
   cd packages/bot-cli
   pnpm dev fetch http://localhost:3000/protected -v
   ```

See [SETUP.md](SETUP.md) for detailed testing instructions.

---

## Documentation

- **[SETUP.md](SETUP.md)** — Complete setup guide
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System architecture
- **[docs/A2A_CARD.md](docs/A2A_CARD.md)** — A2A discovery documentation
- **[packages/mcp-server/README.md](packages/mcp-server/README.md)** — MCP server guide
- **[plugins/wordpress-openbotauth/README.md](plugins/wordpress-openbotauth/README.md)** — WordPress plugin guide
- **[packages/a2a-card/README.md](packages/a2a-card/README.md)** — A2A card documentation

---

## Standards & Protocols

- **[RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html)** — HTTP Message Signatures
- **[RFC 7517](https://www.rfc-editor.org/rfc/rfc7517.html)** — JSON Web Key (JWK)
- **[RFC 7515](https://www.rfc-editor.org/rfc/rfc7515.html)** — JSON Web Signature (JWS)
- **[MCP](https://modelcontextprotocol.io/)** — Model Context Protocol
- **[Ed25519](https://ed25519.cr.yp.to/)** — EdDSA signature scheme

---

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5.7
- **Database:** Neon Postgres (serverless)
- **Cache:** Redis 7
- **Frontend:** React 18 + Vite 5
- **UI:** shadcn/ui + Tailwind CSS
- **Package Manager:** pnpm 8+
- **Cryptography:** Ed25519 (via Web Crypto API)

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- Built with [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html) HTTP Message Signatures
- Inspired by [Web-Bot-Auth](https://github.com/web-bot-auth)
- Uses [Neon](https://neon.tech) for serverless Postgres
- MCP integration via [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

---

**Made with ❤️ for the agent economy**
