"""
ASGI middleware for OpenBotAuth verification (FastAPI/Starlette).
"""

from typing import Any, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from ..client import VerifierClient, DEFAULT_VERIFIER_URL
from ..models import OBAState, VerificationResult
from ..headers import SIGNATURE_HEADERS


def _has_signature_headers(headers: dict[str, str]) -> bool:
    """Check if request has any signature headers."""
    return any(h in headers for h in SIGNATURE_HEADERS)


class OpenBotAuthASGIMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware for OpenBotAuth signature verification.

    Attaches verification state to `request.state.oba` with:
    - signed: bool - whether request had signature headers
    - result: VerificationResult | None - verification result if signed

    Args:
        app: ASGI application
        verifier_url: URL of verifier service (default: hosted verifier)
        require_verified: If True, return 401 for unsigned or failed verification.
            If False (default), operate in observe mode - attach state but allow all.
        timeout_s: Verifier request timeout in seconds

    Example (FastAPI):
        >>> from fastapi import FastAPI, Request
        >>> from openbotauth_verifier import OpenBotAuthASGIMiddleware
        >>>
        >>> app = FastAPI()
        >>> app.add_middleware(OpenBotAuthASGIMiddleware, require_verified=False)
        >>>
        >>> @app.get("/protected")
        >>> async def protected(request: Request):
        ...     oba = request.state.oba
        ...     if oba.signed and oba.result.verified:
        ...         return {"agent": oba.result.agent}
        ...     return {"error": "Not verified"}
    """

    def __init__(
        self,
        app: Any,
        verifier_url: str = DEFAULT_VERIFIER_URL,
        require_verified: bool = False,
        timeout_s: float = 5.0,
    ):
        super().__init__(app)
        self.verifier_url = verifier_url
        self.require_verified = require_verified
        self.client = VerifierClient(verifier_url=verifier_url, timeout_s=timeout_s)

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Any],
    ) -> Response:
        # Extract headers as dict
        headers: dict[str, str] = {}
        for key, value in request.headers.items():
            headers[key.lower()] = value

        # Check if signed
        signed = _has_signature_headers(headers)

        if not signed:
            # No signature headers
            request.state.oba = OBAState(signed=False, result=None)

            if self.require_verified:
                return JSONResponse(
                    status_code=401,
                    content={"error": "Missing OpenBotAuth signature headers"},
                    headers={"X-OBA-Decision": "deny"},
                )

            return await call_next(request)

        # Request is signed - verify it
        try:
            # Build full URL
            url = str(request.url)

            # Get body if present
            body: str | None = None
            if request.method in ("POST", "PUT", "PATCH"):
                body_bytes = await request.body()
                if body_bytes:
                    body = body_bytes.decode("utf-8", errors="replace")

            result = await self.client.verify(
                method=request.method,
                url=url,
                headers=headers,
                body=body,
            )

        except ValueError as e:
            # Sensitive header in signature - reject
            result = VerificationResult(
                verified=False,
                error=str(e),
            )
        except Exception as e:
            # Verifier error
            result = VerificationResult(
                verified=False,
                error=f"Verification failed: {e}",
            )

        request.state.oba = OBAState(signed=True, result=result)

        if self.require_verified and not result.verified:
            return JSONResponse(
                status_code=401,
                content={
                    "error": result.error or "Signature verification failed",
                },
                headers={"X-OBA-Decision": "deny"},
            )

        # Set decision header
        response = await call_next(request)
        response.headers["X-OBA-Decision"] = "allow" if result.verified else "observe"
        return response
