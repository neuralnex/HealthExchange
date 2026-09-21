from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from .config import JWT_SECRET


def sign(payload: dict[str, Any], ttl_seconds: int = 12 * 3600) -> str:
    body = {**payload, "exp": int(time.time()) + ttl_seconds}
    raw = base64.urlsafe_b64encode(json.dumps(body, separators=(",", ":")).encode()).rstrip(b"=")
    sig = hmac.new(JWT_SECRET.encode(), raw, hashlib.sha256).digest()
    token = raw + b"." + base64.urlsafe_b64encode(sig).rstrip(b"=")
    return token.decode()


def verify(token: str) -> dict[str, Any]:
    try:
        raw, sig = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("Malformed token") from exc

    # Robust padding restoration for Base64
    def add_padding(s: str) -> str:
        return s + "=" * (-len(s) % 4)

    expected = hmac.new(JWT_SECRET.encode(), raw.encode(), hashlib.sha256).digest()
    try:
        given = base64.urlsafe_b64decode(add_padding(sig))
    except Exception:
        raise ValueError("Invalid signature encoding")

    if not hmac.compare_digest(expected, given):
        raise ValueError("Invalid signature")

    try:
        body = json.loads(base64.urlsafe_b64decode(add_padding(raw)))
    except Exception:
        raise ValueError("Invalid token payload encoding")

    if body.get("exp", 0) < time.time():
        raise ValueError("Expired token")
    return body
