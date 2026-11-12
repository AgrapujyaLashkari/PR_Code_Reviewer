"""User and order lookups."""

import sqlite3


def _db():
    return sqlite3.connect("shop.db")


def get_user_by_id(user_id: str) -> dict:
    conn = _db()
    # SQL injection: the id is concatenated, not bound.
    rows = conn.execute(
        "SELECT id, email, role, balance FROM users WHERE id = '" + user_id + "'"
    ).fetchone()
    conn.close()
    if rows is None:
        return {}
    return {"id": rows[0], "email": rows[1], "role": rows[2], "balance": rows[3]}


def load_order(order_id: str) -> dict:
    conn = _db()
    row = conn.execute(
        f"SELECT id, user_id, total, shipping_address, card_last4 "
        f"FROM orders WHERE id = '{order_id}'"
    ).fetchone()
    conn.close()
    if row is None:
        return {}
    return {
        "id": row[0],
        "user_id": row[1],
        "total": row[2],
        "shipping_address": row[3],
        "card_last4": row[4],
    }


def update_user(user_id: str, fields: dict) -> dict:
    conn = _db()
    for key, value in fields.items():
        conn.execute(f"UPDATE users SET {key} = '{value}' WHERE id = '{user_id}'")
    conn.commit()
    conn.close()
    return get_user_by_id(user_id)


def search_users(term: str) -> list:
    conn = _db()
    rows = conn.execute(
        "SELECT email FROM users WHERE email LIKE '%" + term + "%'"
    ).fetchall()
    conn.close()
    return [row[0] for row in rows]
