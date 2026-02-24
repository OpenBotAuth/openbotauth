Internet-Draft              OpenBotAuth                 Expires 2026-04-30
Intended status: Informational                            2025-12-17

        OpenBotAuth Agent Identity Profile for Web Bot Authentication
               draft-openbotauth-agent-identity-01

Abstract

This document defines an OpenBotAuth profile for deploying long-lived,
origin-agnostic “agent identifiers” alongside the emerging Web Bot
Authentication (WBA) architecture that uses HTTP Message Signatures.

This profile does NOT change WBA wire formats. Instead, it defines:

* an optional, stable agent identifier scheme ("agent:" identifiers);
* how an implementation can associate such identifiers with WBA key
  directories and HTTP Message Signature verification;
* an optional delegation model using X.509 certificate chains carried
  via JWKS ("x5c" / "x5u") consistent with existing directory examples;
* an optional use of a Signature Agent Card as the primary location for
  agent metadata, including agent identifiers and parent/sub-agent
  relationships.

Status of This Memo

This Internet-Draft-style document is published by the OpenBotAuth
project for review and comment. It is not an IETF product and is not a
candidate for the standards track at this time. It may be updated,
replaced, or obsoleted at any time.

Copyright Notice

Copyright © 2025 OpenBotAuth contributors.

This document is licensed under the Apache License, Version 2.0.

---

1.  Introduction

The Web Bot Authentication (WBA) effort standardizes mechanisms for
cryptographic identification of non-browser HTTP clients using HTTP
Message Signatures and discoverable key directories.

WBA’s scope is intentionally constrained; it does not attempt to define
full “agentic” identity or capability models. OpenBotAuth builds an
optional identity layer ABOVE WBA by introducing long-lived agent
identifiers and optional delegation, without altering WBA’s core header
or directory formats.

This profile aims to:
* keep WBA’s request signing and key discovery as the normative base;
* define a clean place to hang stable “agent identity” metadata;
* offer an optional X.509-based delegation mechanism that interoperates
  with JWKS distribution.

Non-goals:
* defining authorization semantics, payments, or “agent passports” as a
  new security boundary;
* defining a universal registry or reputation network;
* requiring X.509 for WBA interoperability.

2.  Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" are to be
interpreted as described in RFC 2119.

Terms used from related drafts:
* Key Directory: a JWKS served as an HTTP Message Signatures Directory.
* Signature-Agent: the HTTP header field that communicates a directory
  location (URI) for signature verification.
* Signature Agent Card: a JSON object describing a signature agent.

OpenBotAuth-specific terms:
* Agent Identifier (agent-id): a stable identifier string for an agent.
* Parent Agent: an agent delegating authority to another agent.
* Sub-Agent: an agent operating under delegated authority.

3.  Agent Identifiers ("agent:")

3.1.  Syntax

OpenBotAuth defines an OPTIONAL "agent:" identifier scheme:

  agent-id     = "agent:" local-part "@" authority
  local-part   = 1*( ALPHA / DIGIT / "-" / "_" / "." )
  authority    = 1*( ALPHA / DIGIT / "-" / "." )

Examples:
  agent:pete@openbotauth.org
  agent:pricebot@acme-retail.example
  agent:cart-voice@shop.example

The agent-id is a naming layer; it is not a replacement for key-based
verification. Implementations MUST treat the entire agent-id as opaque.

3.2.  Sub-Agent Naming Convention

OpenBotAuth allows an OPTIONAL syntactic convention for sub-agents:

  subagent-id = agent-id "/" sub-label
  sub-label   = 1*( ALPHA / DIGIT / "-" / "_" / "." )

Examples:
  agent:pete@openbotauth.org/voice
  agent:pete@openbotauth.org/browser

This convention MUST NOT be used to infer authorization. Actual
delegation, when used, is expressed via X.509 and/or published metadata.

4.  WBA Compatibility Requirements (Requests)

An OpenBotAuth agent interacting with HTTP resources SHOULD follow the
WBA architecture’s signing guidance:

* Requests MUST be signed using HTTP Message Signatures (RFC 9421).
* Covered components SHOULD include at least "@method", "@path" and
  "@authority".
* A "Signature-Agent" header SHOULD be sent to allow in-band discovery
  of the key directory.
* Implementations SHOULD cover "signature-agent" in the signature input
  so that directory discovery is integrity-protected.
* The "keyid" SHOULD be a JWK thumbprint, and implementations SHOULD
  use the WBA tag value.

(See References for the relevant WBA and directory drafts.)

5.  Signature-Agent and Directory Discovery

5.1.  Signature-Agent Header Field

This profile uses the Signature-Agent header field as defined in the
HTTP Message Signatures Directory draft:

* Signature-Agent is a Structured Field Dictionary.
* Each member value is a String Item whose content is a URI pointing to
  an HTTP Message Signatures Directory (JWKS).

Example (single signature label "sig1"):

  Signature-Agent: sig1="https://registry.openbotauth.org/agents/pete/.well-known/http-message-signatures-directory"

If multiple signatures are present, implementations MAY supply multiple
dictionary members keyed by the signature label(s).

5.2.  Key Directory Format and Response Validation

Key directories are served as JWKS with media type:
  application/http-message-signatures-directory+json

Directory servers SHOULD sign directory responses in a verifiable way
using HTTP Message Signatures, so that verifiers can bind keys to the
intended directory authority. If a directory response is signed, the
directory signing conventions defined by the directory draft apply,
including tag value and thumbprint-style keyid.

6.  Signature Agent Card (Preferred Metadata Container)

6.1.  Overview

OpenBotAuth RECOMMENDS using a Signature Agent Card as the primary
metadata container for:
* human-readable bot metadata,
* contacts,
* and OPTIONAL OpenBotAuth identity bindings (agent-id, parent agent-id).

The Signature Agent Card is defined by the WBA registry/card draft.
OpenBotAuth adds OPTIONAL extension parameters under the "oba_" prefix.

6.2.  Location

By convention, an agent’s Signature Agent Card is published at:

  /.well-known/signature-agent-card

Registries MAY also publish lists of card URLs and/or host cards for
agents.

6.3.  OpenBotAuth Extension Parameters

This profile defines the following OPTIONAL card parameters:

* oba_agent_id:
    A stable OpenBotAuth agent identifier (Section 3).
* oba_parent_agent_id:
    The delegating parent agent identifier, if applicable.
* oba_principal:
    An operator or owning principal identifier (informational only).

These parameters are advisory metadata unless backed by verified keys
and (optionally) verified X.509 delegation.

6.4.  Example Signature Agent Card

{
  "client_name": "Pete Voice Agent",
  "client_uri": "https://openbotauth.org/agents/pete/voice",
  "contacts": ["mailto:hammad@openbotauth.org"],
  "rfc9309-product-token": "PeteVoice",
  "purpose": ["voice-checkout"],
  "keys": {
    "keys": [{
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "base64url-thumbprint-or-kid",
      "x": "...",
      "use": "sig",
      "alg": "EdDSA"
    }]
  },

  "oba_agent_id": "agent:pete@openbotauth.org/voice",
  "oba_parent_agent_id": "agent:pete@openbotauth.org",
  "oba_principal": "principal:hammad@openbotauth.org"
}

7.  Optional X.509 Delegation via JWKS (x5c / x5u)

7.1.  Overview

Some deployments may want a delegation chain where a parent agent (or a
platform/registry) vouches for a sub-agent key. This profile supports
an OPTIONAL X.509 mechanism carried in JWKS, leveraging existing JOSE
fields:

* "x5c": an array of base64-encoded DER certificates (leaf first).
* "x5u": a URI to retrieve the leaf certificate.

If X.509 delegation is not used, WBA verification still works: HTTP
Message Signatures verify possession of a key from a discoverable
directory. X.509 only adds an OPTIONAL additional trust layer.

7.2.  Certificate Binding Rules (Profile)

If a JWK includes "x5c" or "x5u", verifiers that implement this option:

* MUST verify that the public key in the leaf certificate matches the
  JWK’s public key material.
* MUST validate the certificate chain according to RFC 5280 to a trust
  anchor configured by local policy (e.g., a registry CA).
* MAY build the chain using Authority Information Access (AIA) if present.

7.3.  Delegation Semantics

When X.509 validation succeeds, relying parties MAY interpret:

* the certificate issuer relationship as evidence that the issuer
  (parent agent / platform) delegated authority for the leaf key;
* the validated chain as evidence that the platform/registry is acting
  as a CA for that delegation scope.

OpenBotAuth does not standardize global semantics for what delegation
permits. Authorization decisions remain local policy.

7.4.  Recommended Identity Hint in Certificates (Non-Normative)

To help map certificates to OpenBotAuth agent identifiers, implementers
MAY include the agent-id as a URI value in the leaf certificate’s
subjectAltName extension.

This is informational and not required for interoperability.

8.  Verification Process (Relying Party)

A relying party verifying an OpenBotAuth agent request can:

1. Parse the HTTP Message Signature per RFC 9421.
2. Parse Signature-Agent; select the directory URI associated with the
   signature label (e.g., "sig1").
3. Fetch the directory (JWKS) and (if present) validate the directory
   response signatures.
4. Locate the JWK whose "kid" matches the signature "keyid".
5. Verify the HTTP Message Signature using that key.
6. OPTIONAL: fetch /.well-known/signature-agent-card from the agent or
   from the registry; read oba_agent_id and related fields.
7. OPTIONAL: if "x5c" or "x5u" are present, validate X.509 chain and
   bind leaf key to JWK.

If steps (1)-(5) succeed, the request is cryptographically attributable
to the signing key. Steps (6)-(7) can provide additional identity and
delegation signals.

9.  Security and Privacy Considerations

* Stable identifiers enable correlation across origins; operators should
  consider whether to use multiple agents or rotate identifiers.
* Signature-Agent discovery SHOULD be covered by the signature input to
  prevent downgrade or redirection attacks.
* Directory responses should be verifiable (signed) to mitigate key
  substitution risks.
* X.509 delegation introduces traditional PKI risks (CA compromise,
  misissuance, revocation complexity). If used, deployments should
  define revocation and key rotation policies.

10.  IANA Considerations

This document does not request IANA actions. Registration of a new URI
scheme or new HTTP fields is out of scope for this project document.

11.  References

Normative:
* RFC 9421: HTTP Message Signatures
* RFC 8941: Structured Field Values for HTTP
* RFC 5280: Internet X.509 Public Key Infrastructure Certificate and CRL Profile
* RFC 7517: JSON Web Key (JWK)

Informative (work in progress):
* draft-meunier-web-bot-auth-architecture
* draft-meunier-http-message-signatures-directory
* draft-meunier-webbotauth-registry (Registry and Signature Agent Card)

12.  Changelog

* 01:
  - Align Signature-Agent usage with the directory draft (directory URI,
    structured dictionary) and remove the overload where Signature-Agent
    carried agent-id directly.
  - Replace ADT-centric delegation with OPTIONAL X.509 delegation carried
    via x5c/x5u in JWKS.
  - Recommend Signature Agent Card as the metadata container for agent-id
    and parent relationships.
  - Remove 402 semantics from the core profile (left to future documents).
* 00:
  - Initial OpenBotAuth draft.
