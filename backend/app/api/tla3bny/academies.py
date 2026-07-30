from flask import jsonify, request

from app.extensions import db
from app.models import Tla3bnyAcademy, Tla3bnyAcademyManager, Tla3bnyUser
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import _credentials, _claim_login, _err, _forbid, _int, save_upload, _read_payload


@tla3bny_bp.get("/academies")
def list_academies():
    """Every academy that is not suspended — registration is open, so a new one
    is listed as soon as it signs up."""
    limit = min(request.args.get("limit", type=int) or 200, 200)
    offset = request.args.get("offset", type=int) or 0
    academies = (
        Tla3bnyAcademy.query.filter(
            Tla3bnyAcademy.status.notin_(("suspended", "rejected"))
        )
        .order_by(Tla3bnyAcademy.name.asc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return jsonify([a.to_dict(public=True) for a in academies])


@tla3bny_bp.get("/academies/manage")
@auth.super_admin_required
def manage_academies():
    status = request.args.get("status")
    q = Tla3bnyAcademy.query
    if status:
        q = q.filter_by(status=status)
    academies = q.order_by(Tla3bnyAcademy.created_at.desc()).all()
    return jsonify([a.to_dict(with_teams=True) for a in academies])


@tla3bny_bp.get("/academies/<int:academy_id>")
def get_academy(academy_id: int):
    academy = Tla3bnyAcademy.query.get_or_404(academy_id)
    return jsonify(academy.to_dict(public=True, with_teams=True))


def _set_academy_status(academy_id: int, status: str, reason: str | None = None):
    """Flip an academy on or off, and its logins with it — a suspended academy
    must not be able to keep entering teams."""
    academy = Tla3bnyAcademy.query.get_or_404(academy_id)
    academy.status = status
    academy.rejection_reason = reason
    for user in Tla3bnyUser.query.filter_by(academy_id=academy.id).all():
        user.status = "suspended" if status in ("suspended", "rejected") else "active"
    db.session.commit()
    return jsonify(academy.to_dict())


@tla3bny_bp.post("/academies/<int:academy_id>/approve")
@auth.super_admin_required
def approve_academy(academy_id: int):
    """Restore a suspended academy. (Nothing waits for approval any more; this
    is kept as the un-suspend action.)"""
    return _set_academy_status(academy_id, "approved")


@tla3bny_bp.post("/academies/<int:academy_id>/suspend")
@auth.super_admin_required
def suspend_academy(academy_id: int):
    reason = (request.get_json(silent=True) or {}).get("reason") or None
    return _set_academy_status(academy_id, "suspended", reason)


@tla3bny_bp.post("/academies/<int:academy_id>/account")
@auth.super_admin_required
def set_academy_account(academy_id: int):
    """Create or reset the academy owner's login. Registration hands the owner
    their own username, so this is the super admin's recovery path."""
    academy = Tla3bnyAcademy.query.get_or_404(academy_id)
    data = request.get_json(silent=True) or {}
    username, password = _credentials(data)
    if not username or not password:
        return _err("username and password are required")

    account = Tla3bnyUser.query.filter_by(role="academy", academy_id=academy.id).first()
    taken = _claim_login(username, None, exclude_id=account.id if account else None)
    if taken:
        return taken
    if account is None:
        account = Tla3bnyUser(role="academy", status="active", academy_id=academy.id)
        db.session.add(account)
    account.username = username
    if "@" in username:
        account.email = username
    account.set_password(password)
    db.session.commit()
    return jsonify({"message": "saved", "username": username, "academy_id": academy.id})


def _target_academy():
    """The academy an academy-login owns, or 404-ish None for others."""
    user = auth.current_user()
    if user and user.role == "academy" and user.academy:
        return user.academy
    return None


@tla3bny_bp.put("/academies/me")
@auth.approved_academy_required
def update_own_academy():
    academy = _target_academy()
    data, files = _read_payload()
    for field in ("name", "phone", "facebook_url", "training_place", "address", "description"):
        if field in data:
            val = (data.get(field) or "").strip()
            setattr(academy, field, val or None)
    if not academy.name:
        return _err("name is required")
    logo = files.get("logo") if files is not None else None
    if logo is not None:
        try:
            academy.logo_path = save_upload(logo, kind="image")
        except ValueError as e:
            return _err(str(e))
    db.session.commit()
    return jsonify(academy.to_dict())


# ── academy managers ─────────────────────────────────────────────────────────
def _resolve_academy_for_write(academy_id: int) -> Tla3bnyAcademy | None:
    user = auth.current_user()
    if auth.can_manage_academy(user, academy_id):
        return Tla3bnyAcademy.query.get(academy_id)
    return None


@tla3bny_bp.post("/academies/<int:academy_id>/managers")
@auth.login_required
def add_manager(academy_id: int):
    academy = _resolve_academy_for_write(academy_id)
    if academy is None:
        return _forbid()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return _err("name is required")
    m = Tla3bnyAcademyManager(
        academy_id=academy.id,
        name=name,
        role=(data.get("role") or "").strip() or None,
        phone=(data.get("phone") or "").strip() or None,
        sort_order=_int(data.get("sort_order"), 0),
    )
    db.session.add(m)
    db.session.commit()
    return jsonify(m.to_dict()), 201


@tla3bny_bp.delete("/academies/<int:academy_id>/managers/<int:manager_id>")
@auth.login_required
def delete_manager(academy_id: int, manager_id: int):
    if _resolve_academy_for_write(academy_id) is None:
        return _forbid()
    m = Tla3bnyAcademyManager.query.filter_by(id=manager_id, academy_id=academy_id).first_or_404()
    db.session.delete(m)
    db.session.commit()
    return jsonify({"message": "deleted"})
