"""Admin authentication — signed bearer tokens, no server-side sessions.

The public API is read-only and token-free. Write actions (data entry, managing
admins) require a token obtained from POST /api/auth/login. Tokens are signed
with SECRET_KEY via itsdangerous (already a Flask dependency), so nothing is
stored server-side and they expire on their own.
"""

from __future__ import annotations

from functools import wraps

from flask import current_app, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.extensions import db
from app.models import AdminUser

TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # 7 days
_SALT = "admin-auth-v1"

# superadmin > editor > clerk. Data entry needs clerk; managing admins needs
# superadmin.
ROLE_RANK = {"clerk": 1, "editor": 2, "superadmin": 3}


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=_SALT)


def generate_token(user: AdminUser) -> str:
    return _serializer().dumps(
        {"uid": user.id, "role": user.role, "v": user.token_version}
    )


def verify_token(token: str) -> AdminUser | None:
    try:
        data = _serializer().loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    user = db.session.get(AdminUser, data.get("uid"))
    if user is None or not user.is_active:
        return None
    # A token issued before a password change carries an older version and is
    # rejected. Legacy tokens without "v" get 0, matching the column default, so
    # sessions that predate this change survive until their own password reset.
    if data.get("v", 0) != (user.token_version or 0):
        return None
    return user


def _bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip() or None
    return None


def _has_master_key() -> bool:
    """The ADMIN_API_KEY acts as a superadmin master key for automation/seeding."""
    key = current_app.config.get("ADMIN_API_KEY")
    return bool(key) and request.headers.get("X-Admin-Key") == key


def has_master_key() -> bool:
    """Public form of _has_master_key, for callers that must exempt automation.

    A destructive endpoint may ask a human to re-enter their password; a script
    authenticating with the master key has none to give.
    """
    return _has_master_key()


def current_admin() -> AdminUser | None:
    """The signed-in admin for this request, or None. Cached on g."""
    if "admin" in g:
        return g.admin
    token = _bearer_token()
    g.admin = verify_token(token) if token else None
    return g.admin


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_admin() and not _has_master_key():
            return jsonify({"error": "unauthorized"}), 401
        return fn(*args, **kwargs)

    return wrapper


def role_required(min_role: str):
    """Require a signed-in admin of at least `min_role` (or the master key)."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if _has_master_key():
                return fn(*args, **kwargs)
            user = current_admin()
            if not user:
                return jsonify({"error": "unauthorized"}), 401
            if ROLE_RANK.get(user.role, 0) < ROLE_RANK.get(min_role, 99):
                return jsonify({"error": "forbidden", "need_role": min_role}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def public_user(user: AdminUser) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }
