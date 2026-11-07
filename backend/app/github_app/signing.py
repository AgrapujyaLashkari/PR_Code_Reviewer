"""Verify GitHub webhook HMAC signatures."""

import hashlib
import hmac


def verify_webhook_signature(
    body: bytes, signature_header: str | None, secret: str
) -> bool:
    """Return True when `X-Hub-Signature-256` matches `secret` over `body`."""
    if not secret or not signature_header:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
