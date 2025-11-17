# OpenBotAuth A2A Card

**Experimental A2A (Agent-to-Agent) discovery layer with static agent card and stubbed endpoints.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Status](https://img.shields.io/badge/Status-Experimental-yellow.svg)](https://github.com/hammadtq/openbotauth)

---

## Status

**Discovery-only. Endpoints return 501 unless `ENABLE_A2A=true`. Use MCP for real interop today.**

This package provides:
- Static agent card at `/.well-known/agent-card.json`
- Stubbed A2A endpoints (experimental)
- Future-proof URL reservation

---

## Overview

The A2A Card is a **discovery document** that tells other agents:
- What the service is
- What endpoints it exposes (MCP, A2A)
- What authentication it requires
- What capabilities it has

Think of it as a **business card for agents**.

---

## Features

- **Static Agent Card** - JSON discovery document
- **501 by default** - A2A endpoints disabled unless explicitly enabled
- **CORS-aware** - Card allows cross-origin, stubs don't
- **Cached** - In-process cache with ETag support
- **Rate-limited** - Protects stub endpoints from abuse
- **Portable** - Mount in registry or serve standalone
- **Standards-friendly** - References HTTP Message Signatures, JWKS

---

## Installation

```bash
# From monorepo root
pnpm install

# Or install individually
cd packages/a2a-card
pnpm install
```

---

## Usage

### Mount in Express App

```typescript
import express from 'express';
import { mountAgentCard } from '@openbotauth/a2a-card';

const app = express();

mountAgentCard(app, {
  jwksUrl: 'http://localhost:8080/jwks/openbotauth.json',
  mcpUrl: 'http://localhost:8082',
  a2aUrl: 'http://localhost:8080',
  enableA2A: false, // 501 by default
});

app.listen(8080);
```

### Serve Standalone

```bash
# Copy static file to web server
cp static/agent-card.json /var/www/.well-known/

# Or use any static file server
npx serve static
```

---

## Configuration

### Environment Variables

```bash
# A2A
ENABLE_A2A=false                  # Default: disabled (501 responses)
A2A_BASE_URL=http://localhost:8080
AGENTCARD_ENABLE=true
AGENTCARD_PATH=/.well-known/agent-card.json

# Auth
AGENTCARD_JWKS_URL=http://localhost:8080/jwks/openbotauth.json
AGENTCARD_AUTH_SCHEMES=http-signatures
AGENTCARD_SIG_ALGS=ed25519

# Metadata
AGENTCARD_CONTACT=security@openbotauth.org
AGENTCARD_DOCS_URL=https://docs.openbotauth.org/a2a

# MCP
MCP_BASE_URL=http://localhost:8082
```

### Configuration Validation

The package validates configuration on startup:
- JWKS URL must be absolute HTTPS in production
- If `ENABLE_A2A=true`, `A2A_BASE_URL` must be set
- URL formats validated
- Algorithm names validated

---

## Agent Card Schema

```json
{
  "schema": "a2a-agent-card",
  "version": "0.1.0-draft",
  "agent": {
    "name": "OpenBotAuth Service",
    "version": "0.1.0"
  },
  "endpoints": {
    "mcp": "http://localhost:8082",
    "a2a": null
  },
  "experimental": {
    "a2a": false
  },
  "auth": {
    "http-signatures": {
      "signature-agent": "http://localhost:8080/jwks/openbotauth.json",
      "alg": ["ed25519"]
    }
  },
  "capabilities": [
    "policy.apply",
    "payments.create_intent",
    "meter.ingest"
  ],
  "metadata": {
    "contact": "security@openbotauth.org",
    "docs": "https://docs.openbotauth.org/a2a",
    "updated_at": "2025-11-17T00:00:00.000Z"
  }
}
```

---

## Endpoints

### Agent Card

**`GET /.well-known/agent-card.json`**

Returns the agent card with proper headers:
- `Content-Type: application/json; profile="https://openbotauth.org/schemas/a2a-agent-card/0.1.0"`
- `Cache-Control: public, max-age=3600`
- `ETag: "<hash>"`
- `Access-Control-Allow-Origin: *`
- `Link: </.well-known/agent-card.json>; rel="a2a-agent"` (on root)

**Response**: 200 OK with agent card JSON

**304 Not Modified**: If `If-None-Match` matches ETag

---

### A2A Stubs (Experimental)

**`POST /a2a/tasks/create`**

**When disabled** (`ENABLE_A2A=false`):
```json
{
  "experimental": true,
  "message": "A2A endpoints are experimental and currently disabled. Set ENABLE_A2A=true to enable."
}
```
**Status**: 501 Not Implemented

**When enabled** (`ENABLE_A2A=true`):
```json
{
  "task_id": "t_550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "created_at": "2025-11-17T00:00:00.000Z"
}
```
**Status**: 202 Accepted

---

**`GET /a2a/tasks/:id/events`**

**When disabled**: 501 Not Implemented

**When enabled**: Server-Sent Events (SSE) stream
- Heartbeat every 15 seconds
- Timeout after 2 minutes
- Format: `event: heartbeat\ndata: {"ts": 1731720000}\n\n`

---

## Security

### CORS

- **Agent Card**: Cross-origin GET allowed (discovery)
- **A2A Stubs**: No CORS (same-origin only)

### Rate Limiting

- 10 requests per minute per IP
- Applied to all A2A endpoints (even 501 responses)
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429 Too Many Requests when exceeded

### Caching

- In-process cache (1 minute TTL)
- ETag generation from content hash
- 304 Not Modified support

---

## API Reference

### `mountAgentCard(app, config)`

Mount agent card and A2A endpoints in Express app.

**Parameters**:
- `app`: Express application
- `config`: AgentCardConfig object

**Returns**: void

**Example**:
```typescript
mountAgentCard(app, {
  jwksUrl: 'http://localhost:8080/jwks/openbotauth.json',
  mcpUrl: 'http://localhost:8082',
  a2aUrl: 'http://localhost:8080',
  enableA2A: false,
});
```

### `generateAgentCard(config)`

Generate agent card from configuration.

**Parameters**:
- `config`: AgentCardConfig object

**Returns**: AgentCard object

### `validateAgentCard(card)`

Validate agent card against schema.

**Parameters**:
- `card`: Agent card object

**Returns**: `{ valid: boolean, errors?: string[] }`

### `loadAndValidateConfig()`

Load configuration from environment and validate (throws on error).

**Returns**: AgentCardConfig object

---

## Testing

### Unit Tests

```bash
pnpm test
```

### Manual Testing

```bash
# Start registry with A2A card
cd packages/registry-service
pnpm dev

# Test agent card
curl http://localhost:8080/.well-known/agent-card.json

# Test A2A stub (disabled)
curl -X POST http://localhost:8080/a2a/tasks/create
# Returns 501

# Enable A2A
export ENABLE_A2A=true
pnpm dev

# Test A2A stub (enabled)
curl -X POST http://localhost:8080/a2a/tasks/create
# Returns 202 with task_id
```

---

## Why Experimental?

The A2A protocol is still evolving. This package:
- **Reserves URLs** for future implementation
- **Provides discovery** today
- **Avoids over-promising** protocol semantics
- **Enables interop** when spec stabilizes

**For real interop today, use the MCP server.**

---

## Roadmap

When the A2A protocol stabilizes:
1. Implement full task creation semantics
2. Add task status tracking
3. Implement event streaming
4. Add authentication/authorization
5. Support A2A protocol extensions

Until then, this package provides **discovery only**.

---

## Links

- **Main Project**: [github.com/OpenBotAuth/openbotauth](https://github.com/OpenBotAuth/openbotauth)
- **MCP Server**: [packages/mcp-server](../mcp-server)
- **Registry Service**: [packages/registry-service](../registry-service)
- **A2A Documentation**: [docs/A2A_CARD.md](../../docs/A2A_CARD.md)

---

## License

MIT License - see [LICENSE](../../LICENSE) for details

---

**Made with ❤️ by the OpenBotAuth team**

