"""Contract tests for the public feed serializers — the JSON shape the web and
Flutter clients both parse. A DB-backed fixture seeds one minimal league so a
change that silently alters the contract (renamed/removed key, broken standings)
fails here instead of in the apps."""

import os
import tempfile
from datetime import date, datetime

os.environ.setdefault("FLASK_ENV", "development")

from app import create_app
from app.config import DevelopmentConfig
from app.extensions import db


def _app_with_league():
    """A minimal completed 2-team league: Home 2–1 Away. Returns (app, comp_id)."""
    tmpdb = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmpdb.close()
    # Flask-SQLAlchemy binds the engine at create_app (init_app) time from the
    # config CLASS attribute, so updating app.config afterwards does NOT rebind —
    # it would leave the engine on the .env rehearsal DB. Patch the class attr
    # before create_app (and restore it right after) to get a truly isolated DB.
    _orig = DevelopmentConfig.SQLALCHEMY_DATABASE_URI
    DevelopmentConfig.SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmpdb.name}"
    try:
        app = create_app("development")
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = _orig
    with app.app_context():
        # Import the models package BEFORE create_all so every table (incl. Group
        # with its full column set) is registered — create_all on a partial import
        # would miss columns queried later (e.g. competition_groups.sort_order).
        # The from-import runs app.models.__init__, which loads all model modules.
        from app.models import (
            AgeGroup, Club, Team, Season, Competition, Stage,
            CompetitionTeam, Match,
        )

        db.create_all()

        ag = AgeGroup(name_ar="تحت 17", name_en="U17", oldest_birth_year=2009)
        home_club = Club(name_ar="الأهلي", name_en="Ahly")
        away_club = Club(name_ar="الزمالك", name_en="Zamalek")
        db.session.add_all([ag, home_club, away_club])
        db.session.flush()

        home = Team(club_id=home_club.id, age_group_id=ag.id)
        away = Team(club_id=away_club.id, age_group_id=ag.id)
        season = Season(name_ar="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        db.session.add_all([home, away, season])
        db.session.flush()

        comp = Competition(season_id=season.id, age_group_id=ag.id, name_ar="الدوري")
        db.session.add(comp)
        db.session.flush()
        stage = Stage(competition_id=comp.id, stage_order=1, type="league")
        db.session.add(stage)
        db.session.add_all([
            CompetitionTeam(competition_id=comp.id, team_id=home.id),
            CompetitionTeam(competition_id=comp.id, team_id=away.id),
        ])
        db.session.flush()
        db.session.add(Match(
            stage_id=stage.id, home_team_id=home.id, away_team_id=away.id,
            status="completed", home_score=2, away_score=1,
            match_date=datetime(2026, 3, 1, 15, 0),
        ))
        db.session.commit()
        return app, comp.id, home.id, away.id


def test_competition_data_contract():
    app, cid, home_id, away_id = _app_with_league()
    with app.app_context():
        from app.api import serializers

        d = serializers.competition_data(cid)
        # The contract the web + Flutter clients both parse: these top-level keys.
        assert set(d) >= {"competition", "teams", "matches", "venues", "standings"}
        assert d["competition"]["id"] == cid
        assert len(d["teams"]) == 2      # both entered teams serialize
        assert len(d["matches"]) == 1    # the one (non-deleted) fixture
        assert isinstance(d["standings"], list)
        # The one match round-trips its score through the serializer.
        blob = repr(d["matches"][0])
        assert "2" in blob and "1" in blob


def test_competition_data_unknown_is_none():
    app, *_ = _app_with_league()
    with app.app_context():
        from app.api import serializers
        assert serializers.competition_data(999999) is None


def test_all_matches_shape_and_date_filter():
    app, cid, home_id, away_id = _app_with_league()
    with app.app_context():
        from app.api import serializers

        rows = serializers.all_matches("http://x", limit=100, order="desc")["matches"]
        assert len(rows) == 1  # the seeded match, in an isolated DB

        # A window entirely after the match (March 1) excludes it.
        empty = serializers.all_matches(
            "http://x", date_from=date(2026, 6, 1), limit=100, order="desc",
        )["matches"]
        assert empty == []


def test_config_blob_hides_unpublished_news():
    """A draft (is_published=False) must not reach the public config feed."""
    app, *_ = _app_with_league()
    with app.app_context():
        from app.models import News
        from app.api import serializers

        db.session.add_all([
            News(title_ar="منشور", date=date(2026, 3, 2), is_published=True),
            News(title_ar="مسودة", date=date(2026, 3, 3), is_published=False),
        ])
        db.session.commit()

        titles = [
            (n["title"]["ar"] if isinstance(n["title"], dict) else n["title"])
            for n in serializers.config_blob("http://x")["news"]
        ]
        assert "منشور" in titles       # published one is served
        assert "مسودة" not in titles    # draft is withheld


def test_competition_data_roster_is_season_scoped():
    """A team's roster in competition_data reflects who played that season — a
    player whose stint ended before the season is excluded; one active during it
    is included."""
    app, cid, home_id, away_id = _app_with_league()  # comp season = 2026
    with app.app_context():
        from app.models import Player, PlayerTeam
        from app.api import serializers

        left = Player(full_name_ar="راحل", birth_year=2009)
        current = Player(full_name_ar="حالي", birth_year=2009)
        db.session.add_all([left, current])
        db.session.flush()
        db.session.add_all([
            # Stint entirely before the 2026 season → not part of that squad.
            PlayerTeam(player_id=left.id, team_id=home_id,
                       start_date=date(2024, 1, 1), end_date=date(2025, 6, 30)),
            # Open stint that started in-season → part of the squad.
            PlayerTeam(player_id=current.id, team_id=home_id,
                       start_date=date(2026, 2, 1), end_date=None),
        ])
        db.session.commit()

        home = next(t for t in serializers.competition_data(cid)["teams"]
                    if t["team_id"] == str(home_id))
        ids = {p["id"] for p in home["roster"]}
        assert current.id in ids     # active during the season
        assert left.id not in ids    # left before the season began
