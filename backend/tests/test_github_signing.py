"""GitHub App webhook HMAC and App JWT — no MongoDB required."""

import hashlib
import hmac
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.github_app.app_jwt import create_app_jwt
from app.github_app.signing import verify_webhook_signature


def test_webhook_signature_accepts_a_valid_hmac() -> None:
    secret = "webhook-secret"
    body = b'{"action":"opened"}'
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    assert verify_webhook_signature(body, f"sha256={digest}", secret) is True


def test_webhook_signature_rejects_a_tampered_body() -> None:
    secret = "webhook-secret"
    digest = hmac.new(
        secret.encode(), b'{"action":"opened"}', hashlib.sha256
    ).hexdigest()

    assert (
        verify_webhook_signature(b'{"action":"closed"}', f"sha256={digest}", secret)
        is False
    )


def test_webhook_signature_rejects_a_missing_header() -> None:
    assert verify_webhook_signature(b"{}", None, "secret") is False
    assert verify_webhook_signature(b"{}", "", "secret") is False


def test_webhook_signature_rejects_an_empty_secret() -> None:
    assert verify_webhook_signature(b"{}", "sha256=abc", "") is False


@pytest.fixture(scope="module")
def rsa_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


def test_app_jwt_is_rs256_issued_by_the_app(rsa_pem: str) -> None:
    token = create_app_jwt(app_id="123456", private_key_pem=rsa_pem)
    payload = jwt.decode(token, options={"verify_signature": False})

    assert payload["iss"] == "123456"
    assert payload["exp"] - payload["iat"] <= 600
    assert payload["iat"] <= int(time.time())

    public = serialization.load_pem_private_key(
        rsa_pem.encode(), password=None
    ).public_key()
    jwt.decode(token, public, algorithms=["RS256"])
