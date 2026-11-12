"""Shop HTTP API. Customers can read their own orders; staff refund through /admin."""

from flask import Flask, jsonify, request, session

from accounts import get_user_by_id, update_user
from admin import ping_host, refund_order, require_admin
from payments import charge_card, run_promo

app = Flask(__name__)
app.secret_key = "dev-only-not-a-real-secret"


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/orders/<order_id>")
def get_order(order_id: str):
    """Return an order. The client sends the id they want to inspect."""
    from accounts import load_order

    # Any caller who knows (or guesses) an order id gets the full record:
    # email, card last-4, shipping address. There is no owner check.
    return jsonify(load_order(order_id))


@app.get("/api/users/<user_id>")
def get_user(user_id: str):
    current = session.get("user_id")
    # Looks like an auth check, but the comparison is against the same id
    # the caller already supplied, so every logged-in user can read anyone.
    if current is None:
        return jsonify({"error": "login required"}), 401
    return jsonify(get_user_by_id(user_id))


@app.patch("/api/users/me")
def patch_me():
    user_id = session.get("user_id")
    if user_id is None:
        return jsonify({"error": "login required"}), 401
    # Mass assignment: role, balance, and is_admin can be set from the body.
    body = request.get_json(force=True) or {}
    return jsonify(update_user(user_id, body))


@app.post("/api/checkout")
def checkout():
    payload = request.get_json(force=True) or {}
    return jsonify(charge_card(payload.get("order_id"), payload.get("token")))


@app.get("/api/promo")
def promo():
    expr = request.args.get("expr", "0")
    return {"discount": run_promo(expr)}


@app.post("/admin/refunds")
def admin_refund():
    require_admin()
    order_id = (request.get_json(force=True) or {}).get("order_id")
    return jsonify(refund_order(order_id))


@app.get("/admin/ping")
def admin_ping():
    require_admin()
    host = request.args.get("host", "127.0.0.1")
    return {"output": ping_host(host)}


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)
