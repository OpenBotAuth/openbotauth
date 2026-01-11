"""
Verifier client for calling the OpenBotAuth verifier service.
"""

from typing import Any, Mapping

import httpx

from .models import VerificationRequest, VerificationResult
from .headers import extract_forwarded_headers

# Default hosted verifier URL
DEFAULT_VERIFIER_URL = "https://verifier.openbotauth.org/verify"


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
