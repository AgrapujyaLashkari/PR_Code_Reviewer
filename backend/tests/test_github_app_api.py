"""GitHub App OAuth, repo connection, and signed webhooks."""

import hashlib
import hmac
import json

import pytest
from beanie import PydanticObjectId
from httpx import AsyncClient

from app.config import settings
from app.db.models import User
from app.db.models.github import ConnectedRepo, GithubInstallation
from app.github_app.tokens import clear_token_cache
from app.services import reviews as service


def _sign(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture
def github_app_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "github_app_id", "1")
    monkeypatch.setattr(settings, "github_app_client_id", "client")
    monkeypatch.setattr(settings, "github_app_client_secret", "secret")
    monkeypatch.setattr(settings, "github_app_private_key", "not-a-real-key")
    monkeypatch.setattr(settings, "github_app_slug", "reviewpulse")
    monkeypatch.setattr(settings, "github_app_webhook_secret", "whsec")
    monkeypatch.setattr(
        settings, "github_oauth_redirect_url", "http://test/api/v1/auth/github/callback"
    )
    clear_token_cache()


async def test_github_oauth_start_redirects_when_configured(
    client: AsyncClient, github_app_settings: None
) -> None:
    response = await client.get("/api/v1/auth/github", follow_redirects=False)

    assert response.status_code == 302
    assert "github.com/login/oauth/authorize" in response.headers["location"]
    assert "github_oauth_state" in response.cookies


async def test_github_oauth_start_is_unavailable_without_app(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "github_app_client_id", "")
    response = await client.get("/api/v1/auth/github", follow_redirects=False)
    assert response.status_code == 503


async def test_webhook_rejects_a_bad_signature(
    client: AsyncClient, github_app_settings: None
) -> None:
    response = await client.post(
        "/api/v1/github/webhook",
        content=b'{"action":"opened"}',
        headers={
            "X-GitHub-Event": "ping",
            "X-Hub-Signature-256": "sha256=deadbeef",
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 401


async def test_webhook_ping_is_accepted(
    client: AsyncClient, github_app_settings: None
) -> None:
    body = b'{"zen":"ok"}'
    response = await client.post(
        "/api/v1/github/webhook",
        content=body,
        headers={
            "X-GitHub-Event": "ping",
            "X-Hub-Signature-256": _sign(body, "whsec"),
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 200


async def test_pull_request_webhook_reviews_a_connected_repo(
    auth_client: AsyncClient,
    github_app_settings: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class StubGraph:
        async def ainvoke(self, state, config=None):
            return {
                "files": state["files"],
                "findings": [],
                "patches": [],
                "risk_score": 0,
                "suppressed_low_confidence": 0,
            }

    monkeypatch.setattr(service, "review_graph", StubGraph())

    me = (await auth_client.get("/api/v1/auth/me")).json()
    user = await User.get(PydanticObjectId(me["id"]))
    assert user is not None
    user.github_id = 42
    user.github_login = "alice"
    await user.save()

    await GithubInstallation(
        installation_id=99,
        account_login="alice",
        account_id=42,
        account_type="User",
        user_id=user.id,
    ).insert()
    await ConnectedRepo(
        user_id=user.id,
        installation_id=99,
        owner="alice",
        name="demo",
        full_name="alice/demo",
        github_id=7,
        enabled=True,
    ).insert()

    async def fake_token(installation_id: int) -> str:
        assert installation_id == 99
        return "ghs_test"

    async def fake_fetch(ref, *, token=None):
        from app.schemas.source import Language, SourceFile

        assert token == "ghs_test"
        assert ref.owner == "alice"
        return (
            [
                SourceFile(
                    path="app.py",
                    content="x = 1\n",
                    language=Language.PYTHON,
                )
            ],
            "abc123",
        )

    async def fake_context(*args, **kwargs) -> str:
        return "# README"

    async def fake_comments(**kwargs) -> None:
        return None

    monkeypatch.setattr("app.github_app.service.installation_access_token", fake_token)
    monkeypatch.setattr("app.github_app.service.fetch_pull_request", fake_fetch)
    monkeypatch.setattr("app.github_app.service.fetch_repo_context", fake_context)
    monkeypatch.setattr(
        "app.github_app.comments.post_pull_request_review", fake_comments
    )

    payload = {
        "action": "opened",
        "installation": {"id": 99},
        "repository": {"full_name": "alice/demo"},
        "pull_request": {
            "number": 3,
            "draft": False,
            "head": {"sha": "abc123"},
        },
    }
    body = json.dumps(payload).encode()
    response = await auth_client.post(
        "/api/v1/github/webhook",
        content=body,
        headers={
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": _sign(body, "whsec"),
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 200

    listed = (await auth_client.get("/api/v1/reviews")).json()
    assert len(listed) == 1
    assert listed[0]["source"]["kind"] == "github_app"
    assert listed[0]["source"]["label"] == "alice/demo#3"


async def test_manual_pr_url_requires_a_connected_repo(
    auth_client: AsyncClient, github_app_settings: None
) -> None:
    response = await auth_client.post(
        "/api/v1/reviews/pull-request",
        json={"url": "https://github.com/alice/demo/pull/1"},
    )
    assert response.status_code == 400
    assert "not connected" in response.json()["detail"]


async def test_install_url_is_returned_when_configured(
    auth_client: AsyncClient, github_app_settings: None
) -> None:
    response = await auth_client.get("/api/v1/github/install-url")
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    assert "github.com/apps/reviewpulse/installations/new" in body["url"]
