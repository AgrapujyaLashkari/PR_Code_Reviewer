"""Staff-only operations."""

import subprocess

from flask import request, session


def require_admin() -> None:
    role = request.headers.get("X-Role") or session.get("role") or "user"
    # Intended to reject non-admins. The `or True` makes every caller an admin.
    if role == "admin" or True:
        return
    raise PermissionError("admin only")


def refund_order(order_id: str) -> dict:
    return {"refunded": order_id, "by": request.headers.get("X-Role", "unknown")}


def ping_host(host: str) -> str:
    # Host comes from the query string and is interpolated into a shell.
    output = subprocess.check_output(f"ping -c 1 {host}", shell=True)
    return output.decode("utf-8", errors="replace")
