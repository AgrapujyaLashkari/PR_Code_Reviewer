"""GitHub App: install, connected repos, and signed webhooks."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.auth.deps import CurrentUser
from app.config import settings
from app.db.models.github import ConnectedRepo, GithubInstallation
from app.github_app import oauth
from app.github_app.service import (
    attach_installation,
    handle_installation_event,
    handle_installation_repositories_event,
    handle_pull_request_event,
    sync_repos,
)
from app.github_app.signing import verify_webhook_signature
from app.github_app.tokens import GitHubAppApiError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/github", tags=["github"])


class RepoUpdate(BaseModel):
    enabled: bool | None = None
    extra_guidelines: str | None = Field(default=None, max_length=8000)


class RepoResponse(BaseModel):
    full_name: str
    owner: str
    name: str
    private: bool
    enabled: bool
    extra_guidelines: str
    installation_id: int


class InstallUrlResponse(BaseModel):
    url: str
    configured: bool


class InstallRequest(BaseModel):
    installation_id: int


@router.get("/install-url")
async def install_url(user: CurrentUser) -> InstallUrlResponse:
    if not oauth.is_configured():
        return InstallUrlResponse(url="", configured=False)
    return InstallUrlResponse(url=oauth.install_url(), configured=True)


@router.get("/repos")
async def list_repos(user: CurrentUser) -> list[RepoResponse]:
    documents = (
        await ConnectedRepo.find(ConnectedRepo.user_id == user.id)
        .sort(ConnectedRepo.full_name)
        .to_list()
    )
    return [_repo(document) for document in documents]


@router.post("/repos/sync")
async def sync_user_repos(user: CurrentUser) -> list[RepoResponse]:
    installations = await GithubInstallation.find(
        GithubInstallation.user_id == user.id
    ).to_list()
    for installation in installations:
        try:
            await sync_repos(installation)
        except (GitHubAppApiError, RuntimeError) as exc:
            logger.info(
                "Repo sync failed for %s: %s", installation.installation_id, exc
            )
    return await list_repos(user)


@router.patch("/repos/{full_name:path}")
async def update_repo(
    user: CurrentUser, full_name: str, body: RepoUpdate
) -> RepoResponse:
    document = await ConnectedRepo.find_one(
        ConnectedRepo.user_id == user.id, ConnectedRepo.full_name == full_name
    )
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository is not connected")
    if body.enabled is not None:
        document.enabled = body.enabled
    if body.extra_guidelines is not None:
        document.extra_guidelines = body.extra_guidelines
    await document.save()
    return _repo(document)


@router.post("/installations")
async def complete_install(user: CurrentUser, body: InstallRequest) -> dict[str, str]:
    """Attach a GitHub App installation after the user returns from GitHub."""
    try:
        await attach_installation(user, body.installation_id)
    except GitHubAppApiError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return {"status": "ok"}


@router.post("/webhook")
async def webhook(request: Request, background: BackgroundTasks) -> dict[str, str]:
    raw = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    if not verify_webhook_signature(raw, signature, settings.github_app_webhook_secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook signature")

    event = request.headers.get("X-GitHub-Event", "")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON") from exc

    if event == "ping":
        return {"status": "ok"}
    if event == "installation":
        background.add_task(handle_installation_event, payload)
    elif event == "installation_repositories":
        background.add_task(handle_installation_repositories_event, payload)
    elif event == "pull_request":
        background.add_task(handle_pull_request_event, payload)
    return {"status": "ok"}


def _repo(document: ConnectedRepo) -> RepoResponse:
    return RepoResponse(
        full_name=document.full_name,
        owner=document.owner,
        name=document.name,
        private=document.private,
        enabled=document.enabled,
        extra_guidelines=document.extra_guidelines,
        installation_id=document.installation_id,
    )
