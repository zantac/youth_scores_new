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


def test_disqualification_and_unserved_ban_block_the_lineup(ctx):
    db = ctx
    from app.models import Tla3bnyAgeCategory, Tla3bnyMatch, Tla3bnyPlayer, Tla3bnyPunishment
    from app.api.tla3bny.matches import _blocked_player_reasons

    comp_id, team_id, _ = _seed(db)
    age_id = db.session.query(Tla3bnyAgeCategory.id).scalar()
    match = Tla3bnyMatch(competition_id=comp_id, age_category_id=age_id,
                         home_team_id=team_id, away_team_id=team_id, status="scheduled")
    p = Tla3bnyPlayer(name="X")
    db.session.add_all([match, p])
    db.session.flush()

    # No punishment yet → nobody blocked.
    assert _blocked_player_reasons(match, team_id) == {}

    # A disqualified player is blocked.
    db.session.add(Tla3bnyPunishment(
        competition_id=comp_id, player_id=p.id, punishment_type="disqualification"))
    # An unserved match ban (no finished matches yet) is blocked too.
    q = Tla3bnyPlayer(name="Y")
    db.session.add(q)
    db.session.flush()
    db.session.add(Tla3bnyPunishment(
        competition_id=comp_id, player_id=q.id, punishment_type="match_ban", matches=2))
    db.session.commit()

    reasons = _blocked_player_reasons(match, team_id)
    assert p.id in reasons          # disqualified
    assert q.id in reasons          # ban not served (0 of 2)

    # Disqualifying the whole team blocks everyone (sentinel key 0).
    db.session.add(Tla3bnyPunishment(
        competition_id=comp_id, team_id=team_id, punishment_type="disqualification"))
    db.session.commit()
    assert 0 in _blocked_player_reasons(match, team_id)


def test_remove_permission_is_gated_per_organizer(ctx):
    db = ctx
    from app.models import Tla3bnyCompetitionAdmin, Tla3bnyUser
    from app.services import tla3bny_auth as auth

    comp_id, _team_id, _ = _seed(db)
    superu = Tla3bnyUser(username="s", role="super_admin", status="active", password_hash="x")
    org = Tla3bnyUser(username="o", role="competition_admin", status="active", password_hash="x")
    outsider = Tla3bnyUser(username="x", role="competition_admin", status="active", password_hash="x")
    db.session.add_all([superu, org, outsider])
    db.session.flush()
    ca = Tla3bnyCompetitionAdmin(competition_id=comp_id, user_id=org.id, can_remove_punishments=False)
    db.session.add(ca)
    db.session.commit()

    assert auth.can_remove_punishment(superu, comp_id) is True     # super always
    assert auth.can_remove_punishment(org, comp_id) is False       # organizer, not granted
    assert auth.can_remove_punishment(outsider, comp_id) is False  # not an organizer here
    assert auth.can_remove_punishment(None, comp_id) is False

    ca.can_remove_punishments = True
    db.session.commit()
    assert auth.can_remove_punishment(org, comp_id) is True        # now granted


def test_competition_owner_holds_all_permissions(ctx):
    db = ctx
    from app.models import Tla3bnyCompetitionAdmin, Tla3bnyUser
    from app.services import tla3bny_auth as auth

    comp_id, _team_id, _ = _seed(db)
    owner = Tla3bnyUser(username="own", role="competition_admin", status="active", password_hash="x")
    reg = Tla3bnyUser(username="reg", role="competition_admin", status="active", password_hash="x")
    db.session.add_all([owner, reg])
    db.session.flush()
    # Owner: no explicit flags, but is_owner grants everything.
    db.session.add(Tla3bnyCompetitionAdmin(competition_id=comp_id, user_id=owner.id, is_owner=True))
    # Regular organizer: not an owner, no flags.
    db.session.add(Tla3bnyCompetitionAdmin(competition_id=comp_id, user_id=reg.id, is_owner=False))
    db.session.commit()

    assert auth.is_competition_owner(owner, comp_id) is True
    assert auth.is_competition_owner(reg, comp_id) is False
    # The owner implicitly has every permission; the regular organizer has none.
    assert auth.can_remove_punishment(owner, comp_id) is True
    assert auth.can_chat(owner, comp_id) is True
    assert auth.can_remove_punishment(reg, comp_id) is False
    assert auth.can_chat(reg, comp_id) is False


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
