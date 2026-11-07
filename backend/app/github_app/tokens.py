"""Installation access tokens, cached for their ~1 hour lifetime."""

import time
from dataclasses import dataclass

import httpx

from app.config import settings
from app.github_app.app_jwt import create_app_jwt

_cache: dict[int, tuple[str, float]] = {}
#: Refresh 60s before GitHub expires the token.
_SKEW_SECONDS = 60


@dataclass(frozen=True)
class InstallationToken:
    token: str
    expires_at: float


class GitHubAppApiError(RuntimeError):
    """The GitHub App API rejected a request."""


async def installation_access_token(installation_id: int) -> str:
    cached = _cache.get(installation_id)
    if cached is not None and cached[1] - _SKEW_SECONDS > time.time():
        return cached[0]

    minted = await _mint(installation_id)
    _cache[installation_id] = (minted.token, minted.expires_at)
    return minted.token


async def _mint(installation_id: int) -> InstallationToken:
    jwt_token = create_app_jwt()
    url = f"{settings.github_api_url}/app/installations/{installation_id}/access_tokens"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {jwt_token}",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
    if response.status_code not in (200, 201):
        raise GitHubAppApiError(
            f"Could not mint an installation token ({response.status_code})"
        )
    payload = response.json()
    token = payload.get("token")
    if not token:
        raise GitHubAppApiError("GitHub returned no installation token")
    # GitHub documents ~1 hour. If expires_at is missing, assume 50 minutes.
    expires_at = time.time() + 50 * 60
    return InstallationToken(token=token, expires_at=expires_at)


def clear_token_cache() -> None:
    _cache.clear()
