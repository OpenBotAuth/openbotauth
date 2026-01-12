"""
WSGI middleware for OpenBotAuth verification (Flask).
"""

from __future__ import annotations

import json
from io import BytesIO
from typing import Any, Callable, Iterable

from ..client import VerifierClient, DEFAULT_VERIFIER_URL
from ..models import OBAState, VerificationResult
from ..headers import has_signature_headers


def _extract_headers(environ: dict[str, Any]) -> dict[str, str]:
    """Extract HTTP headers from WSGI environ."""
    headers: dict[str, str] = {}
    for key, value in environ.items():
        if key.startswith("HTTP_"):
            # HTTP_SIGNATURE_INPUT -> signature-input
            header_name = key[5:].replace("_", "-").lower()
            headers[header_name] = value
        elif key == "CONTENT_TYPE":
            headers["content-type"] = value
        elif key == "CONTENT_LENGTH":
            headers["content-length"] = value
    return headers


def _build_url(environ: dict[str, Any]) -> str:
    """Build full URL from WSGI environ."""
    scheme = environ.get("wsgi.url_scheme", "http")
    host = environ.get("HTTP_HOST") or environ.get("SERVER_NAME", "localhost")
    path = environ.get("PATH_INFO", "/")
    query = environ.get("QUERY_STRING", "")

    url = f"{scheme}://{host}{path}"
    if query:
        url = f"{url}?{query}"
    return url


class OpenBotAuthWSGIMiddleware:
    """
    WSGI middleware for OpenBotAuth signature verification.

    Attaches verification state to `environ["openbotauth.oba"]` with:
    - signed: bool - whether request had signature headers
    - result: VerificationResult | None - verification result if signed

    Args:
        app: WSGI application
        verifier_url: URL of verifier service (default: hosted verifier)
        require_verified: If True, return 401 for unsigned or failed verification.
            If False (default), operate in observe mode - attach state but allow all.
        timeout_s: Verifier request timeout in seconds

    Example (Flask):
        >>> from flask import Flask, g
        >>> from openbotauth_verifier.middleware.wsgi import OpenBotAuthWSGIMiddleware
        >>>
        >>> app = Flask(__name__)
        >>> app.wsgi_app = OpenBotAuthWSGIMiddleware(app.wsgi_app)
        >>>
        >>> @app.before_request
        >>> def check_oba():
        ...     from flask import request
        ...     oba = request.environ.get("openbotauth.oba")
        ...     g.oba = oba
        >>>
        >>> @app.route("/protected")
        >>> def protected():
        ...     if g.oba and g.oba.signed and g.oba.result.verified:
        ...         return {"agent": g.oba.result.agent}
        ...     return {"error": "Not verified"}, 401
    """

    def __init__(
        self,
        app: Callable[..., Iterable[bytes]],
        verifier_url: str = DEFAULT_VERIFIER_URL,
        require_verified: bool = False,
        timeout_s: float = 5.0,
    ):
        self.app = app
        self.verifier_url = verifier_url
        self.require_verified = require_verified
        self.client = VerifierClient(verifier_url=verifier_url, timeout_s=timeout_s)

    def __call__(
        self,
        environ: dict[str, Any],
        start_response: Callable[..., Any],
    ) -> Iterable[bytes]:
        headers = _extract_headers(environ)
        signed = has_signature_headers(headers)

        if not signed:
            environ["openbotauth.oba"] = OBAState(signed=False, result=None)

            if self.require_verified:
                return self._error_response(
                    start_response,
                    "Missing OpenBotAuth signature headers",
                )

            return self.app(environ, start_response)

        # Request is signed - verify it
        try:
            url = _build_url(environ)
            method = environ.get("REQUEST_METHOD", "GET")

            # Get body if present
            body: str | None = None
            if method in ("POST", "PUT", "PATCH"):
                content_length = environ.get("CONTENT_LENGTH")
                if content_length:
                    try:
                        length = int(content_length)
                        body_bytes = environ["wsgi.input"].read(length)
                        body = body_bytes.decode("utf-8", errors="replace")
                        # Reset input stream for downstream apps
                        environ["wsgi.input"] = BytesIO(body_bytes)
                    except (ValueError, KeyError):
                        pass

            result = self.client.verify_sync(
                method=method,
                url=url,
                headers=headers,
                body=body,
            )

        except ValueError as e:
            result = VerificationResult(
                verified=False,
                error=str(e),
            )
        except Exception as e:
            result = VerificationResult(
                verified=False,
                error=f"Verification failed: {e}",
            )

        environ["openbotauth.oba"] = OBAState(signed=True, result=result)

        if self.require_verified and not result.verified:
            return self._error_response(
                start_response,
                result.error or "Signature verification failed",
            )

        # Add response headers wrapper
        def custom_start_response(
            status: str,
            response_headers: list[tuple[str, str]],
            exc_info: Any = None,
        ) -> Any:
            decision = "allow" if result.verified else "observe"
            response_headers.append(("X-OBA-Decision", decision))
            return start_response(status, response_headers, exc_info)

        return self.app(environ, custom_start_response)

    def _error_response(
        self,
        start_response: Callable[..., Any],
        error: str,
    ) -> Iterable[bytes]:
        """Return 401 error response."""
        body = json.dumps({"error": error}).encode("utf-8")
        start_response(
            "401 Unauthorized",
            [
                ("Content-Type", "application/json"),
                ("Content-Length", str(len(body))),
                ("X-OBA-Decision", "deny"),
            ],
        )
        return [body]
