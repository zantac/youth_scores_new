from datetime import date

from flask import Blueprint, current_app, jsonify, request

from app.api import serializers

api_bp = Blueprint("api", __name__)


@api_bp.after_request
def _public_cache(response):
    """Let browsers and any CDN in front of Railway cache the public read feed.

    Everything under this blueprint is public, unauthenticated read data (the
    config/data feed, matches, clubs, teams, players). A short max-age with a
    longer stale-while-revalidate means repeat visits and CDN hits are served
    without re-running the queries, while updates still appear within a minute.
    Only successful GETs are cached; writes never reach this blueprint.
    """
    if request.method == "GET" and response.status_code == 200:
        response.headers.setdefault(
            "Cache-Control", "public, max-age=60, stale-while-revalidate=300"
        )
    return response


def _base_url() -> str:
    # Absolute URLs are embedded in the config so the clients can fetch each
    # competition directly. Honour a configured base (behind a proxy / real
    # domain) and fall back to however this request arrived.
    return (current_app.config.get("API_BASE_URL") or request.host_url).rstrip("/")


@api_bp.get("/api/config")
def config():
    # Mirrors the old two-step feed: a pointer to the data blob.
    return jsonify({"latestDataUrl": f"{_base_url()}/api/data"})


@api_bp.get("/api/data")
def data():
    return jsonify(serializers.config_blob(_base_url()))


def _parse_date(value: str | None):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


@api_bp.get("/api/matches")
def matches():
    # Every match across all competitions, grouped client-side by date then
    # competition. Optional ?from=&to=YYYY-MM-DD, ?limit=, ?order=asc|desc.
    order = request.args.get("order", "desc")
    if order not in ("asc", "desc"):
        order = "desc"
    return jsonify(
        serializers.all_matches(
            _base_url(),
            date_from=_parse_date(request.args.get("from")),
            date_to=_parse_date(request.args.get("to")),
            limit=request.args.get("limit", type=int),
            order=order,
        )
    )


@api_bp.get("/api/matches/<int:match_id>")
def match_detail(match_id: int):
    from app.models import Match

    m = Match.query.get(match_id)
    if m is None or m.deleted_at is not None:
        return jsonify({"error": "not found"}), 404
    return jsonify(serializers.match_full(m))


@api_bp.get("/api/players/<int:player_id>")
def player_detail(player_id: int):
    from app.models import Player

    p = Player.query.get(player_id)
    if p is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(serializers.player_full(p))


@api_bp.get("/api/coaches/<int:coach_id>")
def coach_detail(coach_id: int):
    from app.models import Coach

    c = Coach.query.get(coach_id)
    if c is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(serializers.coach_full(c))


@api_bp.get("/api/clubs")
def clubs_index():
    return jsonify(serializers.clubs_index())


@api_bp.get("/api/teams/<int:team_id>")
def team_detail(team_id: int):
    from app.models import Team

    t = Team.query.get(team_id)
    if t is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(serializers.team_public(t))


@api_bp.get("/api/clubs/<int:club_id>")
def club_detail(club_id: int):
    from app.models import Club

    c = Club.query.get(club_id)
    if c is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(serializers.club_public(c))


@api_bp.get("/api/competitions/<int:competition_id>/data")
def competition_data(competition_id: int):
    payload = serializers.competition_data(competition_id)
    if payload is None:
        return jsonify({"error": "competition not found"}), 404
    return jsonify(payload)
