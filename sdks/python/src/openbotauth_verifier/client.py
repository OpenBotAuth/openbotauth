"""
Verifier client for calling the OpenBotAuth verifier service.
"""

from typing import Any, Mapping

import httpx

from .models import VerificationResult
from .headers import extract_forwarded_headers, SIGNATURE_HEADERS

# Default hosted verifier URL
DEFAULT_VERIFIER_URL = "https://verifier.openbotauth.org/verify"


def _check_signature_headers(headers: Mapping[str, str]) -> VerificationResult | None:
    """
    Check for signature headers and return early error if incomplete.

    Returns None if headers are valid for verification, or a VerificationResult
    with an error if something is wrong.
    """
    # Normalize header names to lowercase for lookup
    normalized = {k.lower(): v for k, v in headers.items()}

    has_signature_input = "signature-input" in normalized
    has_signature = "signature" in normalized
    has_signature_agent = "signature-agent" in normalized

    # Check if any signature headers are present
    has_any = has_signature_input or has_signature or has_signature_agent

    if not has_any:
        return VerificationResult(
            verified=False,
            error="No signature headers present",
        )

    # If some headers present but missing required ones
    if not has_signature_input:
        return VerificationResult(
            verified=False,
            error="Missing required header: Signature-Input",
        )

    if not has_signature:
        return VerificationResult(
            verified=False,
            error="Missing required header: Signature",
        )

    # All required headers present
    return None


class VerifierClient:
    """
    Client for the OpenBotAuth verifier service.

    Calls the verifier service to validate RFC 9421 HTTP Message Signatures.

    Args:
        verifier_url: URL of the verifier /verify endpoint.
            Default: https://verifier.openbotauth.org/verify
        timeout_s: Request timeout in seconds. Default: 5.0

    Example:
        >>> client = VerifierClient()
        >>> result = await client.verify("GET", "https://example.com/api", headers)
        >>> if result.verified:
        ...     print(f"Verified agent: {result.agent['client_name']}")
    """

    def __init__(
        self,
        verifier_url: str = DEFAULT_VERIFIER_URL,
        timeout_s: float = 5.0,
    ):
        self.verifier_url = verifier_url
        self.timeout_s = timeout_s

    async def verify(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: str | None = None,
    ) -> VerificationResult:
        """
        Verify a signed HTTP request asynchronously.

        Args:
            method: HTTP method (GET, POST, etc.)
            url: Full request URL
            headers: Request headers
            body: Optional request body

        Returns:
            VerificationResult with verified status and agent info

        Raises:
            ValueError: If sensitive headers are in Signature-Input
            httpx.HTTPError: On network errors
        """
        # Early return for missing/incomplete signature headers (no network call)
        header_error = _check_signature_headers(headers)
        if header_error is not None:
            return header_error

        # Extract only safe headers to forward
        forwarded_headers = extract_forwarded_headers(headers)

        payload: dict[str, Any] = {
            "method": method.upper(),
            "url": url,
            "headers": forwarded_headers,
        }
        if body is not None:
            payload["body"] = body

        async with httpx.AsyncClient(timeout=self.timeout_s) as client:
            response = await client.post(
                self.verifier_url,
                json=payload,
            )

        return self._parse_response(response)

    def verify_sync(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: str | None = None,
    ) -> VerificationResult:
        """
        Verify a signed HTTP request synchronously.

        Args:
            method: HTTP method (GET, POST, etc.)
            url: Full request URL
            headers: Request headers
            body: Optional request body

        Returns:
            VerificationResult with verified status and agent info

        Raises:
            ValueError: If sensitive headers are in Signature-Input
            httpx.HTTPError: On network errors
        """
        # Early return for missing/incomplete signature headers (no network call)
        header_error = _check_signature_headers(headers)
        if header_error is not None:
            return header_error

        # Extract only safe headers to forward
        forwarded_headers = extract_forwarded_headers(headers)

        payload: dict[str, Any] = {
            "method": method.upper(),
            "url": url,
            "headers": forwarded_headers,
        }
        if body is not None:
            payload["body"] = body

        with httpx.Client(timeout=self.timeout_s) as client:
            response = client.post(
                self.verifier_url,
                json=payload,
            )

        return self._parse_response(response)

    def _parse_response(self, response: httpx.Response) -> VerificationResult:
        """Parse verifier service response into VerificationResult."""
        try:
            data = response.json()
        except Exception:
            return VerificationResult(
                verified=False,
                error=f"Invalid verifier response: {response.status_code}",
            )

        if response.status_code >= 500:
            return VerificationResult(
                verified=False,
                error=data.get("error", "Verifier service error"),
            )

        return VerificationResult(
            verified=data.get("verified", False),
            agent=data.get("agent"),
            error=data.get("error"),
            created=data.get("created"),
            expires=data.get("expires"),
        )
