"""The competition teams list carries an approved-player count per entry, so the
organiser's Teams tab can show each team's squad size. Only *approved* players
count (pending/rejected/replaced are excluded), and the count is produced in one
grouped query rather than an N+1 over every team's roster.
"""

import os
import tempfile

import pytest


@pytest.fixture()
def app():
    os.environ.setdefault("FLASK_ENV", "development")
    from app import create_app
    from app.config import DevelopmentConfig
    from app.extensions import db

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    orig = DevelopmentConfig.SQLALCHEMY_DATABASE_URI
    DevelopmentConfig.SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp.name}"
    try:
        flask_app = create_app("development")
        with flask_app.app_context():
            db.create_all()
        yield flask_app
        with flask_app.app_context():
            db.session.remove()
            db.engine.dispose()
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = orig
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _seed():
    """One competition with two active team entries. Team A has 2 approved + 1
    pending + 1 rejected player; team B has 0. Returns comp_id and entry ids."""
    from app.extensions import db
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionPlayer, Tla3bnyCompetitionTeam, Tla3bnyPlayer,
        Tla3bnySeason, Tla3bnyTeam,
    )
    age = Tla3bnyAgeCategory(label="2011", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="Ac", status="approved")
    db.session.add(ac)
    db.session.flush()
    team_a = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="A")
    team_b = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="B")
    db.session.add_all([team_a, team_b])
    db.session.flush()
    comp = Tla3bnyCompetition(name="League", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    entry_a = Tla3bnyCompetitionTeam(
        competition_id=comp.id, team_id=team_a.id, age_category_id=age.id, status="active")
    entry_b = Tla3bnyCompetitionTeam(
        competition_id=comp.id, team_id=team_b.id, age_category_id=age.id, status="active")
    db.session.add_all([entry_a, entry_b])
    db.session.flush()

    for status in ("approved", "approved", "pending", "rejected"):
        p = Tla3bnyPlayer(name=f"P-{status}")
        db.session.add(p)
        db.session.flush()
        db.session.add(Tla3bnyCompetitionPlayer(
            competition_team_id=entry_a.id, player_id=p.id, status=status))
    db.session.commit()
    return comp.id, entry_a.id, entry_b.id


def test_teams_list_reports_approved_player_count(app):
    with app.app_context():
        comp_id, entry_a, entry_b = _seed()

    resp = app.test_client().get(f"/api/tla3bny/competitions/{comp_id}/teams")
    assert resp.status_code == 200
    by_id = {e["id"]: e for e in resp.get_json()}

    # Only the two approved players count — pending/rejected are excluded.
    assert by_id[entry_a]["player_count"] == 2
    # A team with no roster reports zero, not a missing key.
    assert by_id[entry_b]["player_count"] == 0
