"""Tests for ASGI and WSGI middleware."""

import pytest
import respx
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from openbotauth_verifier.middleware.asgi import OpenBotAuthASGIMiddleware
from openbotauth_verifier.middleware.wsgi import OpenBotAuthWSGIMiddleware


# Test ASGI app
async def asgi_endpoint(request):
    oba = getattr(request.state, "oba", None)
    return JSONResponse({
        "signed": oba.signed if oba else False,
        "verified": oba.result.verified if oba and oba.result else False,
        "agent": oba.result.agent if oba and oba.result else None,
    })


def create_asgi_app(verifier_url: str, require_verified: bool = False):
    """Create test ASGI app with middleware."""
    app = Starlette(routes=[Route("/test", asgi_endpoint)])
    app.add_middleware(
        OpenBotAuthASGIMiddleware,
        verifier_url=verifier_url,
        require_verified=require_verified,
    )
    return app


@pytest.fixture
def mock_verifier():
    """Create a respx mock for the verifier service."""
    with respx.mock(assert_all_called=False) as mock:
        yield mock


class TestASGIMiddleware:
    """Tests for OpenBotAuthASGIMiddleware."""

    def test_unsigned_request_observe_mode(self, mock_verifier):
        """Unsigned request in observe mode passes through."""
        app = create_asgi_app("http://localhost:8081/verify", require_verified=False)
        client = TestClient(app)

        response = client.get("/test")

        assert response.status_code == 200
        data = response.json()
        assert data["signed"] is False

    def test_unsigned_request_require_mode(self, mock_verifier):
        """Unsigned request in require mode returns 401."""
        app = create_asgi_app("http://localhost:8081/verify", require_verified=True)
        client = TestClient(app)

        response = client.get("/test")

        assert response.status_code == 401
        assert "X-OBA-Decision" in response.headers
        assert response.headers["X-OBA-Decision"] == "deny"

    def test_signed_request_verified(self, mock_verifier):
        """Signed and verified request sets state correctly."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            json={
                "verified": True,
                "agent": {"kid": "key-123", "client_name": "TestBot"},
            }
        )

        app = create_asgi_app("http://localhost:8081/verify")
        client = TestClient(app)

        response = client.get(
            "/test",
            headers={
                "signature-input": 'sig=("host");created=123',
                "signature": "base64==",
                "signature-agent": "https://example.com",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["signed"] is True
        assert data["verified"] is True
        assert data["agent"]["kid"] == "key-123"
        assert response.headers["X-OBA-Decision"] == "allow"

    def test_signed_request_not_verified(self, mock_verifier):
        """Signed but not verified request in observe mode passes through."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            json={
                "verified": False,
                "error": "Invalid signature",
            }
        )

        app = create_asgi_app("http://localhost:8081/verify", require_verified=False)
        client = TestClient(app)

        response = client.get(
            "/test",
            headers={
                "signature-input": 'sig=("host");created=123',
                "signature": "invalid",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["signed"] is True
        assert data["verified"] is False
        assert response.headers["X-OBA-Decision"] == "observe"

    def test_signed_request_not_verified_require_mode(self, mock_verifier):
        """Signed but not verified request in require mode returns 401."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            json={
                "verified": False,
                "error": "Invalid signature",
            }
        )

        app = create_asgi_app("http://localhost:8081/verify", require_verified=True)
        client = TestClient(app)

        response = client.get(
            "/test",
            headers={
                "signature-input": 'sig=("host");created=123',
                "signature": "invalid",
            },
        )

        assert response.status_code == 401
        assert response.headers["X-OBA-Decision"] == "deny"
        data = response.json()
        assert data["error"] == "Invalid signature"

    def test_sensitive_header_in_signature_observe_mode(self):
        """Sensitive header in signature returns error in state (observe mode)."""
        app = create_asgi_app("http://localhost:8081/verify", require_verified=False)
        client = TestClient(app)

        response = client.get(
            "/test",
            headers={
                "signature-input": 'sig=("host" "cookie");created=123',
                "signature": "base64==",
                "cookie": "session=secret",
            },
        )

        # In observe mode, request passes but verification fails
        assert response.status_code == 200
        data = response.json()
        assert data["signed"] is True
        assert data["verified"] is False


# Test WSGI app
def wsgi_app_handler(environ, start_response):
    """Simple WSGI app for testing."""
    oba = environ.get("openbotauth.oba")

    import json
    body = json.dumps({
        "signed": oba.signed if oba else False,
        "verified": oba.result.verified if oba and oba.result else False,
        "agent": oba.result.agent if oba and oba.result else None,
    }).encode()

    start_response("200 OK", [
        ("Content-Type", "application/json"),
        ("Content-Length", str(len(body))),
    ])
    return [body]


def create_wsgi_app(verifier_url: str, require_verified: bool = False):
    """Create test WSGI app with middleware."""
    return OpenBotAuthWSGIMiddleware(
        wsgi_app_handler,
        verifier_url=verifier_url,
        require_verified=require_verified,
    )


class TestWSGIMiddleware:
    """Tests for OpenBotAuthWSGIMiddleware."""

    def test_unsigned_request_observe_mode(self, mock_verifier):
        """Unsigned request in observe mode passes through."""
        app = create_wsgi_app("http://localhost:8081/verify", require_verified=False)

        # Simulate WSGI environ
        environ = {
            "REQUEST_METHOD": "GET",
            "PATH_INFO": "/test",
            "SERVER_NAME": "localhost",
            "wsgi.url_scheme": "http",
        }

        responses = []
        def start_response(status, headers, exc_info=None):
            responses.append((status, headers))

        body = b"".join(app(environ, start_response))

        assert responses[0][0] == "200 OK"
        import json
        data = json.loads(body)
        assert data["signed"] is False

    def test_unsigned_request_require_mode(self, mock_verifier):
        """Unsigned request in require mode returns 401."""
        app = create_wsgi_app("http://localhost:8081/verify", require_verified=True)

        environ = {
            "REQUEST_METHOD": "GET",
            "PATH_INFO": "/test",
            "SERVER_NAME": "localhost",
            "wsgi.url_scheme": "http",
        }

        responses = []
        def start_response(status, headers, exc_info=None):
            responses.append((status, dict(headers)))

        body = b"".join(app(environ, start_response))

        assert responses[0][0] == "401 Unauthorized"
        assert responses[0][1]["X-OBA-Decision"] == "deny"

    def test_signed_request_verified(self, mock_verifier):
        """Signed and verified request sets environ correctly."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            json={
                "verified": True,
                "agent": {"kid": "key-123"},
            }
        )

        app = create_wsgi_app("http://localhost:8081/verify")

        environ = {
            "REQUEST_METHOD": "GET",
            "PATH_INFO": "/test",
            "SERVER_NAME": "localhost",
            "wsgi.url_scheme": "http",
            "HTTP_SIGNATURE_INPUT": 'sig=("host");created=123',
            "HTTP_SIGNATURE": "base64==",
            "HTTP_SIGNATURE_AGENT": "https://example.com",
            "HTTP_HOST": "localhost",
        }

        responses = []
        def start_response(status, headers, exc_info=None):
            responses.append((status, dict(headers)))

        body = b"".join(app(environ, start_response))

        assert responses[0][0] == "200 OK"
        assert responses[0][1]["X-OBA-Decision"] == "allow"

        import json
        data = json.loads(body)
        assert data["signed"] is True
        assert data["verified"] is True

    def test_signed_request_not_verified_require_mode(self, mock_verifier):
        """Signed but not verified request in require mode returns 401."""
        mock_verifier.post("http://localhost:8081/verify").respond(
            json={
                "verified": False,
                "error": "Invalid signature",
            }
        )

        app = create_wsgi_app("http://localhost:8081/verify", require_verified=True)

        environ = {
            "REQUEST_METHOD": "GET",
            "PATH_INFO": "/test",
            "SERVER_NAME": "localhost",
            "wsgi.url_scheme": "http",
            "HTTP_SIGNATURE_INPUT": 'sig=("host");created=123',
            "HTTP_SIGNATURE": "invalid",
        }

        responses = []
        def start_response(status, headers, exc_info=None):
            responses.append((status, dict(headers)))

        body = b"".join(app(environ, start_response))

        assert responses[0][0] == "401 Unauthorized"
        assert responses[0][1]["X-OBA-Decision"] == "deny"
