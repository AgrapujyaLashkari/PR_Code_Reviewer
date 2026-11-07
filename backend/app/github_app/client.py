"""GitHub REST helpers authenticated as the App or an installation."""

from typing import Any

import httpx

from app.config import settings
from app.github_app.app_jwt import create_app_jwt
from app.github_app.tokens import GitHubAppApiError, installation_access_token

_API_VERSION = "2022-11-28"


def _headers(token: str) -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": _API_VERSION,
    }


async def list_app_installations() -> list[dict[str, Any]]:
    """Every installation of this GitHub App (paginated)."""
    jwt_token = create_app_jwt()
    installations: list[dict[str, Any]] = []
    url: str | None = f"{settings.github_api_url}/app/installations?per_page=100"
    async with httpx.AsyncClient(timeout=30, headers=_headers(jwt_token)) as client:
        while url:
            response = await client.get(url)
            if response.status_code != 200:
                raise GitHubAppApiError(
                    f"Could not list installations ({response.status_code})"
                )
            batch = response.json()
            if not isinstance(batch, list):
                break
            installations.extend(batch)
            url = response.links.get("next", {}).get("url")
    return installations


async def get_installation(installation_id: int) -> dict[str, Any]:
    jwt_token = create_app_jwt()
    async with httpx.AsyncClient(timeout=20, headers=_headers(jwt_token)) as client:
        response = await client.get(
            f"{settings.github_api_url}/app/installations/{installation_id}"
        )
    if response.status_code != 200:
        raise GitHubAppApiError(
            f"Installation {installation_id} was not found ({response.status_code})"
        )
    return response.json()


async def list_installation_repos(installation_id: int) -> list[dict[str, Any]]:
    token = await installation_access_token(installation_id)
    repos: list[dict[str, Any]] = []
    url: str | None = (
        f"{settings.github_api_url}/installation/repositories?per_page=100"
    )
    async with httpx.AsyncClient(timeout=30, headers=_headers(token)) as client:
        while url:
            response = await client.get(url)
            if response.status_code != 200:
                raise GitHubAppApiError(
                    f"Could not list installation repositories ({response.status_code})"
                )
            payload = response.json()
            repos.extend(payload.get("repositories") or [])
            url = response.links.get("next", {}).get("url")
    return repos


async def fetch_file_text(
    owner: str,
    repo: str,
    path: str,
    *,
    token: str,
    ref: str | None = None,
) -> str | None:
    """Raw file contents, or None when the path does not exist."""
    url = f"{settings.github_api_url}/repos/{owner}/{repo}/contents/{path}"
    params = {"ref": ref} if ref else None
    headers = {
        **_headers(token),
        "Accept": "application/vnd.github.raw",
    }
    async with httpx.AsyncClient(timeout=20, headers=headers) as client:
        response = await client.get(url, params=params)
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        return None
    return response.text
