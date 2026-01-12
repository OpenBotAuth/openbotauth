"""Tests for signature-input parsing and header forwarding."""

import pytest
from openbotauth_verifier.headers import (
    parse_covered_headers,
    extract_forwarded_headers,
    SENSITIVE_HEADERS,
)


class TestParseCoveredHeaders:
    """Tests for parse_covered_headers function."""

    def test_basic_headers(self):
        """Parse basic header list."""
        sig_input = 'sig1=("@method" "@target-uri" "host");created=123'
        result = parse_covered_headers(sig_input)
        assert result == ["@method", "@target-uri", "host"]

    def test_single_header(self):
        """Parse single header."""
        sig_input = 'sig=("host");created=123;keyid="test"'
        result = parse_covered_headers(sig_input)
        assert result == ["host"]

    def test_empty_parens(self):
        """Empty parentheses returns empty list."""
        sig_input = "sig=();created=123"
        result = parse_covered_headers(sig_input)
        assert result == []

    def test_multiple_headers(self):
        """Parse multiple headers with various components."""
        sig_input = 'sig=("@method" "@path" "host" "content-type" "x-custom-header");created=1699900000;expires=1699900300;nonce="abc123"'
        result = parse_covered_headers(sig_input)
        assert result == ["@method", "@path", "host", "content-type", "x-custom-header"]

    def test_no_parens(self):
        """No parentheses returns empty list."""
        sig_input = "sig=created=123"
        result = parse_covered_headers(sig_input)
        assert result == []

    def test_mixed_case_normalized(self):
        """Headers are normalized to lowercase."""
        sig_input = 'sig=("Host" "Content-Type");created=123'
        result = parse_covered_headers(sig_input)
        assert result == ["host", "content-type"]

    def test_derived_components(self):
        """Derived components (starting with @) are preserved."""
        sig_input = 'sig=("@method" "@authority" "@path" "@query");created=123'
        result = parse_covered_headers(sig_input)
        assert result == ["@method", "@authority", "@path", "@query"]


class TestExtractForwardedHeaders:
    """Tests for extract_forwarded_headers function."""

    def test_basic_forwarding(self):
        """Forward signature and covered headers."""
        headers = {
            "Signature-Input": 'sig=("host" "content-type");created=123',
            "Signature": "base64signature==",
            "Signature-Agent": "https://registry.openbotauth.org/jwks/test.json",
            "Host": "example.com",
            "Content-Type": "application/json",
            "User-Agent": "TestBot/1.0",
        }
        result = extract_forwarded_headers(headers)

        assert "signature-input" in result
        assert "signature" in result
        assert "signature-agent" in result
        assert "host" in result
        assert "content-type" in result
        # User-Agent not covered, not forwarded
        assert "user-agent" not in result

    def test_signature_headers_always_included(self):
        """Signature headers are always included if present."""
        headers = {
            "signature-input": 'sig=();created=123',
            "signature": "base64==",
            "signature-agent": "https://example.com",
        }
        result = extract_forwarded_headers(headers)

        assert "signature-input" in result
        assert "signature" in result
        assert "signature-agent" in result

    def test_derived_components_skipped(self):
        """Derived components starting with @ are skipped."""
        headers = {
            "signature-input": 'sig=("@method" "@target-uri" "host");created=123',
            "signature": "base64==",
            "host": "example.com",
        }
        result = extract_forwarded_headers(headers)

        # @method and @target-uri are skipped
        assert "@method" not in result
        assert "@target-uri" not in result
        assert "host" in result

    def test_sensitive_cookie_raises(self):
        """Cookie header in signature-input raises ValueError."""
        headers = {
            "signature-input": 'sig=("host" "cookie");created=123',
            "signature": "base64==",
            "host": "example.com",
            "cookie": "session=secret",
        }
        with pytest.raises(ValueError, match="Sensitive header 'cookie'"):
            extract_forwarded_headers(headers)

    def test_sensitive_authorization_raises(self):
        """Authorization header in signature-input raises ValueError."""
        headers = {
            "signature-input": 'sig=("authorization");created=123',
            "signature": "base64==",
            "authorization": "Bearer secret-token",
        }
        with pytest.raises(ValueError, match="Sensitive header 'authorization'"):
            extract_forwarded_headers(headers)

    def test_sensitive_proxy_authorization_raises(self):
        """Proxy-Authorization header in signature-input raises ValueError."""
        headers = {
            "signature-input": 'sig=("proxy-authorization");created=123',
            "signature": "base64==",
            "proxy-authorization": "Basic secret",
        }
        with pytest.raises(ValueError, match="Sensitive header 'proxy-authorization'"):
            extract_forwarded_headers(headers)

    def test_sensitive_www_authenticate_raises(self):
        """WWW-Authenticate header in signature-input raises ValueError."""
        headers = {
            "signature-input": 'sig=("www-authenticate");created=123',
            "signature": "base64==",
            "www-authenticate": "Bearer realm=api",
        }
        with pytest.raises(ValueError, match="Sensitive header 'www-authenticate'"):
            extract_forwarded_headers(headers)

    def test_sensitive_headers_present_but_not_covered(self):
        """Sensitive headers present but not covered are not forwarded (no error)."""
        headers = {
            "signature-input": 'sig=("host");created=123',
            "signature": "base64==",
            "host": "example.com",
            "cookie": "session=secret",
            "authorization": "Bearer token",
        }
        result = extract_forwarded_headers(headers)

        # No error raised - sensitive headers not in covered list
        assert "host" in result
        assert "cookie" not in result
        assert "authorization" not in result

    def test_case_insensitive_header_lookup(self):
        """Header lookup is case-insensitive."""
        headers = {
            "SIGNATURE-INPUT": 'sig=("host");created=123',
            "Signature": "base64==",
            "HOST": "example.com",
        }
        result = extract_forwarded_headers(headers)

        assert "signature-input" in result
        assert "signature" in result
        assert "host" in result

    def test_missing_covered_header(self):
        """Missing covered header is silently skipped."""
        headers = {
            "signature-input": 'sig=("host" "x-missing");created=123',
            "signature": "base64==",
            "host": "example.com",
        }
        result = extract_forwarded_headers(headers)

        assert "host" in result
        assert "x-missing" not in result

    def test_no_signature_input(self):
        """No signature-input header means only signature headers forwarded."""
        headers = {
            "signature": "base64==",
            "signature-agent": "https://example.com",
            "host": "example.com",
        }
        result = extract_forwarded_headers(headers)

        assert "signature" in result
        assert "signature-agent" in result
        # host not covered (no signature-input to parse)
        assert "host" not in result


class TestSensitiveHeadersConstant:
    """Tests for SENSITIVE_HEADERS constant."""

    def test_all_sensitive_headers_present(self):
        """All expected sensitive headers are in the set."""
        assert "cookie" in SENSITIVE_HEADERS
        assert "authorization" in SENSITIVE_HEADERS
        assert "proxy-authorization" in SENSITIVE_HEADERS
        assert "www-authenticate" in SENSITIVE_HEADERS

    def test_sensitive_headers_lowercase(self):
        """All sensitive headers are lowercase."""
        for header in SENSITIVE_HEADERS:
            assert header == header.lower()
