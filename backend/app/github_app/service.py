"""Connect installations to users, sync repos, start PR reviews."""

from __future__ import annotations

import logging
from typing import Any

from beanie import PydanticObjectId

from app.db.models import ReviewSource, SourceKind, User
from app.db.models.github import ConnectedRepo, GithubInstallation
from app.github_app import client as gh
from app.github_app.tokens import GitHubAppApiError, installation_access_token
from app.ingest import service as ingest
from app.ingest.github import GitHubError, fetch_pull_request, fetch_repo_context
from app.services import reviews as review_service

logger = logging.getLogger(__name__)

REVIEWABLE_PR_ACTIONS = frozenset({"opened", "synchronize", "reopened"})


async def upsert_installation_for_user(
    user: User, installation_payload: dict[str, Any]
) -> GithubInstallation:
    installation_id = int(installation_payload["id"])
    account = installation_payload.get("account") or {}
    existing = await GithubInstallation.find_one(
        GithubInstallation.installation_id == installation_id
    )
    if existing is not None:
        existing.user_id = user.id
        existing.account_login = str(account.get("login") or existing.account_login)
        existing.account_id = int(account.get("id") or existing.account_id)
        existing.account_type = str(account.get("type") or existing.account_type)
        existing.suspended = bool(installation_payload.get("suspended_at"))
        await existing.save()
        return existing

    document = GithubInstallation(
        installation_id=installation_id,
        account_login=str(account.get("login") or ""),
        account_id=int(account.get("id") or 0),
        account_type=str(account.get("type") or "User"),
        user_id=user.id,
        suspended=bool(installation_payload.get("suspended_at")),
    )
    await document.insert()
    return document


async def sync_repos(installation: GithubInstallation) -> list[ConnectedRepo]:
    raw_repos = await gh.list_installation_repos(installation.installation_id)
    seen_ids: set[int] = set()
    connected: list[ConnectedRepo] = []
    for entry in raw_repos:
        github_id = int(entry["id"])
        seen_ids.add(github_id)
        full_name = str(entry.get("full_name") or "")
        owner, _, name = full_name.partition("/")
        document = await ConnectedRepo.find_one(
            ConnectedRepo.user_id == installation.user_id,
            ConnectedRepo.full_name == full_name,
        )
        if document is None:
            document = ConnectedRepo(
                user_id=installation.user_id,
                installation_id=installation.installation_id,
                owner=owner,
                name=name,
                full_name=full_name,
                github_id=github_id,
                private=bool(entry.get("private")),
                enabled=True,
            )
            await document.insert()
        else:
            document.installation_id = installation.installation_id
            document.github_id = github_id
            document.private = bool(entry.get("private"))
            await document.save()
        connected.append(document)

    stale = await ConnectedRepo.find(
        ConnectedRepo.installation_id == installation.installation_id,
        ConnectedRepo.user_id == installation.user_id,
    ).to_list()
    for document in stale:
        if document.github_id not in seen_ids:
            await document.delete()
    return connected


async def sync_installations_for_github_user(user: User) -> list[GithubInstallation]:
    """Attach personal-account installations whose account id matches the user."""
    if user.github_id is None:
        return []
    matched: list[GithubInstallation] = []
    try:
        installations = await gh.list_app_installations()
    except (GitHubAppApiError, RuntimeError) as exc:
        logger.info("Could not list GitHub App installations: %s", exc)
        return []

    for payload in installations:
        account = payload.get("account") or {}
        if int(account.get("id") or 0) != user.github_id:
            continue
        installation = await upsert_installation_for_user(user, payload)
        await sync_repos(installation)
        matched.append(installation)
    return matched


async def attach_installation(user: User, installation_id: int) -> GithubInstallation:
    payload = await gh.get_installation(installation_id)
    account = payload.get("account") or {}
    account_id = int(account.get("id") or 0)
    # Personal installs must belong to this GitHub user. Org installs are
    # accepted from the signed-in user who just completed the setup redirect.
    if account.get("type") == "User" and account_id != user.github_id:
        raise GitHubAppApiError("This GitHub App install belongs to another account")
    installation = await upsert_installation_for_user(user, payload)
    await sync_repos(installation)
    return installation


async def handle_installation_event(payload: dict[str, Any]) -> None:
    action = payload.get("action")
    installation_payload = payload.get("installation") or {}
    sender = payload.get("sender") or {}
    sender_id = sender.get("id")
    if sender_id is None:
        return
    user = await User.find_one(User.github_id == int(sender_id))
    if user is None:
        logger.info(
            "GitHub App install by github_id=%s has no ReviewPulse user yet",
            sender_id,
        )
        return

    if action in {"deleted", "suspend"}:
        installation_id = int(installation_payload.get("id") or 0)
        await ConnectedRepo.find(
            ConnectedRepo.installation_id == installation_id
        ).delete()
        await GithubInstallation.find(
            GithubInstallation.installation_id == installation_id
        ).delete()
        return

    if action in {"created", "unsuspend", "new_permissions_accepted"}:
        installation = await upsert_installation_for_user(user, installation_payload)
        repos = payload.get("repositories") or []
        if repos:
            await _upsert_repo_list(installation, repos)
        else:
            await sync_repos(installation)


async def handle_installation_repositories_event(payload: dict[str, Any]) -> None:
    installation_payload = payload.get("installation") or {}
    installation_id = int(installation_payload.get("id") or 0)
    installation = await GithubInstallation.find_one(
        GithubInstallation.installation_id == installation_id
    )
    if installation is None:
        return
    for entry in payload.get("repositories_added") or []:
        await _upsert_repo_list(installation, [entry])
    for entry in payload.get("repositories_removed") or []:
        full_name = entry.get("full_name")
        if full_name:
            await ConnectedRepo.find(
                ConnectedRepo.installation_id == installation_id,
                ConnectedRepo.full_name == full_name,
            ).delete()


async def _upsert_repo_list(
    installation: GithubInstallation, repos: list[dict[str, Any]]
) -> None:
    for entry in repos:
        full_name = str(entry.get("full_name") or "")
        if not full_name:
            continue
        owner, _, name = full_name.partition("/")
        existing = await ConnectedRepo.find_one(
            ConnectedRepo.user_id == installation.user_id,
            ConnectedRepo.full_name == full_name,
        )
        if existing is None:
            await ConnectedRepo(
                user_id=installation.user_id,
                installation_id=installation.installation_id,
                owner=owner,
                name=name,
                full_name=full_name,
                github_id=int(entry.get("id") or 0),
                private=bool(entry.get("private")),
                enabled=True,
            ).insert()


async def handle_pull_request_event(payload: dict[str, Any]) -> None:
    action = payload.get("action")
    if action not in REVIEWABLE_PR_ACTIONS:
        return
    pull = payload.get("pull_request") or {}
    if pull.get("draft"):
        return
    repository = payload.get("repository") or {}
    full_name = str(repository.get("full_name") or "")
    if not full_name:
        return
    connected = await ConnectedRepo.find_one(
        ConnectedRepo.full_name == full_name,
        ConnectedRepo.enabled == True,  # noqa: E712
    )
    if connected is None:
        logger.info("Ignoring PR on unconnected repo %s", full_name)
        return
    user = await User.get(connected.user_id)
    if user is None:
        return

    installation_id = int(
        (payload.get("installation") or {}).get("id") or connected.installation_id
    )
    token = await installation_access_token(installation_id)
    owner, _, name = full_name.partition("/")
    number = int(pull["number"])
    try:
        from app.ingest.github import PullRequestRef

        files, head_sha = await fetch_pull_request(
            PullRequestRef(owner=owner, repo=name, number=number), token=token
        )
    except (GitHubError, ingest.IngestError) as exc:
        logger.warning("Could not ingest PR %s#%s: %s", full_name, number, exc)
        return

    guidelines = await _guidelines(connected, token, ref=head_sha)
    source = ReviewSource(
        kind=SourceKind.GITHUB_APP,
        label=f"{full_name}#{number}",
        repo=full_name,
        pr_number=number,
        commit_sha=head_sha,
        installation_id=installation_id,
    )
    review = await review_service.create_review(
        user, source, files, repo_guidelines=guidelines
    )
    await review_service.run_review(review.id)


async def _guidelines(connected: ConnectedRepo, token: str, *, ref: str | None) -> str:
    sections: list[str] = []
    if connected.extra_guidelines.strip():
        sections.append(connected.extra_guidelines.strip())
    try:
        fetched = await fetch_repo_context(
            connected.owner, connected.name, token=token, ref=ref
        )
    except Exception as exc:
        logger.info("Repo context fetch failed for %s: %s", connected.full_name, exc)
        fetched = ""
    if fetched:
        sections.append(fetched)
    return "\n\n".join(sections)


async def token_for_user_repo(user_id: PydanticObjectId, full_name: str) -> str:
    connected = await ConnectedRepo.find_one(
        ConnectedRepo.user_id == user_id,
        ConnectedRepo.full_name == full_name,
        ConnectedRepo.enabled == True,  # noqa: E712
    )
    if connected is None:
        raise GitHubAppApiError(
            f"{full_name} is not connected. Install the GitHub App on that repository."
        )
    return await installation_access_token(connected.installation_id)
