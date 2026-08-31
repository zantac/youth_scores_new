from collections import defaultdict
from datetime import datetime  # noqa: F401 — kept for type annotations in this file

from flask import Response, jsonify, request
import sqlalchemy as sa
from sqlalchemy import func
from sqlalchemy.orm import selectinload

from app.extensions import db
from app.models import (
    Tla3bnyAgeCategory,
    Tla3bnyCompetition,
    Tla3bnyCompetitionAge,
    Tla3bnyCompetitionPlayer,
    Tla3bnyCompetitionTeam,
    Tla3bnyLineup,
    Tla3bnyLineupSlot,
    Tla3bnyMatch,
    Tla3bnyMatchEvent,
    Tla3bnyPlayer,
    Tla3bnyPlayerFile,
    Tla3bnyPlayerTeam,
    Tla3bnyTeam,
)

_FINISHED = ("finished", "completed")
from app.services import storage
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from .audit import _log
from ._helpers import (
    _err,
    _forbid,
    _int,
    _parse_date,
    _parse_date_or_error,
    _read_payload,
    _save_documents,
    _utcnow,
    save_upload,
)


def _can_view_player_files(player: Tla3bnyPlayer) -> bool:
    """Registration papers are private: the owning academy/team login, or an
    admin of a competition this player's team plays in.

    Team membership — not roster entry — is what grants the organiser access.
    They have to check a player's papers *before* deciding whether to approve
    the entry, and they are often the one adding players to the roster in the
    first place, so gating on an approved entry would lock them out of exactly
    the moment they need it.
    """
    user = auth.current_user()
    if user is None:
        return False
    if user.role == "super_admin":
        return True
    team_id = _player_team_id(player)
    if team_id is None:
        return False
    if auth.can_manage_team(user, team_id):
        return True
    comp_ids = (
        db.session.query(Tla3bnyCompetitionTeam.competition_id)
        .filter(Tla3bnyCompetitionTeam.team_id == team_id)
        .distinct()
    )
    return any(auth.is_competition_admin(user, cid) for (cid,) in comp_ids)


@tla3bny_bp.get("/players/<int:player_id>")
def get_player(player_id: int):
    """Public profile. The registration papers ride along only for a caller
    allowed to see them (owning academy/team, or a competition admin)."""
    player = Tla3bnyPlayer.query.get_or_404(player_id)
    return jsonify(player.to_dict(with_files=_can_view_player_files(player)))


@tla3bny_bp.get("/player-files/<int:file_id>")
def serve_player_file(file_id: int):
    """Stream a private registration document behind a short-lived signed link.

    No login decorator on purpose: the ``sig`` query param IS the authorisation —
    a signed, ~30-minute token that is only ever minted inside an authorised
    ``with_files=True`` serialization (see ``_can_view_player_files``). This lets
    a plain <img>/download tag load the file, which a Bearer-token header cannot,
    while an unauthorised caller never receives a working link.
    """
    if not auth.verify_file_sig(request.args.get("sig", ""), file_id):
        return _err("رابط غير صالح أو منتهي الصلاحية", 403)
    pf = Tla3bnyPlayerFile.query.get_or_404(file_id)
    try:
        data = storage.read_bytes(pf.file_path)
    except (FileNotFoundError, OSError):
        return _err("الملف غير موجود", 404)
    ext = pf.file_path.rsplit(".", 1)[-1] if "." in pf.file_path else ""
    resp = Response(data, mimetype=storage.content_type_for(ext))
    # A private document on a short-lived link: never let a shared/CDN cache keep
    # it, and the signature expires regardless.
    resp.headers["Cache-Control"] = "private, no-store"
    resp.headers["Content-Disposition"] = "inline"
    return resp


@tla3bny_bp.get("/players/<int:player_id>/registrations")
def player_registrations(player_id: int):
    """Where this player has been entered, and how each request went.

    The rejection reason is the whole point: it is what tells the academy what
    to fix and re-upload. Public callers get the status without the reason.
    """
    player = Tla3bnyPlayer.query.get_or_404(player_id)
    detailed = _can_view_player_files(player)
    rows = (
        Tla3bnyCompetitionPlayer.query.filter_by(player_id=player_id)
        .join(Tla3bnyCompetitionPlayer.entry)
        .join(Tla3bnyCompetitionTeam.competition)
        .order_by(Tla3bnyCompetition.name.asc())
        .all()
    )
    out = []
    for cp in rows:
        comp = cp.entry.competition if cp.entry else None
        item = {
            "id": cp.id,
            "competition_id": comp.id if comp else None,
            "competition_name": comp.name if comp else None,
            "status": cp.status,
        }
        if detailed:
            # Papers are per registration: this competition's own required set,
            # matched against the papers uploaded for *this* entry.
            cage = None
            if comp:
                cage = next(
                    (a for a in comp.ages
                     if a.age_category_id == cp.entry.age_category_id),
                    None,
                )
            required = cage.documents if cage else (comp.documents if comp else [])
            supplied = {f.label for f in cp.effective_files if f.label}
            item["rejection_reason"] = cp.rejection_reason
            item["required_documents"] = required
            item["missing_documents"] = [d for d in required if d not in supplied]
        out.append(item)
    return jsonify(out)


@tla3bny_bp.get("/players/<int:player_id>/stats")
def player_stats(player_id: int):
    """Career statistics for one player, broken down by competition.

    Counts goals, assists, yellow cards, red cards, and appearances (lineup
    slots in finished matches) across every competition the player has events
    or lineup entries in.  Public endpoint — no auth required.
    """
    Tla3bnyPlayer.query.get_or_404(player_id)

    # ── event stats (goals / assists / cards) ────────────────────────────────
    event_rows = (
        db.session.query(
            Tla3bnyMatch.competition_id,
            Tla3bnyMatchEvent.event_type,
            func.count().label("cnt"),
        )
        .join(Tla3bnyMatch, Tla3bnyMatchEvent.match_id == Tla3bnyMatch.id)
        .filter(
            Tla3bnyMatchEvent.player_id == player_id,
            Tla3bnyMatch.status.in_(_FINISHED),
            Tla3bnyMatchEvent.event_type.in_(["goal", "assist", "yellow", "second_yellow", "red"]),
            # Own goals are not credited to the scorer, matching youthscores.
            sa.or_(
                Tla3bnyMatchEvent.event_type != "goal",
                Tla3bnyMatchEvent.is_own_goal == False,  # noqa: E712
            ),
        )
        .group_by(Tla3bnyMatch.competition_id, Tla3bnyMatchEvent.event_type)
        .all()
    )

    # ── appearances (lineup slots in finished matches) ────────────────────────
    appearance_rows = (
        db.session.query(
            Tla3bnyMatch.competition_id,
            func.count(func.distinct(Tla3bnyMatch.id)).label("cnt"),
        )
        .join(Tla3bnyLineup, Tla3bnyLineup.match_id == Tla3bnyMatch.id)
        .join(Tla3bnyLineupSlot, Tla3bnyLineupSlot.lineup_id == Tla3bnyLineup.id)
        .filter(
            Tla3bnyLineupSlot.player_id == player_id,
            Tla3bnyMatch.status.in_(_FINISHED),
        )
        .group_by(Tla3bnyMatch.competition_id)
        .all()
    )

    # Aggregate into {comp_id: {stat: count}}.
    per_comp: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for comp_id, etype, cnt in event_rows:
        key = {"goal": "goals", "assist": "assists", "yellow": "yellow_cards", "second_yellow": "red_cards", "red": "red_cards"}[etype]
        per_comp[comp_id][key] += cnt
    for comp_id, cnt in appearance_rows:
        per_comp[comp_id]["appearances"] += cnt

    # Fetch competition names in one query.
    comp_ids = list(per_comp)
    comp_map: dict[int, Tla3bnyCompetition] = {}
    if comp_ids:
        for c in (
            Tla3bnyCompetition.query
            .options(selectinload(Tla3bnyCompetition.season))
            .filter(Tla3bnyCompetition.id.in_(comp_ids))
            .all()
        ):
            comp_map[c.id] = c

    _zero = {"goals": 0, "assists": 0, "yellow_cards": 0, "red_cards": 0, "appearances": 0}

    by_competition = []
    for comp_id, stats in per_comp.items():
        comp = comp_map.get(comp_id)
        row = {**_zero, **stats}
        row["competition_id"] = comp_id
        row["competition_name"] = comp.name if comp else None
        row["season_name"] = (
            (comp.season.name_ar or comp.season.name) if comp and comp.season else None
        )
        by_competition.append(row)

    by_competition.sort(key=lambda x: (x["competition_name"] or ""))

    totals = {k: sum(c[k] for c in by_competition) for k in _zero}

    return jsonify({
        "player_id": player_id,
        "totals": totals,
        "by_competition": by_competition,
    })


@tla3bny_bp.post("/teams/<int:team_id>/players")
@auth.login_required
def create_player(team_id: int):
    """Add a player to the team's squad — the academy's durable global roster.

    This only builds the squad; it does *not* enter the player in any
    competition. Entering players in a competition — with that competition's own
    required papers — is a separate step the academy does per competition:
    ``POST /competition-teams/<entry_id>/players``. Keeping the two apart is what
    lets a team play a new competition (or the same one next season) and submit a
    fresh document set for it without touching last season's registration.
    """
    if not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    Tla3bnyTeam.query.get_or_404(team_id)

    data, files = _read_payload()
    name = (data.get("name") or "").strip()
    if not name:
        return _err("name is required")
    if len(name) > 200:
        return _err("اسم اللاعب طويل جدًا (الحد الأقصى 200 حرف)")
    dob, dob_err = _parse_date_or_error(data.get("dob"))
    if dob_err:
        return _err(dob_err, 400)

    photo = None
    try:
        if files is not None and files.get("photo"):
            photo = save_upload(files.get("photo"), kind="image")
    except ValueError as e:
        return _err(str(e))

    player = Tla3bnyPlayer(
        name=name,
        name_en=(data.get("name_en") or "").strip() or None,
        dob=dob,
        position=(data.get("position") or "").strip() or None,
        sub_position=(data.get("sub_position") or "").strip() or None,
        photo_path=photo,
    )
    db.session.add(player)
    db.session.flush()

    db.session.add(
        Tla3bnyPlayerTeam(
            player_id=player.id,
            team_id=team_id,
            jersey_number=_int(data.get("jersey_number")),
            start_date=_parse_date(data.get("start_date")) or _utcnow().date(),
            status="active",
        )
    )
    db.session.commit()
    return jsonify(player.to_dict(with_files=True)), 201


@tla3bny_bp.get("/competition-teams/<int:entry_id>/registration")
@auth.login_required
def competition_registration(entry_id: int):
    """The per-competition registration screen for the academy: every squad
    player, whether they are entered in *this* competition, and the papers this
    competition requires for each of them (its own set, not the global one)."""
    entry = Tla3bnyCompetitionTeam.query.get_or_404(entry_id)
    if not auth.can_manage_team(auth.current_user(), entry.team_id):
        return _forbid()
    comp = entry.competition
    cage = entry.competition_age or Tla3bnyCompetitionAge.query.filter_by(
        competition_id=entry.competition_id,
        age_category_id=entry.age_category_id,
    ).first()
    required = cage.documents if cage else (comp.documents if comp else [])

    # Registrations for this entry, keyed by player.
    regs = {
        cp.player_id: cp
        for cp in Tla3bnyCompetitionPlayer.query.filter_by(
            competition_team_id=entry.id
        ).all()
    }
    active_count = sum(
        1 for cp in regs.values() if cp.status in ("pending", "approved")
    )

    players = []
    for mem in Tla3bnyPlayerTeam.query.filter_by(
        team_id=entry.team_id, end_date=None, status="active"
    ).all():
        p = mem.player
        if p is None:
            continue
        cp = regs.get(mem.player_id)
        # This registration's papers (if any) plus the player's global identity
        # papers — either satisfies a required document.
        files = list(cp.effective_files) if cp else [
            f for f in p.files if f.competition_player_id is None
        ]
        supplied = {f.label for f in files if f.label}
        players.append({
            "player_id": p.id,
            "player_name": p.name,
            "player_name_en": p.name_en,
            "photo_path": p.photo_path,
            "position": p.position,
            "dob": p.dob.isoformat() if p.dob else None,
            "jersey_number": mem.jersey_number,
            "competition_player_id": cp.id if cp else None,
            "registration_status": cp.status if cp else None,
            "rejection_reason": cp.rejection_reason if cp else None,
            "files": [f.to_dict() for f in files],
            "missing_documents": [d for d in required if d not in supplied],
        })

    admin = auth.is_competition_admin(auth.current_user(), entry.competition_id)
    return jsonify({
        "entry_id": entry.id,
        "competition_id": entry.competition_id,
        "competition_name": comp.name if comp else None,
        "sub_competition_name": cage.name if cage else None,
        "status": entry.status,
        "required_documents": required,
        "max_players": cage.max_players_per_team if cage else None,
        "registered_count": active_count,
        "registration_open": bool(comp and comp.registration_open) and (
            admin or not (cage and cage.registration_deadline_passed)
        ),
        "replacements_open": cage.replacements_open if cage else False,
        "players": players,
    })


@tla3bny_bp.post("/competition-players/<int:cp_id>/documents")
@auth.login_required
def upload_registration_documents(cp_id: int):
    """Upload / refresh the papers for one competition registration.

    Papers are per competition, so they attach to this ``Tla3bnyCompetitionPlayer``
    entry — not the player globally — and never touch another competition's set.
    Refreshing the papers of an already-reviewed registration re-opens it: an
    approved or rejected entry goes back to the organiser as pending.
    """
    cp = Tla3bnyCompetitionPlayer.query.get_or_404(cp_id)
    entry = cp.entry
    if not auth.can_manage_team(auth.current_user(), entry.team_id):
        return _forbid()
    player = cp.player
    if player is None:
        return _err("player not found", 404)
    is_admin = auth.is_competition_admin(auth.current_user(), entry.competition_id)
    # Once this registration is approved, its papers are frozen for the academy:
    # swapping the evidence behind an approved player is the same fraud as swapping
    # the photo. Only the competition's admin (or super admin) may change them —
    # doing so re-opens the review below.
    if cp.status == "approved" and not is_admin:
        return _err("لا يمكن تعديل أوراق لاعب تم اعتماده — تواصل مع إدارة البطولة", 403)
    # Frozen once the deadline passes, except for the competition's own admins.
    cage = entry.competition_age or Tla3bnyCompetitionAge.query.filter_by(
        competition_id=entry.competition_id, age_category_id=entry.age_category_id
    ).first()
    if cage and cage.registration_deadline_passed and not is_admin:
        return _err("انتهى موعد تسجيل اللاعبين في هذه البطولة", 403)

    data, files = _read_payload()
    try:
        _save_documents(player, data, files, competition_player=cp)
    except ValueError as e:
        return _err(str(e))

    # A paper refresh re-opens the review.
    if cp.status in ("approved", "rejected"):
        cp.status = "pending"
        cp.rejection_reason = None
    db.session.commit()
    return jsonify(cp.to_dict(with_files=True))


@tla3bny_bp.post("/competition-players/<int:cp_id>/replace")
@auth.login_required
def replace_competition_player(cp_id: int):
    """Mark an approved competition player as replaced during the replacement window.

    The player stays on the team and retains all their match history; they are
    simply removed from this competition's active roster so a new player can
    take their slot.
    """
    cp = Tla3bnyCompetitionPlayer.query.get_or_404(cp_id)
    entry = cp.entry
    if not auth.can_manage_team(auth.current_user(), entry.team_id):
        return _forbid()
    if cp.status != "approved":
        return _err("Only approved players can be replaced")
    cage = entry.competition_age or Tla3bnyCompetitionAge.query.filter_by(
        competition_id=entry.competition_id,
        age_category_id=entry.age_category_id,
    ).first()
    if not cage or not cage.replacements_open:
        return _err("Replacement window is not open for this sub-competition")
    comp = entry.competition
    if comp and comp.status == "finished":
        return _err("لا يمكن الاستبدال في بطولة منتهية", 409)
    # Lock the quota row to prevent a concurrent replace from bypassing the limit.
    replaced_count = Tla3bnyCompetitionPlayer.query.filter_by(
        competition_team_id=entry.id, status="replaced"
    ).with_for_update().count()
    if replaced_count >= cage.max_replacements:
        return _err(
            f"تم استنفاد حصة الاستبدال ({cage.max_replacements} لاعبين)", 409
        )
    cp.status = "replaced"
    _log("player_replaced", "competition_player", cp.id, {
        "player_id": cp.player_id,
        "player_name": cp.player.name if cp.player else None,
        "team_id": entry.team_id,
        "competition_id": entry.competition_id,
    }, competition_id=entry.competition_id)
    db.session.commit()
    return jsonify(cp.to_dict())


def _player_team_id(player: Tla3bnyPlayer) -> int | None:
    cur = player.current_membership()
    return cur.team_id if cur else None


def _player_edit_locked(player: Tla3bnyPlayer, user) -> str | None:
    """Changing a player's global data (name, photo, DOB, papers…) is frozen for
    the academy in two cases; only the relevant competition's admin (or the super
    admin, who counts as admin everywhere) may still edit. Returns a message if
    the caller is locked out.

      1. The player has been APPROVED in a competition — the identity is frozen so
         the academy can't swap the photo and slip a different player onto the
         approved player's papers. This holds regardless of any deadline.
      2. A competition's player-registration deadline has passed — frozen for the
         academy even while the registration is still only pending.
    """
    regs = Tla3bnyCompetitionPlayer.query.filter(
        Tla3bnyCompetitionPlayer.player_id == player.id,
        Tla3bnyCompetitionPlayer.status.in_(("pending", "approved")),
    ).all()
    for cp in regs:
        entry = cp.entry
        if entry is None:
            continue
        if auth.is_competition_admin(user, entry.competition_id):
            continue  # that competition's admin (and the super admin) may edit
        if cp.status == "approved":
            return "لا يمكن تعديل بيانات لاعب تم اعتماده في بطولة — تواصل مع إدارة البطولة"
        cage = entry.competition_age or Tla3bnyCompetitionAge.query.filter_by(
            competition_id=entry.competition_id,
            age_category_id=entry.age_category_id,
        ).first()
        if cage and cage.registration_deadline_passed:
            return "انتهى موعد تعديل بيانات اللاعبين في هذه البطولة"
    return None


@tla3bny_bp.put("/players/<int:player_id>")
@auth.login_required
def update_player(player_id: int):
    player = Tla3bnyPlayer.query.get_or_404(player_id)
    team_id = _player_team_id(player)
    if team_id is None or not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    locked = _player_edit_locked(player, auth.current_user())
    if locked:
        return _err(locked, 403)
    data, files = _read_payload()

    if data.get("name"):
        new_name = data.get("name").strip()
        if len(new_name) > 200:
            return _err("اسم اللاعب طويل جدًا (الحد الأقصى 200 حرف)")
        player.name = new_name
    if "name_en" in data:
        player.name_en = (data.get("name_en") or "").strip() or None
    if "dob" in data:
        dob, dob_err = _parse_date_or_error(data.get("dob"))
        if dob_err:
            return _err(dob_err, 400)
        player.dob = dob
    if "position" in data:
        player.position = (data.get("position") or "").strip() or None
    if "sub_position" in data:
        player.sub_position = (data.get("sub_position") or "").strip() or None
    if "jersey_number" in data:
        cur = player.current_membership()
        if cur:
            new_num = _int(data.get("jersey_number"))
            if new_num is not None:
                conflict = Tla3bnyPlayerTeam.query.filter(
                    Tla3bnyPlayerTeam.team_id == team_id,
                    Tla3bnyPlayerTeam.jersey_number == new_num,
                    Tla3bnyPlayerTeam.end_date == None,  # noqa: E711
                    Tla3bnyPlayerTeam.player_id != player_id,
                ).first()
                if conflict:
                    return _err(f"رقم القميص {new_num} مستخدم بالفعل في هذا الفريق", 409)
            cur.jersey_number = new_num

    # Detect whether new registration papers were uploaded (material change).
    has_new_docs = files is not None and (
        (hasattr(files, "getlist") and any(
            f and getattr(f, "filename", "") != ""
            for f in files.getlist("documents")
        ))
        or bool(files.get("papers"))
    )
    try:
        if files is not None and files.get("photo"):
            player.photo_path = save_upload(files.get("photo"), kind="image")
        _save_documents(player, data, files)
    except ValueError as e:
        return _err(str(e))

    cur = player.current_membership()
    # Any real change to the player — name, DOB, position, jersey, photo or
    # papers — invalidates existing approvals; the competition admin re-reviews.
    # (Checked before the commit clears the change tracking; a no-op save that
    # changed nothing leaves approvals untouched.)
    player_changed = (
        db.session.is_modified(player)
        or (cur is not None and db.session.is_modified(cur))
        or has_new_docs
    )
    _log("player_updated", "player", player.id, {
        "player_name": player.name,
        "team_id": cur.team_id if cur else None,
        "team_name": cur.team.display_name() if cur and cur.team else None,
    })
    db.session.commit()

    if player_changed:
        Tla3bnyCompetitionPlayer.query.filter(
            Tla3bnyCompetitionPlayer.player_id == player.id,
            Tla3bnyCompetitionPlayer.status.in_(("approved", "rejected")),
        ).update({"status": "pending", "rejection_reason": None})
        db.session.commit()
    return jsonify(player.to_dict(with_files=True))


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
    user = auth.current_user()
    if not auth.can_manage_academy(user, dest.academy_id):
        return _forbid()
    today = _utcnow().date()
    cur = player.current_membership()
    # The mover must also control the player's *current* team — otherwise an
    # academy could pull another academy's player into its own team, ending the
    # victim's membership and deleting their roster entries. Super admin passes both.
    if cur and not auth.can_manage_team(user, cur.team_id):
        return _forbid()
    if cur:
        if cur.team_id == dest_team_id:
            return _err("Player is already on that team")
        old_team_id = cur.team_id
        cur.end_date = _parse_date(data.get("end_date")) or today
        cur.status = "transferred"

        # Remove the player from every competition roster tied to the old team.
        # They are no longer a member, so pending/approved entries are invalid.
        # The destination academy can re-register them in any competition.
        old_entry_ids = [
            e.id for e in
            Tla3bnyCompetitionTeam.query.filter_by(team_id=old_team_id).all()
        ]
        if old_entry_ids:
            Tla3bnyCompetitionPlayer.query.filter(
                Tla3bnyCompetitionPlayer.competition_team_id.in_(old_entry_ids),
                Tla3bnyCompetitionPlayer.player_id == player.id,
            ).delete(synchronize_session=False)

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
    # Block deletion if player has an active competition entry — removing them
    # while approved would silently corrupt the organiser's roster.
    active_entry = Tla3bnyCompetitionPlayer.query.filter(
        Tla3bnyCompetitionPlayer.player_id == player_id,
        Tla3bnyCompetitionPlayer.status.in_(("pending", "approved")),
    ).first()
    if active_entry:
        return _err(
            "لا يمكن حذف لاعب مسجّل في بطولة نشطة — أزِل قيده أولًا أو استخدم نافذة الاستبدال",
            409,
        )
    # Block deletion if player has match events — their goals/cards are part of
    # permanent match records and would become unattributed (NULL player_id) on delete.
    if Tla3bnyMatchEvent.query.filter_by(player_id=player_id).first():
        return _err(
            "لا يمكن حذف لاعب شارك في مباريات — سجلّه محفوظ في سجلات المباريات",
            409,
        )
    player_name = player.name
    db.session.delete(player)
    _log("player_deleted", "player", player_id, {
        "player_name": player_name,
        "team_id": team_id,
    })
    db.session.commit()
    return jsonify({"message": "deleted"})
