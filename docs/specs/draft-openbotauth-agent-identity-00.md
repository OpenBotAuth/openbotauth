Internet-Draft              OpenBotAuth                 Expires 2026-04-30
Intended status: Informational                            2025-04-30

```
       OpenBotAuth Agent Identity & Passport Draft
          draft-openbotauth-agent-identity-00
```

Abstract

This document defines an extension to the IETF Web Bot Authentication
(WBA) architecture that assigns long‑lived, origin‑agnostic
identifiers to autonomous software agents and specifies how those
agents present verifiable “passports” when interacting with HTTP
resources.

The draft introduces:

* an `agent:` identifier scheme;
* a binding from agent identifiers to WBA key directories and JWKS;
* use of the `Signature-Agent` header field in HTTP Message
  Signatures to carry an `agent-id`;
* a delegation model for sub‑agents acting under a parent agent
  using a signed Agent Delegation Token (ADT); and
* an optional "402 Agent Required" response pattern for resources
  that demand an authenticated agent passport.

The goal is to let websites, APIs, and other agents reliably
recognize and authorize autonomous software agents across origins,
while remaining compatible with the WBA architecture and its use of
HTTP Message Signatures (RFC 9421).

Status of This Memo

This Internet‑Draft‑style document is published by the OpenBotAuth
project for review and comment.  It is not an IETF product and is not
a candidate for the standards track at this time.  It may be updated,
replaced, or obsoleted at any time.

Copyright Notice

Copyright © 2025 OpenBotAuth contributors.

This document is licensed under the Apache License, Version 2.0.
You may not use this file except in compliance with the License.
You may obtain a copy of the License at https://www.apache.org/licenses/LICENSE-2.0

---

## 1.  Introduction

The Web Bot Authentication architecture draft defines how HTTP Message
Signatures and well‑known key directories can be used to authenticate
web crawlers and other automated clients.  The draft is intentionally
minimal: it focuses on key discovery and HTTP‑level proofs, and it does
not attempt to define an identifier scheme for agents, a delegation
model, or specific authorization semantics.

At the same time, the rise of LLM‑based agents and voice agents creates
new requirements:

* agents may be long‑lived principals with their own policy, memory
  and reputation;
* an end‑user or organization may run multiple agents (and sub‑agents)
  with different privileges;
* websites may wish to distinguish between anonymous scripted access
  and authenticated, passport‑bearing agents; and
* some use‑cases (e.g., voice checkout) require fine‑grained policy on
  which agents may act on behalf of which users.

This draft extends WBA in a narrow way to address these needs while
preserving the core properties of the architecture:

* identities are backed by public keys discoverable via HTTP;
* HTTP Message Signatures (RFC 9421) provide request‑level proofs;
* existing HTTP status codes and header fields are reused where
  possible.

The main contribution is the definition of `agent-id` as a first‑class
identifier, along with a JOSE‑based delegation mechanism that allows a
verifier to link an agent keypair to a parent agent and, optionally, a
human or organizational owner.

## 2.  Conventions and Terminology

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and
**MAY** in this document are to be interpreted as described in RFC 2119.

* **agent** – an autonomous process, model, or composite system that
  initiates HTTP requests or acts on HTTP responses.
* **parent agent** – an agent that delegates capabilities or identity to
  one or more sub‑agents.
* **sub‑agent** – an agent acting under a parent agent with delegated
  authority scoped by policy.
* **agent-id** – the canonical identifier for an agent, defined in
  Section 3.
* **principal** – a human or organizational account that ultimately
  owns or controls one or more agents.
* **passport** – an HTTP request that carries a valid HTTP Message
  Signature bound to an `agent-id` via the `Signature-Agent` field.
* **registry** – a service that maintains bindings from `agent-id`s to
  WBA key directories and optional metadata, and that issues Agent
  Delegation Tokens (ADTs).

This draft assumes familiarity with:

* Web Bot Authentication architecture (draft‑meunier‑web‑bot‑auth‑architecture);
* HTTP Message Signatures (RFC 9421);
* Structured Field Values for HTTP (RFC 8941); and
* JSON Web Key (JWK) and JSON Web Signature (JWS).

## 3.  Agent Identifier Scheme (`agent:` URI)

### 3.1.  Syntax

Agents are identified by an opaque, globally unique string called an
`agent-id`.  This draft defines the `agent:` URI scheme for this
purpose:

```abnf
agent-id     = "agent:" local-part "@" authority
local-part   = 1*( ALPHA / DIGIT / "-" / "_" / "." )
authority    = 1*( ALPHA / DIGIT / "-" / "." )
```

Examples:

* `agent:pete@openbotauth.org`    – registry‑hosted agent
* `agent:pricebot@acme-retail`    – enterprise agent
* `agent:cart-voice@shop.demo`    – scoped voice agent for one site

The entire `agent-id` MUST be treated as an opaque, case‑insensitive
identifier.  No normative semantics are assigned to sub‑strings or
sub‑domains of the authority; deployments MAY apply local conventions.

### 3.2.  Sub‑Agent Identifiers

Sub‑agents are agents that operate under a parent agent’s administrative
control.  This draft defines a simple hierarchical convention for
sub‑agent IDs:

```abnf
subagent-id = agent-id "/" sub-label
sub-label   = 1*( ALPHA / DIGIT / "-" / "_" / "." )
```

Examples:

* `agent:pete@openbotauth.org/browser` – browser automation sub‑agent
* `agent:pete@openbotauth.org/voice`   – voice surface sub‑agent
* `agent:pete@openbotauth.org/rag`     – retrieval sub‑agent

Sub‑agent identifiers are syntactic sugar; the registry maintains an
explicit parent relationship (Section 4.3).  Relying parties MUST NOT
attempt to infer privilege from the path component alone.

## 4.  Principals and Agent Delegation

### 4.1.  Principals

A principal represents the ultimate owner of one or more agents.  This
may be an individual user, a team, or an organization account.

This draft uses the following informal identifier for principals:

```abnf
principal-id = "principal:" local-part "@" authority
```

For example:

* `principal:hammad@openbotauth.org`
* `principal:acme-security@acme-retail`

The precise mapping between principal identifiers and human identity is
out of scope; implementations MAY use existing identity providers
(GitHub, OIDC, etc.) to establish who controls a given principal.

### 4.2.  Agent Key Material

Each agent (including each sub‑agent) uses its own Ed25519 keypair for
HTTP Message Signatures.  Keys MAY be generated by the registry or by
the agent operator and registered via an API.

Agent public keys are published as JWKs inside a WBA‑compatible key
directory (Section 4.4).  The JWK `kid` parameter SHOULD be the JWK
thumbprint so that it uniquely identifies a key.

Example JWK for a sub‑agent:

```json
{
  "kty": "OKP",
  "crv": "Ed25519",
  "kid": "pete-voice-key-1",
  "x": "...base64url...",
  "use": "sig",
  "alg": "EdDSA"
}
```

### 4.3.  Registry Records and Parent/Sub‑Agent Relationships

The registry maintains a record per agent, which includes at minimum:

```json
{
  "agent_id": "agent:pete@openbotauth.org/voice",
  "parent_agent_id": "agent:pete@openbotauth.org",
  "principal_id": "principal:hammad@openbotauth.org",
  "jwks_uri": "https://registry.openbotauth.org/agents/pete/voice/.well-known/http-message-signatures-directory",
  "status": "active"
}
```

Relying parties MAY use `parent_agent_id` to apply policy such as
"accept any active sub‑agent of `agent:pete@openbotauth.org`".  The
registry is responsible for ensuring that only an authorized principal
can create or revoke agents and sub‑agents under that principal.

### 4.4.  Mapping `agent-id` to a Key Directory

The WBA architecture defines a key directory at:

```text
/.well-known/http-message-signatures-directory
```

for a given origin.  OpenBotAuth introduces a registry abstraction that
maps `agent-id`s to per‑agent key directories.

Given an `agent-id` of the form:

```text
agent:<local-part>@<authority>
```

the default key directory URL is constructed as:

```text
https://registry.<authority>/agents/<pct-encode(local-part)>/
        .well-known/http-message-signatures-directory
```

Sub‑agents MAY have nested paths under the same base, for example:

```text
https://registry.openbotauth.org/agents/pete/voice/.well-known/http-message-signatures-directory
```

Deployments MAY support alternative mappings; this convention is
RECOMMENDED for interoperability.

### 4.5.  Agent Delegation Token (ADT)

To allow verifiers to link an agent keypair back to a principal and
optionally a parent agent, this draft defines an Agent Delegation Token
(ADT).

An ADT is a JSON Web Signature (JWS) object with the following
properties:

* JWS protected header:

  ```json
  {
    "alg": "EdDSA",
    "typ": "oba-delegation+jwt"
  }
  ```

* JWS payload (claims set):

  ```json
  {
    "sub": "agent:pete@openbotauth.org/voice",      // the agent-id
    "agent_kid": "pete-voice-key-1",                // key used for HTTP signatures
    "principal": "principal:hammad@openbotauth.org",// owning principal
    "parent": "agent:pete@openbotauth.org",         // optional parent agent-id
    "scope": "checkout",                            // optional scope/role
    "iat": 1714410000,
    "exp": 1714496400
  }
  ```

* Signature: produced by a registry signing key that is trusted by the
  relying party.

The registry publishes its delegation signing keys as a JWKS at a
well‑known location, for example:

```text
https://registry.<authority>/.well-known/openbotauth-delegation-keys
```

An ADT for a given agent SHOULD be available at a stable URL, such as:

```text
https://registry.<authority>/agents/<pct-encode(local-part)>/delegation.jwt
```

When sub‑agents are used (`agent:pete@.../voice`), the ADT’s `sub`
claim MUST contain the full sub‑agent identifier, and the `parent`
claim SHOULD point to the parent agent.

### 4.6.  Verifier Use of ADT

A verifier that wishes to establish the principal and parent for an
agent proceeds as follows:

1. Obtain `agent-id` from the `Signature-Agent` header.
2. Resolve the agent’s key directory (Section 4.4) and fetch the JWKS.
3. Locate the JWK whose `kid` matches the key used in the HTTP
   signature.
4. Fetch the ADT for this `agent-id` from the registry.
5. Verify the JWS using the registry’s delegation JWKS.
6. Check that `agent_kid` in the ADT matches the JWK’s `kid`.
7. Check that `exp` has not passed.
8. Use the `principal` and `parent` claims for policy decisions.

If any step fails, the verifier MUST treat the agent as *unlinked* to a
principal for the purposes of delegation.  The HTTP signature itself may
still be valid; local policy determines whether unsigned delegation is
permitted.

## 5.  HTTP Message Signature Usage

Agents present passports by signing HTTP requests using the mechanisms
in RFC 9421.  This draft constrains the use of the `Signature-Agent`
field and describes how `agent-id`s bind to signatures.

### 5.1.  Required Covered Components

For an agent passport, the signature’s covered components MUST include
at least:

* `@method`
* `@path`
* `@authority`

Deployments concerned about replay SHOULD also include one of:

* `@expires` (recommended), or
* `@created` with short TTL enforced server‑side, or
* a nonce header such as `X-OBA-Nonce`.

### 5.2.  Signature-Agent Header Field

The `Signature-Agent` header field value MUST be a single sf‑string
whose content is an `agent-id` or sub‑agent identifier as defined in
Section 3.

```http
Signature-Agent: agent:pete@openbotauth.org/voice
```

The `Signature-Agent` field binds the HTTP Message Signature to a
specific agent record in the registry.  The signer’s `keyid` parameter
in the `Signature-Input` field SHOULD correspond to a key in that
agent’s JWKS document.

### 5.3.  Example Signed Request

```http
POST /checkout HTTP/1.1
Host: cart.demo
Content-Type: application/json
Signature-Agent: agent:pete@openbotauth.org/voice
Signature-Input: sig1=("@method" "@path" "@authority" "@expires");
    keyid="pete-voice-key-1"; alg="ed25519"; created=1714410000;
    expires=1714410060
Signature: sig1=:z2Jvb3Zl...Base64...aGVybw==:

{"order_id":"1234"}
```

### 5.4.  Optional X.509 Delegation

The HTTP Message Signatures Directory draft includes experimental
examples of using X.509 certificate chains (`x5c` and `x5u`) to express
host‑level delegation.  OpenBotAuth implementations MAY support such
mechanisms for consistency with those examples, but X.509 chaining is
not required for agent identity or principal‑agent delegation in this
specification.

When `x5c` is present on a JWK, a verifier MAY attempt to validate the
certificate chain according to local policy.  Success or failure of this
validation MUST NOT affect the basic interpretation of `agent-id` or the
ADT described in Section 4.5.

## 6.  402 Agent Required Semantics

Many resources may be publicly accessible to generic HTTP clients while
reserving enhanced functionality (e.g., higher rate limits, write
operations, checkout flows) for authenticated agents.  This draft
defines an optional use of HTTP status 402 to signal that an
authenticated agent passport is required.

When a protected resource receives a request that lacks a valid agent
passport, it MAY respond:

* **Status:** 402 (Payment Required)

* **Body:** a JSON object containing an error code, for example:

  ```json
  {"error":"agent_required"}
  ```

* **Optional header:**

  ```http
  X-Agent-Required: openbotauth
  ```

Rationale: status 402 is reserved for future use by HTTP and is
commonly associated with "provide value before accessing this
resource".  In this context, the "value" is a verifiable agent
passport; deployments MAY also couple this with monetary payment or
other proof of value.

Relying parties SHOULD NOT rely solely on the presence of 402 responses
for security; it is a hint, not a guarantee.  Misconfigured servers may
still incorrectly accept unsigned requests.

## 7.  Agent Cards (Metadata)

Agents often need human‑readable metadata for debugging, policy,
reputation, and UI.  This draft defines an optional JSON document called
an **Agent Card**.

### 7.1.  Location

By convention, an Agent Card for `agent:<local-part>@<authority>` is
published at:

```text
https://registry.<authority>/agents/<pct-encode(local-part)>/card.json
```

A registry MAY also expose a discovery API that returns the card URL for
an `agent-id`.

### 7.2.  Schema

This draft does not require a fixed schema, but recommends the following
fields:

```json
{
  "agent_id": "agent:pete@openbotauth.org/voice",
  "agent_name": "Pete (Voice Checkout)",
  "description": "Demo voice agent that performs checkout operations.",
  "operator": {
    "name": "Hammad Tariq",
    "contact": "mailto:hammad@example.com",
    "website": "https://openbotauth.org/"
  },
  "key_directory_url": "https://registry.openbotauth.org/agents/pete/voice/.well-known/http-message-signatures-directory",
  "purpose": "voice-checkout",
  "subject": "github:hammadtariq",
  "compliance": ["robots.txt"],
  "policy_uri": "https://registry.openbotauth.org/policies/pete-voice.html"
}
```

The `subject` claim is non‑normative and MAY link an agent to a human or
organizational identity using prefixes such as `github:`, `mailto:`, or
`did:`.  Relying parties MUST treat this value as advisory unless
separately validated.  The `principal_id` from registry records and the
ADT described in Section 4.5 provide the stronger linkage.

## 8.  Security Considerations

### 8.1.  Key Compromise and Rotation

Compromise of an agent’s private key allows an attacker to impersonate
that agent.  Registries SHOULD provide:

* key rotation mechanisms with overlap periods;
* revocation metadata in Agent Cards or separate endpoints;
* short‑lived keys for high‑value agents.

Relying parties SHOULD cache JWKS responses with conservative TTLs and
refresh on signature verification failures.

### 8.2.  Delegation Abuse

Sub‑agents increase the attack surface.  Registries SHOULD ensure that
only a principal (or a designated admin agent) can create or revoke
sub‑agents, and SHOULD record and expose `parent_agent_id` for policy
enforcement.

Relying parties MAY restrict high‑risk operations to specific
sub‑agents, e.g., accept `agent:pete@openbotauth.org/voice` for checkout
but not `agent:pete@openbotauth.org/scraper`.

### 8.3.  Privacy

Agent IDs are stable identifiers and can be used to track activity
across sites.  Deployments concerned with privacy MAY:

* issue multiple agents with distinct IDs for different contexts;
* rotate agent IDs over time;
* avoid embedding user‑identifying information in `agent-id` strings.

Subject bindings in Agent Cards SHOULD be treated as sensitive and MAY
be omitted for privacy‑preserving deployments.

### 8.4.  Replay and Downgrade Attacks

To mitigate replay, agents SHOULD sign time‑bounded components and
servers SHOULD enforce expirations and/or nonces.

Servers MUST ensure that absence of `Signature-Agent` or failure to
verify a signature does not mistakenly grant access intended only for
passport‑bearing agents.

### 8.5.  Registry Trust

The ADT mechanism assumes that verifiers trust a registry’s
"delegation" keys to speak for the mapping between principals and
agents.  Deployments SHOULD publish registry delegation keys at
well‑known locations and rotate them carefully.  In higher‑assurance
settings, verifiers MAY pin specific registries or require additional
out‑of‑band trust establishment.

## 9.  IANA Considerations

This document suggests registration of the `agent:` URI scheme and
potentially an `X-Agent-Required` HTTP header field.  Formal IANA
registration is out of scope for this draft.

## 10.  References

* Meunier, T., "Web Bot Authentication Architecture", work in
  progress, IETF draft‑meunier‑web‑bot‑auth‑architecture.
* Cavage, M., et al., "HTTP Message Signatures", RFC 9421.
* Nottingham, M., "Structured Field Values for HTTP", RFC 8941.
* Jones, M., "JSON Web Key (JWK)", RFC 7517.
* Jones, M., "JSON Web Signature (JWS)", RFC 7515.

## 11.  Changelog

* 00  – Initial draft defining `agent-id` scheme, sub‑agent notation,
  registry mapping, Agent Delegation Token (ADT), Signature-Agent
  binding, 402 semantics and Agent Cards.
