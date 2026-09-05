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

TOKEN_MAX_AGE = 60 * 60 * 24 * 30  # 30 days
_SALT = "tla3bny-auth-v1"

# One-off links that let a browser load a private registration document (birth
# certificates, national IDs, health certs) without attaching the login token —
# the signature *is* the authorisation, exactly like an S3 pre-signed URL. A
# separate salt keeps these tokens from being interchangeable with login tokens,
# and the short lifetime bounds the damage if a link ever leaks.
_FILE_SALT = "tla3bny-player-file-v1"
FILE_URL_MAX_AGE = 30 * 60  # 30 minutes


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=_SALT)


def _file_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=_FILE_SALT)


def sign_file_id(file_id: int) -> str:
    """A short-lived, tamper-proof token authorising a read of one player file."""
    return _file_serializer().dumps(file_id)


def verify_file_sig(sig: str, file_id: int) -> bool:
    """True when ``sig`` is a valid, unexpired token minted for exactly ``file_id``."""
    try:
        return int(_file_serializer().loads(sig, max_age=FILE_URL_MAX_AGE)) == file_id
    except (BadSignature, SignatureExpired, ValueError, TypeError):
        return False


def player_file_url(file_id: int) -> str:
    """A relative URL a browser can GET to view a private player file for ~30 min.

    Handed out only inside an authorised ``with_files=True`` serialization, so an
    unauthorised caller never receives a working link in the first place.
    """
    return f"/api/tla3bny/player-files/{file_id}?sig={sign_file_id(file_id)}"


def generate_token(user: Tla3bnyUser) -> str:
    return _serializer().dumps({"uid": user.id, "v": user.token_version})


def verify_token(token: str) -> Tla3bnyUser | None:
    try:
        data = _serializer().loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    user = db.session.get(Tla3bnyUser, data.get("uid"))
    if user is None:
        return None
    # Tokens issued before a suspension carry an older version and are rejected.
    # Legacy tokens without "v" get 0, which matches the column default, so
    # existing sessions survive this change without being logged out.
    if data.get("v", 0) != user.token_version:
        return None
    return user


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


def _competition_admin_row(user: Tla3bnyUser | None, competition_id: int):
    if not user or user.role != "competition_admin":
        return None
    return (
        db.session.query(Tla3bnyCompetitionAdmin)
        .filter_by(competition_id=competition_id, user_id=user.id)
        .first()
    )


def is_competition_owner(user: Tla3bnyUser | None, competition_id: int) -> bool:
    """A competition's super admin: the site super admin, or an organizer whose
    ``is_owner`` flag is set. Owners manage the organizer roster + permissions and
    are protected from removal by everyone but the site super admin."""
    if not user:
        return False
    if user.role == "super_admin":
        return True
    ca = _competition_admin_row(user, competition_id)
    return bool(ca and ca.is_owner)


def can_remove_punishment(user: Tla3bnyUser | None, competition_id: int) -> bool:
    """May this user REMOVE a punishment — the super admin, a competition owner, or
    an organizer whose ``can_remove_punishments`` flag is set. (Recording a
    punishment stays open to every organizer; only removal is gated.)"""
    if not user:
        return False
    if user.role == "super_admin":
        return True
    ca = _competition_admin_row(user, competition_id)
    return bool(ca and (ca.is_owner or ca.can_remove_punishments))


def can_chat(user: Tla3bnyUser | None, competition_id: int) -> bool:
    """May this organizer use the academy/team chat — the super admin, a competition
    owner, or an organizer whose ``can_chat`` flag is set."""
    if not user:
        return False
    if user.role == "super_admin":
        return True
    ca = _competition_admin_row(user, competition_id)
    return bool(ca and (ca.is_owner or ca.can_chat))


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
