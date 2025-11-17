# OpenBotAuth MCP Server

**Model Context Protocol server exposing OpenBotAuth policy, metering, and payment tools for AI agents.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/Node-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%2B-blue.svg)](https://www.typescriptlang.org/)

---

## 📖 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Tools](#tools)
- [Usage](#usage)
- [Claude Desktop Integration](#claude-desktop-integration)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Database Schema](#database-schema)

---

## 🎯 Overview

The **OpenBotAuth MCP Server** provides AI agents with tools to:

1. **Evaluate access policies** - Check if an agent can access a resource
2. **Create payment intents** - Generate payment URLs for paid content
3. **Ingest usage metrics** - Track agent activity for analytics

This enables AI agents (like Claude) to:
- ✅ Check access permissions before fetching content
- 💰 Handle payment flows for premium content
- 📊 Track their own usage and costs
- 🤝 Interact with OpenBotAuth-protected sites

---

## ✨ Features

### 🔐 Policy Evaluation (`policy_apply`)
- Check access permissions for agents
- Support for whitelists/blacklists
- Rate limiting enforcement
- Payment requirement detection
- Teaser content detection

### 💰 Payment Management (`payments_create_intent`)
- Create payment intents
- Generate payment URLs
- Track payment status
- Grant access after payment
- Support multiple currencies

### 📊 Usage Metering (`meter_ingest`)
- Track access events
- Record payment events
- Log denials and rate limits
- Real-time counters (Redis)
- Historical analytics (PostgreSQL)

---

## 📦 Installation

### Prerequisites

- Node.js 20+
- PostgreSQL (Neon or local)
- Redis
- pnpm

### Install

```bash
# From monorepo root
pnpm install

# Or install individually
cd packages/mcp-server
pnpm install
```

### Build

```bash
pnpm build
```

---

## ⚙️ Configuration

### Environment Variables

Create `.env` file:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/openbotauth

# Redis
REDIS_URL=redis://localhost:6379

# Payment Service
PAYMENT_BASE_URL=http://localhost:8082

# Server
NODE_ENV=development
```

### Database Setup

Run migrations to create required tables:

```sql
-- Policy logs
CREATE TABLE IF NOT EXISTS policy_logs (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  resource_url TEXT NOT NULL,
  effect TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment intents
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY,
  agent_id TEXT NOT NULL,
  resource_url TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  pay_url TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  paid_at TIMESTAMP
);

-- Meter events
CREATE TABLE IF NOT EXISTS meter_events (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  resource_url TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMP NOT NULL
);

-- Resource policies (optional)
CREATE TABLE IF NOT EXISTS resource_policies (
  id SERIAL PRIMARY KEY,
  resource_url TEXT UNIQUE NOT NULL,
  policy JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_policy_logs_agent ON policy_logs(agent_id);
CREATE INDEX idx_policy_logs_resource ON policy_logs(resource_url);
CREATE INDEX idx_payment_intents_agent ON payment_intents(agent_id);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_meter_events_agent ON meter_events(agent_id);
CREATE INDEX idx_meter_events_timestamp ON meter_events(timestamp);
```

---

## 🔧 Tools

### 1. `policy_apply`

Evaluate access policy for an agent and resource.

**Input:**
```json
{
  "agent_id": "http://localhost:8080/jwks/bot.json",
  "resource_url": "https://example.com/article/123",
  "resource_type": "post",
  "context": {}
}
```

**Output:**
```json
{
  "effect": "allow",
  "reason": "Agent whitelisted"
}
```

**Possible effects:**
- `allow` - Full access granted
- `deny` - Access denied
- `teaser` - Show preview only
- `pay` - Payment required
- `rate_limit` - Rate limit exceeded

---

### 2. `payments_create_intent`

Create a payment intent for resource access.

**Input:**
```json
{
  "agent_id": "http://localhost:8080/jwks/bot.json",
  "resource_url": "https://example.com/article/123",
  "amount_cents": 500,
  "currency": "USD",
  "metadata": {}
}
```

**Output:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "agent_id": "http://localhost:8080/jwks/bot.json",
  "resource_url": "https://example.com/article/123",
  "amount_cents": 500,
  "currency": "USD",
  "status": "pending",
  "pay_url": "http://localhost:8082/pay?intent_id=...",
  "created_at": "2025-11-17T00:00:00.000Z",
  "expires_at": "2025-11-18T00:00:00.000Z"
}
```

---

### 3. `meter_ingest`

Ingest a usage event for metering.

**Input:**
```json
{
  "agent_id": "http://localhost:8080/jwks/bot.json",
  "resource_url": "https://example.com/article/123",
  "event_type": "access",
  "metadata": {}
}
```

**Output:**
```json
{
  "agent_id": "http://localhost:8080/jwks/bot.json",
  "resource_url": "https://example.com/article/123",
  "event_type": "access",
  "metadata": {},
  "timestamp": "2025-11-17T00:00:00.000Z"
}
```

**Event types:**
- `access` - Resource accessed
- `payment` - Payment made
- `denial` - Access denied
- `rate_limit` - Rate limit hit

---

## 🚀 Usage

### Run Server

```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start
```

### Test with MCP Inspector

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Run inspector
mcp-inspector node dist/index.js
```

---

## 🤖 Claude Desktop Integration

### Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openbotauth": {
      "command": "node",
      "args": ["/path/to/openbotauth/packages/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/openbotauth",
        "REDIS_URL": "redis://localhost:6379",
        "PAYMENT_BASE_URL": "http://localhost:8082"
      }
    }
  }
}
```

### Restart Claude Desktop

The MCP server will now be available in Claude Desktop.

### Use in Claude

```
Can you check if I have access to https://example.com/article/123?
My agent ID is http://localhost:8080/jwks/mybot.json
```

Claude will use the `policy_apply` tool to check access.

---

## 📚 API Reference

### PolicyTool

```typescript
class PolicyTool {
  async apply(input: PolicyRequest): Promise<PolicyResult>
  private async getPolicy(resourceUrl: string): Promise<PolicyRule>
  private matchesPattern(agentId: string, patterns: string[]): boolean
  private async checkRateLimit(agentId: string, rateLimit: RateLimit): Promise<RateLimitResult>
  private async checkPayment(agentId: string, resourceUrl: string): Promise<boolean>
}
```

### PaymentsTool

```typescript
class PaymentsTool {
  async createIntent(input: CreatePaymentIntentRequest): Promise<PaymentIntent>
  async getIntent(intentId: string): Promise<PaymentIntent | null>
  async completePayment(intentId: string): Promise<void>
  async verifyReceipt(intentId: string, receipt: string): Promise<boolean>
  async listIntents(agentId: string, limit?: number): Promise<PaymentIntent[]>
}
```

### MeterTool

```typescript
class MeterTool {
  async ingest(input: MeterIngestRequest): Promise<MeterEvent>
  async getAgentStats(agentId: string): Promise<AgentStats>
  async getResourceStats(resourceUrl: string): Promise<ResourceStats>
  async getAgentDailyStats(agentId: string, days?: number): Promise<DailyStats[]>
  async queryEvents(filters: EventFilters): Promise<MeterEvent[]>
}
```

---

## 💡 Examples

### Example 1: Check Access

```typescript
// Claude asks: "Can I access this article?"
const result = await policy_apply({
  agent_id: "http://localhost:8080/jwks/claude.json",
  resource_url: "https://blog.example.com/premium-article"
});

// Result: { effect: "pay", price_cents: 500, currency: "USD" }
// Claude: "This article costs $5.00. Would you like me to create a payment?"
```

### Example 2: Create Payment

```typescript
// User: "Yes, please pay for it"
const intent = await payments_create_intent({
  agent_id: "http://localhost:8080/jwks/claude.json",
  resource_url: "https://blog.example.com/premium-article",
  amount_cents: 500,
  currency: "USD"
});

// Result: { id: "...", pay_url: "http://payment.example.com/pay?..." }
// Claude: "Payment link created: [pay_url]. Please complete payment to access."
```

### Example 3: Track Usage

```typescript
// After accessing content
await meter_ingest({
  agent_id: "http://localhost:8080/jwks/claude.json",
  resource_url: "https://blog.example.com/premium-article",
  event_type: "access"
});

// Result: Event logged
// Claude: "Access logged for analytics"
```

---

## 🗄️ Database Schema

### policy_logs

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| agent_id | TEXT | Agent identifier |
| resource_url | TEXT | Resource URL |
| effect | TEXT | Policy effect (allow/deny/etc) |
| reason | TEXT | Reason for effect |
| created_at | TIMESTAMP | When logged |

### payment_intents

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| agent_id | TEXT | Agent identifier |
| resource_url | TEXT | Resource URL |
| amount_cents | INTEGER | Amount in cents |
| currency | TEXT | Currency code |
| status | TEXT | pending/paid/failed/expired |
| pay_url | TEXT | Payment URL |
| metadata | JSONB | Additional data |
| created_at | TIMESTAMP | When created |
| expires_at | TIMESTAMP | When expires |
| paid_at | TIMESTAMP | When paid |

### meter_events

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| agent_id | TEXT | Agent identifier |
| resource_url | TEXT | Resource URL |
| event_type | TEXT | access/payment/denial/rate_limit |
| metadata | JSONB | Additional data |
| timestamp | TIMESTAMP | When occurred |

### resource_policies

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| resource_url | TEXT | Resource URL (unique) |
| policy | JSONB | Policy configuration |
| created_at | TIMESTAMP | When created |
| updated_at | TIMESTAMP | When updated |

---

## 🧪 Testing

### Unit Tests

```bash
pnpm test
```

### Integration Tests

```bash
# Start dependencies
docker-compose up -d postgres redis

# Run tests
pnpm test:integration
```

### Manual Testing

```bash
# Start server
pnpm dev

# In another terminal, use MCP Inspector
mcp-inspector node dist/index.js

# Or use the example client
node examples/test-client.js
```

---

## 🔗 Links

- **Main Project**: [github.com/hammadtq/openbotauth](https://github.com/hammadtq/openbotauth)
- **MCP SDK**: [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- **Claude Desktop**: [claude.ai/desktop](https://claude.ai/desktop)

---

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details

---

**Made with ❤️ by the OpenBotAuth team**

