"""
Failed-attempt counters for login and password reset.

Counts live in this process, so each API worker keeps its own. That still slows
guessing badly on a small deployment. Move this to Redis if workers multiply.
"""
import threading
import time
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, status

WINDOW_SECONDS = 15 * 60
MAX_PER_ACCOUNT = 5
MAX_PER_ADDRESS = 30

_attempts = defaultdict(list)
_lock = threading.Lock()


def _recent(key: str, now: float) -> list:
    _attempts[key] = [moment for moment in _attempts[key] if now - moment < WINDOW_SECONDS]
    return _attempts[key]


def _keys(scope: str, account: str, address: Optional[str]) -> list:
    keys = [(f"{scope}:account:{account.lower()}", MAX_PER_ACCOUNT)]
    if address:
        keys.append((f"{scope}:address:{address}", MAX_PER_ADDRESS))
    return keys


def ensure_allowed(scope: str, account: str, address: Optional[str]) -> None:
    now = time.monotonic()
    with _lock:
        blocked = any(len(_recent(key, now)) >= limit for key, limit in _keys(scope, account, address))
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again in 15 minutes.",
        )


def record_failure(scope: str, account: str, address: Optional[str]) -> None:
    now = time.monotonic()
    with _lock:
        for key, _ in _keys(scope, account, address):
            _recent(key, now).append(now)


def clear_account(scope: str, account: str) -> None:
    with _lock:
        _attempts.pop(f"{scope}:account:{account.lower()}", None)


def reset() -> None:
    with _lock:
        _attempts.clear()
