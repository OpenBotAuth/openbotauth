"""
Python Package Test Server (FastAPI)

Test server for openbotauth-verifier Python package.
Uses FastAPI with OpenBotAuthASGIMiddleware for signature verification.

This server is part of the unified test-server that supports both:
- npm package testing (npm/server.js) - port 3000
- Python package testing (this file) - port 3001

Usage:
    # From test-server directory
    cd python
    pip install -r requirements.txt
    python server.py

    # Or with uvicorn
    uvicorn server:app --port 3001 --reload

Environment variables:
    VERIFIER_URL - Override verifier URL (default: http://localhost:8081/verify)
    PORT - Override port (default: 3001)
"""

import os
import sys

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# Add the SDK to path if running from monorepo without installation
sdk_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "sdks", "python", "src")
if os.path.exists(sdk_path):
    sys.path.insert(0, sdk_path)

from openbotauth_verifier import OpenBotAuthASGIMiddleware

# Configuration from environment
VERIFIER_URL = os.getenv("VERIFIER_URL", "http://localhost:8081/verify")
PORT = int(os.getenv("PORT", "3001"))

app = FastAPI(
    title="Python Package Test Server",
    description="Test server for openbotauth-verifier Python package",
    version="0.1.0",
)

# Add OpenBotAuth middleware in observe mode (verifies but doesn't block)
app.add_middleware(
    OpenBotAuthASGIMiddleware,
    verifier_url=VERIFIER_URL,
    require_verified=False,  # observe mode
)


def check_verified(oba) -> tuple[bool, dict | None]:
    """
    Check if request is verified and return (is_verified, error_response).
    Similar to requireVerified middleware in npm server.
    """
    if not oba:
        return False, {"error": "Middleware not configured"}

    if not oba.signed:
        print("\n🔍 Checking signature...")
        print("Signed: False")
        print("❌ No signature found")
        return False, {"error": "Unauthorized", "message": "Signature required"}

    print("\n🔍 Checking signature...")
    print(f"Signed: {oba.signed}")

    if not oba.result or not oba.result.verified:
        error = oba.result.error if oba.result else "Unknown error"
        print(f"❌ Signature verification failed: {error}")
        return False, {"error": error or "Unauthorized", "message": "Signature verification failed"}

    print("✅ Signature verified!")
    print(f"Agent: {oba.result.agent}")
    return True, None


@app.get("/protected")
async def protected(request: Request):
    """Protected endpoint - requires signature."""
    oba = getattr(request.state, "oba", None)
    is_verified, error = check_verified(oba)

    if not is_verified:
        return JSONResponse(status_code=401, content=error)

    print("✅ Access granted to protected resource")
    from datetime import datetime

    return {
        "message": "🎉 Access granted! Your signature is valid.",
        "agent": oba.result.agent,
        "timestamp": datetime.now().isoformat(),
        "resource": "protected-data",
    }


@app.get("/api/secret")
async def api_secret(request: Request):
    """Protected API endpoint - requires signature."""
    oba = getattr(request.state, "oba", None)
    is_verified, error = check_verified(oba)

    if not is_verified:
        return JSONResponse(status_code=401, content=error)

    return {
        "message": "Secret data",
        "agent": oba.result.agent,
        "data": {
            "secret": "This is protected information",
            "value": 42,
        },
    }


@app.get("/public")
async def public():
    """Public endpoint - no signature required."""
    print("📖 Public access")
    return {
        "message": "Public access - no signature required",
        "info": "Anyone can access this endpoint",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "test-server-python"}


if __name__ == "__main__":
    import uvicorn

    print("")
    print("🐍 Python Package Test Server (openbotauth-verifier)")
    print("═══════════════════════════════════════════════════════════")
    print(f"   Running on http://localhost:{PORT}")
    print(f"   Verifier: {VERIFIER_URL}")
    print("")
    print("Endpoints:")
    print("   GET /public      - No signature required")
    print("   GET /protected   - Signature required ✓")
    print("   GET /api/secret  - Signature required ✓")
    print("   GET /health      - Health check")
    print("")
    print("Test with bot CLI:")
    print("   cd packages/bot-cli")
    print(f"   pnpm dev fetch http://localhost:{PORT}/protected -v")
    print("")
    print("To use hosted verifier:")
    print(f"   VERIFIER_URL=https://verifier.openbotauth.org/verify python server.py")
    print("")

    uvicorn.run(app, host="0.0.0.0", port=PORT)
