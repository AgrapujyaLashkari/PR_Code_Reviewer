"""Registration, login, refresh and profile endpoints."""

from typing import Annotated

from beanie import PydanticObjectId
from fastapi import APIRouter, Cookie, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from pymongo.errors import DuplicateKeyError

from app.auth.deps import CurrentUser
from app.auth.password import hash_password, verify_password
from app.auth.tokens import (
    TokenError,
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.config import settings
from app.db.models import User
from app.db.models.github import GithubInstallation
from app.schemas.auth import (
    LoginRequest,
    PreferencesUpdate,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth"

#: Verified against when the email is unknown, so a miss costs the same time as
#: a hit and cannot be used to enumerate accounts.
_DUMMY_HASH = hash_password("timing-equalisation-placeholder")

_INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
)


async def _to_response(user: User) -> UserResponse:
    has_install = False
    if user.id is not None:
        has_install = (
            await GithubInstallation.find_one(GithubInstallation.user_id == user.id)
            is not None
        )
    return UserResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        preferences=user.preferences,
        github_id=user.github_id,
        github_login=user.github_login,
        github_connected=has_install,
    )


def _issue(response: Response, user_id: str) -> TokenResponse:
    """Set the refresh cookie and return a fresh access token."""
    response.set_cookie(
        REFRESH_COOKIE,
        create_refresh_token(user_id),
        httponly=True,
        samesite="lax",
        # Dev runs over plain http; enable when served behind TLS.
        secure=False,
        max_age=settings.refresh_token_ttl_days * 24 * 3600,
        path=REFRESH_COOKIE_PATH,
    )
    return TokenResponse(
        access_token=create_access_token(user_id),
        expires_in=settings.access_token_ttl_minutes * 60,
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, response: Response) -> TokenResponse:
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        display_name=body.display_name or body.email.split("@")[0],
    )
    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        ) from exc

    return _issue(response, str(user.id))


@router.post("/login")
async def login(body: LoginRequest, response: Response) -> TokenResponse:
    user = await User.find_one(User.email == body.email.lower())
    hashed = user.password_hash if user and user.password_hash else _DUMMY_HASH
    valid = verify_password(body.password, hashed)
    if user is None or user.password_hash is None or not valid:
        raise _INVALID_CREDENTIALS
    return _issue(response, str(user.id))


@router.post("/refresh")
async def refresh(
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
) -> TokenResponse:
    """Exchange the httpOnly refresh cookie for a new access token."""
    if not refresh_token:
        raise _INVALID_CREDENTIALS
    try:
        user_id = decode_token(refresh_token, TokenType.REFRESH)
    except TokenError as exc:
        raise _INVALID_CREDENTIALS from exc

    if await User.get(PydanticObjectId(user_id)) is None:
        raise _INVALID_CREDENTIALS
    return _issue(response, user_id)


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)
    return {"detail": "logged out"}


@router.get("/me")
async def me(user: CurrentUser) -> UserResponse:
    return await _to_response(user)


@router.patch("/me")
async def update_me(user: CurrentUser, body: PreferencesUpdate) -> UserResponse:
    if body.llm_model is not None:
        user.preferences.llm_model = body.llm_model or None
    if body.min_severity is not None:
        user.preferences.min_severity = body.min_severity
    await user.save()
    return await _to_response(user)


@router.get("/github")
async def github_login_start() -> RedirectResponse:
    """Begin GitHub App OAuth (Vercel-style sign-in)."""
    from app.github_app import oauth

    if not oauth.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub App is not configured on this server",
        )
    state = oauth.new_state()
    redirect = RedirectResponse(oauth.authorize_url(state), status_code=302)
    redirect.set_cookie(
        oauth.STATE_COOKIE,
        state,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=oauth.STATE_COOKIE_MAX_AGE,
        path=REFRESH_COOKIE_PATH,
    )
    return redirect


@router.get("/github/callback")
async def github_login_callback(
    code: Annotated[str, Query()] = "",
    state: Annotated[str, Query()] = "",
    state_cookie: Annotated[str | None, Cookie(alias="github_oauth_state")] = None,
) -> RedirectResponse:
    """Finish GitHub OAuth, create or link the user, send them to the UI."""
    from app.github_app import oauth
    from app.github_app.service import sync_installations_for_github_user

    frontend = settings.frontend_url.rstrip("/")
    error_url = f"{frontend}/login?error=github"

    if not code or not state or not state_cookie or state != state_cookie:
        return RedirectResponse(error_url, status_code=302)

    try:
        user_token = await oauth.exchange_code(code)
        profile = await oauth.fetch_github_user(user_token)
    except oauth.GitHubOAuthError:
        return RedirectResponse(error_url, status_code=302)

    user = await User.find_one(User.github_id == profile["github_id"])
    if user is None:
        user = await User.find_one(User.email == profile["email"])
    if user is None:
        user = User(
            email=str(profile["email"]),
            password_hash=None,
            display_name=str(profile["name"]),
            github_id=int(profile["github_id"]),
            github_login=str(profile["login"]),
            github_avatar_url=str(profile["avatar_url"]),
        )
        try:
            await user.insert()
        except DuplicateKeyError:
            return RedirectResponse(error_url, status_code=302)
    else:
        user.github_id = int(profile["github_id"])
        user.github_login = str(profile["login"])
        user.github_avatar_url = str(profile["avatar_url"])
        if not user.display_name:
            user.display_name = str(profile["name"])
        await user.save()

    await sync_installations_for_github_user(user)
    has_install = (
        await GithubInstallation.find_one(GithubInstallation.user_id == user.id)
        is not None
    )
    dest = f"{frontend}/repos" if not has_install else f"{frontend}/dashboard"
    redirect = RedirectResponse(dest, status_code=302)
    _issue(redirect, str(user.id))
    redirect.delete_cookie("github_oauth_state", path=REFRESH_COOKIE_PATH)
    return redirect
