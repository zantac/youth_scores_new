from flask import Blueprint, request

tla3bny_bp = Blueprint("tla3bny", __name__, url_prefix="/api/tla3bny")


@tla3bny_bp.after_request
def _tla3bny_cache(response):
    """Cache public reads; never cache authenticated responses.

    This blueprint serves both the public site (matches, standings, news) and
    authenticated admin/coach actions. A response tied to a token is
    user-specific, so it is marked no-store; anonymous successful GETs get a
    short shared-cache window (live scores stay near-fresh) that lets a CDN or
    the browser answer repeat requests without hitting Railway compute.
    """
    if request.headers.get("Authorization"):
        response.headers.setdefault("Cache-Control", "private, no-store")
    elif request.method == "GET" and response.status_code == 200:
        response.headers.setdefault(
            "Cache-Control", "public, max-age=30, stale-while-revalidate=120"
        )
    return response


from . import auth, academies, teams, players, seasons, categories, competitions, matches, news, ads, stats, fixtures, audit, search, awards  # noqa: E402, F401
