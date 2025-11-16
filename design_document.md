Here’s a crisp, build-ready design doc you can drop into Cursor/Codex to bootstrap the repo and align the agent on scope, APIs, and file layout.

# OpenBotAuth — Minimal Defensible Surface (v0.1)

**Goal:** Ship a production-lean MVP that proves:

1. **Agent identity over HTTP** (RFC 9421 + Signature-Agent → JWKS via OpenBotRegistry),
2. **Origin-side verification** (sidecar) + **granular policy & pricing** (WordPress plugin),
3. **Interop hooks** via a minimal **MCP server** (policy/meter/payments) and **A2A Agent Card** (discovery stub).

> We intentionally **do not** ship a CDN dependency. The sidecar + plugin work with any origin behind NGINX/Caddy/Envoy.

---

## 0) Repo Layout (monorepo)

```
openbotauth/
├─ packages/
│  ├─ verifier-service/        # Node/TS service; verifies RFC 9421 + JWKS; nonce cache
│  ├─ mcp-server/              # Node/TS MCP server exposing policy/meter/payments tools
│  ├─ a2a-card/                # Static/.well-known agent-card + tiny A2A stub endpoint
│  └─ bot-cli/                 # Demo crawler: signs requests, handles 402 + receipt retry
├─ plugins/
│  └─ wordpress-openbotauth/   # WP plugin (PHP) for policy, pricing, analytics, receipts
├─ examples/
│  └─ wp-site/                 # Dockerized WordPress demo wired to verifier + plugin
├─ infra/
│  ├─ docker/                  # Dockerfiles, docker-compose.yaml
│  └─ k8s/                     # (optional) Helm/k8s manifests
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ POLICY_SCHEMA.md
│  ├─ API.md
│  └─ A2A_CARD.md
└─ package.json
```

**Tech choices**

* Services: **Node 20 + TypeScript**, Express, undici.
* Crypto/Verifier: use **`web-bot-auth`** npm (draft-compatible) for RFC 9421 parsing + HMS directory resolution; wrap with our policy + caching.
* Cache: Redis (nonce + JWKS cache + payment receipts).
* WP plugin: PHP 8.2+, sodium for Ed25519 verify (if needed).
* Build: pnpm workspaces.
* Lint/test: eslint, vitest.

---

## 1) Contracts & Protocol

### 1.1 HTTP signature (incoming to origin)

Agent includes:

```
Signature-Input: sig1=("@method" "@authority" "@path" "signature-agent");created=...;expires=...;nonce="...";keyid="kid-123";alg="ed25519";tag="web-bot-auth"
Signature: sig1=:BASE64URLSIG:
Signature-Agent: https://openbotregistry.example.com/jwks/{agent_id}.json
```

**Verifier MUST:**

* Fetch/resolve **Signature-Agent** → JWKS (cache by `kid`/ETag).
* Verify timestamps (±300s skew) + **nonce replay**.
* Verify Ed25519 signature over the covered components.
* Return policy context for downstream (headers).

### 1.2 Trusted headers (from sidecar → app)

Strip any inbound `X-OBAuth-*` from clients. Sidecar sets:

```
X-OBAuth-Verified: 1
X-OBAuth-Agent-KID: kid-123
X-OBAuth-Agent-JWKS: https://openbotregistry.example.com/jwks/{agent_id}.json
X-OBAuth-Intent: crawl|index|train|…
X-OBAuth-Pay-State: none|required|ok
```

### 1.3 402 payment loop (origin → agent)

When policy requires payment:

```
HTTP/1.1 402 Payment Required
OpenBotAuth-Price: 10.00 USD
OpenBotAuth-Request-Hash: <sha256(method|path|created|kid)>
Link: <https://pay.openbotauth.org/i/{request_hash}>; rel="payment"
```

On success, bot retries with:

```
OpenBotAuth-Receipt: <opaque signed receipt or token>
```

Sidecar/Plugin verifies receipt (either locally signed JWT or via x402/Locus verify endpoint) and sets `X-OBAuth-Pay-State: ok`.

---

## 2) Verifier Service (packages/verifier-service)

**Responsibilities**

* Parse & verify RFC 9421 + Signature-Agent (using `web-bot-auth`).
* Nonce replay protection (Redis).
* JWKS caching with TTL/ETag, keyed by agent JWKS URL + `kid`.
* Policy entry point (path/method/directory host) → verdict: `allow|pay|required|deny|rate_limit`.
* Emit analytics events.

**HTTP API**

```
POST /authorize
Headers: (original request headers proxied by NGINX)
Body: optional raw body (for content-digest in future)

Response:
  200 { verdict, pay, agent, created, expires }
  401 { error }  # invalid/missing sig
  429 { retry_after }  # rate-limited
  402 { price, request_hash, pay_url }  # if we move 402 upstream to sidecar
```

**Config (ENV)**

```
REDIS_URL=redis://...
OB_TRUSTED_DIRECTORIES=openbotregistry.example.com,anotherdir.org
OB_MAX_SKEW_SEC=300
OB_NONCE_TTL_SEC=600
OB_REQUIRE_TAG=web-bot-auth
```

**NGINX wiring (external auth)**

```nginx
location / {
  auth_request /_oba_check;
  proxy_pass http://wp_upstream;
}

location = /_oba_check {
  internal;
  proxy_pass http://verifier:8081/authorize;
  proxy_set_header X-Original-Method $request_method;
  proxy_set_header X-Original-Host   $host;
  proxy_set_header X-Original-Uri    $request_uri;
  proxy_set_header Signature-Input   $http_signature_input;
  proxy_set_header Signature         $http_signature;
  proxy_set_header Signature-Agent   $http_signature_agent;
  proxy_set_header OpenBotAuth-Receipt $http_openbotauth_receipt;
  proxy_pass_request_body off;
}
```

**Verdict → headers**

* On 200 allow: add `X-OBAuth-*` headers for app.
* On pay: either return 200 (let WP return 402), or the sidecar can return 402 itself (choose one mode via env flag).

---

## 3) WordPress Plugin (plugins/wordpress-openbotauth)

**Responsibilities**

* Admin UI for policy & pricing.
* Evaluate **granular rules** (category/tag/date/time/custom fields).
* Return **teasers, 402, 403** as needed.
* Emit analytics + receipts association.

**Hooks**

* `template_redirect` (priority 0): early gate.
* `the_content`: teaser shaping (if allowed but unpaid).
* REST: `/wp-json/openbotauth/v1/policy` (optional export for edge-only enforcement).

**Policy schema (docs/POLICY_SCHEMA.md)**

```yaml
directories:
  - host: openbotregistry.example.com
    trust: high
rules:
  - when: { tag: "friday-premium", weekday: 5 }
    effect: pay
    price_cents: 1000
    unlock: "next_friday_00:00Z"
  - when: { category: "blog" }
    effect: allow
default:
  effect: anon_teaser
  teaser_words: 120
```

**Runtime logic (pseudocode)**

```
if !X-OBAuth-Verified:
  apply anonymous rules (teaser/deny)
else:
  derive post context (tags/category/date)
  apply rules:
    allow → serve 200
    pay → 402 w/ Link rel=payment and request_hash
    deny → 403
    rate_limit → 429
```

**Settings stored in WP**

* `openbotauth_policy` (YAML/JSON)
* per post meta: `oba_effect`, `oba_price_cents`, `oba_unlock_at`

---

## 4) MCP Server (packages/mcp-server)

**Purpose:** Interop. Let any MCP-capable agent (Cloudflare Agents SDK, LangGraph, IDEs) call your policy/payments/metering without bespoke adapters.

**Tools**

* `policy.apply({ path, method, jwks_host, kid, time }) -> { effect, price_cents, unlock_at }`
* `payments.create_intent({ request_hash, amount_cents, currency }) -> { pay_url, receipt_hint }`
* `meter.ingest({ event: { ts, path, effect, bytes, agent_kid }}) -> { ok }`

**Transport**

* MCP over **Streamable HTTP** (and SSE fallback).

**Auth**

* Accept **HTTP Message Signatures** (same registry keys) or static bearer for demo.

---

## 5) A2A Agent Card (packages/a2a-card)

**Static** `/.well-known/agent-card.json` (docs/A2A_CARD.md):

```json
{
  "agent": {
    "name": "OpenBotAuth Verifier",
    "version": "0.1.0"
  },
  "endpoints": {
    "a2a": "https://example.com/a2a",
    "mcp": "https://example.com/mcp"
  },
  "auth": {
    "http-signatures": {
      "signature-agent": "required",
      "alg": ["ed25519"]
    }
  },
  "capabilities": [
    "policy.apply",
    "payments.create_intent",
    "meter.ingest"
  ]
}
```

**A2A stub**

* `POST /a2a/tasks/create` → 202 + task id (no heavy protocol; placeholder).
* `GET /a2a/tasks/{id}/events` → stream (Server-Sent Events) for demo.

(When A2A hardens, we’ll implement the official spec here without breaking changes.)

---

## 6) Bot CLI (packages/bot-cli)

**Demo crawler**

* Generates/loads Ed25519 keypair (or reuses the one minted by your GitHub SSO signer).
* Signs HTTP per RFC 9421 (include nonce, created, expires).
* Sets `Signature-Agent` to OpenBotRegistry JWKS URL.
* On **402**, follows `Link rel=payment`, obtains receipt (mock or x402/Locus sandbox), retries with `OpenBotAuth-Receipt`.

CLI:

```
oba-bot fetch https://demo.local/2025/11/friday-post
```

---

## 7) OpenBotRegistry (existing)

**Assumptions**

* Already issues or registers **JWKS** keyed by SSO (GitHub) and exposes stable URLs.
* For MVP we **do not** custody private keys in the registry; signer helps users generate keys locally, uploads public key.
* JWKS shape expected:

```json
{"keys":[{"kty":"OKP","crv":"Ed25519","kid":"kid-123","x":"...","use":"sig","alg":"EdDSA"}]}
```

If the current implementation lives in the frontend, move the **JWKS publish & validation** into a small backend (Supabase Edge Function or Node service) so URLs are stable and cacheable. Keep key generation client-side.

---

## 8) Security & Performance

* **Fail-closed**: verifier returns 401 on any verify/cache error.
* **Nonce replay**: Redis set with TTL; reject duplicates within window.
* **Clock skew**: default ±300s; configurable.
* **JWKS caching**: honor ETag/Cache-Control; purge on 4xx/5xx backoff.
* **Header scrubbing**: remove inbound `X-OBAuth-*` at edge.
* **Caching (content)**: send `Vary: Signature-Agent, X-OBAuth-Agent-KID, X-OBAuth-Pay-State` on priced/teaser routes.
* **Logging**: structured JSON; never log full signatures or receipts—only hashes and KIDs.

---

## 9) Local Dev: docker-compose

```
services:
  redis:
    image: redis:7-alpine
  verifier:
    build: ./packages/verifier-service
    env_file: .env
    depends_on: [redis]
    ports: ["8081:8081"]
  mcp:
    build: ./packages/mcp-server
    ports: ["8082:8082"]
  a2a:
    build: ./packages/a2a-card
    ports: ["8083:8083"]
  wp:
    build: ./examples/wp-site
    depends_on: [verifier]
    ports: ["8080:80"]
```

---

## 10) Milestones (2–3 day burst)

**Day 1**

* Scaffold repo (pnpm workspaces).
* Verifier service with `POST /authorize` + Redis nonce + JWKS cache.
* NGINX auth_request wiring; hello-world acceptance test.

**Day 2**

* WP plugin: settings page (policy editor), `template_redirect` gate, teaser via `the_content`.
* 402 payment flow (mock receipt service), analytics counters.

**Day 3**

* MCP server (3 tools) + Agent Card stub.
* Bot CLI (sign → fetch → 402 → pay → retry).
* Demo script + screenshots; docs updated.

---

## 11) Acceptance Tests

* **Valid signed request → 200** (policy allow).
* **Missing signature → teaser or 403** (per policy).
* **Replay (same nonce) → 401**.
* **Expired signature → 401**.
* **Friday-tag post**: before unlock → 402 with price; after unlock → 200 free.
* **Receipt mismatch (request_hash) → 401**.
* **JWKS rotation (`kid` change)** → still functions after cache refresh.

---

## 12) Code Stubs (for Cursor to expand)

**packages/verifier-service/src/server.ts**

```ts
import express from "express";
import { verifyRequest } from "web-bot-auth";
import Redis from "ioredis";

const app = express();
app.use(express.text({ type: "*/*", limit: "1mb" })); // if we later sign bodies

const redis = new Redis(process.env.REDIS_URL!);

app.post("/authorize", async (req, res) => {
  try {
    const sigInput = req.header("Signature-Input");
    const sig = req.header("Signature");
    const sigAgent = req.header("Signature-Agent");
    if (!sigInput || !sig || !sigAgent) return res.status(401).json({ error: "missing" });

    // Replay window
    const nonce = /;nonce="([^"]+)"/.exec(sigInput)?.[1];
    if (!nonce) return res.status(401).json({ error: "nonce" });
    const set = await redis.set(`nonce:${nonce}`, "1", "EX", 600, "NX");
    if (!set) return res.status(401).json({ error: "replay" });

    const verdict = await verifyRequest(req, {
      requiredTag: process.env.OB_REQUIRE_TAG || "web-bot-auth",
      maxSkewSec: Number(process.env.OB_MAX_SKEW_SEC || 300),
      directoryFetch: async (url) => {
        const r = await fetch(url, { headers: { "User-Agent": "OpenBotAuth/0.1" }});
        if (!r.ok) throw new Error("dir fetch");
        return r.json();
      }
    });

    // Simple directory trust
    const host = new URL(verdict.agentJwksUrl).host;
    const trusted = (process.env.OB_TRUSTED_DIRECTORIES || "").split(",").map(s => s.trim());
    const allow = verdict.valid && trusted.includes(host);

    if (!allow) return res.status(401).json({ error: "untrusted" });

    // Hand off context via headers
    res.setHeader("X-OBAuth-Verified", "1");
    res.setHeader("X-OBAuth-Agent-KID", verdict.keyId || "");
    res.setHeader("X-OBAuth-Agent-JWKS", verdict.agentJwksUrl);
    return res.status(200).json({ verdict: "allow", agent: verdict.agentJwksUrl });
  } catch (e) {
    return res.status(401).json({ error: "verify" });
  }
});

app.listen(8081);
```

**plugins/wordpress-openbotauth/openbotauth.php** (skeleton)

```php
<?php
/*
Plugin Name: OpenBotAuth Policy
*/

add_action('admin_menu', function () {
  add_options_page('OpenBotAuth', 'OpenBotAuth', 'manage_options', 'openbotauth', 'oba_settings_page');
});
function oba_settings_page(){ /* textarea for YAML + save */ }

add_action('template_redirect', function () {
  $verified = $_SERVER['HTTP_X_OBAUTH_VERIFIED'] ?? '';
  $kid = $_SERVER['HTTP_X_OBAUTH_AGENT_KID'] ?? '';
  $jwks = $_SERVER['HTTP_X_OBAUTH_AGENT_JWKS'] ?? '';
  $path = $_SERVER['REQUEST_URI'] ?? '/';

  // Load policy YAML from options, evaluate (tag/category/time)
  $effect = oba_evaluate_policy($path, $verified, $kid, $jwks);

  if ($effect['type'] === 'pay') {
    header('OpenBotAuth-Price: '.$effect['price'].' USD');
    header('OpenBotAuth-Request-Hash: '. hash('sha256', $_SERVER['REQUEST_METHOD'].$path.$kid));
    header('Link: <https://pay.openbotauth.org/i/'.md5($path.$kid).'>; rel="payment"');
    status_header(402);
    exit;
  }
  if ($effect['type'] === 'deny') { status_header(403); exit; }
  // allow or teaser handled by the_content filter if needed
});

add_filter('the_content', function($content){
  $teaser = get_option('openbotauth_teaser_words', 120);
  $verified = $_SERVER['HTTP_X_OBAUTH_VERIFIED'] ?? '';
  if (!$verified) return wp_trim_words($content, $teaser);
  return $content;
});
```

---

## 13) Open Questions / V2

* Receipt format (JWT vs x402/Locus native token).
* Byte-metered pricing vs per-request.
* Directory governance metadata (KYA levels) without creating a “root.”
* Edge enforcement of teaser (HTML rewrite) vs app-level only.
* A2A final spec mapping.

---

**Owner notes for Cursor/Codex**

* Respect folder layout above; generate TypeScript scaffolds and PHP plugin as shown.
* Prefer `web-bot-auth` lib where possible instead of implementing RFC 9421 from scratch.
* Add unit tests for nonce replay, skew, JWKS cache.
* Compose a working demo with `docker-compose` that serves a WP post tagged `friday-premium` and validates the paywall flow end-to-end with `bot-cli`.

That’s everything needed to start coding immediately.
