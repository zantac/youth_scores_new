import sqlalchemy as sa
from flask import jsonify, request

from app.extensions import db, limiter
from app.models import (
    Tla3bnyAcademy,
    Tla3bnyAcademyBranch,
    Tla3bnyAcademyManager,
    Tla3bnyCompetition,
    Tla3bnyCompetitionPlayer,
    Tla3bnyCompetitionTeam,
    Tla3bnyMatch,
    Tla3bnyPlayer,
    Tla3bnyPlayerTeam,
    Tla3bnyTeam,
    Tla3bnyUser,
)
from app.services import storage
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
    _safe_photo_path,
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

    # Team and player totals per academy, so the admin can spot an empty (likely
    # fake) account at a glance. Two grouped aggregates — not an N+1 per row.
    # Players are counted distinctly across the academy's current squads (an open
    # membership, end_date NULL); a player on two of its teams still counts once.
    team_counts = dict(
        db.session.query(Tla3bnyTeam.academy_id, sa.func.count(Tla3bnyTeam.id))
        .group_by(Tla3bnyTeam.academy_id)
        .all()
    )
    player_counts = dict(
        db.session.query(
            Tla3bnyTeam.academy_id,
            sa.func.count(sa.func.distinct(Tla3bnyPlayerTeam.player_id)),
        )
        .join(Tla3bnyPlayerTeam, Tla3bnyPlayerTeam.team_id == Tla3bnyTeam.id)
        .filter(Tla3bnyPlayerTeam.end_date.is_(None))
        .group_by(Tla3bnyTeam.academy_id)
        .all()
    )

    out = []
    for a in academies:
        data = a.to_dict(with_teams=True)
        data["team_count"] = team_counts.get(a.id, 0)
        data["player_count"] = player_counts.get(a.id, 0)
        out.append(data)
    return jsonify(out)


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
    return [p for p in (_safe_photo_path(x) for x in raw) if p][:3]


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
        photo_path=_safe_photo_path(data.get("photo_path")),
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
        m.photo_path = _safe_photo_path(data.get("photo_path"))
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


# ── delete the whole academy (super admin only) ───────────────────────────────
def _delete_academy_files(academy: Tla3bnyAcademy) -> None:
    """Best-effort removal of the academy's on-disk uploads before its rows go.
    Managers, teams and coaches are cascade-deleted with the academy, so their
    images are gathered here. Player photos and papers are left alone — players
    are durable master data and survive the academy."""
    paths = [academy.logo_path, *(academy.photos or [])]
    paths += [m.photo_path for m in academy.managers]
    for team in academy.teams:
        paths.append(team.photo_path)
        paths += [c.photo_path for c in team.coaches]
    for path in paths:
        if not path:
            continue
        try:
            storage.delete_file(path)
        except Exception:  # noqa: BLE001 - a stray file mustn't abort the delete
            pass


def _academy_has_played(team_ids: list[int]) -> bool:
    """True if any of these teams appears in a match. Match team FKs are RESTRICT
    (see delete_team), so such a team can't be removed without orphaning matches
    and the standings built from them — the club must be soft-closed instead."""
    if not team_ids:
        return False
    return Tla3bnyMatch.query.filter(
        sa.or_(
            Tla3bnyMatch.home_team_id.in_(team_ids),
            Tla3bnyMatch.away_team_id.in_(team_ids),
        )
    ).first() is not None


def _unfinished_entry(team_ids: list[int]):
    """An active entry in a competition that has not finished yet, if any — a
    club can't leave mid-competition without breaking the live table/fixtures."""
    if not team_ids:
        return None
    return (
        db.session.query(Tla3bnyCompetitionTeam.id)
        .join(Tla3bnyCompetition,
              Tla3bnyCompetitionTeam.competition_id == Tla3bnyCompetition.id)
        .filter(
            Tla3bnyCompetitionTeam.team_id.in_(team_ids),
            Tla3bnyCompetitionTeam.status == "active",
            Tla3bnyCompetition.status != "finished",
        )
        .first()
    )


def _hard_delete_academy(academy: Tla3bnyAcademy):
    """Permanently remove an academy and everything it owns — logins, teams,
    coaches, managers and branches all cascade away. Only safe for a club that
    has never played a match (the caller must have checked). Players themselves
    stay (durable master data); they only lose their membership in the gone
    teams — except a player that was ONLY on this academy's teams and was never
    entered in a competition, who would otherwise be left an unreachable,
    teamless profile and is removed with the academy."""
    team_ids = [t.id for t in academy.teams]
    team_id_set = set(team_ids)
    candidate_pids = {m.player_id for t in academy.teams for m in t.memberships}
    for pid in candidate_pids:
        p = Tla3bnyPlayer.query.get(pid)
        if p is None:
            continue
        on_other_team = any(m.team_id not in team_id_set for m in p.memberships)
        ever_entered = (
            db.session.query(Tla3bnyCompetitionPlayer.id)
            .filter_by(player_id=pid)
            .first()
            is not None
        )
        if not on_other_team and not ever_entered:
            db.session.delete(p)

    _delete_academy_files(academy)
    _log("academy_deleted", "academy", academy.id, {"academy_name": academy.name})
    db.session.delete(academy)
    db.session.commit()
    return jsonify({"message": "deleted"})


def _soft_close_academy(academy: Tla3bnyAcademy):
    """Close a club that has competition history. Its teams and match records
    must survive so everyone else's standings, scorers and honours stay intact,
    so this only deactivates the account: the academy is suspended (hidden from
    the browse list), every login is disabled, and its contact details, logo,
    gallery, managers and branches are scrubbed. The club name and its teams
    remain as read-only history."""
    academy.status = "suspended"
    academy.rejection_reason = "closed_by_owner"
    for user in Tla3bnyUser.query.filter_by(academy_id=academy.id).all():
        user.status = "suspended"
        user.token_version = (user.token_version or 0) + 1
    # Remove uploaded files (logo, gallery, manager/team/coach photos) first,
    # then drop the contact PII columns and the manager/branch rows.
    _delete_academy_files(academy)
    academy.logo_path = None
    academy.photos = None
    academy.phone = None
    academy.whatsapp_number = None
    academy.facebook_url = None
    academy.training_place = None
    academy.address = None
    academy.description = None
    for m in list(academy.managers):
        db.session.delete(m)
    for b in list(academy.branches):
        db.session.delete(b)
    _log("academy_closed_by_owner", "academy", academy.id, {"academy_name": academy.name})
    db.session.commit()
    return jsonify({"message": "closed"})


@tla3bny_bp.delete("/academies/<int:academy_id>")
@auth.super_admin_required
def delete_academy(academy_id: int):
    """Super-admin removal of an academy. Refuses (409) if any team has played —
    such a club can only be soft-closed to preserve the matches it took part in."""
    academy = Tla3bnyAcademy.query.get_or_404(academy_id)
    team_ids = [t.id for t in academy.teams]
    if _academy_has_played(team_ids):
        return _err(
            "لا يمكن حذف أكاديمية لها فرق شاركت في مباريات. "
            "أزل فرقها من البطولات أو علّق الحساب بدلًا من الحذف.",
            409,
        )
    return _hard_delete_academy(academy)


@tla3bny_bp.delete("/academies/me")
@auth.approved_academy_required
def delete_own_academy():
    """Self-service account closure for an academy owner.

    A club that has never played a match is deleted outright. A club with
    competition history is *closed* instead (see _soft_close_academy) so its
    matches and everyone else's standings survive. Either way it refuses while a
    team is still in an unfinished competition — withdraw the team or wait for
    it to end first, so live tables aren't broken. Requires an explicit
    ``{"confirm": true}`` body to guard against an accidental call."""
    academy = _target_academy()
    if academy is None:
        return _forbid()
    if not (request.get_json(silent=True) or {}).get("confirm"):
        return _err("confirmation required", 400)
    team_ids = [t.id for t in academy.teams]
    if _unfinished_entry(team_ids):
        return _err(
            "لا يمكن حذف الحساب وأحد فرقك مشارك في بطولة لم تنتهِ بعد — "
            "انسحب من البطولة أو انتظر انتهاءها ثم أعد المحاولة.",
            409,
        )
    if _academy_has_played(team_ids):
        return _soft_close_academy(academy)
    return _hard_delete_academy(academy)
