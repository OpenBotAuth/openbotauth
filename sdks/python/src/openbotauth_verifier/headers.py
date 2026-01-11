"""
Signature-Input parsing and privacy-safe header forwarding.
"""

import re
from typing import Mapping


# Sensitive headers that must never be forwarded to verifier
SENSITIVE_HEADERS = frozenset({
    "cookie",
    "authorization",
    "proxy-authorization",
    "www-authenticate",
})

# Required signature headers
SIGNATURE_HEADERS = frozenset({
    "signature-input",
    "signature",
    "signature-agent",
})


def parse_covered_headers(signature_input: str) -> list[str]:
    """
    Parse the covered headers from a Signature-Input header value.

    RFC 9421 Signature-Input format:
      sig1=("@method" "@target-uri" "host" "content-type");created=...;keyid=...

    This extracts the identifiers inside the parentheses.

    Args:
        signature_input: The Signature-Input header value

    Returns:
        List of covered header/component names (lowercase, without quotes)

    Examples:
        >>> parse_covered_headers('sig1=("@method" "@target-uri" "host");created=123')
        ['@method', '@target-uri', 'host']
        >>> parse_covered_headers('sig=();created=123')
        []
    """
    # Find content inside parentheses
    # Matches: sig1=("header1" "header2" ...);params
    match = re.search(r'\(([^)]*)\)', signature_input)
    if not match:
        return []

    content = match.group(1).strip()
    if not content:
        return []

    # Split on whitespace and remove quotes
    headers = []
    for item in content.split():
        # Remove surrounding quotes
        item = item.strip('"')
        if item:
            headers.append(item.lower())

    return headers


def extract_forwarded_headers(
    all_headers: Mapping[str, str],
) -> dict[str, str]:
    """
    Extract headers that are safe to forward to the verifier service.

    Rules:
    1. Always include signature-input, signature, signature-agent (if present)
    2. Include any headers covered by signature-input (from its parameter list)
    3. Skip derived components starting with "@" (like @method, @target-uri)
    4. REJECT (raise ValueError) if any sensitive header is covered by signature-input

    Args:
        all_headers: All request headers (case-insensitive keys)

    Returns:
        Dict of headers to forward (lowercase keys)

    Raises:
        ValueError: If a sensitive header is covered by signature-input

    Examples:
        >>> headers = {
        ...     "signature-input": 'sig=("host" "content-type");created=123',
        ...     "signature": "base64...",
        ...     "signature-agent": "https://bot.example.com",
        ...     "host": "example.com",
        ...     "content-type": "application/json",
        ...     "cookie": "session=abc",
        ... }
        >>> extract_forwarded_headers(headers)
        {'signature-input': 'sig=...', 'signature': 'base64...', ...}
    """
    # Normalize all header names to lowercase for lookup
    normalized: dict[str, tuple[str, str]] = {}
    for key, value in all_headers.items():
        normalized[key.lower()] = (key, value)

    result: dict[str, str] = {}

    # Get signature-input to parse covered headers
    sig_input_entry = normalized.get("signature-input")
    covered: list[str] = []

    if sig_input_entry:
        sig_input_value = sig_input_entry[1]
        covered = parse_covered_headers(sig_input_value)

        # Check for sensitive headers in covered components
        for header in covered:
            # Skip derived components (start with @)
            if header.startswith("@"):
                continue
            if header in SENSITIVE_HEADERS:
                raise ValueError(
                    f"Sensitive header '{header}' is covered by Signature-Input. "
                    "Cannot forward request to verifier - this may leak credentials."
                )

    # Always include signature headers if present
    for sig_header in SIGNATURE_HEADERS:
        if sig_header in normalized:
            result[sig_header] = normalized[sig_header][1]

    # Include covered headers (except derived components and sensitive)
    for header in covered:
        # Skip derived components
        if header.startswith("@"):
            continue
        # Skip sensitive (already validated above, but be defensive)
        if header in SENSITIVE_HEADERS:
            continue
        # Add if present
        if header in normalized:
            result[header] = normalized[header][1]

    return result
