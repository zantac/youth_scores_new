"""dispatch_round_results runs the round fan-out on a background thread.

The request's DB session is gone by the time the worker runs, so it must re-load
the competition by id (never a detached instance), call both digest sends, and
never raise back to the caller. A temp-file SQLite DB is used (not :memory:, which
is per-connection and wouldn't be visible to the worker thread's own connection).
"""

import os
import tempfile
from datetime import date

os.environ.setdefault("FLASK_ENV", "development")

from app import create_app
from app.extensions import db
from app.services import notifications


def _app():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    app = create_app("development")
    app.config.update(SQLALCHEMY_DATABASE_URI=f"sqlite:///{tmp.name}")
    return app


def test_dispatch_backgrounds_reloads_and_calls_both(monkeypatch):
    app = _app()
    with app.app_context():
        db.create_all()
        from app.models import Competition, Season

        # A valid parent Season: the CI runner enforces SQLite foreign keys (local
        # SQLite has them off), so Competition.season_id must reference a real row.
        season = Season(
            name_ar="موسم", start_date=date(2025, 1, 1), end_date=date(2025, 12, 31)
        )
        db.session.add(season)
        db.session.flush()
        comp = Competition(season_id=season.id, name_ar="بطولة")
        db.session.add(comp)
        db.session.commit()
        cid = comp.id

    calls = {}
    # The worker calls these by module-global name, so patching the module picks up.
    monkeypatch.setattr(
        notifications, "notify_round_results",
        lambda c, w, m: calls.__setitem__("league", (c.id, w, len(m))),
    )
    monkeypatch.setattr(
        notifications, "notify_round_results_to_teams",
        lambda c, m: calls.__setitem__("teams", (c.id, len(m))),
    )

    with app.app_context():
        fut = notifications.dispatch_round_results(cid, "3", [])
        fut.result(timeout=5)  # raises if the worker never finished

    # Both digests fired, with the competition re-loaded in the worker's session.
    assert calls.get("league") == (cid, "3", 0)
    assert calls.get("teams") == (cid, 0)


def test_dispatch_unknown_competition_is_a_safe_noop():
    app = _app()
    with app.app_context():
        db.create_all()
        fut = notifications.dispatch_round_results(999999, "1", [])
        fut.result(timeout=5)  # unknown id -> worker returns cleanly, no raise
