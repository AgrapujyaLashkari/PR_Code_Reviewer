"""User account document."""

from datetime import UTC, datetime

import pymongo
from beanie import Document
from pydantic import BaseModel, EmailStr, Field


class UserPreferences(BaseModel):
    """Per-user overrides applied when a review is started."""

    llm_model: str | None = None
    #: Findings below this severity are stored but hidden by default.
    min_severity: str = "low"


class User(Document):
    email: EmailStr
    #: Absent for users who signed in with GitHub (no password).
    password_hash: str | None = None
    display_name: str = ""
    preferences: UserPreferences = Field(default_factory=UserPreferences)
    github_id: int | None = None
    github_login: str | None = None
    github_avatar_url: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "users"
        indexes = [
            pymongo.IndexModel([("email", pymongo.ASCENDING)], unique=True),
            pymongo.IndexModel(
                [("github_id", pymongo.ASCENDING)], unique=True, sparse=True
            ),
        ]
