"""Delete preview must agree with the actual delete.

A team (or competition) whose only matches are *soft-deleted* is deletable:
delete_team / delete_competition block only on live matches and purge the
soft-deleted ones. The preview the admin panel reads must say the same — else
it greys out the confirm button for a delete that would in fact succeed
(the real "team 452 pinned by 18 soft-deleted fixtures" bug).
"""

import os
import tempfile
from datetime import date, datetime

os.environ.setdefault("FLASK_ENV", "development")

from app import create_app
from app.config import DevelopmentConfig
from app.extensions import db


def _setup():
    """One team with a single SOFT-DELETED match against another team, enrolled
    in one competition. Returns (app, ctx, editor header)."""
    tmpdb = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmpdb.close()
    _orig = DevelopmentConfig.SQLALCHEMY_DATABASE_URI
    DevelopmentConfig.SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmpdb.name}"
    try:
        app = create_app("development")
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = _orig
    with app.app_context():
        from app.models import (
            AdminUser, AgeGroup, Club, Team, Season, Competition, Stage,
            CompetitionTeam, Match,
        )
        from app.services import auth

        db.create_all()

        ag = AgeGroup(name_ar="2009", name_en="2009", oldest_birth_year=2009)
        c1 = Club(name_ar="مسار", name_en="Masar")
        c2 = Club(name_ar="الخصم", name_en="Opp")
        db.session.add_all([ag, c1, c2])
        db.session.flush()

        victim = Team(club_id=c1.id, age_group_id=ag.id)
        opp = Team(club_id=c2.id, age_group_id=ag.id)
        season = Season(name_ar="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        db.session.add_all([victim, opp, season])
        db.session.flush()

        comp = Competition(season_id=season.id, age_group_id=ag.id, code="c1", name_ar="الدوري")
        db.session.add(comp)
        db.session.flush()
        stage = Stage(competition_id=comp.id, stage_order=1, type="league")
        db.session.add(stage)
        db.session.flush()
        db.session.add(CompetitionTeam(competition_id=comp.id, team_id=opp.id))

        # The victim's only match is soft-deleted (deleted_at set) — exactly the
        # production state: removed from the competition, its fixtures purged
        # from public view but never hard-deleted.
        m = Match(
            stage_id=stage.id, home_team_id=victim.id, away_team_id=opp.id,
            status="scheduled", match_date=datetime(2026, 3, 1, 15, 0),
            deleted_at=datetime(2026, 9, 9, 13, 5, 0),
        )
        db.session.add(m)

        editor = AdminUser(username="e", role="editor", is_active=True, password_hash="x")
        editor.set_password("pw")
        db.session.add(editor)
        db.session.commit()

        ctx = {"victim_id": victim.id, "comp_id": comp.id, "match_id": m.id}
        header = {"Authorization": f"Bearer {auth.generate_token(editor)}"}
    return app, ctx, header


def _nouns(items):
    return {it["noun"]: it["count"] for it in items}


def test_preview_excludes_soft_deleted_from_blockers():
    app, ctx, hdr = _setup()
    c = app.test_client()
    r = c.get(f"/api/admin/delete-preview/team/{ctx['victim_id']}", headers=hdr)
    assert r.status_code == 200, r.data
    body = r.get_json()
    # The soft-deleted match must NOT block (no live matches at all).
    assert "مباراة" not in _nouns(body["blockers"])
    # It is surfaced as a cascade instead — the delete purges it.
    assert _nouns(body["cascades"]).get("مباراة محذوفة مؤقتًا") == 1


def test_delete_succeeds_and_purges_soft_deleted_match():
    app, ctx, hdr = _setup()
    c = app.test_client()
    r = c.delete(f"/api/admin/teams/{ctx['victim_id']}", json={"password": "pw"}, headers=hdr)
    assert r.status_code == 200, r.data
    with app.app_context():
        from app.models import Team, Match
        assert db.session.get(Team, ctx["victim_id"]) is None
        assert db.session.get(Match, ctx["match_id"]) is None


def test_live_match_still_blocks_preview():
    app, ctx, hdr = _setup()
    with app.app_context():
        from app.models import Match
        db.session.get(Match, ctx["match_id"]).deleted_at = None  # make it live
        db.session.commit()
    c = app.test_client()
    r = c.get(f"/api/admin/delete-preview/team/{ctx['victim_id']}", headers=hdr)
    assert r.status_code == 200, r.data
    assert _nouns(r.get_json()["blockers"]).get("مباراة") == 1
