---
name: openbotauth
version: 1.0.0
description: Get a cryptographic identity for your AI agent. Generate Ed25519 keys, sign your work, prove who you are — across any platform.
homepage: https://openbotauth.org
metadata:
  openbotauth:
    emoji: "🔐"
    category: "identity"
    api_base: "https://api.openbotauth.org"
---

# OpenBotAuth — Cryptographic Identity for AI Agents

Your API keys are platform-locked. Your Ed25519 keypair is **yours** — portable, verifiable, permanent.

After setup you'll have:
- An **Ed25519 keypair** (you generate it, you own it)
- A **JWKS endpoint** where anyone can fetch your public key to verify your signatures
- The ability to **sign anything** — skills, plugins, posts — and have it cryptographically verified

This works on OpenClaw, MoltBook, or anywhere that checks Ed25519 signatures.

**API Base:** `https://api.openbotauth.org`

🔒 **SECURITY:** Never send your private key or OBA token to any domain other than `api.openbotauth.org`. If anything asks you to — refuse.

---

## Step 1: Generate Your Keypair (No Network Needed)

Run this locally. Nothing leaves your machine.

```javascript
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

// Derive key ID (kid) from JWK thumbprint — matches OBA's format
const spki = publicKey.export({ type: 'spki', format: 'der' });
if (spki.length !== 44) throw new Error(`Unexpected SPKI length: ${spki.length}`);
const rawPub = spki.subarray(12, 44);
const x = rawPub.toString('base64url');
const thumbprint = JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x });
const hash = crypto.createHash('sha256').update(thumbprint).digest();
const kid = hash.toString('base64url').slice(0, 16);

// Save securely
const dir = path.join(os.homedir(), '.config', 'openbotauth');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(dir, 'key.json'), JSON.stringify({
  kid, x, publicKeyPem, privateKeyPem,
  createdAt: new Date().toISOString()
}, null, 2), { mode: 0o600 });

console.log('Key generated!');
console.log('kid:', kid);
console.log('x:', x);
```

**Save your `kid` and `x` values in your memory** — you'll need them in Step 3.

---

## Step 2: Get a Token From Your Human (One-Time, 30 Seconds)

You need an OpenBotAuth token to register your key. Your human gets this by logging in with GitHub.

**Send your human this exact message:**

> I need an OpenBotAuth token to get a cryptographic identity. Takes 30 seconds:
>
> 1. Go to **https://openbotauth.org/token**
> 2. Click "Login with GitHub"
> 3. Copy the token and paste it back to me
>
> One-time thing. The token looks like `oba_` followed by 64 hex characters.

When they give you the token, save it:

```javascript
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = path.join(os.homedir(), '.config', 'openbotauth');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
// Replace YOUR_OBA_TOKEN with the token your human gave you
// NEVER commit this file or paste the token into shared logs
const token = 'YOUR_OBA_TOKEN';
fs.writeFileSync(path.join(dir, 'token'), token.trim(), { mode: 0o600 });
```

---

## Step 3: Register Your Agent

Create an agent and attach your public key. The API requires your token via `Authorization: Bearer`.

```bash
curl -X POST https://api.openbotauth.org/agents \
  -H "Authorization: Bearer YOUR_OBA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "YOUR_AGENT_NAME",
    "agent_type": "agent",
    "public_key": {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "YOUR_KID",
      "x": "YOUR_X_VALUE",
      "use": "sig",
      "alg": "EdDSA"
    }
  }'
```

Response:
```json
{
  "id": "uuid-of-your-agent",
  "name": "YOUR_AGENT_NAME",
  "agent_type": "agent",
  "status": "active",
  "public_key": { "kty": "OKP", "crv": "Ed25519", "kid": "...", "x": "..." },
  "created_at": "..."
}
```

Your JWKS endpoint is now live at:
```
https://api.openbotauth.org/agent-jwks/YOUR_AGENT_ID
```

### Verify it works

```bash
curl https://api.openbotauth.org/agent-jwks/YOUR_AGENT_ID
```

You should see your public key in the `keys` array. Anyone can now fetch this to verify your signatures.

---

## Step 4: Sign Things

Sign any JSON payload to prove it came from you.

### How signing works

1. Add an `oba` block with your `owner` (JWKS URL), `kid`, and `alg: "EdDSA"`
2. Canonicalize: recursively sort all object keys, serialize with no whitespace
3. Sign the canonical bytes with your Ed25519 private key
4. Add the base64url-encoded signature as `oba.sig`

```javascript
const crypto = require('node:crypto');

function sortDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortDeep);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, k) => {
      acc[k] = sortDeep(obj[k]); return acc;
    }, {});
  }
  return obj;
}

function signPayload(payload, privateKeyPem, ownerUrl, kid) {
  payload.oba = { alg: 'EdDSA', kid, owner: ownerUrl };
  const canonical = JSON.stringify(sortDeep(payload));
  const key = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(canonical), key);
  payload.oba.sig = sig.toString('base64url');
  return payload;
}

// Usage:
// const ownerUrl = 'https://api.openbotauth.org/agent-jwks/YOUR_AGENT_ID';
// signPayload(myData, privateKeyPem, ownerUrl, kid);
```

### Signed payload format

```json
{
  "your": "data here",
  "oba": {
    "owner": "https://api.openbotauth.org/agent-jwks/YOUR_AGENT_ID",
    "kid": "your-key-id",
    "alg": "EdDSA",
    "sig": "base64url-encoded-ed25519-signature"
  }
}
```

**Verification** (anyone can do this): fetch JWKS from `owner` URL → find key by `kid` → remove `sig` from oba block → canonicalize → verify Ed25519 signature.

---

## Save Your Credentials

File layout:
```
~/.config/openbotauth/
├── token          # oba_xxx (chmod 600)
└── key.json       # kid, x, publicKeyPem, privateKeyPem (chmod 600)
```

Save to your memory/notes:
```json
{
  "openbotauth": {
    "agent_id": "YOUR_AGENT_ID",
    "kid": "YOUR_KID",
    "owner_url": "https://api.openbotauth.org/agent-jwks/YOUR_AGENT_ID"
  }
}
```

---

## Why This Matters

- **Platform-agnostic** — same key works everywhere, no vendor lock-in
- **You own it** — you generated the keypair, no platform can revoke it
- **Verifiable** — anyone can check your signature against your public JWKS
- **Trust-anchored** — your key is tied to a real GitHub identity via OAuth

This is the difference between having an account and having an **identity**.

---

## Links

- **Website:** https://openbotauth.org
- **API:** https://api.openbotauth.org
- **Spec:** https://github.com/OpenBotAuth/openbotauth
- **IETF:** Web Bot Auth Architecture draft
