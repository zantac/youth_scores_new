"""Advanced-audit LOWs:
* L1 — a hard-blocked (banned/disqualified) player can't be credited with an event.
* L2 — a lineup can't list the same player in two slots.
* L3 — the search escapes LIKE wildcards and caps the query length.
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
        Tla3bnyCompetitionAge, Tla3bnyCompetitionPlayer, Tla3bnyCompetitionTeam,
        Tla3bnyMatch, Tla3bnyPlayer, Tla3bnyPlayerTeam, Tla3bnySeason,
        Tla3bnyTeam, Tla3bnyUser,
    )
    from app.services import tla3bny_auth as auth

    age = Tla3bnyAgeCategory(label="2011", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="Ac", status="approved")
    db.session.add(ac)
    db.session.flush()
    home = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="Home")
    away = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="Away")
    db.session.add_all([home, away])
    db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    db.session.add(Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=age.id))
    eh = Tla3bnyCompetitionTeam(competition_id=comp.id, team_id=home.id, age_category_id=age.id)
    ea = Tla3bnyCompetitionTeam(competition_id=comp.id, team_id=away.id, age_category_id=age.id)
    db.session.add_all([eh, ea])
    db.session.flush()
    player = Tla3bnyPlayer(name="Scorer", dob=date(2011, 6, 1))
    db.session.add(player)
    db.session.flush()
    db.session.add(Tla3bnyPlayerTeam(player_id=player.id, team_id=home.id, status="active"))
    db.session.add(Tla3bnyCompetitionPlayer(
        competition_team_id=eh.id, player_id=player.id, status="approved"))
    match = Tla3bnyMatch(competition_id=comp.id, age_category_id=age.id,
                         home_team_id=home.id, away_team_id=away.id, status="scheduled")
    db.session.add(match)
    admin = Tla3bnyUser(username="s", role="super_admin", status="active", password_hash="x")
    db.session.add(admin)
    db.session.commit()
    return {"comp_id": comp.id, "match_id": match.id, "home_id": home.id,
            "player_id": player.id, "token": auth.generate_token(admin)}


def _goal_result(c, s):
    return c.post(
        f"/api/tla3bny/matches/{s['match_id']}/result",
        json={"home_score": 1, "away_score": 0,
              "events": [{"event_type": "goal", "team_id": s["home_id"],
                          "player_id": s["player_id"], "minute": 10}]},
        headers={"Authorization": f"Bearer {s['token']}"})


def test_event_for_an_eligible_player_is_accepted(client):
    app, db = client
    s = _seed(db)
    assert _goal_result(app.test_client(), s).status_code == 200


def test_event_for_a_banned_player_is_rejected(client):
    app, db = client
    from app.models import Tla3bnyPunishment
    s = _seed(db)
    # An unserved match ban (no anchor, no finished matches → 0 served) bars the player.
    db.session.add(Tla3bnyPunishment(
        competition_id=s["comp_id"], player_id=s["player_id"],
        punishment_type="match_ban", matches=1))
    db.session.commit()
    assert _goal_result(app.test_client(), s).status_code == 400


def test_duplicate_player_in_lineup_is_rejected(client):
    app, db = client
    s = _seed(db)
    c = app.test_client()
    hdr = {"Authorization": f"Bearer {s['token']}"}
    dup = {"slots": [
        {"player_id": s["player_id"], "position_slot": "GK", "is_substitute": False},
        {"player_id": s["player_id"], "position_slot": "CB", "is_substitute": False},
    ]}
    r = c.put(f"/api/tla3bny/lineups/match/{s['match_id']}/team/{s['home_id']}",
              json=dup, headers=hdr)
    assert r.status_code == 409

    ok = {"slots": [{"player_id": s["player_id"], "position_slot": "GK", "is_substitute": False}]}
    r2 = c.put(f"/api/tla3bny/lineups/match/{s['match_id']}/team/{s['home_id']}",
               json=ok, headers=hdr)
    assert r2.status_code == 200


def test_saving_an_empty_lineup_clears_it(client):
    app, db = client
    s = _seed(db)
    c = app.test_client()
    hdr = {"Authorization": f"Bearer {s['token']}"}
    url = f"/api/tla3bny/lineups/match/{s['match_id']}/team/{s['home_id']}"

    # Save a lineup, then clear it by saving an empty slot list (the organizer
    # removed everyone and wants the lineup blank).
    r1 = c.put(url, json={"slots": [
        {"player_id": s["player_id"], "position_slot": "GK", "is_substitute": False}]},
        headers=hdr)
    assert r1.status_code == 200

    r2 = c.put(url, json={"formation": None, "slots": []}, headers=hdr)
    assert r2.status_code == 200
    assert r2.get_json()["slots"] == []

    from app.models import Tla3bnyLineup, Tla3bnyLineupSlot
    db.session.expire_all()
    lineup = Tla3bnyLineup.query.filter_by(
        match_id=s["match_id"], team_id=s["home_id"]).first()
    assert lineup is not None
    assert Tla3bnyLineupSlot.query.filter_by(lineup_id=lineup.id).count() == 0


def test_search_escapes_like_wildcards(client):
    app, db = client
    from app.models import Tla3bnyAcademy
    db.session.add_all([
        Tla3bnyAcademy(name="Star", status="approved"),
        Tla3bnyAcademy(name="S%r", status="approved"),
    ])
    db.session.commit()
    c = app.test_client()
    # "S%r" must match the literal-named academy only — not "Star" (which a raw
    # LIKE wildcard "S%r" would catch).
    names = {a["name"] for a in c.get("/api/tla3bny/search?q=S%25r").get_json()["academies"]}
    assert "S%r" in names
    assert "Star" not in names
