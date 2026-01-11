"""Tests for VerifierClient."""

import pytest
import httpx
import respx

from openbotauth_verifier import VerifierClient, VerificationResult


@pytest.fixture
def mock_verifier():
    """Create a respx mock for the verifier service."""
    with respx.mock(assert_all_called=False) as mock:
        yield mock


class TestVerifierClient:
    """Tests for VerifierClient."""

    def test_default_url(self):
        """Default verifier URL is set."""
        client = VerifierClient()
        assert client.verifier_url == "https://verifier.openbotauth.org/verify"

    def test_custom_url(self):
        """Custom verifier URL can be set."""
        client = VerifierClient(verifier_url="http://localhost:8081/verify")
        assert client.verifier_url == "http://localhost:8081/verify"

    @pytest.mark.asyncio
    async def test_verify_success(self, mock_verifier):
        """Successful verification returns verified=True."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            json={
                "verified": True,
                "agent": {
                    "kid": "key-123",
                    "jwks_url": "https://registry.openbotauth.org/jwks/test.json",
                    "client_name": "TestBot",
                },
                "created": 1699900000,
                "expires": 1699900300,
            }
        )

        client = VerifierClient(verifier_url="http://localhost:8081/verify")
        result = await client.verify(
            method="GET",
            url="https://example.com/api",
            headers={
                "signature-input": 'sig=("host");created=123',
                "signature": "base64==",
                "signature-agent": "https://registry.openbotauth.org/jwks/test.json",
                "host": "example.com",
            },
        )

        assert result.verified is True
        assert result.agent is not None
        assert result.agent["kid"] == "key-123"
        assert result.created == 1699900000
        assert result.expires == 1699900300

    @pytest.mark.asyncio
    async def test_verify_failure(self, mock_verifier):
        """Failed verification returns verified=False with error."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            json={
                "verified": False,
                "error": "Invalid signature",
            }
        )

        client = VerifierClient(verifier_url="http://localhost:8081/verify")
        result = await client.verify(
            method="GET",
            url="https://example.com/api",
            headers={
                "signature-input": 'sig=("host");created=123',
                "signature": "invalid",
                "host": "example.com",
            },
        )

        assert result.verified is False
        assert result.error == "Invalid signature"

    @pytest.mark.asyncio
    async def test_verify_server_error(self, mock_verifier):
        """Server error returns verified=False with error."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            status_code=500,
            json={"error": "Internal server error"},
        )

        client = VerifierClient(verifier_url="http://localhost:8081/verify")
        result = await client.verify(
            method="GET",
            url="https://example.com/api",
            headers={
                "signature-input": 'sig=("host");created=123',
                "signature": "base64==",
                "host": "example.com",
            },
        )

        assert result.verified is False
        assert "error" in result.error.lower()

    @pytest.mark.asyncio
    async def test_verify_sensitive_header_raises(self):
        """Sensitive header in signature-input raises ValueError."""
        client = VerifierClient()

        with pytest.raises(ValueError, match="Sensitive header"):
            await client.verify(
                method="GET",
                url="https://example.com/api",
                headers={
                    "signature-input": 'sig=("host" "cookie");created=123',
                    "signature": "base64==",
                    "host": "example.com",
                    "cookie": "session=secret",
                },
            )

    @pytest.mark.asyncio
    async def test_verify_with_body(self, mock_verifier):
        """Verification includes body for POST requests."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            json={"verified": True, "agent": {"kid": "key-123"}},
        )

        client = VerifierClient(verifier_url="http://localhost:8081/verify")
        result = await client.verify(
            method="POST",
            url="https://example.com/api",
            headers={
                "signature-input": 'sig=("host");created=123',
                "signature": "base64==",
                "host": "example.com",
            },
            body='{"data": "test"}',
        )

        assert result.verified is True

        # Check that body was included in request
        request = mock_verifier.calls.last.request
        import json
        payload = json.loads(request.content)
        assert payload["body"] == '{"data": "test"}'

    def test_verify_sync_success(self, mock_verifier):
        """Synchronous verification works."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            json={
                "verified": True,
                "agent": {"kid": "key-123"},
            }
        )

        client = VerifierClient(verifier_url="http://localhost:8081/verify")
        result = client.verify_sync(
            method="GET",
            url="https://example.com/api",
            headers={
                "signature-input": 'sig=("host");created=123',
                "signature": "base64==",
                "host": "example.com",
            },
        )

        assert result.verified is True

    def test_verify_sync_sensitive_header_raises(self):
        """Sensitive header in signature-input raises ValueError (sync)."""
        client = VerifierClient()

        with pytest.raises(ValueError, match="Sensitive header"):
            client.verify_sync(
                method="GET",
                url="https://example.com/api",
                headers={
                    "signature-input": 'sig=("authorization");created=123',
                    "signature": "base64==",
                    "authorization": "Bearer secret",
                },
            )

    @pytest.mark.asyncio
    async def test_headers_forwarded_correctly(self, mock_verifier):
        """Only appropriate headers are forwarded."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            json={"verified": True, "agent": {"kid": "key-123"}},
        )

        client = VerifierClient(verifier_url="http://localhost:8081/verify")
        await client.verify(
            method="GET",
            url="https://example.com/api",
            headers={
                "signature-input": 'sig=("@method" "host" "x-custom");created=123',
                "signature": "base64==",
                "signature-agent": "https://example.com",
                "host": "example.com",
                "x-custom": "custom-value",
                "user-agent": "TestBot/1.0",  # Not covered, should not be forwarded
            },
        )

        request = mock_verifier.calls.last.request
        import json
        payload = json.loads(request.content)

        # Signature headers should be present
        assert "signature-input" in payload["headers"]
        assert "signature" in payload["headers"]
        assert "signature-agent" in payload["headers"]

        # Covered headers should be present (except @method - derived)
        assert "host" in payload["headers"]
        assert "x-custom" in payload["headers"]

        # Non-covered headers should not be present
        assert "user-agent" not in payload["headers"]
