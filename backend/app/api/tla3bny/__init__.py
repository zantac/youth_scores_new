from flask import Blueprint

tla3bny_bp = Blueprint("tla3bny", __name__, url_prefix="/api/tla3bny")

from . import auth, academies, teams, players, seasons, categories, competitions, matches, news, ads, stats, fixtures, audit  # noqa: E402, F401
