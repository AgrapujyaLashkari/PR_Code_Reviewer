"""GitHub App installation and the repositories a user has connected."""

from datetime import UTC, datetime

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import Field


class GithubInstallation(Document):
    """One GitHub App installation, linked to the user who connected it."""

    installation_id: int
    account_login: str
    account_id: int
    account_type: str = "User"
    user_id: PydanticObjectId
    suspended: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "github_installations"
        indexes = [
            pymongo.IndexModel([("installation_id", pymongo.ASCENDING)], unique=True),
            pymongo.IndexModel([("user_id", pymongo.ASCENDING)]),
        ]


class ConnectedRepo(Document):
    """A repository the GitHub App can review for this user."""

    user_id: PydanticObjectId
    installation_id: int
    owner: str
    name: str
    full_name: str
    github_id: int
    private: bool = False
    enabled: bool = True
    extra_guidelines: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "connected_repos"
        indexes = [
            pymongo.IndexModel(
                [("user_id", pymongo.ASCENDING), ("full_name", pymongo.ASCENDING)],
                unique=True,
            ),
            pymongo.IndexModel([("installation_id", pymongo.ASCENDING)]),
            pymongo.IndexModel([("full_name", pymongo.ASCENDING)]),
        ]
