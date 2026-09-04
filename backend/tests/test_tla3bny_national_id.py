"""The national-ID (الرقم القومي) integrity rules, at the query level.

Two guards keep the same real child from being double-registered:

* ``_national_id_in_academy`` — a person can hold one squad slot per academy.
* ``_national_id_clash_in_competition`` — once a national ID is actively entered
  on any roster in a competition, no other player row with that ID may be entered
  in the same competition (by a rival academy or the same academy's other team).

These exercise the SQL directly against a seeded DB, so the rule is covered
without standing up HTTP + auth.
"""

import os
import tempfile
from datetime import date

import pytest

from app.api.tla3bny.players import (
    _national_id_clash_in_competition,
    _national_id_in_academy,
)


@pytest.fixture()
def app_ctx():
    """A throwaway app on an empty SQLite file with the full schema built."""
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
            db.engine.dispose()  # release the file handle so Windows can unlink it
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = orig
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _seed_two_academies(db):
    """Two academies, each with one team in the same age category, plus a season
    and a competition both teams are entered in. Returns the ids needed to add
    players and roster entries."""
    from app.models import (
        Tla3bnyAcademy,
        Tla3bnyAgeCategory,
        Tla3bnyCompetition,
        Tla3bnyCompetitionTeam,
        Tla3bnySeason,
        Tla3bnyTeam,
    )

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

    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()

    entry_a = Tla3bnyCompetitionTeam(
        competition_id=comp.id, team_id=team_a.id, age_category_id=age.id
    )
    entry_b = Tla3bnyCompetitionTeam(
        competition_id=comp.id, team_id=team_b.id, age_category_id=age.id
    )
    db.session.add_all([entry_a, entry_b])
    db.session.flush()
    return {
        "comp_id": comp.id,
        "team_a": team_a.id, "team_b": team_b.id,
        "entry_a": entry_a.id, "entry_b": entry_b.id,
    }


def _add_player(db, team_id, national_id, name="Player"):
    from app.models import Tla3bnyPlayer, Tla3bnyPlayerTeam

    p = Tla3bnyPlayer(name=name, national_id=national_id)
    db.session.add(p)
    db.session.flush()
    db.session.add(
        Tla3bnyPlayerTeam(player_id=p.id, team_id=team_id,
                          start_date=date(2026, 9, 1), status="active")
    )
    db.session.flush()
    return p


NID = "29801011234567"


def test_same_national_id_blocked_across_academies_in_one_competition(app_ctx):
    _app, db = app_ctx
    from app.models import Tla3bnyCompetitionPlayer

    ids = _seed_two_academies(db)
    # Academy A enters their copy of the child (pending approval).
    pa = _add_player(db, ids["team_a"], NID, "Ahmed (A)")
    db.session.add(Tla3bnyCompetitionPlayer(
        competition_team_id=ids["entry_a"], player_id=pa.id, status="pending"))
    db.session.flush()

    # Academy B's own row for the same child (same national ID) now clashes.
    pb = _add_player(db, ids["team_b"], NID, "Ahmed (B)")
    clash = _national_id_clash_in_competition(pb, ids["comp_id"])
    assert clash is not None
    assert clash.player_id == pa.id  # points at academy A's active entry


def test_no_clash_before_the_first_registration(app_ctx):
    _app, db = app_ctx
    ids = _seed_two_academies(db)
    pa = _add_player(db, ids["team_a"], NID, "Ahmed (A)")
    pb = _add_player(db, ids["team_b"], NID, "Ahmed (B)")
    # Nobody is on a roster yet → B is free to be entered.
    assert _national_id_clash_in_competition(pb, ids["comp_id"]) is None
    # And A entering themselves doesn't clash with their own (only) row.
    assert _national_id_clash_in_competition(pa, ids["comp_id"]) is None


def test_rejected_registration_does_not_block(app_ctx):
    _app, db = app_ctx
    from app.models import Tla3bnyCompetitionPlayer

    ids = _seed_two_academies(db)
    pa = _add_player(db, ids["team_a"], NID, "Ahmed (A)")
    # A's entry was rejected — it no longer holds the slot.
    db.session.add(Tla3bnyCompetitionPlayer(
        competition_team_id=ids["entry_a"], player_id=pa.id, status="rejected"))
    db.session.flush()
    pb = _add_player(db, ids["team_b"], NID, "Ahmed (B)")
    assert _national_id_clash_in_competition(pb, ids["comp_id"]) is None


def test_duplicate_national_id_within_same_academy_detected(app_ctx):
    _app, db = app_ctx
    ids = _seed_two_academies(db)
    _add_player(db, ids["team_a"], NID, "First")
    # Adding another player row with the same ID under the same academy is caught.
    dup = _national_id_in_academy(NID, academy_id=_academy_of(db, ids["team_a"]))
    assert dup is not None
    # A different academy holding the same ID is *not* a same-academy duplicate.
    assert _national_id_in_academy(NID, academy_id=_academy_of(db, ids["team_b"])) is None


def _academy_of(db, team_id):
    from app.models import Tla3bnyTeam
    return db.session.get(Tla3bnyTeam, team_id).academy_id
