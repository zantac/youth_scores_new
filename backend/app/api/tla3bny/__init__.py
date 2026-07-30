from flask import Blueprint

tla3bny_bp = Blueprint("tla3bny", __name__, url_prefix="/api/tla3bny")

from . import auth, academies, teams, players, seasons, categories, competitions, matches, news, stats, fixtures  # noqa: E402, F401
