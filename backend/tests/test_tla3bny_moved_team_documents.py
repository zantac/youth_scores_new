"""Approving a player reads the papers of the entry's OWN sub-competition.

Regression: when a competition has two sub-competitions that share an age (e.g.
after a team was moved into the right one), the approval document check resolved
the sub-competition by matching the age category — which could land on the wrong
sub-competition and demand papers the team was never asked for, so an uploaded
paper read as "missing". The check must follow the entry's competition_age_id.
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


def _seed(db):
    """Two sub-competitions share one age. The team sits in the custom-papers
    one; a rival sub-competition (created first, so first by age match) asks for
    a different paper. The player uploads exactly the custom one's papers."""
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionAge, Tla3bnyCompetitionPlayer, Tla3bnyCompetitionTeam,
        Tla3bnyPlayer, Tla3bnyPlayerFile, Tla3bnySeason, Tla3bnyTeam, Tla3bnyUser,
    )
    from app.services import tla3bny_auth as auth

    age = Tla3bnyAgeCategory(label="2017", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="Eldawly", status="approved")
    db.session.add(ac)
    db.session.flush()
    team = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="T")
    db.session.add(team)
    db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    # The "other" sub-competition is created FIRST, so an age-only match lands on
    # it. It demands a paper the player did NOT upload.
    other = Tla3bnyCompetitionAge(
        competition_id=comp.id, age_category_id=age.id,
        required_documents=["الرقم القومي للاعب"])
    # The sub-competition the team is really in, with its own paper list.
    home = Tla3bnyCompetitionAge(
        competition_id=comp.id, age_category_id=age.id,
        required_documents=["صورة حديثة للاعب", "شهادة الميلاد"])
    db.session.add_all([other, home])
    db.session.flush()
    entry = Tla3bnyCompetitionTeam(
        competition_id=comp.id, team_id=team.id,
        age_category_id=age.id, competition_age_id=home.id)
    db.session.add(entry)
    db.session.flush()
    player = Tla3bnyPlayer(name="حمزة", national_id="12345678901234")
    db.session.add(player)
    db.session.flush()
    cp = Tla3bnyCompetitionPlayer(
        competition_team_id=entry.id, player_id=player.id, status="pending")
    db.session.add(cp)
    db.session.flush()
    for label in ("صورة حديثة للاعب", "شهادة الميلاد"):
        db.session.add(Tla3bnyPlayerFile(
            player_id=player.id, competition_player_id=cp.id,
            file_path="u/x.jpg", label=label))
    admin = Tla3bnyUser(username="s", role="super_admin", status="active", password_hash="x")
    db.session.add(admin)
    db.session.commit()
    return {"token": auth.generate_token(admin), "cp_id": cp.id,
            "team_id": team.id, "entry_id": entry.id}


def _hdr(s):
    return {"Authorization": f"Bearer {s['token']}"}


def test_approve_uses_the_entrys_own_subcompetition_papers(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    # The player uploaded exactly the home sub-competition's papers, so approval
    # succeeds — the check must not demand the other sub-competition's paper.
    r = c.post(f"/api/tla3bny/competition-players/{s['cp_id']}/approve", headers=_hdr(s))
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["status"] == "approved"


def test_required_documents_follow_the_entrys_subcompetition(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    # The academy-facing "what papers do we owe" list for this team must be the
    # home sub-competition's, not the rival one that merely shares the age.
    r = c.get(f"/api/tla3bny/teams/{s['team_id']}/required-documents", headers=_hdr(s))
    assert r.status_code == 200
    docs = r.get_json()["documents"]
    assert "صورة حديثة للاعب" in docs and "شهادة الميلاد" in docs
    assert "الرقم القومي للاعب" not in docs


def test_roster_review_shows_no_missing_for_the_right_subcompetition(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    # The organiser's roster view (the chips) must mark every paper satisfied —
    # it reads required_documents from the entry's own sub-competition.
    r = c.get(f"/api/tla3bny/competition-teams/{s['entry_id']}/roster", headers=_hdr(s))
    assert r.status_code == 200
    player = r.get_json()["roster"][0]
    assert player["missing_documents"] == []
    assert set(player["required_documents"]) == {"صورة حديثة للاعب", "شهادة الميلاد"}
