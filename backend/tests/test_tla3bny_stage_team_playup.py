"""Adding a moved / play-up team to a stage.

A team whose own age differs from its sub-competition's age — it plays up/down,
or was moved into this sub-competition — keeps its real age on the entry while
``competition_age_id`` points at the sub-competition. The team-list dropdown
filters by sub-competition, so it offers such a team; adding it to a stage must
accept it too. It used to be validated by age, which rejected the very team the
dropdown had just offered (it showed in the list but never landed in the stage).
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
    """A 2016 team sits (post-move) in the 2015 sub-competition's league stage."""
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionAge, Tla3bnyCompetitionTeam, Tla3bnyStage,
        Tla3bnySeason, Tla3bnyTeam, Tla3bnyUser,
    )
    from app.services import tla3bny_auth as auth

    age15 = Tla3bnyAgeCategory(label="2015", sort_order=0, oldest_birth_year=2015)
    age16 = Tla3bnyAgeCategory(label="2016", sort_order=1, oldest_birth_year=2016)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age15, age16, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="Ac", status="approved")
    db.session.add(ac)
    db.session.flush()
    # A genuine 2016 team.
    team = Tla3bnyTeam(academy_id=ac.id, age_category_id=age16.id, name="T")
    db.session.add(team)
    db.session.flush()
    comp = Tla3bnyCompetition(name="League", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    cage15 = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=age15.id)
    cage16 = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=age16.id)
    db.session.add_all([cage15, cage16])
    db.session.flush()
    stage = Tla3bnyStage(competition_age_id=cage15.id, name="League", stage_order=1, type="league")
    db.session.add(stage)
    # The entry keeps the team's real age (2016) but plays in the 2015 sub-comp.
    entry = Tla3bnyCompetitionTeam(
        competition_id=comp.id, team_id=team.id,
        age_category_id=age16.id, competition_age_id=cage15.id, status="active")
    db.session.add(entry)
    admin = Tla3bnyUser(username="s", role="super_admin", status="active", password_hash="x")
    db.session.add(admin)
    db.session.commit()
    return {"token": auth.generate_token(admin), "comp_id": comp.id,
            "cage15": cage15.id, "stage_id": stage.id, "team_id": team.id}


def _hdr(s):
    return {"Authorization": f"Bearer {s['token']}"}


def test_playup_team_is_offered_and_can_be_added_to_the_stage(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)

    # The dropdown (filtered by sub-competition) offers the team…
    lst = c.get(f"/api/tla3bny/competitions/{s['comp_id']}/teams"
                f"?competition_age_id={s['cage15']}", headers=_hdr(s))
    assert lst.status_code == 200
    assert any(e["team_id"] == s["team_id"] for e in lst.get_json())

    # …and adding it to the stage succeeds (used to 409 on an age mismatch).
    r = c.post(f"/api/tla3bny/stages/{s['stage_id']}/teams",
               headers=_hdr(s), json={"team_id": s["team_id"]})
    assert r.status_code == 201, r.get_json()

    from app.models import Tla3bnyGroup, Tla3bnyGroupTeam
    db.session.expire_all()
    gids = [g.id for g in Tla3bnyGroup.query.filter_by(stage_id=s["stage_id"]).all()]
    placed = Tla3bnyGroupTeam.query.filter(
        Tla3bnyGroupTeam.group_id.in_(gids),
        Tla3bnyGroupTeam.team_id == s["team_id"]).first()
    assert placed is not None


def test_team_not_registered_in_the_subcompetition_is_still_rejected(client):
    app, db = client
    c = app.test_client()
    s = _seed(db)
    # A stranger team with no entry must not be addable.
    from app.models import Tla3bnyTeam
    stray = Tla3bnyTeam.query.filter_by(name="T").first()
    bogus_team_id = stray.id + 999
    r = c.post(f"/api/tla3bny/stages/{s['stage_id']}/teams",
               headers=_hdr(s), json={"team_id": bogus_team_id})
    assert r.status_code in (400, 409)
