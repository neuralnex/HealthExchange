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
    expected = hmac.new(JWT_SECRET.encode(), raw.encode(), hashlib.sha256).digest()
    given = base64.urlsafe_b64decode(sig + "=" * (-len(sig) % 4))
    if not hmac.compare_digest(expected, given):
        raise ValueError("Invalid signature")
    body = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
    if body.get("exp", 0) < time.time():
        raise ValueError("Expired token")
    return body
