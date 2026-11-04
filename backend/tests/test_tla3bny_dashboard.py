"""The competition organiser's overview/dashboard endpoint.

A 500 here renders as an endless spinner on the Overview tab (the frontend only
knows "no data yet"), so this pins that the aggregation returns 200 for a normal
competition — with data and with none.
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


def _seed(db, with_data=True):
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionAdmin, Tla3bnyCompetitionAge, Tla3bnyCompetitionPlayer,
        Tla3bnyCompetitionTeam, Tla3bnyMatch, Tla3bnyPlayer, Tla3bnySeason,
        Tla3bnyTeam, Tla3bnyUser,
    )
    from app.services import tla3bny_auth as auth

    age = Tla3bnyAgeCategory(label="2015", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="Ac", status="approved")
    db.session.add(ac)
    db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    cage = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=age.id)
    db.session.add(cage)
    db.session.flush()
    # The organiser is a competition admin — the account a super admin impersonates.
    org = Tla3bnyUser(username="org", role="competition_admin", status="active", password_hash="x")
    db.session.add(org)
    db.session.flush()
    db.session.add(Tla3bnyCompetitionAdmin(competition_id=comp.id, user_id=org.id))
    if with_data:
        home = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="Home")
        away = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="Away")
        db.session.add_all([home, away])
        db.session.flush()
        for t in (home, away):
            db.session.add(Tla3bnyCompetitionTeam(
                competition_id=comp.id, team_id=t.id, age_category_id=age.id,
                competition_age_id=cage.id, status="active"))
        db.session.flush()
        eh = Tla3bnyCompetitionTeam.query.filter_by(
            competition_id=comp.id, team_id=home.id).first()
        player = Tla3bnyPlayer(name="P", dob=date(2015, 1, 1))
        db.session.add(player)
        db.session.flush()
        db.session.add(Tla3bnyCompetitionPlayer(
            competition_team_id=eh.id, player_id=player.id, status="pending"))
        db.session.add(Tla3bnyMatch(
            competition_id=comp.id, age_category_id=age.id, competition_age_id=cage.id,
            home_team_id=home.id, away_team_id=away.id, status="scheduled"))
    db.session.commit()
    return {"comp_id": comp.id, "token": auth.generate_token(org)}


def _hdr(s):
    return {"Authorization": f"Bearer {s['token']}"}


def test_dashboard_returns_200_with_data(client):
    app, db = client
    s = _seed(db, with_data=True)
    r = app.test_client().get(
        f"/api/tla3bny/competitions/{s['comp_id']}/dashboard", headers=_hdr(s))
    assert r.status_code == 200, r.get_data(as_text=True)
    body = r.get_json()
    assert body["counts"]["teams"] == 2
    assert body["counts"]["players_pending"] == 1


def test_dashboard_returns_200_when_empty(client):
    app, db = client
    s = _seed(db, with_data=False)
    r = app.test_client().get(
        f"/api/tla3bny/competitions/{s['comp_id']}/dashboard", headers=_hdr(s))
    # No teams/players/matches yet → zeros, not an error (which would spin forever).
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["counts"]["teams"] == 0
