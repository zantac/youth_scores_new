from flask import jsonify

from app.models import (
    Tla3bnyAcademy,
    Tla3bnyAgeCategory,
    Tla3bnyCoach,
    Tla3bnyCompetition,
    Tla3bnyCompetitionPlayer,
    Tla3bnyCompetitionTeam,
    Tla3bnyMatch,
    Tla3bnyMatchEvent,
    Tla3bnyNews,
    Tla3bnyPlayer,
    Tla3bnySeason,
    Tla3bnyTeam,
)
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import _forbid


@tla3bny_bp.get("/stats")
@auth.super_admin_required
def stats():
    """Aggregate counts for the super-admin dashboard."""
    total_matches = Tla3bnyMatch.query.count()
    played = Tla3bnyMatch.query.filter_by(status="finished").count()
    goals = Tla3bnyMatchEvent.query.filter_by(event_type="goal").count()
    teams = Tla3bnyTeam.query.count()
    players = Tla3bnyPlayer.query.count()
    pending_approvals = Tla3bnyCompetitionPlayer.query.filter_by(status="pending").count()

    active_season = Tla3bnySeason.query.filter_by(is_active=True).first()

    per_comp = []
    for c in Tla3bnyCompetition.query.order_by(Tla3bnyCompetition.id.desc()).all():
        m = Tla3bnyMatch.query.filter_by(competition_id=c.id)
        tot = m.count()
        done = m.filter_by(status="finished").count()
        comp_teams = Tla3bnyCompetitionTeam.query.filter_by(
            competition_id=c.id, status="active"
        ).count()
        pending_in = (
            Tla3bnyCompetitionPlayer.query
            .join(Tla3bnyCompetitionTeam,
                  Tla3bnyCompetitionPlayer.competition_team_id == Tla3bnyCompetitionTeam.id)
            .filter(
                Tla3bnyCompetitionTeam.competition_id == c.id,
                Tla3bnyCompetitionPlayer.status == "pending",
            ).count()
        )
        approved_in = (
            Tla3bnyCompetitionPlayer.query
            .join(Tla3bnyCompetitionTeam,
                  Tla3bnyCompetitionPlayer.competition_team_id == Tla3bnyCompetitionTeam.id)
            .filter(
                Tla3bnyCompetitionTeam.competition_id == c.id,
                Tla3bnyCompetitionPlayer.status == "approved",
            ).count()
        )
        per_comp.append({
            "id": c.id,
            "name": c.name,
            "name_en": c.name_en,
            "season_name": c.season.name_ar or c.season.name if c.season else None,
            "status": c.status,
            "teams": comp_teams,
            "total_matches": tot,
            "played_matches": done,
            "pending_players": pending_in,
            # For the priced player cap on the dashboard: approved players count
            # against max_players (null = no cap set).
            "approved_players": approved_in,
            "max_players": c.max_players,
        })

    return jsonify({
        "counts": {
            "seasons": Tla3bnySeason.query.count(),
            "competitions": Tla3bnyCompetition.query.count(),
            "age_categories": Tla3bnyAgeCategory.query.count(),
            "academies": Tla3bnyAcademy.query.count(),
            "teams": teams,
            "players": players,
            "coaches": Tla3bnyCoach.query.count(),
            "matches": total_matches,
            "goals": goals,
            "news": Tla3bnyNews.query.count(),
        },
        "matches": {
            "total": total_matches,
            "played": played,
            "remaining": total_matches - played,
        },
        "averages": {
            "goals_per_match": round(goals / played, 2) if played else 0,
            "players_per_team": round(players / teams, 1) if teams else 0,
        },
        "active_season": (active_season.name_ar or active_season.name) if active_season else None,
        "pending_approvals": pending_approvals,
        "competitions": per_comp,
    })
