"""
OpenBotAuth middleware for ASGI and WSGI frameworks.

Re-exports middleware classes for convenient imports:
    from openbotauth_verifier.middleware import OpenBotAuthASGIMiddleware
    from openbotauth_verifier.middleware import OpenBotAuthWSGIMiddleware
"""

__all__: list[str] = []

# ASGI middleware (FastAPI, Starlette)
try:
    from .asgi import OpenBotAuthASGIMiddleware
    __all__.append("OpenBotAuthASGIMiddleware")
except ImportError:
    pass

# WSGI middleware (Flask)
try:
    from .wsgi import OpenBotAuthWSGIMiddleware
    __all__.append("OpenBotAuthWSGIMiddleware")
except ImportError:
    pass
