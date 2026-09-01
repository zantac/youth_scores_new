from datetime import date

from flask import Blueprint, current_app, jsonify, request

from app.api import serializers
from app.services import cache
from app.extensions import limiter

api_bp = Blueprint("api", __name__)


def _fresh_requested() -> bool:
    """True when the client asked to bypass caches (an admin's live refresh sends
    fetch(cache:'no-store')). Server-side cache must honour it or an edit wouldn't
    appear on a deliberate refresh."""
    cc = request.cache_control
    return bool(cc.no_cache or cc.no_store)


# Live feeds — match scores/statuses and the per-competition data blob — carry a
# much shorter TTL so an edit during a live round reaches clients within seconds.
_LIVE_PATH_PREFIXES = ("/api/matches", "/api/competitions")
# The config feed (news + venues + season/competition list) is edited from admin
# and should surface promptly too, just not as aggressively as live scores.
_FEED_PATHS = ("/api/config", "/api/data")


@api_bp.after_request
def _public_cache(response):
    """Let browsers and any CDN in front of Railway cache the public read feed.

    Everything under this blueprint is public, unauthenticated read data (the
    config/data feed, matches, clubs, teams, players). A short max-age with a
    longer stale-while-revalidate means repeat visits and CDN hits are served
    without re-running the queries, while updates still appear promptly. Only
    successful GETs are cached; writes never reach this blueprint.
    """
    if request.method == "GET" and response.status_code == 200:
        if request.path.startswith(_LIVE_PATH_PREFIXES):
            cache = "public, max-age=15, stale-while-revalidate=30"
        elif request.path in _FEED_PATHS:
            cache = "public, max-age=20, stale-while-revalidate=60"
        else:
            cache = "public, max-age=60, stale-while-revalidate=300"
        response.headers.setdefault("Cache-Control", cache)
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
    base = _base_url()
    build = lambda: serializers.config_blob(base)  # noqa: E731
    # 20s TTL == the endpoint's HTTP max-age, so no extra staleness; bypassed on a
    # no-store refresh. Keyed by base so a proxy/host variant can't cross-serve.
    if _fresh_requested():
        return jsonify(build())
    return jsonify(cache.get_or_compute(f"data:{base}", 20, build))


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
    # Always bound the feed so a no-arg call can't stream every match ever.
    raw_limit = request.args.get("limit", type=int)
    limit = min(raw_limit, 2000) if raw_limit and raw_limit > 0 else 1000
    return jsonify(
        serializers.all_matches(
            _base_url(),
            date_from=_parse_date(request.args.get("from")),
            date_to=_parse_date(request.args.get("to")),
            limit=limit,
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


@api_bp.get("/api/search")
@limiter.limit("60 per minute")
def search():
    # Free-text search across clubs, players and coaches. Needs at least two
    # characters so a single keystroke doesn't scan the whole name tables.
    # Rate-limited: the ILIKE '%q%' scan can't use an index, so it's a cheap
    # DoS lever without a per-IP cap.
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify({"clubs": [], "players": [], "coaches": []})
    return jsonify(serializers.search_all(q))


@api_bp.get("/api/teams/<int:team_id>")
def team_detail(team_id: int):
    from app.models import Team

    t = Team.query.get(team_id)
    if t is None:
        return jsonify({"error": "not found"}), 404
    season_id = request.args.get("season_id", type=int)
    return jsonify(serializers.team_public(t, season_id=season_id))


@api_bp.get("/api/clubs/<int:club_id>")
def club_detail(club_id: int):
    from app.models import Club

    c = Club.query.get(club_id)
    if c is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(serializers.club_public(c))


@api_bp.get("/api/competitions/<int:competition_id>/data")
def competition_data(competition_id: int):
    build = lambda: serializers.competition_data(competition_id)  # noqa: E731
    # 15s TTL == the endpoint's HTTP max-age; bypassed on a no-store live refresh.
    # None (not found) is not cached, so a newly-created competition appears at once.
    if _fresh_requested():
        payload = build()
    else:
        payload = cache.get_or_compute(f"comp:{competition_id}", 15, build)
        if payload is None:
            payload = build()
    if payload is None:
        return jsonify({"error": "competition not found"}), 404
    return jsonify(payload)
