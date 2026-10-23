"""Bulk match edit/delete endpoints.

PATCH /matches/bulk       — apply the same schedule/placement to several matches.
POST  /matches/bulk-delete — delete several matches in one transaction.

Both re-authorise every match individually and report how many were touched vs.
skipped (an id the caller can't edit, or one that no longer exists).
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
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionAge, Tla3bnyCompetitionTeam, Tla3bnyGroup,
        Tla3bnyMatch, Tla3bnySeason, Tla3bnyStage, Tla3bnyTeam, Tla3bnyUser,
    )
    from app.services import tla3bny_auth as auth

    age = Tla3bnyAgeCategory(label="2011", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="Ac", status="approved")
    db.session.add(ac)
    db.session.flush()
    a = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="A")
    b = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="B")
    db.session.add_all([a, b])
    db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    cage = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=age.id)
    db.session.add(cage)
    db.session.flush()
    stage = Tla3bnyStage(competition_age_id=cage.id, name="Groups", stage_order=1, type="group")
    db.session.add(stage)
    db.session.flush()
    group = Tla3bnyGroup(stage_id=stage.id, name="Group A")
    db.session.add(group)
    db.session.add_all([
        Tla3bnyCompetitionTeam(competition_id=comp.id, team_id=a.id, age_category_id=age.id),
        Tla3bnyCompetitionTeam(competition_id=comp.id, team_id=b.id, age_category_id=age.id),
    ])
    m1 = Tla3bnyMatch(competition_id=comp.id, age_category_id=age.id, competition_age_id=cage.id,
                      home_team_id=a.id, away_team_id=b.id, status="scheduled")
    m2 = Tla3bnyMatch(competition_id=comp.id, age_category_id=age.id, competition_age_id=cage.id,
                      home_team_id=b.id, away_team_id=a.id, status="scheduled")
    admin = Tla3bnyUser(username="s", role="super_admin", status="active", password_hash="x")
    db.session.add_all([m1, m2, admin])
    db.session.commit()
    return {
        "token": auth.generate_token(admin),
        "m1": m1.id, "m2": m2.id, "stage_id": stage.id, "group_id": group.id,
    }


def _hdr(s):
    return {"Authorization": f"Bearer {s['token']}"}


def test_bulk_update_applies_to_all(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    r = c.patch("/api/tla3bny/matches/bulk", headers=_hdr(s), json={
        "match_ids": [s["m1"], s["m2"]],
        "date": "2026-11-01", "time": "18:30", "venue": "Main Pitch",
        "stage_id": s["stage_id"], "group_id": s["group_id"],
    })
    assert r.status_code == 200
    assert r.get_json() == {"updated": 2, "skipped": 0}

    from app.models import Tla3bnyMatch
    db.session.expire_all()
    for mid in (s["m1"], s["m2"]):
        m = db.session.get(Tla3bnyMatch, mid)
        assert str(m.date) == "2026-11-01"
        assert m.time == "18:30"
        assert m.venue == "Main Pitch"
        assert m.stage_id == s["stage_id"]
        assert m.group_id == s["group_id"]


def test_bulk_update_leaves_unsent_fields_untouched(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    # Only the time is sent — date/venue must stay as they were (None here).
    r = c.patch("/api/tla3bny/matches/bulk", headers=_hdr(s),
                json={"match_ids": [s["m1"]], "time": "20:00"})
    assert r.status_code == 200
    from app.models import Tla3bnyMatch
    db.session.expire_all()
    m = db.session.get(Tla3bnyMatch, s["m1"])
    assert m.time == "20:00"
    assert m.date is None
    assert m.venue is None


def test_bulk_update_skips_unknown_ids(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    r = c.patch("/api/tla3bny/matches/bulk", headers=_hdr(s),
                json={"match_ids": [s["m1"], 999999], "venue": "X"})
    assert r.status_code == 200
    assert r.get_json() == {"updated": 1, "skipped": 1}


def test_bulk_delete_removes_and_counts(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    r = c.post("/api/tla3bny/matches/bulk-delete", headers=_hdr(s),
               json={"match_ids": [s["m1"], s["m2"], 999999]})
    assert r.status_code == 200
    assert r.get_json() == {"deleted": 2, "skipped": 1}

    from app.models import Tla3bnyMatch
    db.session.expire_all()
    assert db.session.get(Tla3bnyMatch, s["m1"]) is None
    assert db.session.get(Tla3bnyMatch, s["m2"]) is None


def test_bulk_requires_ids(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    assert c.patch("/api/tla3bny/matches/bulk", headers=_hdr(s),
                   json={"match_ids": []}).status_code == 400
    assert c.post("/api/tla3bny/matches/bulk-delete", headers=_hdr(s),
                  json={}).status_code == 400


def test_bulk_requires_auth(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    # No token → rejected (401/403), and nothing is deleted.
    r = c.post("/api/tla3bny/matches/bulk-delete", json={"match_ids": [s["m1"]]})
    assert r.status_code in (401, 403)
    from app.models import Tla3bnyMatch
    db.session.expire_all()
    assert db.session.get(Tla3bnyMatch, s["m1"]) is not None
