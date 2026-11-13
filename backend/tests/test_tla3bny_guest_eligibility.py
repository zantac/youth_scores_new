"""Advanced-audit H1: a guest player must be an APPROVED competition player on their
own team's entry in this competition. Guesting is cross-age *within* the competition —
not a way to field a player who was never registered/approved (which would dodge the
papers, national-ID clash check, and roster/priced caps)."""

import os
import tempfile
from datetime import date

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


def _seed(db, approve_guest: bool):
    """An academy with a primary (older) team entered in a competition and a younger
    sibling team also entered. A player sits on the sibling team. `approve_guest`
    controls whether that player is an approved competition player on the sibling's
    entry. Returns (match, primary_team_id, guest_player_id)."""
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionPlayer, Tla3bnyCompetitionTeam, Tla3bnyMatch,
        Tla3bnyPlayer, Tla3bnyPlayerTeam, Tla3bnySeason, Tla3bnyTeam,
    )
    old = Tla3bnyAgeCategory(label="2010", sort_order=0)   # oldest_birth_year 2010
    young = Tla3bnyAgeCategory(label="2012", sort_order=1)  # younger
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([old, young, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="A", status="approved")
    db.session.add(ac)
    db.session.flush()
    primary = Tla3bnyTeam(academy_id=ac.id, age_category_id=old.id, name="U16")
    sibling = Tla3bnyTeam(academy_id=ac.id, age_category_id=young.id, name="U14")
    db.session.add_all([primary, sibling])
    db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    e_primary = Tla3bnyCompetitionTeam(competition_id=comp.id, team_id=primary.id, age_category_id=old.id)
    e_sibling = Tla3bnyCompetitionTeam(competition_id=comp.id, team_id=sibling.id, age_category_id=young.id)
    db.session.add_all([e_primary, e_sibling])
    db.session.flush()
    # A younger player on the sibling team (year 2012 >= 2010 → passes the age gate).
    p = Tla3bnyPlayer(name="Young Guest", dob=date(2012, 5, 1), national_id="29012011234567")
    db.session.add(p)
    db.session.flush()
    db.session.add(Tla3bnyPlayerTeam(player_id=p.id, team_id=sibling.id, status="active"))
    if approve_guest:
        db.session.add(Tla3bnyCompetitionPlayer(
            competition_team_id=e_sibling.id, player_id=p.id, status="approved"))
    match = Tla3bnyMatch(competition_id=comp.id, age_category_id=old.id,
                         home_team_id=primary.id, away_team_id=primary.id, status="scheduled")
    db.session.add(match)
    db.session.commit()
    return match, primary.id, p.id


def test_unapproved_guest_is_excluded(db_ctx):
    db = db_ctx
    from app.api.tla3bny.matches import _lineup_eligible_players
    match, primary_id, guest_id = _seed(db, approve_guest=False)
    eligible_ids = {e["player_id"] for e in _lineup_eligible_players(match, primary_id)}
    assert guest_id not in eligible_ids  # never registered/approved → not a guest option


def test_approved_guest_is_included(db_ctx):
    db = db_ctx
    from app.api.tla3bny.matches import _lineup_eligible_players
    match, primary_id, guest_id = _seed(db, approve_guest=True)
    eligible = _lineup_eligible_players(match, primary_id)
    guest = next((e for e in eligible if e["player_id"] == guest_id), None)
    assert guest is not None and guest["guest"] is True  # approved sibling → eligible guest


def _seed_tracks(db):
    """One competition, two sub-competition tracks ("A" and "B"), each spanning two
    ages (old 2010 + young 2012). One academy fields four teams — old-A, young-A,
    old-B, young-B — with an approved player on each young team. Returns
    (match_old_A, old_A_team_id, young_A_guest_id, young_B_guest_id)."""
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionAge, Tla3bnyCompetitionPlayer, Tla3bnyCompetitionTeam,
        Tla3bnyMatch, Tla3bnyPlayer, Tla3bnyPlayerTeam, Tla3bnySeason, Tla3bnyTeam,
    )
    old = Tla3bnyAgeCategory(label="2010", sort_order=0)
    young = Tla3bnyAgeCategory(label="2012", sort_order=1)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([old, young, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="A", status="approved")
    db.session.add(ac)
    db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    # Four sub-competitions: {A,B} × {old,young}.
    ca_old_A = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=old.id, name="A")
    ca_young_A = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=young.id, name="A")
    ca_old_B = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=old.id, name="B")
    ca_young_B = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=young.id, name="B")
    db.session.add_all([ca_old_A, ca_young_A, ca_old_B, ca_young_B])
    db.session.flush()

    def _entry_with_player(age_cat, cage, pname):
        team = Tla3bnyTeam(academy_id=ac.id, age_category_id=age_cat.id, name=pname)
        db.session.add(team)
        db.session.flush()
        entry = Tla3bnyCompetitionTeam(
            competition_id=comp.id, team_id=team.id,
            age_category_id=age_cat.id, competition_age_id=cage.id)
        db.session.add(entry)
        db.session.flush()
        p = Tla3bnyPlayer(name=pname, dob=date(2012, 5, 1))
        db.session.add(p)
        db.session.flush()
        db.session.add(Tla3bnyPlayerTeam(player_id=p.id, team_id=team.id, status="active"))
        db.session.add(Tla3bnyCompetitionPlayer(
            competition_team_id=entry.id, player_id=p.id, status="approved"))
        return team, p

    old_A_team, _ = _entry_with_player(old, ca_old_A, "oldA")
    _young_A_team, young_A_p = _entry_with_player(young, ca_young_A, "youngA")
    _old_B_team, _ = _entry_with_player(old, ca_old_B, "oldB")
    _young_B_team, young_B_p = _entry_with_player(young, ca_young_B, "youngB")

    match = Tla3bnyMatch(
        competition_id=comp.id, age_category_id=old.id, competition_age_id=ca_old_A.id,
        home_team_id=old_A_team.id, away_team_id=old_A_team.id, status="scheduled")
    db.session.add(match)
    db.session.commit()
    return match, old_A_team.id, young_A_p.id, young_B_p.id


def test_guest_confined_to_same_subcompetition_track(db_ctx):
    db = db_ctx
    from app.api.tla3bny.matches import _lineup_eligible_players
    match_old_A, old_A_team_id, young_A_id, young_B_id = _seed_tracks(db)
    eligible_ids = {e["player_id"] for e in _lineup_eligible_players(match_old_A, old_A_team_id)}
    # 2015-"A" player may guest up into a 2013-"A" match…
    assert young_A_id in eligible_ids
    # …but a 2015-"B" player may NOT — different sub-competition track.
    assert young_B_id not in eligible_ids


def _seed_same_bracket_siblings(db):
    """One academy, two teams BOTH entered in the same sub-competition bracket
    (same competition_age_id). Each team has an approved player. Returns
    (match, team_A_id, player_A_id, team_B_id, player_B_id)."""
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition,
        Tla3bnyCompetitionAge, Tla3bnyCompetitionPlayer, Tla3bnyCompetitionTeam,
        Tla3bnyMatch, Tla3bnyPlayer, Tla3bnyPlayerTeam, Tla3bnySeason, Tla3bnyTeam,
    )
    age = Tla3bnyAgeCategory(label="2012", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    ac = Tla3bnyAcademy(name="BigAcademy", status="approved")
    db.session.add(ac)
    db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    db.session.add(comp)
    db.session.flush()
    cage = Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=age.id, name="A")
    db.session.add(cage)
    db.session.flush()

    def _make_team_with_player(pname):
        team = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name=pname)
        db.session.add(team)
        db.session.flush()
        entry = Tla3bnyCompetitionTeam(
            competition_id=comp.id, team_id=team.id,
            age_category_id=age.id, competition_age_id=cage.id)
        db.session.add(entry)
        db.session.flush()
        p = Tla3bnyPlayer(name=pname, dob=date(2012, 3, 1))
        db.session.add(p)
        db.session.flush()
        db.session.add(Tla3bnyPlayerTeam(player_id=p.id, team_id=team.id, status="active"))
        db.session.add(Tla3bnyCompetitionPlayer(
            competition_team_id=entry.id, player_id=p.id, status="approved"))
        return team, p

    team_a, player_a = _make_team_with_player("TeamA")
    team_b, player_b = _make_team_with_player("TeamB")
    match = Tla3bnyMatch(
        competition_id=comp.id, age_category_id=age.id, competition_age_id=cage.id,
        home_team_id=team_a.id, away_team_id=team_b.id, status="scheduled")
    db.session.add(match)
    db.session.commit()
    return match, team_a.id, player_a.id, team_b.id, player_b.id


def test_same_bracket_sibling_players_not_guests(db_ctx):
    """An academy with two teams in the same sub-competition bracket must NOT
    offer each other's players as guests — guesting is cross-age only."""
    db = db_ctx
    from app.api.tla3bny.matches import _lineup_eligible_players
    match, team_a_id, player_a_id, team_b_id, player_b_id = _seed_same_bracket_siblings(db)
    # From team A's perspective: player B should NOT appear as a guest.
    eligible_a = {e["player_id"] for e in _lineup_eligible_players(match, team_a_id)}
    assert player_a_id in eligible_a       # own player is on the roster
    assert player_b_id not in eligible_a   # sibling team, same bracket → not a guest option
    # Symmetric: from team B's perspective: player A should NOT appear as a guest.
    eligible_b = {e["player_id"] for e in _lineup_eligible_players(match, team_b_id)}
    assert player_b_id in eligible_b
    assert player_a_id not in eligible_b
