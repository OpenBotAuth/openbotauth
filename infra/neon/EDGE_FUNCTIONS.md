# Edge Function Behavior Documentation

This document describes the behavior of the Supabase Edge Functions that need to be replicated as Node.js endpoints in the registry-service.

## 1. JWKS Endpoint (`/jwks/{username}.json`)

**Original**: `supabase/functions/jwks/index.ts`

### Behavior

- **Path**: `/jwks/{username}.json`
- **Method**: GET
- **Purpose**: Serve JWKS (JSON Web Key Set) for a user's public keys

### Logic

1. Extract username from path (remove `.json` extension)
2. Query `profiles` table by username
3. Query `key_history` table for all active keys for that user
4. Fallback to `public_keys` table if no key history
5. Convert each public key to JWK format:
   - `kty`: "OKP"
   - `crv`: "Ed25519"
   - `kid`: key ID from database
   - `x`: public key in base64url format (convert from base64)
   - `use`: "sig"
   - `nbf`: key creation timestamp
   - `exp`: creation timestamp + 1 year
6. Build response with Web Bot Auth metadata:
   - `client_name`: from profile or username
   - `keys`: array of JWKs
   - Optional fields: `client_uri`, `logo_uri`, `contacts`, `expected-user-agent`, `rfc9309-product-token`, `rfc9309-compliance`, `trigger`, `purpose`, `targeted-content`, `rate-control`, `rate-expectation`, `known-urls`
   - `known-identities`: "Github" if github_username exists
   - `Verified`: false (placeholder)
7. Return JSON with `Cache-Control: public, max-age=3600`

### Response Example

```json
{
  "client_name": "mybot",
  "client_uri": "https://example.com",
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "abc123",
      "x": "base64url-encoded-key",
      "use": "sig",
      "nbf": 1700000000,
      "exp": 1731536000
    }
  ],
  "expected-user-agent": "MyBot/1.0",
  "rfc9309-product-token": "mybot",
  "rfc9309-compliance": ["User-Agent"],
  "trigger": "fetcher",
  "purpose": "tdm",
  "known-identities": "Github",
  "Verified": false
}
```

## 2. Agent JWKS Endpoint (`/agent-jwks/{agent_id}`) — DEPRECATED

> **⚠️ DEPRECATED**: This endpoint has been removed and returns HTTP 410 Gone.
> Use the user JWKS endpoint `/jwks/{username}.json` instead, which includes
> all agent keys under the user's identity.

**Status**: Returns 410 Gone with message:
```json
{
  "error": "Gone",
  "message": "The /agent-jwks endpoint is deprecated. Use /jwks/{username}.json."
}
```

**Historical documentation preserved below for reference:**

---

**Original**: `supabase/functions/agent-jwks/index.ts`

### Behavior (Historical)

- **Path**: `/agent-jwks/{agent_id}`
- **Method**: GET
- **Purpose**: Serve JWKS for a specific agent

### Logic (Historical)

1. Extract agent_id from path
2. Query `agents` table by ID
3. Query `profiles` table for the agent's user
4. Build response with agent-specific metadata:
   - `client_name`: agent name
   - `agent_type`: from agents table
   - `status`: from agents table
   - `created_at`: agent creation timestamp
   - `description`: if exists
   - Profile metadata (same as JWKS endpoint)
   - `keys`: array with single agent public key (already in JWK format from JSONB)
   - `Verified`: true if github_username exists
5. Return JSON

### Response Example (Historical)

```json
{
  "client_name": "My Web Scraper",
  "agent_type": "web_scraper",
  "status": "active",
  "created_at": "2025-11-15T00:00:00Z",
  "description": "Scrapes product data",
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "agent-abc123",
      "x": "base64url-encoded-key",
      "use": "sig",
      "alg": "EdDSA",
      "nbf": 1700000000,
      "exp": 1707776000
    }
  ],
  "known-identities": "Github",
  "Verified": true
}
```

## 3. Agent Activity Endpoint (`/agent-activity`)

**Original**: `supabase/functions/agent-activity/index.ts`

### Behavior

- **Path**: `/agent-activity`
- **Method**: POST
- **Purpose**: Log agent HTTP activity

### Logic

1. Parse JSON body with required fields:
   - `agent_id` (UUID)
   - `target_url` (string)
   - `method` (string, e.g., "GET", "POST")
   - `status_code` (integer)
   - `response_time_ms` (integer, optional)
2. Validate required fields
3. Insert into `agent_activity` table
4. Return success response with activity ID

### Request Example

```json
{
  "agent_id": "abc123-def456-ghi789",
  "target_url": "https://example.com/page",
  "method": "GET",
  "status_code": 200,
  "response_time_ms": 150
}
```

### Response Example

```json
{
  "success": true,
  "activity_id": "xyz789-uvw012-rst345"
}
```

## Implementation Notes for registry-service

### Base64 to Base64URL Conversion

```typescript
function base64ToBase64Url(base64: string): string {
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

### CORS Headers

All endpoints should include CORS headers for browser access:

```typescript
{
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

### Error Responses

Consistent error format:

```json
{
  "error": "Error message here"
}
```

With appropriate HTTP status codes:
- 400: Bad Request (missing fields, validation errors)
- 404: Not Found (user/agent not found)
- 500: Internal Server Error

### Caching

- JWKS endpoints should include `Cache-Control` headers
- Consider ETag support for efficient caching
- Cache duration: 1 hour (3600 seconds) for JWKS

