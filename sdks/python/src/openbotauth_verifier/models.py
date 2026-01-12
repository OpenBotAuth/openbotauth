"""
Data models for OpenBotAuth verification.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class VerificationRequest:
    """
    Request data to be verified.

    Attributes:
        method: HTTP method (GET, POST, etc.)
        url: Full request URL
        headers: Request headers as a dict
        body: Optional request body (for POST/PUT)
    """
    method: str
    url: str
    headers: dict[str, str]
    body: str | None = None


@dataclass
class VerificationResult:
    """
    Result from the verifier service.

    Attributes:
        verified: Whether the signature was valid
        agent: Agent info dict if verified (contains kid, jwks_url, client_name, etc.)
        error: Error message if verification failed
        created: Signature creation timestamp (Unix epoch)
        expires: Signature expiration timestamp (Unix epoch)
    """
    verified: bool
    agent: dict[str, Any] | None = None
    error: str | None = None
    created: int | None = None
    expires: int | None = None


@dataclass
class OBAState:
    """
    OpenBotAuth state attached to requests.

    Attributes:
        signed: Whether the request had signature headers
        result: Verification result if signed
    """
    signed: bool
    result: VerificationResult | None = None
