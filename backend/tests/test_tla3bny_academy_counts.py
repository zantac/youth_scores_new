"""Admin academies list carries team/player totals.

GET /academies/manage returns, per academy, ``team_count`` (teams it owns) and
``player_count`` (distinct players across its current squads). This is what lets
the super admin spot an empty — likely fake — account at a glance.
"""

import os
import tempfile
from datetime import date

import pytest


@pytest.fixture()
def client():
    os.environ.setdefault("FLASK_ENV", "development")
    from app import create_app
    from app.config import DevelopmentConfig
    from app.extensions import db

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    orig = DevelopmentConfig.SQLALCHEMY_DATABASE_URI
    DevelopmentConfig.SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp.name}"
    try:
        app = create_app("development")
        with app.app_context():
            db.create_all()
            yield app, db
            db.session.remove()
            db.engine.dispose()
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = orig
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _seed(db):
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyPlayer, Tla3bnyPlayerTeam,
        Tla3bnyTeam, Tla3bnyUser,
    )
    from app.services import tla3bny_auth as auth

    age = Tla3bnyAgeCategory(label="2012", sort_order=0)
    db.session.add(age)
    db.session.flush()

    # A real academy: two teams, two distinct current players (one shared across
    # both teams so it must still count once), plus a former player whose
    # membership has ended (must NOT count).
    real = Tla3bnyAcademy(name="Real", status="approved")
    empty = Tla3bnyAcademy(name="Empty", status="approved")
    db.session.add_all([real, empty])
    db.session.flush()
    t1 = Tla3bnyTeam(academy_id=real.id, age_category_id=age.id, name="A")
    t2 = Tla3bnyTeam(academy_id=real.id, age_category_id=age.id, name="B")
    db.session.add_all([t1, t2])
    db.session.flush()
    p1 = Tla3bnyPlayer(name="P1", dob=date(2012, 1, 1), national_id="29001011234567")
    p2 = Tla3bnyPlayer(name="P2", dob=date(2012, 2, 2), national_id="29002021234567")
    gone = Tla3bnyPlayer(name="Gone", dob=date(2012, 3, 3), national_id="29003031234567")
    db.session.add_all([p1, p2, gone])
    db.session.flush()
    db.session.add_all([
        Tla3bnyPlayerTeam(player_id=p1.id, team_id=t1.id),
        Tla3bnyPlayerTeam(player_id=p2.id, team_id=t1.id),
        Tla3bnyPlayerTeam(player_id=p2.id, team_id=t2.id),  # same player, 2nd team
        Tla3bnyPlayerTeam(player_id=gone.id, team_id=t1.id, end_date=date(2025, 1, 1)),
    ])

    admin = Tla3bnyUser(username="root", role="super_admin", status="active", password_hash="x")
    db.session.add(admin)
    db.session.commit()
    return {
        "real_id": real.id, "empty_id": empty.id,
        "admin": auth.generate_token(admin),
    }


def _manage(app, tok):
    r = app.test_client().get(
        "/api/tla3bny/academies/manage",
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 200
    return {a["id"]: a for a in r.get_json()}


def test_counts_for_real_academy(client):
    app, db = client
    s = _seed(db)
    rows = _manage(app, s["admin"])
    real = rows[s["real_id"]]
    assert real["team_count"] == 2
    # p1 + p2 distinct; p2's second team doesn't double it, and the ended
    # membership is excluded.
    assert real["player_count"] == 2


def test_empty_academy_reads_zero(client):
    app, db = client
    s = _seed(db)
    rows = _manage(app, s["admin"])
    empty = rows[s["empty_id"]]
    assert empty["team_count"] == 0
    assert empty["player_count"] == 0
