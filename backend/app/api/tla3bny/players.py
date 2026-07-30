from collections import defaultdict
from datetime import datetime  # noqa: F401 — kept for type annotations in this file

from flask import jsonify, request
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
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from .audit import _log
from ._helpers import _err, _forbid, _int, _parse_date, _read_payload, _utcnow, save_upload


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


def _save_documents(player: Tla3bnyPlayer, data, files) -> None:
    """Save uploaded registration papers, pairing each with its document label.

    The client sends files under 'documents' and a parallel 'document_labels'
    list (same order) naming which paper each is — birth certificate, school
    letter, national id, health certificate, etc. A legacy single 'papers'
    field is still accepted. Re-uploading a paper replaces the one already held
    under that label, so a player keeps one file per required document.
    """
    if files is None:
        return
    uploaded = files.getlist("documents") if hasattr(files, "getlist") else []
    labels = data.getlist("document_labels") if hasattr(data, "getlist") else []
    if files.get("papers"):
        uploaded = list(uploaded) + [files.get("papers")]
    for i, f in enumerate(uploaded):
        if f is None or f.filename == "":
            continue
        path = save_upload(f, kind="document")
        if not path:
            continue
        label = (labels[i] if i < len(labels) else None) or None
        if label:
            for old in [x for x in player.files if x.label == label]:
                db.session.delete(old)
        db.session.add(
            Tla3bnyPlayerFile(
                player_id=player.id,
                file_path=path,
                original_name=f.filename,
                label=label,
            )
        )
        player.papers_path = path


@tla3bny_bp.get("/players/<int:player_id>")
def get_player(player_id: int):
    """Public profile. The registration papers ride along only for a caller
    allowed to see them (owning academy/team, or a competition admin)."""
    player = Tla3bnyPlayer.query.get_or_404(player_id)
    return jsonify(player.to_dict(with_files=_can_view_player_files(player)))


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
            item["rejection_reason"] = cp.rejection_reason
            item["required_documents"] = comp.documents if comp else []
            supplied = {f.label for f in player.files if f.label}
            item["missing_documents"] = [
                d for d in (comp.documents if comp else []) if d not in supplied
            ]
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
            Tla3bnyMatchEvent.event_type.in_(["goal", "assist", "yellow", "red"]),
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
        key = {"goal": "goals", "assist": "assists", "yellow": "yellow_cards", "red": "red_cards"}[etype]
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
    """Create a player and enqueue them as pending in the team's competitions.

    Registration is gated: the team must be in at least one competition with
    open registration and an available slot (max_players_per_team not reached).
    """
    if not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    Tla3bnyTeam.query.get_or_404(team_id)

    # Gate: team must be registered in at least one competition.
    comp_entries = Tla3bnyCompetitionTeam.query.filter_by(
        team_id=team_id, status="active"
    ).all()
    if not comp_entries:
        return _err(
            "الفريق لم يُضَف لأي بطولة بعد — تواصل مع المنظّم لإضافته أولًا", 403
        )

    # Gate: at least one open competition must still have room.
    has_room = False
    for entry in comp_entries:
        comp = entry.competition
        if not comp or not comp.registration_open:
            continue
        cage = Tla3bnyCompetitionAge.query.filter_by(
            competition_id=entry.competition_id,
            age_category_id=entry.age_category_id,
        ).first()
        cap = cage.max_players_per_team if cage else None
        if cap is None:
            has_room = True
            break
        count = Tla3bnyCompetitionPlayer.query.filter_by(
            competition_team_id=entry.id
        ).count()
        if count < cap:
            has_room = True
            break
    if not has_room:
        return _err(
            "وصل الفريق للحد الأقصى من اللاعبين أو أُغلق التسجيل في جميع البطولات",
            409,
        )

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
        _save_documents(player, data, files)
    except ValueError as e:
        return _err(str(e))

    db.session.add(
        Tla3bnyPlayerTeam(
            player_id=player.id,
            team_id=team_id,
            jersey_number=_int(data.get("jersey_number")),
            start_date=_parse_date(data.get("start_date")) or _utcnow().date(),
            status="active",
        )
    )
    # Auto-enqueue the new player as "pending" in every active competition this
    # team is registered in — the organiser's Approvals tab shows them at once.
    for entry in Tla3bnyCompetitionTeam.query.filter_by(team_id=team_id, status="active"):
        comp = entry.competition
        if not comp or not comp.registration_open:
            continue
        cage = Tla3bnyCompetitionAge.query.filter_by(
            competition_id=entry.competition_id, age_category_id=entry.age_category_id
        ).first()
        cap = cage.max_players_per_team if cage else None
        if cap is not None and Tla3bnyCompetitionPlayer.query.filter_by(
            competition_team_id=entry.id
        ).count() >= cap:
            continue
        db.session.add(Tla3bnyCompetitionPlayer(
            competition_team_id=entry.id, player_id=player.id, status="pending"
        ))
    db.session.commit()
    return jsonify(player.to_dict(with_files=True)), 201


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
        _save_documents(player, data, files)
    except ValueError as e:
        return _err(str(e))
    cur = player.current_membership()
    _log("player_updated", "player", player.id, {
        "player_name": player.name,
        "team_id": cur.team_id if cur else None,
        "team_name": cur.team.display_name() if cur and cur.team else None,
    })
    db.session.commit()
    # Any approved or rejected competition entry must go back to pending so the
    # organiser reviews the updated data before the player competes.
    Tla3bnyCompetitionPlayer.query.filter(
        Tla3bnyCompetitionPlayer.player_id == player.id,
        Tla3bnyCompetitionPlayer.status != "pending",
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
    if not auth.can_manage_academy(auth.current_user(), dest.academy_id):
        return _forbid()
    today = _utcnow().date()
    cur = player.current_membership()
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
    db.session.delete(player)
    db.session.commit()
    return jsonify({"message": "deleted"})
