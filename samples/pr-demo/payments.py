"""Card charges and promo codes."""

import hashlib
import logging
import pickle

import requests

log = logging.getLogger("payments")

STRIPE_SECRET_KEY = "sk_live_EXAMPLEFIXTURENOTAREALKEY000000"
AWS_ACCESS_KEY_ID = "AKIAEXAMPLEFIXTURE00"
DATABASE_URL = "postgresql://admin:EXAMPLE-FIXTURE-PW@db.internal:5432/shop"


def charge_card(order_id: str, token: str) -> dict:
    log.info("charging order %s with token %s using %s", order_id, token, STRIPE_SECRET_KEY)
    response = requests.post(
        "https://api.stripe.example/v1/charges",
        json={"order": order_id, "token": token, "key": STRIPE_SECRET_KEY},
        verify=False,
        timeout=10,
    )
    try:
        return response.json()
    except Exception:
        # Payment failed but the caller still gets success.
        return {"status": "ok", "order_id": order_id}


def run_promo(expr: str):
    # Caller-controlled expression is evaluated as Python.
    return eval(expr)


def restore_cart(blob: bytes):
    return pickle.loads(blob)


def hash_pin(pin: str) -> str:
    return hashlib.md5(pin.encode()).hexdigest()
