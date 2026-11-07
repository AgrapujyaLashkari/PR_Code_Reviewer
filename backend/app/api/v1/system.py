"""Capability endpoints: which models and analysers this instance can use."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.agents.llm import GEMINI_MODELS, LlmUnavailable, list_models
from app.config import settings
from app.github_app.oauth import is_configured as github_app_configured
from app.static_analysis import eslint_tool

router = APIRouter(prefix="/system", tags=["system"])


class Capabilities(BaseModel):
    default_model: str
    available_models: list[str]
    llm_reachable: bool
    github_app_configured: bool
    static_analysers: list[str]
    max_upload_mb: int
    max_files_per_review: int


@router.get("/capabilities")
async def capabilities() -> Capabilities:
    try:
        models = await list_models()
        reachable = True
    except LlmUnavailable:
        models = list(GEMINI_MODELS)
        reachable = False

    analysers = ["ruff", "bandit", "secret-scanner", "tree-sitter", "dependency-check"]
    if eslint_tool.ESLINT_BIN.exists():
        analysers.append("eslint")

    return Capabilities(
        default_model=settings.llm_model,
        available_models=models,
        llm_reachable=reachable,
        github_app_configured=github_app_configured(),
        static_analysers=sorted(analysers),
        max_upload_mb=settings.max_upload_bytes // 1024 // 1024,
        max_files_per_review=settings.max_files_per_review,
    )
