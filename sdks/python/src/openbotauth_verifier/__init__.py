"""
OpenBotAuth Verifier SDK for Python

Verify RFC 9421 HTTP Message Signatures from OpenBotAuth-signed requests.
"""

from .models import VerificationRequest, VerificationResult
from .client import VerifierClient
from .headers import parse_covered_headers, extract_forwarded_headers, has_signature_headers

__version__ = "0.1.0"

__all__ = [
    "VerificationRequest",
    "VerificationResult",
    "VerifierClient",
    "parse_covered_headers",
    "extract_forwarded_headers",
    "has_signature_headers",
]

# Middleware imports - optional, require framework dependencies
try:
    from .middleware.asgi import OpenBotAuthASGIMiddleware
    __all__.append("OpenBotAuthASGIMiddleware")
except ImportError:
    pass

try:
    from .middleware.wsgi import OpenBotAuthWSGIMiddleware
    __all__.append("OpenBotAuthWSGIMiddleware")
except ImportError:
    pass
