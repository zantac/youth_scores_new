"""Punishment rules that aren't obvious from the model.

* A point-deduction punishment drives the standings: a team's
  Tla3bnyCompetitionTeam.point_deduction is recomputed as the sum of its active
  point-deduction punishments.
* The fine amount is private — only emitted when to_dict is asked for it.
"""

import os
import tempfile

import pytest


@pytest.fixture()
def ctx():
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


def _seed(db):
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionTeam, Tla3bnySeason, Tla3bnyTeam,
    )
    age = Tla3bnyAgeCategory(label="2012", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="A", status="approved")
    db.session.add(ac)
    db.session.flush()
    team = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="T")
    db.session.add(team)
    db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    entry = Tla3bnyCompetitionTeam(competition_id=comp.id, team_id=team.id, age_category_id=age.id)
    db.session.add(entry)
    db.session.commit()
    return comp.id, team.id, entry.id


def test_point_deduction_punishments_drive_the_entry_deduction(ctx):
    db = ctx
    from app.models import Tla3bnyCompetitionTeam, Tla3bnyPunishment
    from app.api.tla3bny.punishments import _recompute_team_deduction

    comp_id, team_id, entry_id = _seed(db)

    db.session.add(Tla3bnyPunishment(
        competition_id=comp_id, team_id=team_id, punishment_type="point_deduction", points=3))
    db.session.add(Tla3bnyPunishment(
        competition_id=comp_id, team_id=team_id, punishment_type="point_deduction", points=2))
    # A fine on the same team must NOT count toward the deduction.
    db.session.add(Tla3bnyPunishment(
        competition_id=comp_id, team_id=team_id, punishment_type="fine", amount=500))
    db.session.commit()

    _recompute_team_deduction(comp_id, team_id)
    db.session.commit()
    assert db.session.get(Tla3bnyCompetitionTeam, entry_id).point_deduction == 5  # 3 + 2

    # Removing one deduction lowers the total.
    dp = Tla3bnyPunishment.query.filter_by(
        team_id=team_id, punishment_type="point_deduction", points=2).first()
    db.session.delete(dp)
    db.session.commit()
    _recompute_team_deduction(comp_id, team_id)
    db.session.commit()
    assert db.session.get(Tla3bnyCompetitionTeam, entry_id).point_deduction == 3


def test_fine_amount_is_private_in_to_dict(ctx):
    db = ctx
    from app.models import Tla3bnyPunishment
    comp_id, team_id, _ = _seed(db)
    fine = Tla3bnyPunishment(
        competition_id=comp_id, team_id=team_id, punishment_type="fine", amount=750)
    db.session.add(fine)
    db.session.commit()
    assert "amount" not in fine.to_dict()                     # hidden by default
    assert fine.to_dict(include_amount=True)["amount"] == 750  # only when asked
