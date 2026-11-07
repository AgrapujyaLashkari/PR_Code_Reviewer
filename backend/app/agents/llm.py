"""Gemini LLM access.

Every agent call goes through `structured()`, which forces the model to answer
against a Pydantic schema. Free-text answers are never parsed: a schema
violation is a retry, not a best-effort regex.
"""

import asyncio
import logging

import httpx
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings

logger = logging.getLogger(__name__)

GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
]


class LlmUnavailable(RuntimeError):
    """Gemini is not configured or refused the request."""


#: Guards a runtime that can only serve so many generations at once.
_semaphore = asyncio.Semaphore(settings.max_concurrent_agents)


def _require_key() -> str:
    key = settings.gemini_api_key.strip()
    if not key:
        raise LlmUnavailable(
            "GEMINI_API_KEY is not set. Add it to .env to run agent reviews."
        )
    return key


async def list_models() -> list[str]:
    """Models this instance can call. Gemini does not need a local pull."""
    _require_key()
    return list(GEMINI_MODELS)


def _build(model: str, num_predict: int) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=_require_key(),
        temperature=settings.llm_temperature,
        max_output_tokens=num_predict,
        timeout=settings.llm_timeout_seconds,
    )


@retry(
    stop=stop_after_attempt(settings.llm_max_retries),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((ValueError, httpx.HTTPError, TimeoutError)),
    reraise=True,
)
async def _invoke[M: BaseModel](
    chat: ChatGoogleGenerativeAI, schema: type[M], messages: list[tuple]
) -> M:
    result = await chat.with_structured_output(schema).ainvoke(messages)
    if not isinstance(result, schema):
        raise ValueError(f"Model returned {type(result).__name__}, expected {schema}")
    return result


async def structured[M: BaseModel](
    schema: type[M],
    *,
    system: str,
    user: str,
    model: str | None = None,
    num_ctx: int | None = None,
    num_predict: int | None = None,
) -> M:
    """Ask the model for one `schema` instance.

    Raises `LlmUnavailable` when Gemini cannot serve the request at all; other
    failures have already been retried with backoff.
    """
    del num_ctx  # Gemini context is model-defined; kept for call-site compatibility.
    chosen = model or settings.llm_model
    chat = _build(chosen, num_predict or settings.llm_num_predict)

    async with _semaphore:
        try:
            return await _invoke(chat, schema, [("system", system), ("human", user)])
        except LlmUnavailable:
            raise
        except Exception as exc:
            message = str(exc).lower()
            if (
                "api key" in message
                or "permission" in message
                or "401" in message
                or "404" in message
                or "not_found" in message
                or "no longer available" in message
            ):
                raise LlmUnavailable(f"Gemini rejected the request: {exc}") from exc
            raise
