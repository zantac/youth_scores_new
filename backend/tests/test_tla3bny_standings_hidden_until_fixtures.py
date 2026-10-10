"""The standings table stays hidden until the organiser draws up the fixtures.

A table built from entered teams but no matches is just a roster count — it would
tell every academy how many (and which) rivals have joined before the organiser
chooses to reveal the draw. ``standings_by_group`` therefore returns ``[]`` while
no match exists for the (competition, age), and the real table the moment one does
— even before it is played.
"""

import os
import tempfile

import pytest


@pytest.fixture()
def db_ctx():
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
            yield db
            db.session.remove()
            db.engine.dispose()
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = orig
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _seed_entered_teams(db):
    """Two teams entered into a competition's age — but no fixtures yet."""
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionAge, Tla3bnyCompetitionTeam, Tla3bnySeason, Tla3bnyTeam,
    )
    age = Tla3bnyAgeCategory(label="2011", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="Ac", status="approved")
    db.session.add(ac)
    db.session.flush()
    teams = {}
    for key in ("A", "B"):
        t = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name=key)
        db.session.add(t)
        db.session.flush()
        teams[key] = t.id
    comp = Tla3bnyCompetition(name="League", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    db.session.add(Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=age.id))
    for tid in teams.values():
        db.session.add(Tla3bnyCompetitionTeam(
            competition_id=comp.id, team_id=tid, age_category_id=age.id))
    db.session.commit()
    return comp.id, age.id, teams


def _flatten(tables):
    return {r["team_id"]: r for grp in tables for r in grp["standings"]}


def test_no_table_before_any_fixture_is_created(db_ctx):
    db = db_ctx
    from app.services import tla3bny_tables as tables

    comp_id, age_id, _teams = _seed_entered_teams(db)
    # Teams are entered, but the organiser hasn't drawn the fixtures: no table,
    # so the roster count never leaks.
    assert tables.standings_by_group(comp_id, age_id) == []


def test_table_appears_once_a_fixture_exists_even_unplayed(db_ctx):
    db = db_ctx
    from app.models import Tla3bnyMatch
    from app.services import tla3bny_tables as tables

    comp_id, age_id, teams = _seed_entered_teams(db)
    # The organiser publishes one scheduled (unplayed) fixture.
    db.session.add(Tla3bnyMatch(
        competition_id=comp_id, age_category_id=age_id,
        home_team_id=teams["A"], away_team_id=teams["B"], status="scheduled"))
    db.session.commit()

    rows = _flatten(tables.standings_by_group(comp_id, age_id))
    # Both entered teams now show — at zero, since nothing has been played.
    assert set(rows) == {teams["A"], teams["B"]}
    assert rows[teams["A"]]["P"] == 0 and rows[teams["A"]]["Pts"] == 0
