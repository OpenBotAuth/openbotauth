# OpenBotAuth Verifier SDK for Python

Python SDK for verifying OpenBotAuth (Web Bot Auth) signed HTTP requests using RFC 9421 HTTP Message Signatures.

OpenBotAuth is a reference implementation of [Web Bot Auth](https://datatracker.ietf.org/doc/draft-kelsey-httpbis-web-bot-auth/), an IETF draft specification for agent authentication over HTTP. This package enables Python origins (FastAPI, Starlette, Flask) to verify AI agent and bot signatures by calling the OpenBotAuth verifier service.

## Installation

```bash
pip install openbotauth-verifier
```

For framework-specific middleware:

```bash
# FastAPI/Starlette
pip install openbotauth-verifier[fastapi]

# Flask
pip install openbotauth-verifier[flask]

# All extras including dev dependencies
pip install openbotauth-verifier[all]
```

## Quick Start

### FastAPI / Starlette

```python
from fastapi import FastAPI, Request
from openbotauth_verifier import OpenBotAuthASGIMiddleware

app = FastAPI()

# Add middleware (observe mode - logs verification but allows all requests)
app.add_middleware(OpenBotAuthASGIMiddleware)

# Or enforce verification:
# app.add_middleware(OpenBotAuthASGIMiddleware, require_verified=True)

@app.get("/protected")
async def protected(request: Request):
    oba = request.state.oba

    if oba.signed and oba.result.verified:
        return {
            "message": "Verified bot access",
            "agent": oba.result.agent,
        }

    return {"message": "Unverified access"}
```

### Flask

```python
from flask import Flask, request, g
from openbotauth_verifier.middleware.wsgi import OpenBotAuthWSGIMiddleware

app = Flask(__name__)
app.wsgi_app = OpenBotAuthWSGIMiddleware(app.wsgi_app)

@app.before_request
def load_oba():
    g.oba = request.environ.get("openbotauth.oba")

@app.route("/protected")
def protected():
    if g.oba and g.oba.signed and g.oba.result.verified:
        return {
            "message": "Verified bot access",
            "agent": g.oba.result.agent,
        }
    return {"message": "Unverified access"}
```

### Direct Client Usage

```python
from openbotauth_verifier import VerifierClient

client = VerifierClient()

# Async
result = await client.verify(
    method="GET",
    url="https://example.com/api",
    headers={
        "signature-input": 'sig=("host");created=1699900000',
        "signature": "base64signature==",
        "signature-agent": "https://registry.openbotauth.org/jwks/mybot.json",
        "host": "example.com",
    },
)

if result.verified:
    print(f"Verified agent: {result.agent['client_name']}")
else:
    print(f"Verification failed: {result.error}")

# Sync
result = client.verify_sync(method="GET", url="...", headers={...})
```

## Configuration

### Verifier URL

By default, the SDK uses the hosted verifier at `https://verifier.openbotauth.org/verify`.

For local development or self-hosted verifiers:

```python
# Middleware
app.add_middleware(
    OpenBotAuthASGIMiddleware,
    verifier_url="http://localhost:8081/verify",
)

# Client
client = VerifierClient(verifier_url="http://localhost:8081/verify")
```

### Middleware Modes

**Observe Mode** (default): Attaches verification state but allows all requests.
```python
app.add_middleware(OpenBotAuthASGIMiddleware, require_verified=False)
```

**Require Mode**: Returns 401 for unsigned or failed verification.
```python
app.add_middleware(OpenBotAuthASGIMiddleware, require_verified=True)
```

### Timeout

```python
app.add_middleware(OpenBotAuthASGIMiddleware, timeout_s=10.0)
client = VerifierClient(timeout_s=10.0)
```

## Verification State

The middleware attaches an `OBAState` object:

```python
@dataclass
class OBAState:
    signed: bool              # Request had signature headers
    result: VerificationResult | None

@dataclass
class VerificationResult:
    verified: bool            # Signature was valid
    agent: dict | None        # Agent info (kid, jwks_url, client_name)
    error: str | None         # Error message if failed
    created: int | None       # Signature creation timestamp
    expires: int | None       # Signature expiration timestamp
```

Access in your handlers:

```python
# FastAPI/Starlette
oba = request.state.oba

# Flask
oba = request.environ.get("openbotauth.oba")
```

## Security

### Sensitive Header Protection

The SDK **never forwards sensitive headers** to the verifier service:

- `cookie`
- `authorization`
- `proxy-authorization`
- `www-authenticate`

If any of these headers are covered by `Signature-Input`, the verification fails immediately with a `ValueError` - no network call is made.

### Header Forwarding

Only these headers are forwarded to the verifier:

1. `signature-input`, `signature`, `signature-agent` (always)
2. Headers explicitly listed in the `Signature-Input` covered components
3. Derived components (starting with `@`) are parsed but not forwarded as headers

## Testing with bot-cli

Use the Node.js bot-cli from the OpenBotAuth monorepo to test your Python server:

### 1. Start your Python server

```bash
cd sdks/python
python -m venv .venv
source .venv/bin/activate
pip install -e ".[fastapi]"
uvicorn examples.fastapi_demo:app --port 8009
```

### 2. Test with bot-cli

```bash
# From the monorepo root
pnpm --filter @openbotauth/bot-cli dev fetch http://localhost:8009/protected -v
```

### Notes

- **Hosted verifier**: Requires your JWKS URL (from `Signature-Agent`) to be publicly reachable. Use an OpenBotAuth registry JWKS URL if you have one.

- **Local verifier**: Start the verifier service locally and configure:
  ```python
  app.add_middleware(
      OpenBotAuthASGIMiddleware,
      verifier_url="http://localhost:8081/verify",
  )
  ```

## API Reference

### `VerifierClient`

```python
VerifierClient(
    verifier_url: str = "https://verifier.openbotauth.org/verify",
    timeout_s: float = 5.0,
)
```

Methods:
- `async verify(method, url, headers, body=None) -> VerificationResult`
- `verify_sync(method, url, headers, body=None) -> VerificationResult`

### `OpenBotAuthASGIMiddleware`

```python
OpenBotAuthASGIMiddleware(
    app,
    verifier_url: str = "https://verifier.openbotauth.org/verify",
    require_verified: bool = False,
    timeout_s: float = 5.0,
)
```

Sets `request.state.oba: OBAState`

### `OpenBotAuthWSGIMiddleware`

```python
OpenBotAuthWSGIMiddleware(
    app,
    verifier_url: str = "https://verifier.openbotauth.org/verify",
    require_verified: bool = False,
    timeout_s: float = 5.0,
)
```

Sets `environ["openbotauth.oba"]: OBAState`

### Header Utilities

```python
from openbotauth_verifier import parse_covered_headers, extract_forwarded_headers

# Parse covered headers from Signature-Input
headers = parse_covered_headers('sig=("host" "content-type");created=123')
# Returns: ["host", "content-type"]

# Extract safe headers to forward
forwarded = extract_forwarded_headers(request_headers)
# Raises ValueError if sensitive headers are covered
```

## Development

```bash
cd sdks/python
python -m venv .venv
source .venv/bin/activate
pip install -e ".[all]"

# Run tests
pytest

# Type checking
mypy src

# Linting
ruff check src tests
```

## Resources

- **OpenBotAuth Website**: https://openbotauth.org
- **Main Repository**: https://github.com/OpenBotAuth/openbotauth
- **Web Bot Auth (IETF Draft)**: https://datatracker.ietf.org/doc/draft-kelsey-httpbis-web-bot-auth/
- **RFC 9421 (HTTP Message Signatures)**: https://www.rfc-editor.org/rfc/rfc9421.html
- **PyPI Package**: https://pypi.org/project/openbotauth-verifier/

## License

MIT
