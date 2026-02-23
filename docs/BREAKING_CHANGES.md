# Breaking Changes

## PR #50 (Agent Identity / X.509 MVP)

These changes are intentional and may break clients built against older OpenBotAuth behavior.

### 1) `kid` / `keyid` format now uses full RFC 7638 thumbprint

- Old behavior: truncated 16-character identifier in some paths.
- New behavior: full RFC 7638 SHA-256 JWK thumbprint (base64url).

Impact:

- Existing clients hardcoded to old short `kid` values will fail key lookup until re-provisioned.
- Any local configs/scripts that assume fixed 16-char `kid` length must be updated.

Recommended migration:

- Regenerate or re-export signer config so `keyid` matches the published JWKS `kid`.
- Re-sync integrations that persist `kid` externally.

### 2) `Signature-Agent` is now signed and dictionary-aware by default

- New default signer behavior emits RFC 8941 dictionary format:
  - `Signature-Agent: sig1="https://.../.well-known/http-message-signatures-directory"`
- Covered component now includes dictionary key selector in dict mode:
  - `"signature-agent";key="sig1"`
- Legacy mode is still supported, but is covered as plain `"signature-agent"` (no `;key=`).

Impact:

- Middlewares/parsers that incorrectly split parameterized covered components (for example `"signature-agent";key="sig1"`) will reject valid requests.

### 3) `Signature-Input` now includes WBA tag

- Signatures include `;tag="web-bot-auth"` to align with draft semantics.

Impact:

- Strict custom verifiers expecting old parameter sets may need updates.

