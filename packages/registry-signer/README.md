# @openbotauth/registry-signer

Shared Ed25519 key generation and JWKS utilities for OpenBotAuth.

## Features

- Ed25519 key pair generation (PEM and raw formats)
- PEM ↔ Base64 ↔ Base64URL conversion
- JWK (JSON Web Key) creation and validation
- JWKS (JSON Web Key Set) formatting
- Web Bot Auth compliant JWKS responses
- Key ID (kid) generation

## Installation

```bash
pnpm add @openbotauth/registry-signer
```

## Usage

### Generate Key Pair

```typescript
import { generateKeyPair } from '@openbotauth/registry-signer';

const { publicKey, privateKey } = generateKeyPair();
console.log(publicKey);  // PEM format
console.log(privateKey); // PEM format
```

### Convert to JWK

```typescript
import { publicKeyToJWK } from '@openbotauth/registry-signer';

const jwk = publicKeyToJWK(publicKey, 'my-key-id', {
  nbf: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 31536000, // 1 year
  alg: 'EdDSA'
});

console.log(jwk);
/*
{
  kty: 'OKP',
  crv: 'Ed25519',
  kid: 'my-key-id',
  x: 'base64url-encoded-key',
  use: 'sig',
  alg: 'EdDSA',
  nbf: 1700000000,
  exp: 1731536000
}
*/
```

### Create JWKS

```typescript
import { createWebBotAuthJWKS } from '@openbotauth/registry-signer';

const jwks = createWebBotAuthJWKS([jwk], {
  client_name: 'My Bot',
  client_uri: 'https://example.com',
  rfc9309_compliance: ['User-Agent'],
  trigger: 'fetcher',
  purpose: 'tdm',
  verified: true
});

console.log(JSON.stringify(jwks, null, 2));
```

### Base64 Conversions

```typescript
import { 
  pemToBase64, 
  base64ToBase64Url, 
  base64UrlToBase64 
} from '@openbotauth/registry-signer';

const base64 = pemToBase64(publicKey);
const base64url = base64ToBase64Url(base64);
const backToBase64 = base64UrlToBase64(base64url);
```

### Generate Key ID

```typescript
import { generateKid } from '@openbotauth/registry-signer';

const kid = generateKid(publicKey);
console.log(kid); // 43-char RFC 7638 thumbprint (base64url)
```

## API Reference

### Key Generation

#### `generateKeyPair(): Ed25519KeyPair`

Generate an Ed25519 key pair in PEM format.

Returns:
```typescript
{
  publicKey: string;   // PEM format
  privateKey: string;  // PEM format
}
```

#### `generateKeyPairRaw(): Ed25519KeyPairRaw`

Generate an Ed25519 key pair as raw DER buffers.

Returns:
```typescript
{
  publicKey: Buffer;
  privateKey: Buffer;
}
```

### Conversions

#### `pemToBase64(pem: string): string`

Extract base64 from PEM format (removes headers and newlines).

#### `base64ToBase64Url(base64: string): string`

Convert base64 to base64url format (RFC 4648).

#### `base64UrlToBase64(base64url: string): string`

Convert base64url to base64 format.

### JWK Operations

#### `publicKeyToJWK(publicKeyPem: string, kid?: string, options?: {...}): JWK`

Convert an Ed25519 public key (PEM) to JWK format.

Options:
- `nbf?: number` - Not before timestamp
- `exp?: number` - Expiration timestamp
- `alg?: 'EdDSA'` - Algorithm

#### `base64PublicKeyToJWK(publicKeyBase64: string, kid: string, createdAt?: Date): JWK`

Convert a base64-encoded public key to JWK format (used when reading from database).

#### `generateKid(publicKeyPem: string): string`

Generate a key ID (kid) from a public key using RFC 7638 JWK thumbprint (SHA-256, base64url).

#### `generateKidFromJWK(jwk: Partial<JWK>): string`

Generate a kid from JWK properties using RFC 7638.

#### `generateLegacyKid(publicKeyPem: string): string`

Generate the legacy 16-character kid (first 16 chars of the RFC 7638 thumbprint).

#### `generateLegacyKidFromJWK(jwk: Partial<JWK>): string`

Generate the legacy 16-character kid from JWK properties.

#### `validateJWK(jwk: unknown): jwk is JWK`

Validate that an object is a valid Ed25519 JWK.

### JWKS Operations

#### `createJWKS(keys: JWK[]): JWKS`

Create a JWKS (JSON Web Key Set) from multiple JWKs.

#### `createWebBotAuthJWKS(keys: JWK[], metadata: {...}): WebBotAuthJWKS`

Create a Web Bot Auth compliant JWKS response with metadata.

Metadata fields:
- `client_name: string` (required)
- `client_uri?: string`
- `logo_uri?: string`
- `contacts?: string[]`
- `expected_user_agent?: string`
- `rfc9309_product_token?: string`
- `rfc9309_compliance?: string[]`
- `trigger?: string`
- `purpose?: string`
- `targeted_content?: string`
- `rate_control?: string`
- `rate_expectation?: string`
- `known_urls?: string[]`
- `known_identities?: string`
- `verified?: boolean`

## Types

```typescript
interface Ed25519KeyPair {
  publicKey: string;   // PEM format
  privateKey: string;  // PEM format
}

interface JWK {
  kty: 'OKP';
  crv: 'Ed25519';
  kid: string;
  x: string;  // base64url encoded public key
  use: 'sig';
  alg?: 'EdDSA';
  nbf?: number;
  exp?: number;
}

interface JWKS {
  keys: JWK[];
}

interface WebBotAuthJWKS extends JWKS {
  client_name: string;
  // ... additional Web Bot Auth fields
}
```

## License

MIT
