from flask import jsonify, request

from app.extensions import db, limiter
from app.models import (
    Tla3bnyAcademy,
    Tla3bnyAcademyBranch,
    Tla3bnyAcademyManager,
    Tla3bnyUser,
)
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from .audit import _log
from ._helpers import (
    _credentials,
    _claim_login,
    _clean_url,
    _clip,
    _err,
    _forbid,
    _int,
    _validate_password,
    save_upload,
    _read_payload,
)


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
    suspending = status in ("suspended", "rejected")
    for user in Tla3bnyUser.query.filter_by(academy_id=academy.id).all():
        user.status = "suspended" if suspending else "active"
        if suspending:
            user.token_version = (user.token_version or 0) + 1
    action = "academy_suspended" if status in ("suspended", "rejected") else "academy_approved"
    _log(action, "academy", academy.id, {
        "academy_name": academy.name,
        "reason": reason,
    })
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
@limiter.limit("20 per hour")
@auth.super_admin_required
def set_academy_account(academy_id: int):
    """Create or reset the academy owner's login. Registration hands the owner
    their own username, so this is the super admin's recovery path."""
    academy = Tla3bnyAcademy.query.get_or_404(academy_id)
    data = request.get_json(silent=True) or {}
    username, password = _credentials(data)
    if not username or not password:
        return _err("username and password are required")
    pw_err = _validate_password(password)
    if pw_err:
        return _err(pw_err)

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
    for field in ("name", "name_en", "phone", "whatsapp_number", "facebook_url",
                  "training_place", "address", "description"):
        if field in data:
            if field == "facebook_url":
                value = _clean_url(data.get(field))
            elif field in ("phone", "whatsapp_number"):
                value = _clip(data.get(field), 50)
            else:
                value = _clip(data.get(field), 20000 if field == "description" else 255)
            setattr(academy, field, value)
    if not academy.name:
        return _err("name is required")
    logo = files.get("logo") if files is not None else None
    if logo is not None:
        try:
            academy.logo_path = save_upload(logo, kind="image")
        except ValueError as e:
            return _err(str(e))
    # Gallery photos — up to 3 paths already uploaded via /uploads/image. Sending
    # the field (even empty) replaces the set; an empty list clears it.
    photos = _photos_field(data)
    if photos is not None:
        academy.photos = photos or None
    db.session.commit()
    return jsonify(academy.to_dict())


def _photos_field(data):
    """Read up to 3 gallery photo paths from a JSON or multipart body, or None
    when the field was not sent at all (so it isn't touched)."""
    if hasattr(data, "getlist"):
        if "photos" not in data:
            return None
        raw = data.getlist("photos")
    else:
        if "photos" not in data:
            return None
        raw = data.get("photos") or []
        if not isinstance(raw, list):
            raw = [raw]
    return [str(p).strip() for p in raw if str(p).strip()][:3]


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
        photo_path=(data.get("photo_path") or "").strip() or None,
        sort_order=_int(data.get("sort_order"), 0),
    )
    db.session.add(m)
    db.session.commit()
    return jsonify(m.to_dict()), 201


@tla3bny_bp.put("/academies/<int:academy_id>/managers/<int:manager_id>")
@auth.login_required
def update_manager(academy_id: int, manager_id: int):
    if _resolve_academy_for_write(academy_id) is None:
        return _forbid()
    m = Tla3bnyAcademyManager.query.filter_by(id=manager_id, academy_id=academy_id).first_or_404()
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return _err("name is required")
        m.name = name
    if "role" in data:
        m.role = (data.get("role") or "").strip() or None
    if "phone" in data:
        m.phone = (data.get("phone") or "").strip() or None
    if "photo_path" in data:
        m.photo_path = (data.get("photo_path") or "").strip() or None
    if "sort_order" in data:
        m.sort_order = _int(data.get("sort_order"), m.sort_order)
    db.session.commit()
    return jsonify(m.to_dict())


@tla3bny_bp.delete("/academies/<int:academy_id>/managers/<int:manager_id>")
@auth.login_required
def delete_manager(academy_id: int, manager_id: int):
    if _resolve_academy_for_write(academy_id) is None:
        return _forbid()
    m = Tla3bnyAcademyManager.query.filter_by(id=manager_id, academy_id=academy_id).first_or_404()
    db.session.delete(m)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ── academy branches (locations) ──────────────────────────────────────────────
@tla3bny_bp.post("/academies/<int:academy_id>/branches")
@auth.login_required
def add_branch(academy_id: int):
    academy = _resolve_academy_for_write(academy_id)
    if academy is None:
        return _forbid()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return _err("name is required")
    b = Tla3bnyAcademyBranch(
        academy_id=academy.id,
        name=_clip(name, 255),
        governorate=_clip(data.get("governorate"), 60),
        address=_clip(data.get("address"), 512),
        location_url=_clean_url(data.get("location_url")),
        phone=_clip(data.get("phone"), 50),
        sort_order=_int(data.get("sort_order"), 0),
    )
    db.session.add(b)
    db.session.commit()
    return jsonify(b.to_dict()), 201


@tla3bny_bp.put("/academies/<int:academy_id>/branches/<int:branch_id>")
@auth.login_required
def update_branch(academy_id: int, branch_id: int):
    if _resolve_academy_for_write(academy_id) is None:
        return _forbid()
    b = Tla3bnyAcademyBranch.query.filter_by(id=branch_id, academy_id=academy_id).first_or_404()
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return _err("name is required")
        b.name = _clip(name, 255)
    if "governorate" in data:
        b.governorate = _clip(data.get("governorate"), 60)
    if "address" in data:
        b.address = _clip(data.get("address"), 512)
    if "location_url" in data:
        b.location_url = _clean_url(data.get("location_url"))
    if "phone" in data:
        b.phone = _clip(data.get("phone"), 50)
    if "sort_order" in data:
        b.sort_order = _int(data.get("sort_order"), b.sort_order)
    db.session.commit()
    return jsonify(b.to_dict())


@tla3bny_bp.delete("/academies/<int:academy_id>/branches/<int:branch_id>")
@auth.login_required
def delete_branch(academy_id: int, branch_id: int):
    if _resolve_academy_for_write(academy_id) is None:
        return _forbid()
    b = Tla3bnyAcademyBranch.query.filter_by(id=branch_id, academy_id=academy_id).first_or_404()
    db.session.delete(b)
    db.session.commit()
    return jsonify({"message": "deleted"})
