"""
Flask demo with OpenBotAuth verification.

Usage:
    # Install dependencies
    pip install -e ".[flask]"

    # Run the server
    flask --app examples.flask_demo run --port 8010

    # Or directly
    python examples/flask_demo.py

Test with curl:
    # Public endpoint (no signature required)
    curl http://localhost:8010/public

    # Protected endpoint (requires valid signature in require mode)
    # Use the bot-cli from the monorepo:
    pnpm --filter @openbotauth/bot-cli dev fetch http://localhost:8010/protected -v

Environment variables:
    OBA_VERIFIER_URL - Override verifier URL (default: https://verifier.openbotauth.org/verify)
                       Use http://localhost:8081/verify for local testing
    OBA_REQUIRE_VERIFIED - Set to "true" to enforce verification (default: observe mode)
"""

import os
from flask import Flask, g, request, jsonify

# Import from installed package
from openbotauth_verifier.middleware import OpenBotAuthWSGIMiddleware

# Configuration from environment
VERIFIER_URL = os.getenv("OBA_VERIFIER_URL", "https://verifier.openbotauth.org/verify")
REQUIRE_VERIFIED = os.getenv("OBA_REQUIRE_VERIFIED", "false").lower() == "true"

app = Flask(__name__)

# Wrap with OpenBotAuth middleware
app.wsgi_app = OpenBotAuthWSGIMiddleware(
    app.wsgi_app,
    verifier_url=VERIFIER_URL,
    require_verified=REQUIRE_VERIFIED,
)


@app.before_request
def extract_oba_state():
    """Extract OBA state from environ and attach to Flask g object."""
    g.oba = request.environ.get("openbotauth.oba")


@app.route("/")
def root():
    """API info endpoint."""
    return jsonify({
        "service": "OpenBotAuth Flask Demo API",
        "verifier_url": VERIFIER_URL,
        "require_verified": REQUIRE_VERIFIED,
        "endpoints": {
            "/public": "No signature required",
            "/protected": "Signature verification checked (401 in require mode)",
            "/agent": "Returns agent info if verified",
        },
    })


@app.route("/public")
def public():
    """Public endpoint - no signature required."""
    return jsonify({"message": "This is public content", "access": "unrestricted"})


@app.route("/protected")
def protected():
    """
    Protected endpoint - checks signature verification.

    In observe mode (require_verified=False):
        Returns 200 with verification status - allows inspection of signed/verified state.

    In require mode (require_verified=True):
        Returns 401 if not verified (handled by middleware before reaching this handler).
    """
    oba = g.oba

    if not oba:
        return jsonify({"error": "Middleware not configured"}), 500

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

    return jsonify(response_data)


@app.route("/agent")
def agent_info():
    """Returns detailed agent information if verified."""
    oba = g.oba

    if not oba or not oba.signed:
        return jsonify({
            "signed": False,
            "message": "No signature detected",
        })

    if not oba.result:
        return jsonify({
            "signed": True,
            "verified": False,
            "error": "Verification failed",
        })

    return jsonify({
        "signed": True,
        "verified": oba.result.verified,
        "agent": oba.result.agent,
        "created": oba.result.created,
        "expires": oba.result.expires,
        "error": oba.result.error,
    })


@app.route("/health")
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8010, debug=True)
