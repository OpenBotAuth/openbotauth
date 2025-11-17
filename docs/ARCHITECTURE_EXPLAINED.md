# 🏗️ OpenBotAuth Architecture Explained

## The Problem We're Solving

**Scenario:** You have a WordPress blog. An AI bot (like GPT, Claude, or a web crawler) wants to read your content. You want to:
1. Know WHO is accessing your content
2. Control WHAT they can access
3. Charge for premium content
4. Prevent abuse (rate limiting, replay attacks)

## The Solution: OpenBotAuth

OpenBotAuth uses **HTTP Message Signatures (RFC 9421)** to verify bot identity without passwords or API keys.

## 🔑 Key Concept: Public-Key Cryptography

Think of it like a signature on a check:

```
Bot has:                  Registry has:
├─ Private Key            ├─ Public Key
│  (like a pen)           │  (like a signature sample)
│                         │
└─ Signs requests         └─ Verifies signatures
   with private key          using public key
```

**The bot NEVER sends its private key!**

## 🎭 The Actors

### 1. **You (Content Owner)**
- Register in OpenBotAuth
- Generate Ed25519 key pair
- Register PUBLIC key in registry
- Configure WordPress with policies

### 2. **The Bot/Agent** (e.g., GPT, Claude, web crawler)
- Has its own private key
- Claims to be authorized by you
- Signs every request with its private key
- Includes your JWKS URL in headers

### 3. **Registry Service** (OpenBotAuth)
- Hosts your public key at `/jwks/yourname.json`
- Anyone can fetch this public key
- Used by verifiers to check signatures

### 4. **Verifier Service**
- Checks if bot's signature is valid
- Fetches public key from registry
- Verifies signature matches
- Checks for replay attacks

### 5. **Your WordPress Site**
- Protected by verifier
- Applies policies (allow/pay/deny)
- Serves content if authorized

## 🔄 The Complete Flow

### Phase 1: Setup (One Time)

```
┌─────────────────────────────────────────────────────────────────┐
│ YOU (Content Owner)                                              │
└─────────────────────────────────────────────────────────────────┘

1. Go to http://localhost:5173 (OpenBotAuth Portal)
2. Sign in with GitHub
3. Click "Generate New Key Pair"
   ├─ Portal generates Ed25519 key pair
   ├─ Shows you the PRIVATE KEY (copy and save it!)
   └─ Registers PUBLIC KEY in database

4. Your public key is now available at:
   http://localhost:8080/jwks/hammadtq.json

   {
     "client_name": "hammadtq",
     "keys": [{
       "kty": "OKP",
       "crv": "Ed25519",
       "kid": "3312fbbe-4e79-4b06-8d88-c6aa78b81d4a",
       "x": "MCowBQYDK2VwAyEA...",  ← PUBLIC KEY
       "use": "sig"
     }]
   }

┌─────────────────────────────────────────────────────────────────┐
│ BOT/AGENT                                                        │
└─────────────────────────────────────────────────────────────────┘

The bot needs to be configured with YOUR private key:

Option A: You give the bot your private key (if it's YOUR bot)
Option B: The bot generates its own keys and you register them

For testing, we use Option A:
  cd packages/bot-cli
  # Configure with YOUR private key
  node ../setup-bot-from-db.js
```

### Phase 2: Every Request

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Bot Makes Request                                        │
└─────────────────────────────────────────────────────────────────┘

Bot CLI:
  $ pnpm dev fetch http://example.com/article

  1. Loads private key from ~/.openbotauth/bot-config.json
  2. Builds signature base:
     "@method": GET
     "@path": /article
     "@authority": example.com
     "@signature-params": ...;created=1763282275;nonce="abc123";...

  3. Signs with private key using Ed25519
  4. Adds headers:
     Signature-Input: sig1=("@method" "@path" "@authority");...
     Signature: sig1=:K2qGT5srn2OGbOIDzQ6kYT+ruaycnDAAUpKv+ePFfD0=:
     Signature-Agent: http://localhost:8080/jwks/hammadtq.json
                      ↑
                      This tells the verifier WHERE to find your public key

  5. Sends HTTP request

┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Request Reaches Your WordPress                          │
└─────────────────────────────────────────────────────────────────┘

WordPress receives:
  GET /article HTTP/1.1
  Host: example.com
  Signature-Input: sig1=...
  Signature: sig1=:...:
  Signature-Agent: http://localhost:8080/jwks/hammadtq.json

WordPress thinks: "I need to verify this signature before serving content"

┌─────────────────────────────────────────────────────────────────┐
│ Step 3: WordPress Asks Verifier                                 │
└─────────────────────────────────────────────────────────────────┘

WordPress → Verifier Service:
  "Hey, is this signature valid?"
  Forwards: Signature-Input, Signature, Signature-Agent

┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Verifier Checks Signature                               │
└─────────────────────────────────────────────────────────────────┘

Verifier Service (http://localhost:8081):

  1. Parse headers:
     ✓ Signature-Input: sig1=...
     ✓ Signature: sig1=:...:
     ✓ Signature-Agent: http://localhost:8080/jwks/hammadtq.json

  2. Extract JWKS URL:
     → http://localhost:8080/jwks/hammadtq.json

  3. Fetch public key:
     GET http://localhost:8080/jwks/hammadtq.json
     ← {
         "keys": [{
           "kid": "3312fbbe-4e79-4b06-8d88-c6aa78b81d4a",
           "x": "MCowBQYDK2VwAyEA..."  ← PUBLIC KEY
         }]
       }

  4. Cache public key (1 hour TTL in Redis)

  5. Rebuild signature base:
     "@method": GET
     "@path": /article
     "@authority": example.com
     "@signature-params": ...

  6. Verify signature:
     Use Ed25519 algorithm
     Public key: from JWKS
     Signature: from header
     Message: signature base
     
     Result: ✅ VALID or ❌ INVALID

  7. Check nonce (replay protection):
     Query Redis: "Has this nonce been used?"
     If yes: ❌ REPLAY ATTACK
     If no: Store nonce, continue

  8. Check timestamp:
     created: 1763282275
     now: 1763282280
     diff: 5 seconds ✓ (within 5 minutes)

  9. Return result:
     {
       "verified": true,
       "agent": {
         "jwks_url": "http://localhost:8080/jwks/hammadtq.json",
         "kid": "3312fbbe-4e79-4b06-8d88-c6aa78b81d4a",
         "client_name": "hammadtq"
       }
     }

┌─────────────────────────────────────────────────────────────────┐
│ Step 5: WordPress Applies Policy                                │
└─────────────────────────────────────────────────────────────────┘

WordPress receives verification result:

If ✅ VALID:
  1. Check policy rules:
     - Is this a free article? → Serve full content
     - Is this premium? → Check if paid → 402 or serve
     - Rate limit exceeded? → 429 Too Many Requests
  
  2. Serve content based on policy

If ❌ INVALID:
  → 401 Unauthorized
```

## 🔍 Why This Works

### Security Benefits

1. **No Shared Secrets**
   - Bot never sends private key
   - Public key is... public!
   - Can't be stolen from the wire

2. **Replay Protection**
   - Each request has unique nonce
   - Nonces stored in Redis
   - Can't reuse old requests

3. **Time-Limited**
   - Signatures expire after 5 minutes
   - Can't use old signatures

4. **Identity Verification**
   - Signature proves bot has the private key
   - Public key proves identity
   - Can't impersonate without private key

### Scalability Benefits

1. **Caching**
   - Public keys cached for 1 hour
   - Reduces load on registry
   - Fast verification

2. **Stateless**
   - Verifier doesn't need to track users
   - Can scale horizontally
   - No session storage needed

## 🎯 Real-World Example

### Scenario: OpenAI's GPT wants to read your blog

**Setup:**
```
You (blog owner):
  1. Register in OpenBotAuth
  2. Generate keys
  3. Configure WordPress:
     - Free articles: allow GPT
     - Premium articles: require payment

OpenAI:
  1. Generates keys for GPT bot
  2. You register GPT's public key in your registry
  3. GPT configured with its private key
```

**When GPT visits your blog:**
```
GPT Bot:
  GET /blog/free-article
  Signature-Agent: http://localhost:8080/jwks/hammadtq.json
  (signed with GPT's private key)

Your WordPress:
  → Verifier: "Check this signature"
  
Verifier:
  → Registry: "Get hammadtq's public key"
  → Verify signature
  → ✅ Valid!

Your WordPress:
  Policy: "Free article + verified = allow"
  → 200 OK + full article

---

GPT Bot:
  GET /blog/premium-article
  Signature-Agent: http://localhost:8080/jwks/hammadtq.json

Your WordPress:
  → Verifier: "Check this signature"
  
Verifier:
  → ✅ Valid!

Your WordPress:
  Policy: "Premium article + no payment = require payment"
  → 402 Payment Required
  → Link: <https://pay.example.com/intent/123>; rel="payment"

GPT Bot:
  → Follows payment link
  → Completes payment
  → Retries with receipt
  → Gets full article
```

## 🔧 Components Explained

### Registry Service (Port 8080)
- **What:** Hosts public keys
- **Why:** Central place to verify identities
- **How:** PostgreSQL database + Express API
- **Endpoint:** `/jwks/{username}.json`

### Verifier Service (Port 8081)
- **What:** Verifies signatures
- **Why:** Separate service for security
- **How:** Node.js + Redis + Web Crypto API
- **Endpoint:** `/verify` or `/authorize`

### Bot CLI
- **What:** Demo tool to sign requests
- **Why:** Test the system
- **How:** Node.js + Ed25519 signing
- **Usage:** `pnpm dev fetch <url>`

### Portal (Port 5173)
- **What:** User interface
- **Why:** Easy key management
- **How:** React + Vite
- **Features:** Register, generate keys, manage agents

## 🚀 Production Setup

### With NGINX

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    # Check signature before proxying
    auth_request /_oba_check;
    
    # If valid, proxy to WordPress
    proxy_pass http://wordpress;
  }

  location = /_oba_check {
    internal;
    proxy_pass http://verifier:8081/authorize;
    proxy_set_header X-Original-Method $request_method;
    proxy_set_header X-Original-Uri $request_uri;
    proxy_set_header Signature-Input $http_signature_input;
    proxy_set_header Signature $http_signature;
    proxy_set_header Signature-Agent $http_signature_agent;
  }
}
```

**Flow:**
```
Bot → NGINX → auth_request → Verifier
                    ↓
              If ✅: proxy to WordPress
              If ❌: return 401
```

## 📊 Summary

**The Magic:**
- Bot signs with PRIVATE key (kept secret)
- Verifier checks with PUBLIC key (from registry)
- No shared secrets, no passwords, no API keys

**The Flow:**
1. Bot signs request
2. WordPress asks verifier
3. Verifier fetches public key
4. Verifier checks signature
5. WordPress applies policy
6. Content served (or payment required)

**The Security:**
- Replay protection (nonces)
- Time-limited (timestamps)
- Identity verification (signatures)
- No credential theft (public keys)

🎉 **That's OpenBotAuth!**

