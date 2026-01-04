# ChatGPT Signature Verification Enhancement

## Summary

This document describes the enhancements made to OpenBotAuth to support verification of real ChatGPT bot signatures and other agents that use identity URLs instead of direct JWKS URLs.

## Problem Statement

A real ChatGPT bot hit our WordPress site with RFC 9421 signature headers, but verification failed. The issues identified were:

1. **Strict Signature-Agent parsing**: The verifier expected `Signature-Agent` to be a direct JWKS URL (ending in `.json` or containing `/jwks/`), but ChatGPT sent an identity URL like `https://chatgpt.com`
2. **Missing signed headers**: If the bot's `Signature-Input` covered additional headers (e.g., `accept`, `user-agent`, `content-digest`), but WordPress plugin didn't forward them to the verifier service, signature verification would fail
3. **Poor error visibility**: When verification failed, error details from the verifier service were discarded by the WordPress plugin

## Solution Overview

We implemented three major improvements:

### A. WordPress Plugin: Forward All Covered Headers

**Files Changed:**
- `plugins/wordpress-openbotauth/includes/Verifier.php`
- `plugins/wordpress-openbotauth/readme.txt`

**Changes:**
1. Parse `Signature-Input` header to extract the list of covered components
2. Forward all covered headers (except sensitive ones like cookies/auth) to verifier service
3. Block verification if signature covers sensitive headers and return clear error
4. Improve error reporting by parsing JSON error responses from verifier
5. Update External Service Disclosure in readme.txt

**Privacy Protection:**
- Never forward: `cookie`, `authorization`, `proxy-authorization`, `www-authenticate`
- If signature covers these, verification fails with: `"Cannot verify: Signature-Input covers sensitive header 'X' which is not forwarded"`

### B. Verifier Service: JWKS Discovery

**Files Changed:**
- `packages/verifier-service/src/signature-parser.ts`
- `packages/verifier-service/src/signature-verifier.ts`
- `packages/verifier-service/src/jwks-cache.ts`
- `packages/verifier-service/src/server.ts`

**Changes:**

1. **parseSignatureAgent enhancements:**
   - Strip wrapping quotes: `"https://example.com"` → `https://example.com`
   - Strip angle brackets: `<https://example.com>` → `https://example.com`
   - Detect whether URL is already a JWKS URL or needs discovery

2. **JWKS Discovery mechanism:**
   - New function: `resolveJwksUrl(agentUrl, discoveryPaths?)`
   - Default discovery paths (tried in order):
     - `/.well-known/jwks.json`
     - `/.well-known/openbotauth/jwks.json`
     - `/jwks.json`
   - Configurable via env var: `OB_JWKS_DISCOVERY_PATHS`
   - Validates JWKS structure before accepting

3. **SSRF Protection:**
   - Only allow `http://` and `https://` schemes
   - Block localhost and private IP addresses (127.0.0.1, 10.x, 192.168.x, 172.16-31.x)
   - 3-second timeout on JWKS fetches
   - 1MB max response size limit

4. **Better error messages:**
   - `buildSignatureBase()` throws `"Missing covered header: X"` when header is listed in Signature-Input but not provided
   - Empty string header values are treated as present (not missing)
   - Updated telemetry error mapping:
     - `invalid_signature_agent` - Invalid Signature-Agent header
     - `missing_signed_component` - Missing covered header
     - `jwks_discovery_failed` - JWKS discovery failed

5. **Fix /authorize header forwarding:**
   - Forward all incoming headers (lowercased) to signature verification
   - Previously only forwarded signature headers + content-type

### C. Tests

**New File:**
- `packages/verifier-service/src/signature-parser.test.ts`

**Coverage:**
- parseSignatureAgent: quoted/bracketed URLs, JWKS detection, identity URLs
- resolveJwksUrl: discovery order, custom paths, size limits, invalid JWKS rejection
- buildSignatureBase: missing header detection, empty strings, derived components
- parseSignatureInput: valid formats, expires handling

**Test Results:** ✅ 21/21 tests passing

## Configuration

### Environment Variables

**Verifier Service:**
```bash
# Optional: Custom JWKS discovery paths (comma-separated)
OB_JWKS_DISCOVERY_PATHS=/.well-known/jwks.json,/.well-known/openbotauth/jwks.json,/jwks.json

# Existing variables (unchanged)
OB_TRUSTED_DIRECTORIES=openbotregistry.example.com,chatgpt.com
OB_MAX_SKEW_SEC=300
OB_NONCE_TTL_SEC=600
```

**WordPress Plugin:**
- No configuration changes needed
- Plugin automatically parses Signature-Input and forwards covered headers
- Sensitive headers are automatically blocked

## How It Works

### Example: ChatGPT Bot Request

1. **Bot sends request:**
```http
GET /article/123 HTTP/1.1
Host: example.com
Signature-Input: sig1=("@method" "@path" "@authority" "accept" "user-agent");created=1234567890;keyid="chatgpt-key-1";nonce="abc123"
Signature: sig1=:base64signature...:
Signature-Agent: https://chatgpt.com
Accept: application/json
User-Agent: ChatGPT-User-Agent/1.0
```

2. **WordPress plugin:**
   - Parses `Signature-Input` → finds covered headers: `accept`, `user-agent`
   - Extracts these headers from request
   - Sends to verifier:
```json
{
  "method": "GET",
  "url": "https://example.com/article/123",
  "headers": {
    "signature-input": "sig1=(...)",
    "signature": "sig1=:...:",
    "signature-agent": "https://chatgpt.com",
    "accept": "application/json",
    "user-agent": "ChatGPT-User-Agent/1.0"
  }
}
```

3. **Verifier service:**
   - Parses `Signature-Agent: https://chatgpt.com` → not a JWKS URL, needs discovery
   - Tries discovery paths:
     - `https://chatgpt.com/.well-known/jwks.json` → finds valid JWKS!
   - Fetches JWKS with SSRF protection
   - Builds signature base including `accept` and `user-agent` headers
   - Verifies signature with public key from JWKS
   - Returns success or detailed error

4. **WordPress plugin:**
   - If verified: allow full content
   - If failed: logs detailed error (e.g., "Verifier 401: Missing covered header: accept")

## Testing with curl

### Test /verify endpoint with covered headers:

```bash
curl -X POST http://localhost:8081/verify \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "url": "https://example.com/test",
    "headers": {
      "signature-input": "sig1=(\"@method\" \"@path\" \"accept\");created=1234567890;keyid=\"test-key\";nonce=\"abc123\"",
      "signature": "sig1=:base64sig...:",
      "signature-agent": "https://example.com/jwks/user.json",
      "accept": "application/json"
    }
  }'
```

### Test missing covered header (should fail):

```bash
curl -X POST http://localhost:8081/verify \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "url": "https://example.com/test",
    "headers": {
      "signature-input": "sig1=(\"@method\" \"@path\" \"accept\");created=1234567890;keyid=\"test-key\";nonce=\"abc123\"",
      "signature": "sig1=:base64sig...:",
      "signature-agent": "https://example.com/jwks/user.json"
    }
  }'

# Expected response:
# {"verified": false, "error": "Missing covered header: accept"}
```

### Test JWKS discovery:

```bash
curl -X POST http://localhost:8081/verify \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "url": "https://example.com/test",
    "headers": {
      "signature-input": "sig1=(\"@method\" \"@path\");created=1234567890;keyid=\"test-key\";nonce=\"abc123\"",
      "signature": "sig1=:base64sig...:",
      "signature-agent": "https://chatgpt.com"
    }
  }'

# Verifier will attempt discovery:
# - https://chatgpt.com/.well-known/jwks.json
# - https://chatgpt.com/.well-known/openbotauth/jwks.json
# - https://chatgpt.com/jwks.json
```

## Acceptance Criteria

✅ **1. Additional headers verified successfully**
- When `Signature-Input` covers extra headers, WordPress forwards them
- Verifier includes them in signature base computation
- Signature verification succeeds

✅ **2. Identity URL resolution**
- `Signature-Agent: https://chatgpt.com` triggers JWKS discovery
- Discovery finds valid JWKS at well-known paths
- Verification succeeds with discovered JWKS

✅ **3. Precise error reporting**
- Missing covered headers: `"Missing covered header: accept"`
- Invalid signature agent: `"Invalid Signature-Agent header"`
- Discovery failure: `"JWKS discovery failed for agent: https://chatgpt.com"`
- Untrusted directory: `"JWKS URL not from trusted directory: https://..."`

✅ **4. Privacy protection**
- Cookies and auth headers never forwarded
- Sensitive header coverage fails verification with clear error
- Updated disclosure in readme.txt

## Security Considerations

1. **SSRF Protection**: All JWKS fetches validated for:
   - Valid http/https schemes
   - No private IP addresses
   - Timeout protection (3s)
   - Size limits (1MB)

2. **Privacy**: Sensitive headers explicitly blocked from forwarding

3. **Trusted Directories**: Still enforced after JWKS discovery

4. **Nonce Replay Protection**: Unchanged, still active

5. **Signature Base**: Must match exactly; missing headers now cause clear failures instead of silent mismatches

## Migration Notes

### For Existing Deployments

**Verifier Service:**
- Rebuild and redeploy with new code
- Optionally set `OB_JWKS_DISCOVERY_PATHS` if custom paths needed
- No breaking changes to existing functionality
- Existing JWKS URLs continue to work as before

**WordPress Plugin:**
- Update plugin files
- No configuration changes needed
- Plugin automatically handles new header forwarding
- Existing functionality preserved

### Backward Compatibility

✅ All changes are backward compatible:
- Direct JWKS URLs still work (no discovery attempted)
- Signature-Input without extra headers works (only signature headers forwarded)
- Existing error handling preserved
- No database migrations required

## Future Enhancements

Potential improvements for future versions:

1. **DNS-based JWKS discovery**: Support DNS TXT records for JWKS URL
2. **Cache discovery results**: Cache successful discovery paths per origin
3. **OpenID Connect discovery**: Support `.well-known/openid-configuration`
4. **Agent reputation**: Track agents with failed discovery attempts
5. **WordPress admin UI**: Show covered headers in analytics dashboard

## References

- [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html)
- [RFC 7517: JSON Web Key (JWK)](https://www.rfc-editor.org/rfc/rfc7517.html)
- [OpenBotAuth Documentation](../README.md)
- [Architecture Overview](./ARCHITECTURE.md)

## Changelog

**Version: 0.2.0** (Next Release)

**Verifier Service:**
- ✨ Add JWKS discovery for identity URLs
- ✨ Support quoted and angle-bracketed Signature-Agent headers
- 🔒 Add SSRF protection to JWKS fetching
- 🐛 Fix missing header detection in signature base
- 🐛 Fix /authorize header forwarding
- 📊 Improve telemetry error mapping
- ✅ Add comprehensive test suite (21 tests)

**WordPress Plugin:**
- ✨ Forward all headers covered by Signature-Input
- 🔒 Block sensitive headers from forwarding
- 🐛 Improve error reporting with verifier response details
- 📝 Update External Service Disclosure in readme.txt

---

**Implementation Date:** 2026-01-04
**Status:** ✅ Completed
**Tests:** ✅ 21/21 passing
