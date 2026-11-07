"""Auto-published honour news carries the age bracket, and a team-of-the-round
item carries its best XI so the article can draw it on a pitch.

  * Any award news stores competition_age_id and serializes sub_competition_name
    + age_label, so the card shows the age next to the competition.
  * A team-of-the-round news links team_of_round_id and serializes team_of_round
    (formation + placed players) — the honours-page pitch, in the article.
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
        Tla3bnyPlayer, Tla3bnySeason, Tla3bnyTeam, Tla3bnyUser,
    )
    from app.services import tla3bny_auth as auth

    age = Tla3bnyAgeCategory(label="2011", label_ar="تحت 11", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="Ac", status="approved")
    db.session.add(ac)
    db.session.flush()
    team = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="A")
    db.session.add(team)
    db.session.flush()
    comp = Tla3bnyCompetition(name="UG League", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    cage = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=age.id, name="LEAGUE 1")
    db.session.add(cage)
    db.session.flush()
    entry = Tla3bnyCompetitionTeam(competition_id=comp.id, team_id=team.id, age_category_id=age.id)
    db.session.add(entry)
    db.session.flush()
    player = Tla3bnyPlayer(name="Star Player", dob=date(2011, 2, 2))
    db.session.add(player)
    db.session.flush()
    db.session.add(Tla3bnyCompetitionPlayer(
        competition_team_id=entry.id, player_id=player.id, status="approved"))
    admin = Tla3bnyUser(username="s", role="super_admin", status="active", password_hash="x")
    db.session.add(admin)
    db.session.commit()
    return {
        "comp_id": comp.id, "cage_id": cage.id, "team_id": team.id,
        "player_id": player.id, "token": auth.generate_token(admin),
    }


def _auth(s):
    return {"Authorization": f"Bearer {s['token']}"}


def _latest_news(db, comp_id):
    from app.models import Tla3bnyNews
    return (Tla3bnyNews.query.filter_by(competition_id=comp_id)
            .order_by(Tla3bnyNews.id.desc()).first())


def test_award_news_carries_age(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    r = c.post(f"/api/tla3bny/competitions/{s['comp_id']}/awards",
               json={"award_type": "player_of_round", "player_id": s["player_id"],
                     "competition_age_id": s["cage_id"], "round": "الجولة 1"},
               headers=_auth(s))
    assert r.status_code == 201
    news = _latest_news(db, s["comp_id"])
    assert news is not None
    d = news.to_dict()
    assert d["competition_age_id"] == s["cage_id"]
    # display_name is "<sub-comp> · <age label>".
    assert d["sub_competition_label"] == "LEAGUE 1 · 2011"
    # The body text mentions the age bracket, not just the competition.
    assert "2011" in (d["body"] or "")
    assert d["team_of_round"] is None


def test_team_of_round_news_carries_pitch(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    r = c.put(f"/api/tla3bny/competitions/{s['comp_id']}/team-of-round",
              json={"round": "الجولة 1", "competition_age_id": s["cage_id"],
                    "formation": "1-2-1", "slots": [
                        {"player_id": s["player_id"], "position_slot": "ST", "sort_order": 0}]},
              headers=_auth(s))
    assert r.status_code == 200
    news = _latest_news(db, s["comp_id"])
    assert news is not None
    d = news.to_dict()
    # The XI rides along so the article can draw the pitch (honours design).
    assert d["team_of_round"] is not None
    assert d["team_of_round"]["formation"] == "1-2-1"
    assert [sl["player_id"] for sl in d["team_of_round"]["slots"]] == [s["player_id"]]
    # And the age is present here too.
    assert d["competition_age_id"] == s["cage_id"]
    assert d["sub_competition_label"] == "LEAGUE 1 · 2011"
