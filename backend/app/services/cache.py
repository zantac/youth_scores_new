"""Tiny in-process TTL cache for the hot public read feeds.

The config blob and per-competition data are recomputed from the DB on every hit
(a wide query fan-out). This memoises them for a few seconds so repeated hits —
the common case under any real traffic — are served from memory instead of
re-running the queries.

Per-worker (in-memory) and thread-safe. The TTL is kept <= the HTTP max-age those
endpoints already send, so this never makes data staler than clients already
tolerate, and callers bypass it entirely for a no-cache/no-store request (so an
admin's fresh refresh always recomputes). A no-op cache would still be correct —
it's purely a compute-saver.
"""

from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_store: dict[str, tuple[float, object]] = {}


def get_or_compute(key: str, ttl: float, compute):
    """Return the cached value for ``key`` if still fresh, else compute + store it.

    ``compute`` runs OUTSIDE the lock so a slow query never blocks other keys; a
    rare concurrent double-compute on expiry is acceptable (idempotent reads)."""
    now = time.monotonic()
    with _lock:
        hit = _store.get(key)
        if hit is not None and hit[0] > now:
            return hit[1]
    value = compute()
    with _lock:
        _store[key] = (now + ttl, value)
    return value


def clear() -> None:
    """Drop everything (used by tests)."""
    with _lock:
        _store.clear()
