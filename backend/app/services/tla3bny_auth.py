"""tla3bny authentication — the subdomain's own login.

Kept deliberately separate from the youthscores admin auth (`services.auth`):
the subdomain (tla3bny.youthscores.org) uses *this* login, while the main site
keeps its own. Both happen to use the same signed-token mechanism (itsdangerous
+ SECRET_KEY), so no extra dependency is needed, but the tokens carry a
different salt and resolve against the `tla3bny_users` table — a youthscores
admin token is not valid here, and vice versa.

One accounts table serves four roles (see ``codes.TLA3BNY_USER_ROLE``):
``super_admin`` runs everything; ``competition_admin`` is assigned to specific
competitions; ``academy`` and ``team`` are the self-service logins that own an
academy / a single team. The helpers below express the authorisation rules the
API relies on.

Academy registration is open — an academy is live the moment it signs up, so
these checks only ever turn one away when the super admin has *suspended* it.
The one thing that is still vetted is a player entered into a competition, and
that is the competition admin's call (see the roster-approval routes).
"""

from __future__ import annotations

from functools import wraps

from flask import current_app, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.extensions import db
from app.models import Tla3bnyCompetitionAdmin, Tla3bnyTeam, Tla3bnyUser

TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # 7 days
_SALT = "tla3bny-auth-v1"


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=_SALT)


def generate_token(user: Tla3bnyUser) -> str:
    return _serializer().dumps({"uid": user.id})


def verify_token(token: str) -> Tla3bnyUser | None:
    try:
        data = _serializer().loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    return db.session.get(Tla3bnyUser, data.get("uid"))


def _bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip() or None
    return None


def current_user() -> Tla3bnyUser | None:
    """The signed-in tla3bny account for this request, or None. Cached on g."""
    if "tla3bny_user" in g:
        return g.tla3bny_user
    token = _bearer_token()
    g.tla3bny_user = verify_token(token) if token else None
    return g.tla3bny_user


# ── decorators ──────────────────────────────────────────────────────────────
def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return jsonify({"error": "unauthorized"}), 401
        return fn(*args, **kwargs)

    return wrapper


def role_required(*roles: str):
    """Require a signed-in tla3bny account whose role is in `roles`."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify({"error": "unauthorized"}), 401
            if user.role not in roles:
                return jsonify({"error": "Insufficient permissions"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def super_admin_required(fn):
    return role_required("super_admin")(fn)


def _is_suspended(academy) -> bool:
    return bool(academy) and academy.status in ("suspended", "rejected")


def approved_academy_required(fn):
    """Require an academy account that has not been suspended."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        if user.role != "academy" or not user.academy:
            return jsonify({"error": "Academy account required"}), 403
        if _is_suspended(user.academy):
            return jsonify({"error": "This account is suspended"}), 403
        return fn(*args, **kwargs)

    return wrapper


# ── authorisation helpers ───────────────────────────────────────────────────
def is_competition_admin(user: Tla3bnyUser | None, competition_id: int) -> bool:
    """The super admin, or a competition_admin assigned to this competition."""
    if not user:
        return False
    if user.role == "super_admin":
        return True
    if user.role == "competition_admin":
        return (
            db.session.query(Tla3bnyCompetitionAdmin.id)
            .filter_by(competition_id=competition_id, user_id=user.id)
            .first()
            is not None
        )
    return False


def can_manage_academy(user: Tla3bnyUser | None, academy_id: int) -> bool:
    """The super admin, or the academy's own login (unless suspended)."""
    if not user:
        return False
    if user.role == "super_admin":
        return True
    if user.role == "academy" and user.academy_id == academy_id:
        return not _is_suspended(user.academy)
    return False


def can_manage_team(user: Tla3bnyUser | None, team_id: int) -> bool:
    """The super admin, the owning academy's login, or the team's own login."""
    if not user:
        return False
    if user.role == "super_admin":
        return True
    if user.role == "team":
        return user.team_id == team_id
    if user.role == "academy":
        team = db.session.get(Tla3bnyTeam, team_id)
        return bool(
            team
            and team.academy_id == user.academy_id
            and not _is_suspended(user.academy)
        )
    return False
