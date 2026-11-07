"""GitHub App user OAuth — Vercel-style sign-in, never a pasted PAT."""

import secrets

import httpx

from app.config import settings

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
STATE_COOKIE = "github_oauth_state"
STATE_COOKIE_MAX_AGE = 600


class GitHubAppNotConfigured(RuntimeError):
    """The instance has no GitHub App credentials."""


class GitHubOAuthError(RuntimeError):
    """The OAuth handshake failed."""


def is_configured() -> bool:
    return bool(
        settings.github_app_id
        and settings.github_app_client_id
        and settings.github_app_client_secret
        and settings.github_app_private_key
        and settings.github_app_slug
    )


def new_state() -> str:
    return secrets.token_urlsafe(32)


def authorize_url(state: str) -> str:
    if not is_configured():
        raise GitHubAppNotConfigured("GitHub App OAuth is not configured")
    redirect = settings.github_oauth_redirect_url
    return (
        f"{GITHUB_AUTHORIZE_URL}"
        f"?client_id={settings.github_app_client_id}"
        f"&redirect_uri={redirect}"
        f"&state={state}"
        f"&allow_signup=true"
    )


def install_url(*, state: str = "") -> str:
    if not is_configured():
        raise GitHubAppNotConfigured("GitHub App is not configured")
    url = f"https://github.com/apps/{settings.github_app_slug}/installations/new"
    if state:
        url += f"?state={state}"
    return url


async def exchange_code(code: str) -> str:
    """Trade the OAuth `code` for a short-lived *user* access token."""
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_app_client_id,
                "client_secret": settings.github_app_client_secret,
                "code": code,
                "redirect_uri": settings.github_oauth_redirect_url,
            },
        )
    if response.status_code != 200:
        raise GitHubOAuthError("GitHub refused the OAuth code exchange")
    payload = response.json()
    token = payload.get("access_token")
    if not token:
        raise GitHubOAuthError(payload.get("error_description") or "No access token")
    return token


async def fetch_github_user(user_token: str) -> dict[str, str | int]:
    """Identity of the GitHub user who just authorised the app."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {user_token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=20, headers=headers) as client:
        user_response = await client.get(f"{settings.github_api_url}/user")
        if user_response.status_code != 200:
            raise GitHubOAuthError("Could not read the GitHub user profile")
        profile = user_response.json()

        email = profile.get("email")
        if not email:
            emails_response = await client.get(f"{settings.github_api_url}/user/emails")
            if emails_response.status_code == 200:
                for entry in emails_response.json():
                    if entry.get("primary") and entry.get("email"):
                        email = entry["email"]
                        break
                if not email:
                    for entry in emails_response.json():
                        if entry.get("email"):
                            email = entry["email"]
                            break

    login = str(profile.get("login") or "")
    if not email:
        email = f"{login}@users.noreply.github.com"
    return {
        "github_id": int(profile["id"]),
        "login": login,
        "email": str(email).lower(),
        "name": str(profile.get("name") or login),
        "avatar_url": str(profile.get("avatar_url") or ""),
    }
