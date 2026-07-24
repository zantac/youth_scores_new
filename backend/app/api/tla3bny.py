"""tla3bny API — served under /api/tla3bny, for the tla3bny.youthscores.org
subdomain (youth-academy friendly competitions, ages ~6-13).

All reads are public; writes require the tla3bny login (`services.tla3bny_auth`),
which is independent of the youthscores admin auth. Authorisation follows the
roles in ``codes.TLA3BNY_USER_ROLE``: the super admin runs seasons/ages and
creates competitions; each competition's admins run their competition (teams,
approvals, stages, matches, news); academies and team (coach) logins manage
their own master data.
"""

from __future__ import annotations

import os
import uuid
from collections import defaultdict
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models import (
    Tla3bnyAcademy,
    Tla3bnyAcademyManager,
    Tla3bnyAgeCategory,
    Tla3bnyCoach,
    Tla3bnyCompetition,
    Tla3bnyCompetitionAdmin,
    Tla3bnyCompetitionAge,
    Tla3bnyCompetitionPlayer,
    Tla3bnyCompetitionTeam,
    Tla3bnyGroup,
    Tla3bnyGroupTeam,
    Tla3bnyLineup,
    Tla3bnyLineupSlot,
    Tla3bnyMatch,
    Tla3bnyMatchEvent,
    Tla3bnyNews,
    Tla3bnyPlayer,
    Tla3bnyPlayerFile,
    Tla3bnyPlayerTeam,
    Tla3bnySeason,
    Tla3bnyStage,
    Tla3bnyTeam,
    Tla3bnyUser,
)
from app.services import tla3bny_auth as auth
from app.services import tla3bny_tables as tables

tla3bny_bp = Blueprint("tla3bny", __name__, url_prefix="/api/tla3bny")


# ── helpers ─────────────────────────────────────────────────────────────────
def _allowed(filename: str, allowed_set: set[str]) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_set


def save_upload(file_storage, kind: str = "image") -> str | None:
    """Save an uploaded file and return its relative path (``uploads/<name>``).

    kind: "image", "pdf" or "document" (image or pdf). None if no file. Raises
    ValueError on a disallowed extension.
    """
    if file_storage is None or file_storage.filename == "":
        return None

    images = current_app.config["ALLOWED_IMAGE_EXTENSIONS"]
    pdfs = current_app.config["ALLOWED_PDF_EXTENSIONS"]
    if kind == "pdf":
        allowed = pdfs
    elif kind == "document":
        allowed = pdfs | images
    else:
        allowed = images

    if not _allowed(file_storage.filename, allowed):
        raise ValueError(f"File type not allowed for {file_storage.filename}")

    ext = file_storage.filename.rsplit(".", 1)[1].lower()
    safe = secure_filename(f"{uuid.uuid4().hex}.{ext}")
    folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(folder, exist_ok=True)
    file_storage.save(os.path.join(folder, safe))
    return f"uploads/{safe}"


def _read_payload():
    """Return (data, files) handling both multipart and JSON bodies."""
    if request.content_type and "multipart/form-data" in request.content_type:
        return request.form, request.files
    return (request.get_json(silent=True) or {}), None


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _int(value, default=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _err(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


def _forbid():
    return jsonify({"error": "Insufficient permissions"}), 403


# ── auth ────────────────────────────────────────────────────────────────────
@tla3bny_bp.post("/auth/register")
def register():
    """Register a new academy (multipart for a logo, or JSON). Creates the
    academy (pending) and its academy login."""
    data, files = _read_payload()
    logo = files.get("logo") if files is not None else None

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not name or not email or not password:
        return _err("name, email and password are required")
    if Tla3bnyUser.query.filter_by(email=email).first():
        return _err("Email already registered", 409)

    logo_path = None
    if logo is not None:
        try:
            logo_path = save_upload(logo, kind="image")
        except ValueError as e:
            return _err(str(e))

    academy = Tla3bnyAcademy(
        name=name,
        logo_path=logo_path,
        phone=(data.get("phone") or "").strip() or None,
        facebook_url=(data.get("facebook_url") or "").strip() or None,
        training_place=(data.get("training_place") or "").strip() or None,
        address=(data.get("address") or "").strip() or None,
        description=(data.get("description") or "").strip() or None,
        status="pending",
    )
    db.session.add(academy)
    db.session.flush()

    user = Tla3bnyUser(email=email, role="academy", status="active", academy_id=academy.id)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return (
        jsonify(
            {
                "message": "Registration submitted. Awaiting admin approval.",
                "token": auth.generate_token(user),
                "user": user.to_dict(),
            }
        ),
        201,
    )


@tla3bny_bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = Tla3bnyUser.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return _err("Invalid email or password", 401)
    return jsonify({"token": auth.generate_token(user), "user": user.to_dict()})


@tla3bny_bp.get("/auth/me")
@auth.login_required
def me():
    user = auth.current_user()
    data = {"user": user.to_dict()}
    if user.role == "academy" and user.academy:
        data["academy"] = user.academy.to_dict(with_teams=True)
    if user.role == "team" and user.team:
        data["team"] = user.team.to_dict(with_roster=True)
    if user.role == "competition_admin":
        data["competitions"] = [
            ca.competition.to_dict()
            for ca in Tla3bnyCompetitionAdmin.query.filter_by(user_id=user.id).all()
            if ca.competition
        ]
    return jsonify(data)


# ── academies ───────────────────────────────────────────────────────────────
@tla3bny_bp.get("/academies")
def list_academies():
    academies = (
        Tla3bnyAcademy.query.filter_by(status="approved")
        .order_by(Tla3bnyAcademy.name.asc())
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
    academy = Tla3bnyAcademy.query.get_or_404(academy_id)
    academy.status = status
    academy.rejection_reason = reason
    db.session.commit()
    return jsonify(academy.to_dict())


@tla3bny_bp.post("/academies/<int:academy_id>/approve")
@auth.super_admin_required
def approve_academy(academy_id: int):
    return _set_academy_status(academy_id, "approved")


@tla3bny_bp.post("/academies/<int:academy_id>/reject")
@auth.super_admin_required
def reject_academy(academy_id: int):
    reason = (request.get_json(silent=True) or {}).get("reason") or None
    return _set_academy_status(academy_id, "rejected", reason)


@tla3bny_bp.post("/academies/<int:academy_id>/suspend")
@auth.super_admin_required
def suspend_academy(academy_id: int):
    return _set_academy_status(academy_id, "pending")


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


# ── teams ────────────────────────────────────────────────────────────────────
@tla3bny_bp.get("/academies/<int:academy_id>/teams")
def list_academy_teams(academy_id: int):
    teams = Tla3bnyTeam.query.filter_by(academy_id=academy_id).all()
    return jsonify([t.to_dict() for t in teams])


@tla3bny_bp.get("/teams/<int:team_id>")
def get_team(team_id: int):
    team = Tla3bnyTeam.query.get_or_404(team_id)
    return jsonify(team.to_dict(with_roster=True))


@tla3bny_bp.post("/academies/<int:academy_id>/teams")
@auth.login_required
def create_team(academy_id: int):
    academy = _resolve_academy_for_write(academy_id)
    if academy is None:
        return _forbid()
    data = request.get_json(silent=True) or {}
    age_id = _int(data.get("age_category_id"))
    if not age_id or not Tla3bnyAgeCategory.query.get(age_id):
        return _err("valid age_category_id is required")
    team = Tla3bnyTeam(
        academy_id=academy.id,
        age_category_id=age_id,
        class_label=(data.get("class_label") or "").strip() or None,
        name=(data.get("name") or "").strip() or None,
    )
    db.session.add(team)
    db.session.commit()
    return jsonify(team.to_dict()), 201


@tla3bny_bp.put("/teams/<int:team_id>")
@auth.login_required
def update_team(team_id: int):
    if not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    team = Tla3bnyTeam.query.get_or_404(team_id)
    data = request.get_json(silent=True) or {}
    if "class_label" in data:
        team.class_label = (data.get("class_label") or "").strip() or None
    if "name" in data:
        team.name = (data.get("name") or "").strip() or None
    if "age_category_id" in data and _int(data.get("age_category_id")):
        team.age_category_id = _int(data.get("age_category_id"))
    db.session.commit()
    return jsonify(team.to_dict())


@tla3bny_bp.delete("/teams/<int:team_id>")
@auth.login_required
def delete_team(team_id: int):
    team = Tla3bnyTeam.query.get_or_404(team_id)
    user = auth.current_user()
    # Only the owning academy or super admin may delete a team (not the team login).
    if not auth.can_manage_academy(user, team.academy_id):
        return _forbid()
    db.session.delete(team)
    db.session.commit()
    return jsonify({"message": "deleted"})


@tla3bny_bp.post("/teams/<int:team_id>/account")
@auth.login_required
def set_team_account(team_id: int):
    """The owning academy (or super admin) creates/resets the team's coach login."""
    team = Tla3bnyTeam.query.get_or_404(team_id)
    user = auth.current_user()
    if not auth.can_manage_academy(user, team.academy_id):
        return _forbid()
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return _err("email and password are required")

    account = Tla3bnyUser.query.filter_by(role="team", team_id=team.id).first()
    clash = Tla3bnyUser.query.filter_by(email=email).first()
    if clash and (account is None or clash.id != account.id):
        return _err("Email already registered", 409)
    if account is None:
        account = Tla3bnyUser(
            role="team", status="active", team_id=team.id, academy_id=team.academy_id
        )
        db.session.add(account)
    account.email = email
    account.set_password(password)
    db.session.commit()
    return jsonify({"message": "saved", "email": email, "team_id": team.id}), 201


# ── coaches ──────────────────────────────────────────────────────────────────
@tla3bny_bp.post("/teams/<int:team_id>/coaches")
@auth.login_required
def add_coach(team_id: int):
    if not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    Tla3bnyTeam.query.get_or_404(team_id)
    data, files = _read_payload()
    name = (data.get("name") or "").strip()
    if not name:
        return _err("name is required")
    photo = None
    try:
        if files is not None and files.get("photo"):
            photo = save_upload(files.get("photo"), kind="image")
    except ValueError as e:
        return _err(str(e))
    coach = Tla3bnyCoach(
        team_id=team_id,
        name=name,
        role_ar=(data.get("role_ar") or "").strip() or None,
        phone=(data.get("phone") or "").strip() or None,
        photo_path=photo,
        start_date=_parse_date(data.get("start_date")),
        end_date=_parse_date(data.get("end_date")),
        sort_order=_int(data.get("sort_order"), 0),
    )
    db.session.add(coach)
    db.session.commit()
    return jsonify(coach.to_dict()), 201


@tla3bny_bp.put("/coaches/<int:coach_id>")
@auth.login_required
def update_coach(coach_id: int):
    coach = Tla3bnyCoach.query.get_or_404(coach_id)
    if not auth.can_manage_team(auth.current_user(), coach.team_id):
        return _forbid()
    data, files = _read_payload()
    for field in ("name", "role_ar", "phone"):
        if field in data:
            setattr(coach, field, (data.get(field) or "").strip() or None)
    if "start_date" in data:
        coach.start_date = _parse_date(data.get("start_date"))
    if "end_date" in data:
        coach.end_date = _parse_date(data.get("end_date"))
    if "sort_order" in data:
        coach.sort_order = _int(data.get("sort_order"), coach.sort_order)
    try:
        if files is not None and files.get("photo"):
            coach.photo_path = save_upload(files.get("photo"), kind="image")
    except ValueError as e:
        return _err(str(e))
    db.session.commit()
    return jsonify(coach.to_dict())


@tla3bny_bp.delete("/coaches/<int:coach_id>")
@auth.login_required
def delete_coach(coach_id: int):
    coach = Tla3bnyCoach.query.get_or_404(coach_id)
    if not auth.can_manage_team(auth.current_user(), coach.team_id):
        return _forbid()
    db.session.delete(coach)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ── players (person + dated membership) ──────────────────────────────────────
def _save_documents(player: Tla3bnyPlayer, files) -> None:
    if files is None:
        return
    uploaded = files.getlist("documents") if hasattr(files, "getlist") else []
    if files.get("papers"):
        uploaded = list(uploaded) + [files.get("papers")]
    for f in uploaded:
        if f is None or f.filename == "":
            continue
        path = save_upload(f, kind="document")
        if path:
            db.session.add(
                Tla3bnyPlayerFile(player_id=player.id, file_path=path, original_name=f.filename)
            )
            if not player.papers_path:
                player.papers_path = path


@tla3bny_bp.get("/players/<int:player_id>")
def get_player(player_id: int):
    player = Tla3bnyPlayer.query.get_or_404(player_id)
    return jsonify(player.to_dict())


@tla3bny_bp.post("/teams/<int:team_id>/players")
@auth.login_required
def create_player(team_id: int):
    """Create a player person and their active membership on this team."""
    if not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    Tla3bnyTeam.query.get_or_404(team_id)
    data, files = _read_payload()
    name = (data.get("name") or "").strip()
    if not name:
        return _err("name is required")

    photo = None
    try:
        if files is not None and files.get("photo"):
            photo = save_upload(files.get("photo"), kind="image")
    except ValueError as e:
        return _err(str(e))

    player = Tla3bnyPlayer(
        name=name,
        dob=_parse_date(data.get("dob")),
        position=(data.get("position") or "").strip() or None,
        sub_position=(data.get("sub_position") or "").strip() or None,
        photo_path=photo,
    )
    db.session.add(player)
    db.session.flush()
    try:
        _save_documents(player, files)
    except ValueError as e:
        return _err(str(e))

    db.session.add(
        Tla3bnyPlayerTeam(
            player_id=player.id,
            team_id=team_id,
            jersey_number=_int(data.get("jersey_number")),
            start_date=_parse_date(data.get("start_date")) or datetime.utcnow().date(),
            status="active",
        )
    )
    db.session.commit()
    return jsonify(player.to_dict()), 201


def _player_team_id(player: Tla3bnyPlayer) -> int | None:
    cur = player.current_membership()
    return cur.team_id if cur else None


@tla3bny_bp.put("/players/<int:player_id>")
@auth.login_required
def update_player(player_id: int):
    player = Tla3bnyPlayer.query.get_or_404(player_id)
    team_id = _player_team_id(player)
    if team_id is None or not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    data, files = _read_payload()
    if data.get("name"):
        player.name = data.get("name").strip()
    if "dob" in data:
        player.dob = _parse_date(data.get("dob"))
    if "position" in data:
        player.position = (data.get("position") or "").strip() or None
    if "sub_position" in data:
        player.sub_position = (data.get("sub_position") or "").strip() or None
    if "jersey_number" in data:
        cur = player.current_membership()
        if cur:
            cur.jersey_number = _int(data.get("jersey_number"))
    try:
        if files is not None and files.get("photo"):
            player.photo_path = save_upload(files.get("photo"), kind="image")
        _save_documents(player, files)
    except ValueError as e:
        return _err(str(e))
    db.session.commit()
    return jsonify(player.to_dict())


@tla3bny_bp.post("/players/<int:player_id>/move")
@auth.login_required
def move_player(player_id: int):
    """Move a player to another team: close the current membership, open a new
    one. Allowed for the super admin or the destination team's academy owner."""
    player = Tla3bnyPlayer.query.get_or_404(player_id)
    data = request.get_json(silent=True) or {}
    dest_team_id = _int(data.get("team_id"))
    dest = Tla3bnyTeam.query.get(dest_team_id) if dest_team_id else None
    if dest is None:
        return _err("valid destination team_id is required")
    if not auth.can_manage_academy(auth.current_user(), dest.academy_id):
        return _forbid()
    today = datetime.utcnow().date()
    cur = player.current_membership()
    if cur:
        if cur.team_id == dest_team_id:
            return _err("Player is already on that team")
        cur.end_date = _parse_date(data.get("end_date")) or today
        cur.status = "transferred"
    db.session.add(
        Tla3bnyPlayerTeam(
            player_id=player.id,
            team_id=dest_team_id,
            jersey_number=_int(data.get("jersey_number")),
            start_date=_parse_date(data.get("start_date")) or today,
            status="active",
        )
    )
    db.session.commit()
    return jsonify(player.to_dict())


@tla3bny_bp.delete("/players/<int:player_id>/files/<int:file_id>")
@auth.login_required
def delete_player_file(player_id: int, file_id: int):
    player = Tla3bnyPlayer.query.get_or_404(player_id)
    team_id = _player_team_id(player)
    if team_id is None or not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    pf = Tla3bnyPlayerFile.query.filter_by(id=file_id, player_id=player_id).first_or_404()
    db.session.delete(pf)
    db.session.commit()
    return jsonify({"message": "deleted"})


@tla3bny_bp.delete("/players/<int:player_id>")
@auth.login_required
def delete_player(player_id: int):
    player = Tla3bnyPlayer.query.get_or_404(player_id)
    team_id = _player_team_id(player)
    if team_id is None or not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    db.session.delete(player)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ── seasons ──────────────────────────────────────────────────────────────────
@tla3bny_bp.get("/seasons")
def list_seasons():
    seasons = Tla3bnySeason.query.order_by(
        Tla3bnySeason.sort_order.asc(), Tla3bnySeason.name.desc()
    ).all()
    return jsonify([s.to_dict() for s in seasons])


@tla3bny_bp.post("/seasons")
@auth.super_admin_required
def create_season():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return _err("name is required")
    if Tla3bnySeason.query.filter_by(name=name).first():
        return _err("Season already exists", 409)
    s = Tla3bnySeason(
        name=name,
        start_date=_parse_date(data.get("start_date")),
        end_date=_parse_date(data.get("end_date")),
        is_active=bool(data.get("is_active", True)),
        sort_order=_int(data.get("sort_order"), 0),
    )
    db.session.add(s)
    db.session.commit()
    return jsonify(s.to_dict()), 201


@tla3bny_bp.put("/seasons/<int:season_id>")
@auth.super_admin_required
def update_season(season_id: int):
    s = Tla3bnySeason.query.get_or_404(season_id)
    data = request.get_json(silent=True) or {}
    if data.get("name"):
        s.name = data.get("name").strip()
    if "start_date" in data:
        s.start_date = _parse_date(data.get("start_date"))
    if "end_date" in data:
        s.end_date = _parse_date(data.get("end_date"))
    if "is_active" in data:
        s.is_active = bool(data.get("is_active"))
    if "sort_order" in data:
        s.sort_order = _int(data.get("sort_order"), s.sort_order)
    db.session.commit()
    return jsonify(s.to_dict())


@tla3bny_bp.delete("/seasons/<int:season_id>")
@auth.super_admin_required
def delete_season(season_id: int):
    s = Tla3bnySeason.query.get_or_404(season_id)
    db.session.delete(s)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ── age categories (global, super-admin editable) ────────────────────────────
@tla3bny_bp.get("/categories")
def list_categories():
    cats = Tla3bnyAgeCategory.query.order_by(
        Tla3bnyAgeCategory.sort_order.asc(), Tla3bnyAgeCategory.label.asc()
    ).all()
    return jsonify([c.to_dict() for c in cats])


@tla3bny_bp.post("/categories")
@auth.super_admin_required
def create_category():
    data = request.get_json(silent=True) or {}
    label = (data.get("label") or "").strip()
    if not label:
        return _err("label is required")
    if Tla3bnyAgeCategory.query.filter_by(label=label).first():
        return _err("Category already exists", 409)
    cat = Tla3bnyAgeCategory(
        label=label,
        required_files=max(0, _int(data.get("required_files"), 1)),
        sort_order=_int(data.get("sort_order"), 0),
    )
    db.session.add(cat)
    db.session.commit()
    return jsonify(cat.to_dict()), 201


@tla3bny_bp.put("/categories/<int:cat_id>")
@auth.super_admin_required
def update_category(cat_id: int):
    cat = Tla3bnyAgeCategory.query.get_or_404(cat_id)
    data = request.get_json(silent=True) or {}
    label = (data.get("label") or "").strip()
    if label:
        existing = Tla3bnyAgeCategory.query.filter_by(label=label).first()
        if existing and existing.id != cat_id:
            return _err("Category already exists", 409)
        cat.label = label
    if "required_files" in data:
        cat.required_files = max(0, _int(data.get("required_files"), cat.required_files))
    if "sort_order" in data:
        cat.sort_order = _int(data.get("sort_order"), cat.sort_order)
    db.session.commit()
    return jsonify(cat.to_dict())


@tla3bny_bp.delete("/categories/<int:cat_id>")
@auth.super_admin_required
def delete_category(cat_id: int):
    cat = Tla3bnyAgeCategory.query.get_or_404(cat_id)
    in_use = (
        Tla3bnyTeam.query.filter_by(age_category_id=cat_id).first()
        or Tla3bnyCompetitionAge.query.filter_by(age_category_id=cat_id).first()
    )
    if in_use:
        return _err("Age is in use by a team or competition and cannot be deleted", 409)
    db.session.delete(cat)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ── competitions ─────────────────────────────────────────────────────────────
@tla3bny_bp.get("/competitions")
def list_competitions():
    q = Tla3bnyCompetition.query
    season_id = request.args.get("season_id", type=int)
    if season_id:
        q = q.filter_by(season_id=season_id)
    comps = q.order_by(Tla3bnyCompetition.created_at.desc()).all()
    return jsonify([c.to_dict(with_ages=True) for c in comps])


@tla3bny_bp.get("/competitions/<int:comp_id>")
def get_competition(comp_id: int):
    comp = Tla3bnyCompetition.query.get_or_404(comp_id)
    data = comp.to_dict()
    data["ages"] = [a.to_dict(with_stages=True) for a in comp.ages]
    data["admins"] = [ca.to_dict() for ca in comp.admins]
    return jsonify(data)


@tla3bny_bp.post("/competitions")
@auth.super_admin_required
def create_competition():
    data, files = _read_payload()
    name = (data.get("name") or "").strip()
    season_id = _int(data.get("season_id"))
    if not name or not season_id:
        return _err("name and season_id are required")
    if not Tla3bnySeason.query.get(season_id):
        return _err("season not found", 404)
    logo = None
    try:
        if files is not None and files.get("logo"):
            logo = save_upload(files.get("logo"), kind="image")
    except ValueError as e:
        return _err(str(e))
    comp = Tla3bnyCompetition(
        season_id=season_id,
        name=name,
        description=(data.get("description") or "").strip() or None,
        location=(data.get("location") or "").strip() or None,
        logo_path=logo,
        start_date=_parse_date(data.get("start_date")),
        end_date=_parse_date(data.get("end_date")),
        status=data.get("status") or "draft",
    )
    db.session.add(comp)
    db.session.commit()
    return jsonify(comp.to_dict()), 201


@tla3bny_bp.put("/competitions/<int:comp_id>")
@auth.login_required
def update_competition(comp_id: int):
    if not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    comp = Tla3bnyCompetition.query.get_or_404(comp_id)
    data, files = _read_payload()
    for field in ("name", "description", "location"):
        if field in data:
            setattr(comp, field, (data.get(field) or "").strip() or None)
    if "status" in data and data.get("status"):
        comp.status = data.get("status")
    if "start_date" in data:
        comp.start_date = _parse_date(data.get("start_date"))
    if "end_date" in data:
        comp.end_date = _parse_date(data.get("end_date"))
    try:
        if files is not None and files.get("logo"):
            comp.logo_path = save_upload(files.get("logo"), kind="image")
    except ValueError as e:
        return _err(str(e))
    db.session.commit()
    return jsonify(comp.to_dict())


@tla3bny_bp.delete("/competitions/<int:comp_id>")
@auth.super_admin_required
def delete_competition(comp_id: int):
    comp = Tla3bnyCompetition.query.get_or_404(comp_id)
    db.session.delete(comp)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ── competition admins ───────────────────────────────────────────────────────
@tla3bny_bp.post("/competitions/<int:comp_id>/admins")
@auth.super_admin_required
def add_competition_admin(comp_id: int):
    """Assign a competition_admin. Creates the account if the email is new."""
    Tla3bnyCompetition.query.get_or_404(comp_id)
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return _err("email is required")
    user = Tla3bnyUser.query.filter_by(email=email).first()
    if user is None:
        if not data.get("password"):
            return _err("password is required for a new admin")
        user = Tla3bnyUser(
            email=email,
            role="competition_admin",
            status="active",
            name=(data.get("name") or "").strip() or None,
        )
        user.set_password(data.get("password"))
        db.session.add(user)
        db.session.flush()
    elif user.role not in ("competition_admin", "super_admin"):
        return _err("That account is not a competition admin", 409)
    if not Tla3bnyCompetitionAdmin.query.filter_by(
        competition_id=comp_id, user_id=user.id
    ).first():
        db.session.add(Tla3bnyCompetitionAdmin(competition_id=comp_id, user_id=user.id))
    db.session.commit()
    return jsonify({"message": "assigned", "user": user.to_dict()}), 201


@tla3bny_bp.delete("/competitions/<int:comp_id>/admins/<int:user_id>")
@auth.super_admin_required
def remove_competition_admin(comp_id: int, user_id: int):
    ca = Tla3bnyCompetitionAdmin.query.filter_by(
        competition_id=comp_id, user_id=user_id
    ).first_or_404()
    db.session.delete(ca)
    db.session.commit()
    return jsonify({"message": "removed"})


# ── competition ages + rules ─────────────────────────────────────────────────
_RULE_FIELDS = (
    "max_players_per_team",
    "lineup_size",
    "players_on_pitch",
    "max_substitutes",
    "num_periods",
    "period_minutes",
    "lineup_deadline_minutes",
)


@tla3bny_bp.post("/competitions/<int:comp_id>/ages")
@auth.login_required
def add_competition_age(comp_id: int):
    if not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    Tla3bnyCompetition.query.get_or_404(comp_id)
    data = request.get_json(silent=True) or {}
    age_id = _int(data.get("age_category_id"))
    if not age_id or not Tla3bnyAgeCategory.query.get(age_id):
        return _err("valid age_category_id is required")
    if Tla3bnyCompetitionAge.query.filter_by(
        competition_id=comp_id, age_category_id=age_id
    ).first():
        return _err("Age already added to this competition", 409)
    cage = Tla3bnyCompetitionAge(competition_id=comp_id, age_category_id=age_id)
    for f in _RULE_FIELDS:
        if f in data and _int(data.get(f)) is not None:
            setattr(cage, f, _int(data.get(f)))
    db.session.add(cage)
    db.session.commit()
    return jsonify(cage.to_dict()), 201


@tla3bny_bp.put("/competition-ages/<int:cage_id>")
@auth.login_required
def update_competition_age(cage_id: int):
    cage = Tla3bnyCompetitionAge.query.get_or_404(cage_id)
    if not auth.is_competition_admin(auth.current_user(), cage.competition_id):
        return _forbid()
    data = request.get_json(silent=True) or {}
    for f in _RULE_FIELDS:
        if f in data and _int(data.get(f)) is not None:
            setattr(cage, f, _int(data.get(f)))
    db.session.commit()
    return jsonify(cage.to_dict())


@tla3bny_bp.delete("/competition-ages/<int:cage_id>")
@auth.login_required
def delete_competition_age(cage_id: int):
    cage = Tla3bnyCompetitionAge.query.get_or_404(cage_id)
    if not auth.is_competition_admin(auth.current_user(), cage.competition_id):
        return _forbid()
    db.session.delete(cage)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ── stages + groups ──────────────────────────────────────────────────────────
@tla3bny_bp.post("/competition-ages/<int:cage_id>/stages")
@auth.login_required
def add_stage(cage_id: int):
    cage = Tla3bnyCompetitionAge.query.get_or_404(cage_id)
    if not auth.is_competition_admin(auth.current_user(), cage.competition_id):
        return _forbid()
    data = request.get_json(silent=True) or {}
    order = _int(data.get("stage_order"))
    if order is None:
        order = (max((s.stage_order for s in cage.stages), default=0)) + 1
    stage = Tla3bnyStage(
        competition_age_id=cage_id,
        name=(data.get("name") or "").strip() or None,
        stage_order=order,
        type=data.get("type") or "league",
        carries_points=bool(data.get("carries_points", True)),
    )
    db.session.add(stage)
    db.session.commit()
    return jsonify(stage.to_dict()), 201


@tla3bny_bp.put("/stages/<int:stage_id>")
@auth.login_required
def update_stage(stage_id: int):
    stage = Tla3bnyStage.query.get_or_404(stage_id)
    if not auth.is_competition_admin(
        auth.current_user(), stage.competition_age.competition_id
    ):
        return _forbid()
    data = request.get_json(silent=True) or {}
    if "name" in data:
        stage.name = (data.get("name") or "").strip() or None
    if data.get("type"):
        stage.type = data.get("type")
    if "stage_order" in data and _int(data.get("stage_order")) is not None:
        stage.stage_order = _int(data.get("stage_order"))
    if "carries_points" in data:
        stage.carries_points = bool(data.get("carries_points"))
    db.session.commit()
    return jsonify(stage.to_dict())


@tla3bny_bp.delete("/stages/<int:stage_id>")
@auth.login_required
def delete_stage(stage_id: int):
    stage = Tla3bnyStage.query.get_or_404(stage_id)
    if not auth.is_competition_admin(
        auth.current_user(), stage.competition_age.competition_id
    ):
        return _forbid()
    db.session.delete(stage)
    db.session.commit()
    return jsonify({"message": "deleted"})


def _stage_comp_id(stage: Tla3bnyStage) -> int:
    return stage.competition_age.competition_id


@tla3bny_bp.post("/stages/<int:stage_id>/groups")
@auth.login_required
def add_group(stage_id: int):
    stage = Tla3bnyStage.query.get_or_404(stage_id)
    if not auth.is_competition_admin(auth.current_user(), _stage_comp_id(stage)):
        return _forbid()
    data = request.get_json(silent=True) or {}
    g = Tla3bnyGroup(stage_id=stage_id, name=(data.get("name") or "").strip() or None)
    db.session.add(g)
    db.session.commit()
    return jsonify(g.to_dict()), 201


@tla3bny_bp.delete("/groups/<int:group_id>")
@auth.login_required
def delete_group(group_id: int):
    g = Tla3bnyGroup.query.get_or_404(group_id)
    if not auth.is_competition_admin(auth.current_user(), _stage_comp_id(g.stage)):
        return _forbid()
    db.session.delete(g)
    db.session.commit()
    return jsonify({"message": "deleted"})


@tla3bny_bp.post("/groups/<int:group_id>/teams")
@auth.login_required
def add_group_team(group_id: int):
    g = Tla3bnyGroup.query.get_or_404(group_id)
    if not auth.is_competition_admin(auth.current_user(), _stage_comp_id(g.stage)):
        return _forbid()
    team_id = _int((request.get_json(silent=True) or {}).get("team_id"))
    if not team_id or not Tla3bnyTeam.query.get(team_id):
        return _err("valid team_id is required")
    if not Tla3bnyGroupTeam.query.filter_by(group_id=group_id, team_id=team_id).first():
        db.session.add(Tla3bnyGroupTeam(group_id=group_id, team_id=team_id))
        db.session.commit()
    return jsonify(g.to_dict()), 201


@tla3bny_bp.delete("/groups/<int:group_id>/teams/<int:team_id>")
@auth.login_required
def remove_group_team(group_id: int, team_id: int):
    g = Tla3bnyGroup.query.get_or_404(group_id)
    if not auth.is_competition_admin(auth.current_user(), _stage_comp_id(g.stage)):
        return _forbid()
    gt = Tla3bnyGroupTeam.query.filter_by(group_id=group_id, team_id=team_id).first_or_404()
    db.session.delete(gt)
    db.session.commit()
    return jsonify({"message": "removed"})


# ── competition registration + roster approval ───────────────────────────────
@tla3bny_bp.get("/competitions/<int:comp_id>/teams")
def list_competition_teams(comp_id: int):
    q = Tla3bnyCompetitionTeam.query.filter_by(competition_id=comp_id)
    age_id = request.args.get("age_category_id", type=int)
    if age_id:
        q = q.filter_by(age_category_id=age_id)
    entries = q.all()
    with_roster = request.args.get("roster") == "1"
    return jsonify([e.to_dict(with_roster=with_roster) for e in entries])


@tla3bny_bp.post("/competitions/<int:comp_id>/teams")
@auth.login_required
def register_team(comp_id: int):
    """A competition admin registers a team (its age must run in this comp)."""
    if not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    Tla3bnyCompetition.query.get_or_404(comp_id)
    team_id = _int((request.get_json(silent=True) or {}).get("team_id"))
    team = Tla3bnyTeam.query.get(team_id) if team_id else None
    if team is None:
        return _err("valid team_id is required")
    if not Tla3bnyCompetitionAge.query.filter_by(
        competition_id=comp_id, age_category_id=team.age_category_id
    ).first():
        return _err("This competition does not run the team's age", 409)
    if Tla3bnyCompetitionTeam.query.filter_by(
        competition_id=comp_id, team_id=team_id
    ).first():
        return _err("Team already registered", 409)
    entry = Tla3bnyCompetitionTeam(
        competition_id=comp_id, team_id=team_id, age_category_id=team.age_category_id
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify(entry.to_dict()), 201


@tla3bny_bp.delete("/competition-teams/<int:entry_id>")
@auth.login_required
def unregister_team(entry_id: int):
    entry = Tla3bnyCompetitionTeam.query.get_or_404(entry_id)
    if not auth.is_competition_admin(auth.current_user(), entry.competition_id):
        return _forbid()
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "deleted"})


@tla3bny_bp.get("/competition-teams/<int:entry_id>/roster")
def get_roster(entry_id: int):
    entry = Tla3bnyCompetitionTeam.query.get_or_404(entry_id)
    return jsonify(entry.to_dict(with_roster=True))


@tla3bny_bp.post("/competition-teams/<int:entry_id>/players")
@auth.login_required
def add_roster_player(entry_id: int):
    """The team's academy/coach adds one of its players to the competition
    roster — pending approval by the competition admin."""
    entry = Tla3bnyCompetitionTeam.query.get_or_404(entry_id)
    if not auth.can_manage_team(auth.current_user(), entry.team_id):
        return _forbid()
    player_id = _int((request.get_json(silent=True) or {}).get("player_id"))
    player = Tla3bnyPlayer.query.get(player_id) if player_id else None
    if player is None:
        return _err("valid player_id is required")
    if _player_team_id(player) != entry.team_id:
        return _err("Player is not on this team", 409)
    if Tla3bnyCompetitionPlayer.query.filter_by(
        competition_team_id=entry_id, player_id=player_id
    ).first():
        return _err("Player already on the roster", 409)

    cage = Tla3bnyCompetitionAge.query.filter_by(
        competition_id=entry.competition_id, age_category_id=entry.age_category_id
    ).first()
    cap = cage.max_players_per_team if cage else None
    if cap is not None:
        count = Tla3bnyCompetitionPlayer.query.filter_by(competition_team_id=entry_id).count()
        if count >= cap:
            return _err(f"Roster is full (max {cap})", 409)

    cp = Tla3bnyCompetitionPlayer(
        competition_team_id=entry_id, player_id=player_id, status="pending"
    )
    db.session.add(cp)
    db.session.commit()
    return jsonify(cp.to_dict()), 201


@tla3bny_bp.delete("/competition-players/<int:cp_id>")
@auth.login_required
def remove_roster_player(cp_id: int):
    cp = Tla3bnyCompetitionPlayer.query.get_or_404(cp_id)
    entry = cp.entry
    user = auth.current_user()
    if not (
        auth.is_competition_admin(user, entry.competition_id)
        or auth.can_manage_team(user, entry.team_id)
    ):
        return _forbid()
    db.session.delete(cp)
    db.session.commit()
    return jsonify({"message": "deleted"})


@tla3bny_bp.post("/competition-players/<int:cp_id>/approve")
@auth.login_required
def approve_roster_player(cp_id: int):
    cp = Tla3bnyCompetitionPlayer.query.get_or_404(cp_id)
    if not auth.is_competition_admin(auth.current_user(), cp.entry.competition_id):
        return _forbid()
    cp.status = "approved"
    cp.rejection_reason = None
    cp.approved_by_user_id = auth.current_user().id
    db.session.commit()
    return jsonify(cp.to_dict())


@tla3bny_bp.post("/competition-players/<int:cp_id>/reject")
@auth.login_required
def reject_roster_player(cp_id: int):
    cp = Tla3bnyCompetitionPlayer.query.get_or_404(cp_id)
    if not auth.is_competition_admin(auth.current_user(), cp.entry.competition_id):
        return _forbid()
    cp.status = "rejected"
    cp.rejection_reason = (request.get_json(silent=True) or {}).get("reason") or None
    cp.approved_by_user_id = auth.current_user().id
    db.session.commit()
    return jsonify(cp.to_dict())


# ── matches ──────────────────────────────────────────────────────────────────
@tla3bny_bp.get("/matches")
def list_matches():
    q = Tla3bnyMatch.query
    for field in ("competition_id", "age_category_id", "stage_id", "group_id"):
        val = request.args.get(field, type=int)
        if val:
            q = q.filter(getattr(Tla3bnyMatch, field) == val)
    status = request.args.get("status")
    if status:
        q = q.filter_by(status=status)
    team_id = request.args.get("team_id", type=int)
    if team_id:
        q = q.filter(
            (Tla3bnyMatch.home_team_id == team_id)
            | (Tla3bnyMatch.away_team_id == team_id)
        )
    date_str = request.args.get("date")
    d = _parse_date(date_str)
    if d:
        q = q.filter(Tla3bnyMatch.date == d)
    # date IS NULL sorts TBD fixtures last — MySQL has no NULLS LAST.
    matches = q.order_by(
        Tla3bnyMatch.date.is_(None), Tla3bnyMatch.date.desc(), Tla3bnyMatch.time.desc()
    ).all()
    return jsonify([m.to_dict() for m in matches])


@tla3bny_bp.get("/matches/<int:match_id>")
def get_match(match_id: int):
    match = Tla3bnyMatch.query.get_or_404(match_id)
    return jsonify(match.to_dict(include_events=True))


def _validate_match_teams(comp_id, age_id, home_id, away_id):
    if not home_id or not away_id or not age_id:
        return "home_team_id, away_team_id and age_category_id are required"
    if home_id == away_id:
        return "Home and away teams must differ"
    for tid in (home_id, away_id):
        if not Tla3bnyCompetitionTeam.query.filter_by(
            competition_id=comp_id, team_id=tid, age_category_id=age_id
        ).first():
            return f"Team {tid} is not registered in this competition/age"
    return None


@tla3bny_bp.post("/matches")
@auth.login_required
def create_match():
    data = request.get_json(silent=True) or {}
    comp_id = _int(data.get("competition_id"))
    if not comp_id or not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    Tla3bnyCompetition.query.get_or_404(comp_id)
    age_id = _int(data.get("age_category_id"))
    home_id = _int(data.get("home_team_id"))
    away_id = _int(data.get("away_team_id"))
    err = _validate_match_teams(comp_id, age_id, home_id, away_id)
    if err:
        return _err(err, 409)
    match = Tla3bnyMatch(
        competition_id=comp_id,
        age_category_id=age_id,
        stage_id=_int(data.get("stage_id")),
        group_id=_int(data.get("group_id")),
        home_team_id=home_id,
        away_team_id=away_id,
        date=_parse_date(data.get("date")),
        time=data.get("time"),
        venue=(data.get("venue") or "").strip() or None,
        round=(data.get("round") or "").strip() or None,
        status="scheduled",
    )
    db.session.add(match)
    db.session.commit()
    return jsonify(match.to_dict()), 201


@tla3bny_bp.put("/matches/<int:match_id>")
@auth.login_required
def update_match(match_id: int):
    match = Tla3bnyMatch.query.get_or_404(match_id)
    if not auth.is_competition_admin(auth.current_user(), match.competition_id):
        return _forbid()
    data = request.get_json(silent=True) or {}
    for field in ("time", "venue", "round", "status"):
        if field in data:
            setattr(match, field, data.get(field))
    if "date" in data:
        match.date = _parse_date(data.get("date"))
    for field in ("stage_id", "group_id"):
        if field in data:
            setattr(match, field, _int(data.get(field)))
    db.session.commit()
    return jsonify(match.to_dict())


@tla3bny_bp.delete("/matches/<int:match_id>")
@auth.login_required
def delete_match(match_id: int):
    match = Tla3bnyMatch.query.get_or_404(match_id)
    if not auth.is_competition_admin(auth.current_user(), match.competition_id):
        return _forbid()
    db.session.delete(match)
    db.session.commit()
    return jsonify({"message": "deleted"})


@tla3bny_bp.post("/matches/<int:match_id>/result")
@auth.login_required
def enter_result(match_id: int):
    """Enter final score + events, replacing existing events. An assist links to
    its goal via related_temp_id, resolved after the goals are inserted."""
    match = Tla3bnyMatch.query.get_or_404(match_id)
    if not auth.is_competition_admin(auth.current_user(), match.competition_id):
        return _forbid()
    data = request.get_json(silent=True) or {}
    match.home_score = _int(data.get("home_score"))
    match.away_score = _int(data.get("away_score"))

    Tla3bnyMatchEvent.query.filter_by(match_id=match.id).delete()
    db.session.flush()

    temp_map: dict = {}
    pending_assists = []
    for ev in data.get("events") or []:
        etype = ev.get("event_type")
        if not etype:
            continue
        if etype == "assist" and ev.get("related_temp_id"):
            pending_assists.append(ev)
            continue
        obj = Tla3bnyMatchEvent(
            match_id=match.id,
            player_id=_int(ev.get("player_id")),
            team_id=_int(ev.get("team_id")),
            event_type=etype,
            minute=_int(ev.get("minute")),
        )
        db.session.add(obj)
        db.session.flush()
        if ev.get("temp_id"):
            temp_map[ev["temp_id"]] = obj.id

    for ev in pending_assists:
        db.session.add(
            Tla3bnyMatchEvent(
                match_id=match.id,
                player_id=_int(ev.get("player_id")),
                team_id=_int(ev.get("team_id")),
                event_type="assist",
                minute=_int(ev.get("minute")),
                related_event_id=temp_map.get(ev.get("related_temp_id")),
            )
        )

    match.status = "finished"
    db.session.commit()
    return jsonify(match.to_dict(include_events=True))


# ── lineups ──────────────────────────────────────────────────────────────────
@tla3bny_bp.get("/lineups/match/<int:match_id>")
def get_match_lineups(match_id: int):
    lineups = Tla3bnyLineup.query.filter_by(match_id=match_id).all()
    return jsonify([l.to_dict() for l in lineups])


@tla3bny_bp.put("/lineups/match/<int:match_id>/team/<int:team_id>")
@auth.login_required
def save_lineup(match_id: int, team_id: int):
    match = Tla3bnyMatch.query.get_or_404(match_id)
    if team_id not in (match.home_team_id, match.away_team_id):
        return _err("Team is not part of this match")

    user = auth.current_user()
    is_admin = auth.is_competition_admin(user, match.competition_id)
    is_team = auth.can_manage_team(user, team_id)
    if not (is_admin or is_team):
        return _forbid()

    rules = match.rules
    # Deadline applies to the team coach, not the competition admin.
    if is_team and not is_admin and rules and match.match_date:
        deadline = match.match_date - timedelta(minutes=rules.lineup_deadline_minutes)
        if datetime.utcnow() > deadline:
            return _err("Lineup submission deadline has passed", 409)

    data = request.get_json(silent=True) or {}
    slots = data.get("slots") or []
    starters = [s for s in slots if not s.get("is_substitute")]
    subs = [s for s in slots if s.get("is_substitute")]
    if rules:
        if len(starters) > rules.players_on_pitch:
            return _err(f"Too many starters (max {rules.players_on_pitch})", 409)
        if len(subs) > rules.max_substitutes:
            return _err(f"Too many substitutes (max {rules.max_substitutes})", 409)
        if len(slots) > rules.lineup_size:
            return _err(f"Lineup too large (max {rules.lineup_size})", 409)

    # Players must be approved on this team's roster for this competition.
    entry = Tla3bnyCompetitionTeam.query.filter_by(
        competition_id=match.competition_id, team_id=team_id
    ).first()
    approved_ids = set()
    if entry:
        approved_ids = {
            cp.player_id
            for cp in Tla3bnyCompetitionPlayer.query.filter_by(
                competition_team_id=entry.id, status="approved"
            ).all()
        }
    for s in slots:
        pid = _int(s.get("player_id"))
        if pid and pid not in approved_ids:
            return _err("Lineup contains a player not approved for this competition", 409)

    lineup = Tla3bnyLineup.query.filter_by(match_id=match_id, team_id=team_id).first()
    if not lineup:
        lineup = Tla3bnyLineup(match_id=match_id, team_id=team_id)
        db.session.add(lineup)
    lineup.formation = data.get("formation")
    if lineup.id:
        Tla3bnyLineupSlot.query.filter(Tla3bnyLineupSlot.lineup_id == lineup.id).delete()
    db.session.flush()
    for s in slots:
        db.session.add(
            Tla3bnyLineupSlot(
                lineup_id=lineup.id,
                position_slot=s.get("position_slot"),
                player_id=_int(s.get("player_id")),
                is_substitute=bool(s.get("is_substitute", False)),
            )
        )
    db.session.commit()
    return jsonify(lineup.to_dict())


# ── standings / bracket / analysis ───────────────────────────────────────────
@tla3bny_bp.get("/standings")
def standings():
    comp_id = request.args.get("competition_id", type=int)
    age_id = request.args.get("age_category_id", type=int)
    if not comp_id or not age_id:
        return _err("competition_id and age_category_id are required")
    return jsonify(tables.standings_by_group(comp_id, age_id))


@tla3bny_bp.get("/bracket")
def bracket():
    comp_id = request.args.get("competition_id", type=int)
    age_id = request.args.get("age_category_id", type=int)
    if not comp_id or not age_id:
        return _err("competition_id and age_category_id are required")
    return jsonify(tables.knockout_bracket(comp_id, age_id))


@tla3bny_bp.get("/analysis")
def analysis():
    comp_id = request.args.get("competition_id", type=int)
    age_id = request.args.get("age_category_id", type=int)
    if not comp_id or not age_id:
        return _err("competition_id and age_category_id are required")

    matches = Tla3bnyMatch.query.filter_by(
        competition_id=comp_id, age_category_id=age_id, status="finished"
    ).all()
    match_ids = [m.id for m in matches]

    goals: dict = defaultdict(int)
    assists: dict = defaultdict(int)
    yellows: dict = defaultdict(int)
    reds: dict = defaultdict(int)
    buckets = {"goal": goals, "assist": assists, "yellow": yellows, "red": reds}
    if match_ids:
        for e in Tla3bnyMatchEvent.query.filter(
            Tla3bnyMatchEvent.match_id.in_(match_ids)
        ).all():
            if e.player_id is None:
                continue
            bucket = buckets.get(e.event_type)
            if bucket is not None:
                bucket[e.player_id] += 1

    def board(counter):
        out = []
        for pid, count in counter.items():
            p = Tla3bnyPlayer.query.get(pid)
            if not p:
                continue
            cur = p.current_membership()
            team = cur.team if cur else None
            out.append(
                {
                    "player_id": pid,
                    "player_name": p.name,
                    "photo_path": p.photo_path,
                    "team_id": team.id if team else None,
                    "team_name": team.display_name() if team else None,
                    "academy_id": team.academy_id if team else None,
                    "count": count,
                }
            )
        out.sort(key=lambda x: (-x["count"], (x["player_name"] or "").lower()))
        return out

    return jsonify(
        {
            "top_scorers": board(goals),
            "top_assisters": board(assists),
            "yellow_cards": board(yellows),
            "red_cards": board(reds),
        }
    )


# ── news ─────────────────────────────────────────────────────────────────────
@tla3bny_bp.get("/news")
def list_news():
    q = Tla3bnyNews.query
    comp_id = request.args.get("competition_id", type=int)
    if comp_id:
        q = q.filter_by(competition_id=comp_id)
    limit = request.args.get("limit", type=int) or 50
    items = q.order_by(Tla3bnyNews.published_at.desc()).limit(limit).all()
    return jsonify([n.to_dict() for n in items])


@tla3bny_bp.get("/news/<int:news_id>")
def get_news(news_id: int):
    return jsonify(Tla3bnyNews.query.get_or_404(news_id).to_dict())


@tla3bny_bp.post("/competitions/<int:comp_id>/news")
@auth.login_required
def create_news(comp_id: int):
    if not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    Tla3bnyCompetition.query.get_or_404(comp_id)
    data, files = _read_payload()
    title = (data.get("title") or "").strip()
    if not title:
        return _err("title is required")
    image = None
    try:
        if files is not None and files.get("image"):
            image = save_upload(files.get("image"), kind="image")
    except ValueError as e:
        return _err(str(e))
    n = Tla3bnyNews(
        competition_id=comp_id,
        title=title,
        body=(data.get("body") or "").strip() or None,
        image_path=image,
        author_user_id=auth.current_user().id,
    )
    db.session.add(n)
    db.session.commit()
    return jsonify(n.to_dict()), 201


@tla3bny_bp.put("/news/<int:news_id>")
@auth.login_required
def update_news(news_id: int):
    n = Tla3bnyNews.query.get_or_404(news_id)
    if not auth.is_competition_admin(auth.current_user(), n.competition_id):
        return _forbid()
    data, files = _read_payload()
    if data.get("title"):
        n.title = data.get("title").strip()
    if "body" in data:
        n.body = (data.get("body") or "").strip() or None
    try:
        if files is not None and files.get("image"):
            n.image_path = save_upload(files.get("image"), kind="image")
    except ValueError as e:
        return _err(str(e))
    db.session.commit()
    return jsonify(n.to_dict())


@tla3bny_bp.delete("/news/<int:news_id>")
@auth.login_required
def delete_news(news_id: int):
    n = Tla3bnyNews.query.get_or_404(news_id)
    if not auth.is_competition_admin(auth.current_user(), n.competition_id):
        return _forbid()
    db.session.delete(n)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ── home ─────────────────────────────────────────────────────────────────────
@tla3bny_bp.get("/home")
def home():
    """Today's matches + recent news for the tla3bny landing page."""
    today = datetime.utcnow().date()
    todays = (
        Tla3bnyMatch.query.filter(Tla3bnyMatch.date == today)
        .order_by(Tla3bnyMatch.time.asc())
        .all()
    )
    recent_news = (
        Tla3bnyNews.query.order_by(Tla3bnyNews.published_at.desc()).limit(6).all()
    )
    return jsonify(
        {
            "today_matches": [m.to_dict() for m in todays],
            "recent_news": [n.to_dict() for n in recent_news],
        }
    )
