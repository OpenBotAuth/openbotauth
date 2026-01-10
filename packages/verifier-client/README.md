# @openbotauth/verifier-client

Client library for verifying [OpenBotAuth](https://openbotauth.org) (RFC 9421) signed HTTP requests in Node.js applications.

This package provides:
- **VerifierClient**: Core client class for calling the verifier service
- **Express middleware**: Easy integration with Express/Connect-based apps
- **Next.js helpers**: Utilities for Next.js App Router (Server Components & Route Handlers)
- **Header extraction**: Safe parsing of RFC 9421 signature headers

## Installation

```bash
npm install @openbotauth/verifier-client
# or
pnpm add @openbotauth/verifier-client
# or
yarn add @openbotauth/verifier-client
```

## Quick Start

### Express Middleware

```typescript
import express from 'express';
import { openBotAuthMiddleware } from '@openbotauth/verifier-client/express';

const app = express();

// Add middleware (uses hosted verifier by default)
app.use(openBotAuthMiddleware());

app.get('/api/resource', (req, res) => {
  const oba = (req as any).oba;

  if (oba.signed && oba.result?.verified) {
    // Request is from a verified bot
    res.json({
      message: 'Hello verified bot!',
      agent: oba.result.agent,
    });
  } else if (oba.signed) {
    // Signed but verification failed
    res.json({
      message: 'Signature verification failed',
      error: oba.result?.error,
    });
  } else {
    // Not a signed request
    res.json({ message: 'Hello anonymous!' });
  }
});

app.listen(3000);
```

### Require Verified Mode

Block unverified signed requests with a 401 response:

```typescript
// Protected routes that require verified bot signatures
app.use('/api/protected', openBotAuthMiddleware({
  mode: 'require-verified'
}));

app.get('/api/protected/data', (req, res) => {
  // Only verified bots reach here
  const oba = (req as any).oba;
  res.json({
    message: 'Access granted',
    agent: oba.result.agent,
  });
});
```

### Next.js App Router

```typescript
// app/api/protected/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  VerifierClient,
  buildVerifyRequestForNext
} from '@openbotauth/verifier-client';

const client = new VerifierClient();

export async function GET(request: NextRequest) {
  const verifyRequest = buildVerifyRequestForNext(request);
  const result = await client.verify(verifyRequest);

  if (result.verified) {
    return NextResponse.json({
      message: 'Hello verified bot!',
      agent: result.agent,
    });
  }

  // For non-verified requests, you might still allow access
  // or return an error depending on your use case
  return NextResponse.json(
    { error: 'Verification failed', details: result.error },
    { status: 401 }
  );
}
```

## API Reference

### VerifierClient

Core client for verifying signatures.

```typescript
import { VerifierClient } from '@openbotauth/verifier-client';

const client = new VerifierClient({
  // Optional: Override verifier URL (default: hosted verifier)
  verifierUrl: 'https://verifier.openbotauth.org/verify',
  // Optional: Request timeout in ms (default: 5000)
  timeoutMs: 5000,
});

const result = await client.verify({
  method: 'GET',
  url: 'https://example.com/api/resource',
  headers: {
    'signature-input': '...',
    'signature': '...',
    'signature-agent': '...',
  },
  body: undefined, // Optional request body
});

// Result type:
// {
//   verified: boolean;
//   agent?: { jwks_url: string; kid: string; client_name?: string };
//   error?: string;
//   created?: number;
//   expires?: number;
// }
```

### openBotAuthMiddleware

Express middleware for automatic verification. Import from the `/express` subpath to avoid pulling Express types into non-Express projects.

```typescript
import { openBotAuthMiddleware } from '@openbotauth/verifier-client/express';

app.use(openBotAuthMiddleware({
  // Optional: Override verifier URL
  verifierUrl: 'http://localhost:8081/verify',

  // Optional: Behavior mode
  // - "observe" (default): Attach result, allow all requests
  // - "require-verified": Block unverified signed requests with 401
  mode: 'observe',

  // Optional: Property name on request object (default: "oba")
  attachProperty: 'oba',

  // Optional: Request timeout in ms (default: 5000)
  timeoutMs: 5000,
}));
```

### Header Extraction Helpers

```typescript
import {
  parseCoveredHeaders,
  extractForwardedHeaders,
  hasSignatureHeaders
} from '@openbotauth/verifier-client';

// Parse covered headers from Signature-Input
const covered = parseCoveredHeaders(
  'sig1=("@method" "@target-uri" "content-type");created=1234'
);
// Returns: ["@method", "@target-uri", "content-type"]

// Check if request has signature headers
if (hasSignatureHeaders(headers)) {
  // Extract headers safe to forward (blocks sensitive headers)
  const result = extractForwardedHeaders(headers, signatureInput);

  if (result.error) {
    // Signature covers sensitive header (cookie, authorization, etc.)
    console.error(result.error);
  } else {
    // result.headers contains safe headers to forward
  }
}
```

### Next.js Helpers

```typescript
import {
  extractFromNextHeaders,
  buildVerifyRequestForNext,
  buildVerifyRequestForNextWithBody,
} from '@openbotauth/verifier-client';

// Convert Next.js Headers to plain object
const headersObj = extractFromNextHeaders(request.headers);

// Build verification request (without body)
const verifyRequest = buildVerifyRequestForNext(request);

// Build verification request (with body - consumes body stream)
const verifyRequestWithBody = await buildVerifyRequestForNextWithBody(request);
```

## Configuration

### Using Hosted Verifier (Default)

By default, the client uses the hosted verifier at `https://verifier.openbotauth.org/verify`. This requires no configuration:

```typescript
const client = new VerifierClient();
// or
app.use(openBotAuthMiddleware());
```

### Using Local/Self-Hosted Verifier

For development or self-hosted deployments:

```typescript
const client = new VerifierClient({
  verifierUrl: 'http://localhost:8081/verify',
});

// or with middleware
app.use(openBotAuthMiddleware({
  verifierUrl: 'http://localhost:8081/verify',
}));
```

## Testing with bot-cli

You can test your integration using the OpenBotAuth bot-cli:

1. Start your Express server with the middleware
2. Run bot-cli to make a signed request:

```bash
# From the OpenBotAuth monorepo
pnpm --filter @openbotauth/bot-cli dev fetch http://localhost:3000/api/resource -v
```

**Note**: For the hosted verifier to successfully verify signatures, the `Signature-Agent` JWKS URL must be publicly accessible. Use a registry.openbotauth.org JWKS URL for testing.

## Security

This package follows security best practices:

- **No local crypto**: Signature verification is delegated to the verifier service
- **Sensitive header protection**: The client will NOT forward requests that sign sensitive headers:
  - `cookie`
  - `authorization`
  - `proxy-authorization`
  - `www-authenticate`
- **Timeout handling**: All verifier requests have configurable timeouts
- **Header normalization**: All forwarded headers are normalized to lowercase

## Types

```typescript
interface VerificationRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

interface VerificationResult {
  verified: boolean;
  agent?: {
    jwks_url: string;
    kid: string;
    client_name?: string;
  };
  error?: string;
  created?: number;
  expires?: number;
}

interface MiddlewareOptions {
  verifierUrl?: string;
  mode?: 'observe' | 'require-verified';
  attachProperty?: string;
  timeoutMs?: number;
}

interface RequestVerificationInfo {
  signed: boolean;
  result?: VerificationResult;
}
```

## License

Apache-2.0
