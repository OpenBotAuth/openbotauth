"""
FastAPI demo with OpenBotAuth verification.

Usage:
    # Install dependencies
    pip install -e ".[fastapi]"

    # Run the server
    uvicorn examples.fastapi_demo:app --port 8009 --reload

    # Or directly
    python examples/fastapi_demo.py

Test with curl:
    # Public endpoint (no signature required)
    curl http://localhost:8009/public

    # Protected endpoint (requires valid signature in require mode)
    # Use the bot-cli from the monorepo:
    pnpm --filter @openbotauth/bot-cli dev fetch http://localhost:8009/protected -v

Environment variables:
    OBA_VERIFIER_URL - Override verifier URL (default: https://verifier.openbotauth.org/verify)
                       Use http://localhost:8081/verify for local testing
    OBA_REQUIRE_VERIFIED - Set to "true" to enforce verification (default: observe mode)
"""

import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# Import from installed package
from openbotauth_verifier import OpenBotAuthASGIMiddleware

# Configuration from environment
VERIFIER_URL = os.getenv("OBA_VERIFIER_URL", "https://verifier.openbotauth.org/verify")
REQUIRE_VERIFIED = os.getenv("OBA_REQUIRE_VERIFIED", "false").lower() == "true"

app = FastAPI(
    title="OpenBotAuth Demo API",
    description="Demo API with OpenBotAuth signature verification",
    version="0.1.0",
)

# Add OpenBotAuth middleware
app.add_middleware(
    OpenBotAuthASGIMiddleware,
    verifier_url=VERIFIER_URL,
    require_verified=REQUIRE_VERIFIED,
)


@app.get("/")
async def root():
    """API info endpoint."""
    return {
        "service": "OpenBotAuth Demo API",
        "verifier_url": VERIFIER_URL,
        "require_verified": REQUIRE_VERIFIED,
        "endpoints": {
            "/public": "No signature required",
            "/protected": "Signature verification checked (401 in require mode)",
            "/agent": "Returns agent info if verified",
        },
    }


@app.get("/public")
async def public():
    """Public endpoint - no signature required."""
    return {"message": "This is public content", "access": "unrestricted"}


@app.get("/protected")
async def protected(request: Request):
    """
    Protected endpoint - checks signature verification.

    In observe mode (require_verified=False):
        Returns 200 with verification status - allows inspection of signed/verified state.

    In require mode (require_verified=True):
        Returns 401 if not verified (handled by middleware before reaching this handler).
    """
    oba = getattr(request.state, "oba", None)

    if not oba:
        return JSONResponse(
            status_code=500,
            content={"error": "Middleware not configured"},
        )

    # Build response with verification status
    response_data = {
        "signed": oba.signed,
        "verified": oba.result.verified if oba.result else False,
    }

    if oba.signed and oba.result:
        if oba.result.verified:
            response_data["message"] = "Access granted - signature verified"
            response_data["agent"] = oba.result.agent
        else:
            response_data["message"] = "Signature present but verification failed"
            response_data["error"] = oba.result.error
    else:
        response_data["message"] = "No signature provided"
        response_data["hint"] = "Use bot-cli to sign your request"

    return response_data


@app.get("/agent")
async def agent_info(request: Request):
    """
    Returns detailed agent information if verified.
    """
    oba = getattr(request.state, "oba", None)

    if not oba or not oba.signed:
        return {
            "signed": False,
            "message": "No signature detected",
        }

    if not oba.result:
        return {
            "signed": True,
            "verified": False,
            "error": "Verification failed",
        }

    return {
        "signed": True,
        "verified": oba.result.verified,
        "agent": oba.result.agent,
        "created": oba.result.created,
        "expires": oba.result.expires,
        "error": oba.result.error,
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8009)
