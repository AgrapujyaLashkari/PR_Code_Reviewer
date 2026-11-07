"""Short-lived GitHub App JWTs (RS256), used to mint installation tokens."""

import time

import jwt

from app.config import settings


def create_app_jwt(
    *, app_id: str | None = None, private_key_pem: str | None = None
) -> str:
    """Sign a GitHub App JWT valid for under 10 minutes."""
    issuer = app_id if app_id is not None else settings.github_app_id
    pem = (
        private_key_pem
        if private_key_pem is not None
        else settings.github_app_private_key
    )
    if not issuer or not pem:
        raise RuntimeError("GitHub App is not configured (APP_ID / PRIVATE_KEY)")

    now = int(time.time())
    payload = {"iat": now - 60, "exp": now + 9 * 60, "iss": issuer}
    return jwt.encode(payload, pem, algorithm="RS256")
