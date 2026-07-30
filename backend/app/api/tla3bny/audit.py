"""Audit log for the tla3bny subdomain.

Every significant admin action is recorded via _log() — called inside the
same db.session as the action itself, so the entry is committed atomically
or rolled back with it.

Read endpoint:
    GET /api/tla3bny/audit
        ?competition_id=   filter to one competition (required for comp admins)
        ?target_type=      e.g. "player", "competition_team"
        ?target_id=        integer — combined with target_type
        ?action=           e.g. "player_approved"
        ?limit=50          max 200
        ?offset=0
"""

from flask import jsonify, request
from sqlalchemy.orm import selectinload

from app.extensions import db
from app.models import Tla3bnyAuditLog
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import _err, _forbid, _int


# ── write helper (called by other modules) ────────────────────────────────────

def _log(
    action: str,
    target_type: str,
    target_id: int | None = None,
    detail: dict | None = None,
    competition_id: int | None = None,
) -> None:
    """Append one audit entry to the current db session.

    The caller is responsible for committing — the entry is persisted
    atomically with the action that triggered it.
    """
    user = auth.current_user()
    db.session.add(Tla3bnyAuditLog(
        actor_user_id=user.id if user else None,
        action=action,
        target_type=target_type,
        target_id=target_id,
        competition_id=competition_id,
        detail=detail,
    ))


# ── read endpoint ─────────────────────────────────────────────────────────────

@tla3bny_bp.get("/audit")
@auth.login_required
def list_audit_log():
    """Return recent audit entries visible to the caller.

    Super admins see everything.  Competition admins must pass competition_id
    and may only see entries for their competitions.
    """
    user = auth.current_user()
    comp_id = request.args.get("competition_id", type=int)

    if user.role != "super_admin":
        if not comp_id:
            return _err("competition_id is required", 400)
        if not auth.is_competition_admin(user, comp_id):
            return _forbid()

    q = Tla3bnyAuditLog.query.options(
        selectinload(Tla3bnyAuditLog.actor)
    )

    if comp_id:
        q = q.filter(Tla3bnyAuditLog.competition_id == comp_id)

    target_type = request.args.get("target_type")
    target_id = request.args.get("target_id", type=int)
    if target_type:
        q = q.filter(Tla3bnyAuditLog.target_type == target_type)
    if target_id is not None:
        q = q.filter(Tla3bnyAuditLog.target_id == target_id)

    action = request.args.get("action")
    if action:
        q = q.filter(Tla3bnyAuditLog.action == action)

    limit = min(_int(request.args.get("limit"), 50), 200)
    offset = _int(request.args.get("offset"), 0)

    entries = (
        q.order_by(Tla3bnyAuditLog.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return jsonify([e.to_dict() for e in entries])
