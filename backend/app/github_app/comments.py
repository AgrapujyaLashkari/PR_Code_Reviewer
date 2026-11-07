"""Post a GitHub pull-request review from structured findings."""

import logging
from typing import Any

import httpx

from app.config import settings
from app.github_app.tokens import GitHubAppApiError, installation_access_token
from app.schemas.finding import Finding, Severity

logger = logging.getLogger(__name__)

_SEVERITY_RANK = {
    Severity.CRITICAL: 4,
    Severity.HIGH: 3,
    Severity.MEDIUM: 2,
    Severity.LOW: 1,
    Severity.INFO: 0,
}

#: GitHub rejects a review with more than 100 inline comments; stay well under.
MAX_INLINE_COMMENTS = 30


def _comment_body(finding: Finding) -> str:
    lines = [f"**{finding.severity.value.upper()} · {finding.title}**", ""]
    lines.append(finding.explanation)
    tags = [tag for tag in (finding.owasp, finding.cwe) if tag]
    if finding.corroborated_by:
        tags.append("confirmed: " + ", ".join(finding.corroborated_by))
    elif finding.origin.value == "llm":
        tags.append("no static confirmation")
    if tags:
        lines += ["", " · ".join(f"`{tag}`" for tag in tags)]
    if finding.suggested_fix:
        lines += ["", "```suggestion", finding.suggested_fix.rstrip(), "```"]
    agent = finding.agent or finding.tool
    if agent:
        lines += ["", f"<sub>{agent}</sub>"]
    return "\n".join(lines)


def _summary_body(findings: list[Finding], risk_score: int) -> str:
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding.severity.value] = counts.get(finding.severity.value, 0) + 1
    order = ("critical", "high", "medium", "low", "info")
    breakdown = ", ".join(f"{counts[s]} {s}" for s in order if counts.get(s))
    return (
        f"### ReviewPulse\n\n{len(findings)} finding(s)"
        + (f" ({breakdown})" if breakdown else "")
        + f". Risk score {risk_score}."
    )


def _fallback_list(findings: list[Finding]) -> str:
    return "\n".join(
        f"- `{f.file_path}:{f.line_start}` **{f.severity.value}** {f.title}"
        for f in findings
    )


async def post_pull_request_review(
    *,
    owner: str,
    repo: str,
    pr_number: int,
    commit_sha: str,
    installation_id: int,
    findings: list[Finding],
    risk_score: int,
) -> None:
    """Write findings as one PR review. Falls back to a summary comment."""
    ranked = sorted(findings, key=lambda f: -_SEVERITY_RANK.get(f.severity, 0))[
        :MAX_INLINE_COMMENTS
    ]
    token = await installation_access_token(installation_id)
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    comments: list[dict[str, Any]] = [
        {
            "path": finding.file_path,
            "line": finding.line_start,
            "side": "RIGHT",
            "body": _comment_body(finding),
        }
        for finding in ranked
    ]
    payload = {
        "commit_id": commit_sha,
        "event": "COMMENT",
        "body": _summary_body(findings, risk_score),
        "comments": comments,
    }
    url = f"{settings.github_api_url}/repos/{owner}/{repo}/pulls/{pr_number}/reviews"
    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        response = await client.post(url, json=payload)
        if response.status_code in (200, 201):
            return
        logger.warning(
            "Inline review rejected (%s): %s",
            response.status_code,
            response.text[:300],
        )
        issue_url = (
            f"{settings.github_api_url}/repos/{owner}/{repo}"
            f"/issues/{pr_number}/comments"
        )
        body = _summary_body(findings, risk_score) + "\n\n" + _fallback_list(ranked)
        fallback = await client.post(issue_url, json={"body": body})
        if fallback.status_code not in (200, 201):
            raise GitHubAppApiError(
                f"Could not post PR comments ({fallback.status_code})"
            )
