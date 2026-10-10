"""A registration request is private to the academy/team that made it.

The ``/players/<id>/registrations`` endpoint returns every roster entry for a
player, so without per-row scoping a rival academy looking at the same child
would see the other academy's approvals (and rejection reasons). These tests
pin the scoping: each academy sees only its own entry, a stranger/public caller
sees none, and the competition's organiser sees the entry in their competition.
"""

import os
import tempfile
from datetime import date

import pytest


@pytest.fixture()
def app():
    """A throwaway app on an empty SQLite file with the full schema built.

    The app context is **not** held open: each test seeds inside its own
    ``with app.app_context()`` and then issues HTTP requests through the test
    client, so every request gets a fresh request/app context — the same
    per-request isolation production has. (Holding one context open would let
    ``current_user()``'s ``g`` cache leak across requests and mask the scoping.)
    """
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
            db.engine.dispose()  # release the file handle so Windows can unlink it
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = orig
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _seed():
    """One player entered in the same competition under two academies' teams:
    academy A's entry is approved, academy B's is rejected. Returns the ids and
    an academy login token for each side. Run inside an app context."""
    from app.extensions import db
    from app.models import (
        Tla3bnyAcademy,
        Tla3bnyAgeCategory,
        Tla3bnyCompetition,
        Tla3bnyCompetitionPlayer,
        Tla3bnyCompetitionTeam,
        Tla3bnyPlayer,
        Tla3bnyPlayerTeam,
        Tla3bnySeason,
        Tla3bnyTeam,
        Tla3bnyUser,
    )
    from app.services import tla3bny_auth as auth

    age = Tla3bnyAgeCategory(label="2010", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()

    ac_a = Tla3bnyAcademy(name="Academy A", status="approved")
    ac_b = Tla3bnyAcademy(name="Academy B", status="approved")
    db.session.add_all([ac_a, ac_b])
    db.session.flush()

    team_a = Tla3bnyTeam(academy_id=ac_a.id, age_category_id=age.id)
    team_b = Tla3bnyTeam(academy_id=ac_b.id, age_category_id=age.id)
    db.session.add_all([team_a, team_b])
    db.session.flush()

    comp = Tla3bnyCompetition(name="UG League", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()

    entry_a = Tla3bnyCompetitionTeam(
        competition_id=comp.id, team_id=team_a.id, age_category_id=age.id)
    entry_b = Tla3bnyCompetitionTeam(
        competition_id=comp.id, team_id=team_b.id, age_category_id=age.id)
    db.session.add_all([entry_a, entry_b])
    db.session.flush()

    # A single player row carried on both academies' rosters (e.g. moved teams).
    player = Tla3bnyPlayer(name="Mohamed")
    db.session.add(player)
    db.session.flush()
    db.session.add_all([
        Tla3bnyPlayerTeam(player_id=player.id, team_id=team_a.id,
                          start_date=date(2026, 9, 1), status="active"),
        Tla3bnyPlayerTeam(player_id=player.id, team_id=team_b.id,
                          start_date=date(2026, 9, 1), status="active"),
    ])
    db.session.add_all([
        Tla3bnyCompetitionPlayer(
            competition_team_id=entry_a.id, player_id=player.id,
            status="approved"),
        Tla3bnyCompetitionPlayer(
            competition_team_id=entry_b.id, player_id=player.id,
            status="rejected", rejection_reason="ورقة ناقصة"),
    ])

    user_a = Tla3bnyUser(role="academy", academy_id=ac_a.id, status="active",
                         password_hash="x", username="aca_a")
    user_b = Tla3bnyUser(role="academy", academy_id=ac_b.id, status="active",
                         password_hash="x", username="aca_b")
    db.session.add_all([user_a, user_b])
    db.session.commit()

    return {
        "player_id": player.id,
        "comp_id": comp.id,
        "token_a": auth.generate_token(user_a),
        "token_b": auth.generate_token(user_b),
    }


def _registrations(app, player_id, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = app.test_client().get(
        f"/api/tla3bny/players/{player_id}/registrations", headers=headers)
    assert resp.status_code == 200
    return resp.get_json()


def test_academy_sees_only_its_own_registration(app):
    with app.app_context():
        ids = _seed()

    # Academy A sees its approved entry — and not B's rejection/reason.
    rows_a = _registrations(app, ids["player_id"], ids["token_a"])
    assert [r["status"] for r in rows_a] == ["approved"]

    # Academy B sees its own rejected entry with the reason, but not A's.
    rows_b = _registrations(app, ids["player_id"], ids["token_b"])
    assert [r["status"] for r in rows_b] == ["rejected"]
    assert rows_b[0]["rejection_reason"] == "ورقة ناقصة"


def test_public_and_stranger_see_no_registrations(app):
    with app.app_context():
        ids = _seed()
    # A logged-out visitor gets the public profile: no registration requests.
    assert _registrations(app, ids["player_id"]) == []


def test_competition_organiser_sees_both_entries_in_their_competition(app):
    from app.extensions import db
    from app.models import Tla3bnyCompetitionAdmin, Tla3bnyUser
    from app.services import tla3bny_auth as auth

    with app.app_context():
        ids = _seed()
        organiser = Tla3bnyUser(role="competition_admin", status="active",
                                password_hash="x", username="org", name="Organiser")
        db.session.add(organiser)
        db.session.flush()
        db.session.add(Tla3bnyCompetitionAdmin(
            competition_id=ids["comp_id"], user_id=organiser.id, is_owner=True))
        db.session.commit()
        token = auth.generate_token(organiser)

    rows = _registrations(app, ids["player_id"], token)
    # The organiser owns the whole competition, so both academies' entries show.
    assert sorted(r["status"] for r in rows) == ["approved", "rejected"]
