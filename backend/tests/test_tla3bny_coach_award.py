"""The coach-award additions: the competition coaches pool endpoint.

``GET /competitions/<id>/coaches`` is the pool an organizer picks a coach-award
(best coach / coach of the round) winner from — the coaches of the teams entered
in the competition. Exercised against a seeded DB via the public test client.
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
            yield app.test_client(), db
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
        Tla3bnyAcademy,
        Tla3bnyAgeCategory,
        Tla3bnyCoach,
        Tla3bnyCompetition,
        Tla3bnyCompetitionTeam,
        Tla3bnySeason,
        Tla3bnyTeam,
    )

    age = Tla3bnyAgeCategory(label="2010", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="Academy A", status="approved")
    db.session.add(ac)
    db.session.flush()
    entered = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="Entered")
    outside = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="Outside")
    db.session.add_all([entered, outside])
    db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    db.session.add(Tla3bnyCompetitionTeam(
        competition_id=comp.id, team_id=entered.id, age_category_id=age.id))
    # A current coach on the entered team, and a coach on a team NOT in the comp.
    db.session.add(Tla3bnyCoach(team_id=entered.id, name="In Coach", start_date=date(2026, 9, 1)))
    db.session.add(Tla3bnyCoach(team_id=outside.id, name="Out Coach", start_date=date(2026, 9, 1)))
    # An ex-coach (ended stint) on the entered team — should be excluded.
    db.session.add(Tla3bnyCoach(team_id=entered.id, name="Ex Coach",
                               start_date=date(2025, 1, 1), end_date=date(2025, 12, 31)))
    db.session.commit()
    return comp.id


def test_coaches_pool_is_only_current_coaches_of_entered_teams(client):
    test_client, db = client
    comp_id = _seed(db)
    rows = test_client.get(f"/api/tla3bny/competitions/{comp_id}/coaches").get_json()
    names = {c["name"] for c in rows}
    assert names == {"In Coach"}  # not the outside team's, not the ended stint
    assert rows[0]["team_name"]   # the coach carries their team for the picker
