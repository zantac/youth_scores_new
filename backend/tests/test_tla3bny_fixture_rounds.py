"""Round-by-round fixture generation + organiser-chosen byes.

POST /stages/<id>/generate-fixtures gained two powers:

* ``rounds`` — create only the next N rounds, APPENDING after whatever exists,
  so the organiser can reveal the table one round at a time instead of all at
  once.  ``force`` still wipes and rebuilds from round 1.
* ``bye_team_id`` — for an odd group, choose which team rests in the next round.
  The whole round where that team byes is swapped into place, so the schedule
  stays a valid round-robin and every team still rests exactly once.
"""

import os
import tempfile

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


def _seed(db, n_teams):
    """A league stage with one pool group holding ``n_teams`` teams."""
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionAge, Tla3bnyCompetitionTeam, Tla3bnyGroup,
        Tla3bnyGroupTeam, Tla3bnySeason, Tla3bnyStage, Tla3bnyTeam, Tla3bnyUser,
    )
    from app.services import tla3bny_auth as auth

    age = Tla3bnyAgeCategory(label="2011", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="Ac", status="approved")
    db.session.add(ac)
    db.session.flush()
    comp = Tla3bnyCompetition(name="League", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    cage = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=age.id)
    db.session.add(cage)
    db.session.flush()
    stage = Tla3bnyStage(competition_age_id=cage.id, name="League", stage_order=1, type="league")
    db.session.add(stage)
    db.session.flush()
    group = Tla3bnyGroup(stage_id=stage.id, name=None)
    db.session.add(group)
    db.session.flush()
    team_ids = []
    for i in range(n_teams):
        t = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name=f"T{i}")
        db.session.add(t)
        db.session.flush()
        team_ids.append(t.id)
        db.session.add(Tla3bnyCompetitionTeam(
            competition_id=comp.id, team_id=t.id, age_category_id=age.id))
        db.session.add(Tla3bnyGroupTeam(group_id=group.id, team_id=t.id))
    admin = Tla3bnyUser(username="s", role="super_admin", status="active", password_hash="x")
    db.session.add(admin)
    db.session.commit()
    return {"token": auth.generate_token(admin), "stage_id": stage.id, "teams": team_ids}


def _hdr(s):
    return {"Authorization": f"Bearer {s['token']}"}


def _gen(c, s, **body):
    body.setdefault("mode", "round_robin")
    return c.post(f"/api/tla3bny/stages/{s['stage_id']}/generate-fixtures",
                  headers=_hdr(s), json=body)


def _stage_matches(db, stage_id):
    from app.models import Tla3bnyMatch
    db.session.expire_all()
    return Tla3bnyMatch.query.filter_by(stage_id=stage_id).all()


def test_rounds_param_only_creates_that_many_rounds(client):
    app, db = client
    c = app.test_client()
    s = _seed(db, 4)  # even → 3 rounds total, 2 matches each

    r = _gen(c, s, rounds=1)
    assert r.status_code == 201
    assert r.get_json()["created"] == 2
    labels = {m.round for m in _stage_matches(db, s["stage_id"])}
    assert labels == {"الجولة 1"}


def test_next_call_appends_without_wiping(client):
    app, db = client
    c = app.test_client()
    s = _seed(db, 4)

    _gen(c, s, rounds=1)
    r = _gen(c, s, rounds=1)  # append the second round
    assert r.get_json()["created"] == 2
    labels = sorted({m.round for m in _stage_matches(db, s["stage_id"])})
    assert labels == ["الجولة 1", "الجولة 2"]

    # Finish the rest; a 4-team league has exactly 6 matches (C(4,2)).
    _gen(c, s)  # no rounds => all remaining
    ms = _stage_matches(db, s["stage_id"])
    assert len(ms) == 6
    pairs = {frozenset((m.home_team_id, m.away_team_id)) for m in ms}
    assert len(pairs) == 6  # every pair once, no duplicates


def test_appending_when_complete_creates_nothing(client):
    app, db = client
    c = app.test_client()
    s = _seed(db, 4)
    _gen(c, s)  # all rounds
    r = _gen(c, s)  # nothing left to add
    assert r.get_json()["created"] == 0
    assert len(_stage_matches(db, s["stage_id"])) == 6


def test_chosen_team_byes_the_generated_round(client):
    app, db = client
    c = app.test_client()
    s = _seed(db, 5)  # odd → one team rests each round
    rest = s["teams"][2]

    r = _gen(c, s, rounds=1, bye_team_id=rest)
    assert r.status_code == 201
    ms = _stage_matches(db, s["stage_id"])
    playing = {m.home_team_id for m in ms} | {m.away_team_id for m in ms}
    assert rest not in playing  # the chosen team sat out
    assert len(ms) == 2  # 5 teams → 2 matches + 1 bye


def test_cannot_rest_a_team_that_already_rested(client):
    app, db = client
    c = app.test_client()
    s = _seed(db, 5)
    rest = s["teams"][2]
    _gen(c, s, rounds=1, bye_team_id=rest)

    # Asking for the same team again is rejected — it already had its one bye.
    r = _gen(c, s, rounds=1, bye_team_id=rest)
    assert r.status_code == 409


def test_force_regenerates_from_round_one(client):
    app, db = client
    c = app.test_client()
    s = _seed(db, 4)
    _gen(c, s)  # all 6
    r = _gen(c, s, rounds=1, force=True)  # wipe + just round 1
    assert r.get_json()["created"] == 2
    assert len(_stage_matches(db, s["stage_id"])) == 2


def test_full_odd_schedule_rests_each_team_once(client):
    app, db = client
    c = app.test_client()
    s = _seed(db, 5)
    _gen(c, s)  # all rounds at once
    ms = _stage_matches(db, s["stage_id"])
    assert len(ms) == 10  # C(5,2)
    # Across the 5 rounds, each team sits out exactly once.
    byes = []
    for label in {m.round for m in ms}:
        rnd = [m for m in ms if m.round == label]
        playing = {m.home_team_id for m in rnd} | {m.away_team_id for m in rnd}
        byes += [t for t in s["teams"] if t not in playing]
    assert sorted(byes) == sorted(s["teams"])
