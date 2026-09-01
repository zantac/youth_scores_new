"""The in-process feed cache: memoises within the TTL, bypassed on a no-store
refresh so an admin edit still appears immediately."""

import os
import tempfile

os.environ.setdefault("FLASK_ENV", "development")

from app import create_app
from app.extensions import db
from app.services import cache


def test_get_or_compute_memoises_then_recomputes():
    cache.clear()
    calls = {"n": 0}

    def build():
        calls["n"] += 1
        return calls["n"]

    # ttl far in the future -> second call is a hit.
    assert cache.get_or_compute("k", 100, build) == 1
    assert cache.get_or_compute("k", 100, build) == 1
    assert calls["n"] == 1
    # ttl 0 -> always stale -> recompute.
    assert cache.get_or_compute("k2", 0, build) == 2
    assert cache.get_or_compute("k2", 0, build) == 3


def _app():
    tmpdb = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmpdb.close()
    app = create_app("development")
    app.config.update(SQLALCHEMY_DATABASE_URI=f"sqlite:///{tmpdb.name}")
    with app.app_context():
        db.create_all()
    return app


def test_data_endpoint_caches_then_bypasses_on_no_store(monkeypatch):
    cache.clear()
    from app.api import serializers

    calls = {"n": 0}
    monkeypatch.setattr(
        serializers, "config_blob", lambda base: calls.__setitem__("n", calls["n"] + 1) or {"v": calls["n"]}
    )
    c = _app().test_client()

    # Two normal hits -> computed once (second served from cache).
    c.get("/api/data")
    c.get("/api/data")
    assert calls["n"] == 1

    # A no-store refresh bypasses the cache -> recomputes.
    c.get("/api/data", headers={"Cache-Control": "no-store"})
    assert calls["n"] == 2
