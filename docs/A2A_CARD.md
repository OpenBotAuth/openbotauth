# A2A Agent Card

## Status

**Discovery-only. Endpoints return 501 unless `ENABLE_A2A=true`. Use MCP for real interop today.**

---

## What is A2A?

**A2A (Agent-to-Agent)** is an emerging protocol for agents to discover and interact with each other. The **Agent Card** is a discovery document that tells other agents:

- What services are available
- How to authenticate
- What capabilities are supported
- Where to find documentation

Think of it as a **business card for AI agents**.

---

## Current Implementation

OpenBotAuth ships a **minimal, experimental A2A implementation**:

### What We Have

1. **Static Agent Card** at `/.well-known/agent-card.json`
   - Discovery document in JSON format
   - References JWKS for authentication
   - Lists MCP and A2A endpoints
   - Includes metadata (contact, docs)

2. **Stubbed A2A Endpoints**
   - `POST /a2a/tasks/create` - Returns 501 by default
   - `GET /a2a/tasks/:id/events` - Returns 501 by default
   - Can be enabled with `ENABLE_A2A=true` flag

3. **URL Reservation**
   - Reserves `/a2a/*` URLs for future use
   - No breaking changes when full protocol lands

### What We Don't Have

- Full A2A protocol implementation
- Task semantics
- Event streaming (beyond heartbeat)
- A2A-specific authentication
- Protocol extensions

---

## Why Discovery-Only?

The A2A protocol is **still evolving**. By shipping discovery-only, we:

1. **Reserve URLs** - No breaking changes later
2. **Signal standards awareness** - We're tracking A2A
3. **Enable future interop** - Easy to upgrade when spec stabilizes
4. **Avoid over-promising** - No incomplete protocol semantics
5. **Focus on MCP** - Real interop works today via MCP

---

## Architecture

```
┌─────────────────┐
│   AI Agent      │
│   (Discovery)   │
└────────┬────────┘
         │ 1. Fetch /.well-known/agent-card.json
         ▼
┌─────────────────┐
│  OpenBotAuth    │
│  Registry       │
└────────┬────────┘
         │ 2. Return agent card
         │    - MCP endpoint: http://localhost:8082
         │    - A2A endpoint: null (disabled)
         │    - JWKS URL: http://localhost:8080/jwks/...
         │    - Capabilities: policy.apply, payments, meter
         ▼
┌─────────────────┐
│   AI Agent      │
│   (Uses MCP)    │
└─────────────────┘
```

**Today**: Agents discover via card, use MCP for interop

**Future**: Agents discover via card, use A2A for agent-to-agent tasks

---

## Agent Card Schema

The agent card follows this structure:

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

### Key Fields

- **schema**: Always `"a2a-agent-card"`
- **version**: Schema version (`"0.1.0-draft"`)
- **agent**: Service name and version
- **endpoints**: MCP and A2A URLs (A2A is `null` when disabled)
- **experimental**: Flags for experimental features
- **auth**: Authentication requirements (HTTP Message Signatures)
- **capabilities**: List of supported operations
- **metadata**: Contact, docs, last updated

---

## Relationship to MCP

**MCP (Model Context Protocol)** and **A2A (Agent-to-Agent)** serve different purposes:

### MCP
- **Purpose**: Tool-level interop (Claude, LangChain, etc.)
- **Use case**: AI agents calling tools (policy, payments, meter)
- **Status**: **Working today** ✅
- **Transport**: Stdio, HTTP
- **Discovery**: Via config files

### A2A
- **Purpose**: Agent-to-agent task delegation
- **Use case**: One agent asking another to perform a task
- **Status**: **Experimental** ⚠️
- **Transport**: HTTP, SSE
- **Discovery**: Via agent card

**Today**: Use MCP for real interop
**Future**: Use A2A for agent-to-agent workflows

---

## Enabling A2A (Experimental)

To enable the experimental A2A endpoints:

```bash
# Set environment variable
export ENABLE_A2A=true

# Restart registry service
cd packages/registry-service
pnpm dev
```

**Endpoints will now return 202 instead of 501**:

```bash
# Create task
curl -X POST http://localhost:8080/a2a/tasks/create
# Returns: {"task_id": "t_...", "status": "pending", ...}

# Stream events
curl http://localhost:8080/a2a/tasks/t_.../events
# Returns: SSE stream with heartbeats
```

**Note**: This is a **minimal stub** for testing. No real task semantics.

---

## Future Roadmap

When the A2A protocol stabilizes, we'll implement:

1. **Full Task Semantics**
   - Task creation with parameters
   - Task status tracking
   - Task cancellation
   - Task results

2. **Event Streaming**
   - Real-time task updates
   - Progress notifications
   - Error reporting

3. **Authentication**
   - HTTP Message Signatures for A2A
   - Agent identity verification
   - Permission checks

4. **Protocol Extensions**
   - Custom task types
   - Streaming responses
   - Bidirectional communication

Until then: **Use MCP for real interop**.

---

## Standards & References

- **HTTP Message Signatures**: [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html)
- **JWKS**: [RFC 7517](https://www.rfc-editor.org/rfc/rfc7517.html)
- **MCP**: [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- **A2A**: Emerging standard (watch this space)

---

## FAQ

### Q: Should I use A2A or MCP?

**A**: Use **MCP** today. A2A is experimental.

### Q: When will A2A be production-ready?

**A**: When the A2A protocol spec stabilizes. We're tracking it closely.

### Q: Can I build on the A2A stubs?

**A**: Not recommended. They're placeholders. Use MCP for real work.

### Q: What if I enable A2A?

**A**: You get minimal stubs (202 + task ID, SSE heartbeat). No real semantics.

### Q: Will enabling A2A break anything?

**A**: No, but it doesn't add real functionality either. It's for testing discovery.

### Q: How do I discover services?

**A**: Fetch `/.well-known/agent-card.json` from any OpenBotAuth service.

---

## Links

- **A2A Card Package**: [packages/a2a-card](../packages/a2a-card)
- **MCP Server**: [packages/mcp-server](../packages/mcp-server)
- **Main README**: [README.md](../README.md)

---

**Status**: Experimental - Discovery only - Use MCP for real interop

