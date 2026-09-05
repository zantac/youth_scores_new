import csv
import io
import os
import re
import tempfile
import zipfile
from collections import defaultdict
from decimal import Decimal, InvalidOperation

import sqlalchemy as sa
from sqlalchemy import func
from sqlalchemy.orm import joinedload, selectinload

from flask import after_this_request, jsonify, request, send_file

from app.extensions import db, limiter
from app.models import (
    Tla3bnyAgeCategory,
    Tla3bnyCompetition,
    Tla3bnyCompetitionAdmin,
    Tla3bnyCompetitionAge,
    Tla3bnyCompetitionPlayer,
    Tla3bnyCompetitionTeam,
    Tla3bnyGroup,
    Tla3bnyGroupTeam,
    Tla3bnyMatch,
    Tla3bnyMatchEvent,
    Tla3bnyPlayer,
    Tla3bnyPlayerFile,
    Tla3bnySeason,
    Tla3bnyStage,
    Tla3bnyTeam,
    Tla3bnyUser,
    Tla3bnyPlayerTeam,
)
from app.models import codes
from app.services import notifications
from app.services import storage
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from .audit import _log
from ._helpers import (
    _bool,
    _clean_docs,
    _credentials,
    _docs_field,
    _clean_url,
    _clip,
    _err,
    _forbid,
    _int,
    _parse_date,
    _parse_date_or_error,
    _read_payload,
    _save_documents,
    _validate_password,
    save_upload,
)
from .players import _national_id_clash_in_competition, _player_team_id


# The free-text fields of a competition's public info page. Kept in one place so
# create and update always take the same set.
COMPETITION_TEXT_FIELDS = (
    "name",
    "name_en",
    "description",
    "location",
    "info",
    "organizer_name",
    "contact_phone",
    "whatsapp_number",
    "whatsapp_group_url",
    "facebook_url",
    "location_url",
)


def _digits(value: str | None) -> str | None:
    """A phone number reduced to digits, the form wa.me needs. A leading '+' is
    dropped, so '+20 100 123 4567' and '00201001234567' both land somewhere
    dialable."""
    if not value:
        return None
    kept = "".join(ch for ch in value if ch.isdigit())
    return kept or None


@tla3bny_bp.get("/competitions")
def list_competitions():
    q = Tla3bnyCompetition.query.options(
        selectinload(Tla3bnyCompetition.season),
        selectinload(Tla3bnyCompetition.ages).selectinload(Tla3bnyCompetitionAge.age_category),
        selectinload(Tla3bnyCompetition.admins).selectinload(Tla3bnyCompetitionAdmin.user),
    )
    season_id = request.args.get("season_id", type=int)
    if season_id:
        q = q.filter_by(season_id=season_id)
    comps = q.order_by(Tla3bnyCompetition.created_at.desc()).all()
    out = [c.to_dict(with_ages=True) for c in comps]
    # The super admin's panel assigns organisers straight from this list, so it
    # needs to see who is already on each competition.
    user = auth.current_user()
    if user is not None and user.role == "super_admin":
        for data, comp in zip(out, comps):
            data["admins"] = [ca.to_dict() for ca in comp.admins]
    return jsonify(out)


@tla3bny_bp.get("/competitions/<int:comp_id>")
def get_competition(comp_id: int):
    comp = (
        Tla3bnyCompetition.query
        .options(
            selectinload(Tla3bnyCompetition.season),
            selectinload(Tla3bnyCompetition.ages).selectinload(Tla3bnyCompetitionAge.age_category),
            selectinload(Tla3bnyCompetition.ages)
            .selectinload(Tla3bnyCompetitionAge.stages)
            .selectinload(Tla3bnyStage.groups),
            selectinload(Tla3bnyCompetition.admins).selectinload(Tla3bnyCompetitionAdmin.user),
        )
        .filter_by(id=comp_id)
        .first_or_404()
    )
    data = comp.to_dict()
    include_fee = _can_see_fee(comp_id)
    data["ages"] = [
        a.to_dict(with_stages=True, include_fee=include_fee) for a in comp.ages
    ]
    data["admins"] = [ca.to_dict() for ca in comp.admins]
    return jsonify(data)


@tla3bny_bp.get("/competitions/<int:comp_id>/dashboard")
@auth.login_required
def competition_dashboard(comp_id: int):
    """Aggregated stats for the competition organiser's dashboard."""
    if not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    comp = (
        Tla3bnyCompetition.query
        .options(
            selectinload(Tla3bnyCompetition.ages)
            .selectinload(Tla3bnyCompetitionAge.age_category),
        )
        .filter_by(id=comp_id)
        .first_or_404()
    )

    entries = (
        Tla3bnyCompetitionTeam.query
        .options(
            selectinload(Tla3bnyCompetitionTeam.team)
            .selectinload(Tla3bnyTeam.academy),
        )
        .filter_by(competition_id=comp_id, status="active")
        .all()
    )
    entry_ids = [e.id for e in entries]

    # One query for all player statuses, grouped by (entry_id, status).
    player_rows = (
        db.session.query(
            Tla3bnyCompetitionPlayer.competition_team_id,
            Tla3bnyCompetitionPlayer.status,
            func.count().label("cnt"),
        )
        .filter(Tla3bnyCompetitionPlayer.competition_team_id.in_(entry_ids))
        .group_by(
            Tla3bnyCompetitionPlayer.competition_team_id,
            Tla3bnyCompetitionPlayer.status,
        )
        .all()
    ) if entry_ids else []

    # Aggregate into {entry_id: {status: count}}, then derive per-age and totals.
    entry_player_counts: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for entry_id, status, cnt in player_rows:
        entry_player_counts[entry_id][status] = cnt

    # Attribute each team/player/match to a *sub-competition* (competition_age),
    # not just an age category — two sub-competitions can share one age (e.g. two
    # 2014 groups), and lumping them by age would show both totals on each. New
    # rows carry competition_age_id; a legacy row with only age_category_id is
    # mapped to the sole sub-competition of that age when there is exactly one,
    # otherwise left unattributed so it never inflates a specific sub-competition.
    cages_by_age: dict[int, list[int]] = defaultdict(list)
    for cage in comp.ages:
        cages_by_age[cage.age_category_id].append(cage.id)

    def _resolve_cage(cage_id, age_cat_id):
        if cage_id is not None:
            return cage_id
        same = cages_by_age.get(age_cat_id, [])
        return same[0] if len(same) == 1 else None

    entry_cage = {
        e.id: _resolve_cage(e.competition_age_id, e.age_category_id) for e in entries
    }
    cage_player_counts: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    total_counts: dict[str, int] = defaultdict(int)
    for entry_id, counts in entry_player_counts.items():
        cage_id = entry_cage.get(entry_id)
        for status, cnt in counts.items():
            if cage_id is not None:
                cage_player_counts[cage_id][status] += cnt
            total_counts[status] += cnt

    total_matches = Tla3bnyMatch.query.filter_by(competition_id=comp_id).count()
    # A result-entered match has status "completed" (see enter_result); "finished"
    # is an accepted synonym an admin can set manually. Count both.
    played_matches = Tla3bnyMatch.query.filter(
        Tla3bnyMatch.competition_id == comp_id,
        Tla3bnyMatch.status.in_(("finished", "completed")),
    ).count()
    goals = (
        Tla3bnyMatchEvent.query.filter_by(event_type="goal")
        .join(Tla3bnyMatch, Tla3bnyMatchEvent.match_id == Tla3bnyMatch.id)
        .filter(Tla3bnyMatch.competition_id == comp_id)
        .count()
    )

    # One query for match counts by (competition_age_id, age_category_id, status),
    # resolved to a sub-competition the same way team/player counts are.
    match_rows = (
        db.session.query(
            Tla3bnyMatch.competition_age_id,
            Tla3bnyMatch.age_category_id,
            Tla3bnyMatch.status,
            func.count().label("cnt"),
        )
        .filter(Tla3bnyMatch.competition_id == comp_id)
        .group_by(
            Tla3bnyMatch.competition_age_id,
            Tla3bnyMatch.age_category_id,
            Tla3bnyMatch.status,
        )
        .all()
    )
    cage_match_counts: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for cage_id, age_cat_id, status, cnt in match_rows:
        rid = _resolve_cage(cage_id, age_cat_id)
        if rid is not None:
            cage_match_counts[rid][status] += cnt

    # Per-sub-competition breakdown, sorted by age_category year.
    def _sort_key(c):
        try:
            return int(c.age_category.label) if c.age_category else 0
        except (ValueError, TypeError):
            return 0

    ages_data = []
    for cage in sorted(comp.ages, key=_sort_key):
        p = cage_player_counts[cage.id]
        m = cage_match_counts[cage.id]
        cage_entry_ids = [e.id for e in entries if entry_cage.get(e.id) == cage.id]
        ages_data.append({
            "competition_age_id": cage.id,
            "age_category": cage.age_category.label if cage.age_category else None,
            "name": cage.name,
            "teams": len(cage_entry_ids),
            "players_approved": p.get("approved", 0),
            "players_pending": p.get("pending", 0),
            "matches_total": sum(m.values()),
            "matches_played": m.get("completed", 0) + m.get("finished", 0),
        })

    # Teams with pending players — derived from pre-computed counts, no extra queries.
    pending_teams = []
    for entry in entries:
        pending = entry_player_counts[entry.id].get("pending", 0)
        if pending:
            pending_teams.append({
                "team_id": entry.team_id,
                "team_name": entry.team.display_name() if entry.team else None,
                "academy_name": (
                    entry.team.academy.name
                    if entry.team and entry.team.academy
                    else None
                ),
                "pending": pending,
            })
    pending_teams.sort(key=lambda x: -x["pending"])

    return jsonify({
        "counts": {
            "teams": len(entries),
            "players_approved": total_counts.get("approved", 0),
            "players_pending": total_counts.get("pending", 0),
            "players_rejected": total_counts.get("rejected", 0),
            "matches_total": total_matches,
            "matches_played": played_matches,
            "goals": goals,
        },
        "ages": ages_data,
        "pending_teams": pending_teams,
    })


@tla3bny_bp.post("/competitions/<int:comp_id>/clone")
@auth.super_admin_required
def clone_competition(comp_id: int):
    """Clone a competition into a different season.

    Copies the competition's text fields, sub-competitions (ages), stages, and
    groups into a fresh competition linked to the given season. Teams, players,
    matches, admins, and news are NOT copied — the new season starts blank.
    """
    source = Tla3bnyCompetition.query.get_or_404(comp_id)
    data = request.get_json(silent=True) or {}
    season_id = _int(data.get("season_id"))
    if not season_id:
        return _err("season_id is required")
    target_season = Tla3bnySeason.query.get(season_id)
    if not target_season:
        return _err("Season not found", 404)

    new_comp = Tla3bnyCompetition(
        season_id=season_id,
        season_number=source.season_number,
        name=source.name,
        name_en=source.name_en,
        description=source.description,
        logo_path=source.logo_path,
        location=source.location,
        start_date=None,
        end_date=None,
        status="draft",
        required_documents=list(source.required_documents) if source.required_documents else None,
        info=source.info,
        organizer_name=source.organizer_name,
        organizer_photo_path=source.organizer_photo_path,
        contact_phone=source.contact_phone,
        whatsapp_number=source.whatsapp_number,
        whatsapp_group_url=source.whatsapp_group_url,
        facebook_url=source.facebook_url,
        location_url=source.location_url,
        registration_open=False,
        max_players=source.max_players,
        max_ads=source.max_ads,
        ads_enabled=source.ads_enabled,
    )
    db.session.add(new_comp)
    db.session.flush()

    for age in source.ages:
        new_age = Tla3bnyCompetitionAge(
            competition_id=new_comp.id,
            age_category_id=age.age_category_id,
            name=age.name,
            player_registration_deadline=None,
            max_players_per_team=age.max_players_per_team,
            lineup_size=age.lineup_size,
            players_on_pitch=age.players_on_pitch,
            max_substitutes=age.max_substitutes,
            num_periods=age.num_periods,
            period_minutes=age.period_minutes,
            lineup_deadline_minutes=age.lineup_deadline_minutes,
            required_documents=list(age.required_documents) if age.required_documents else None,
        )
        db.session.add(new_age)
        db.session.flush()

        for stage in age.stages:
            new_stage = Tla3bnyStage(
                competition_age_id=new_age.id,
                name=stage.name,
                stage_order=stage.stage_order,
                type=stage.type,
                carries_points=stage.carries_points,
            )
            db.session.add(new_stage)
            db.session.flush()

            for group in stage.groups:
                db.session.add(Tla3bnyGroup(
                    stage_id=new_stage.id,
                    name=group.name,
                ))

    db.session.commit()
    return jsonify(new_comp.to_dict(with_ages=True)), 201


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
    _, docs = _docs_field(data)
    status = data.get("status") or "draft"
    if status not in codes.TLA3BNY_COMPETITION_STATUS:
        return _err("Invalid competition status", 400)
    comp = Tla3bnyCompetition(
        season_id=season_id,
        name=name,
        logo_path=logo,
        start_date=_parse_date(data.get("start_date")),
        end_date=_parse_date(data.get("end_date")),
        status=status,
        required_documents=docs,
    )
    _apply_competition_text(comp, data)
    _apply_season_number(comp, data)
    if "registration_open" in data:
        comp.registration_open = _bool(data.get("registration_open"), True)
    if "exclusive_entry" in data:
        comp.exclusive_entry = _bool(data.get("exclusive_entry"), False)
    err = _apply_max_players(comp, data)
    if err:
        return err
    _apply_ad_controls(comp, data)  # creator is the super admin
    db.session.add(comp)
    db.session.commit()
    # Announce joinable competitions to academies (drafts stay quiet).
    if comp.status != "draft":
        notifications.notify_tla3bny_new_competition(comp)
    return jsonify(comp.to_dict()), 201


def _apply_ad_controls(comp: Tla3bnyCompetition, data) -> None:
    """Apply the super-admin sponsor-ad controls (``max_ads`` allowance and the
    ``ads_enabled`` kill switch). Only the super admin may change these — a
    competition admin must not raise their own paid allowance."""
    user = auth.current_user()
    if not (user and user.role == "super_admin"):
        return
    if "max_ads" in data:
        comp.max_ads = max(0, _int(data.get("max_ads"), comp.max_ads) or 0)
    if "ads_enabled" in data:
        comp.ads_enabled = _bool(data.get("ads_enabled"), comp.ads_enabled)

def _apply_season_number(comp: Tla3bnyCompetition, data) -> None:
    """Set the competition's edition/season number (الموسم) if the caller sent it.
    An empty/zero/invalid value clears it; a positive whole number sets it."""
    if "season_number" not in data:
        return
    n = _int(data.get("season_number"))
    comp.season_number = n if (n and n > 0) else None


def _apply_max_players(comp: Tla3bnyCompetition, data) -> None:
    """Set the competition-wide contributor cap if the caller sent it. An empty
    value clears the cap (unlimited). Returns an error response on a bad value,
    else None."""
    if "max_players" not in data:
        return None
    raw = data.get("max_players")
    if raw is None or str(raw).strip() == "":
        comp.max_players = None
        return None
    value = _int(raw)
    if value is None or value < 1:
        return _err("'max_players' must be a positive whole number", 400)
    comp.max_players = value
    return None


# URL fields get scheme-sanitized (block javascript:/data:); long-form fields
# get a generous length ceiling, the rest a short single-line cap.
_COMPETITION_URL_FIELDS = {"whatsapp_group_url", "facebook_url", "location_url"}
_COMPETITION_TEXT_MAX = {"description": 20000, "info": 20000}


def _apply_competition_text(comp: Tla3bnyCompetition, data) -> None:
    """Copy whichever info-page fields the caller sent onto the competition."""
    for field in COMPETITION_TEXT_FIELDS:
        if field not in data:
            continue
        raw = data.get(field)
        if field in _COMPETITION_URL_FIELDS:
            value = _clean_url(raw)
        else:
            value = _clip(raw, _COMPETITION_TEXT_MAX.get(field, 255))
        if field == "whatsapp_number":
            value = _digits(value)
        setattr(comp, field, value)


@tla3bny_bp.put("/competitions/<int:comp_id>")
@auth.login_required
def update_competition(comp_id: int):
    if not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    comp = Tla3bnyCompetition.query.get_or_404(comp_id)
    data, files = _read_payload()
    _apply_competition_text(comp, data)
    _apply_season_number(comp, data)
    if not comp.name:
        return _err("name is required")
    if "status" in data and data.get("status"):
        if data.get("status") not in codes.TLA3BNY_COMPETITION_STATUS:
            return _err("Invalid competition status", 400)
        comp.status = data.get("status")
    if "registration_open" in data:
        comp.registration_open = _bool(data.get("registration_open"), comp.registration_open)
    if "exclusive_entry" in data:
        comp.exclusive_entry = _bool(data.get("exclusive_entry"), comp.exclusive_entry)
    if "start_date" in data:
        sd, sd_err = _parse_date_or_error(data.get("start_date"))
        if sd_err:
            return _err(sd_err, 400)
        comp.start_date = sd
    if "end_date" in data:
        ed, ed_err = _parse_date_or_error(data.get("end_date"))
        if ed_err:
            return _err(ed_err, 400)
        comp.end_date = ed
    err = _apply_max_players(comp, data)
    if err:
        return err
    _apply_ad_controls(comp, data)  # no-op unless the caller is the super admin
    present, docs = _docs_field(data)
    if present:
        comp.required_documents = docs
    try:
        if files is not None and files.get("logo"):
            comp.logo_path = save_upload(files.get("logo"), kind="image")
        if files is not None and files.get("organizer_photo"):
            comp.organizer_photo_path = save_upload(files.get("organizer_photo"), kind="image")
    except ValueError as e:
        return _err(str(e))
    # An explicit empty organizer_photo_path (with no new file) clears the photo.
    if ("organizer_photo_path" in data
            and not (data.get("organizer_photo_path") or "").strip()
            and not (files is not None and files.get("organizer_photo"))):
        comp.organizer_photo_path = None
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
@limiter.limit("20 per hour")
@auth.login_required
def add_competition_admin(comp_id: int):
    """Assign an organiser to this competition.

    The super admin, or an existing organiser of this competition, may do it —
    so a competition's organisers can bring in co-organisers themselves. The
    username may be one that already exists (an organiser running several
    competitions) or a brand new one, in which case a password creates it.
    """
    actor = auth.current_user()
    # Only a competition owner (super admin) manages the organizer roster now, so a
    # regular/data-entry organizer can't add or remove co-organizers.
    if not auth.is_competition_owner(actor, comp_id):
        return _forbid()
    is_super = actor.role == "super_admin"
    Tla3bnyCompetition.query.get_or_404(comp_id)
    data = request.get_json(silent=True) or {}
    username, password = _credentials(data)
    if not username:
        return _err("username is required")
    user = Tla3bnyUser.by_login(username)
    if user is None:
        if not password:
            return _err("password is required for a new organizer")
        pw_err = _validate_password(password)
        if pw_err:
            return _err(pw_err)
        user = Tla3bnyUser(
            username=username,
            email=username if "@" in username else None,
            role="competition_admin",
            status="active",
            name=(data.get("name") or "").strip() or None,
        )
        user.set_password(password)
        db.session.add(user)
        db.session.flush()
    elif user.role not in ("competition_admin", "super_admin"):
        return _err("That account is not a competition admin", 409)
    elif password and user.role == "competition_admin":
        # Re-assigning with a password doubles as "reset their password", the
        # only way an organiser who forgot theirs gets back in. That password is
        # shared across every competition the organiser runs, so a competition
        # admin may reset it only when this organiser runs no *other* competition
        # — otherwise the reset would hand over those competitions too, and only
        # the super admin may do it. (Never resets a super_admin either.)
        may_reset = is_super
        if not may_reset:
            runs_other = Tla3bnyCompetitionAdmin.query.filter(
                Tla3bnyCompetitionAdmin.user_id == user.id,
                Tla3bnyCompetitionAdmin.competition_id != comp_id,
            ).first()
            if runs_other is not None:
                return _err(
                    "لا يمكنك تغيير كلمة مرور منظم يدير بطولات أخرى — اطلب من "
                    "السوبر أدمن.",
                    403,
                )
            may_reset = True
        if may_reset:
            pw_err = _validate_password(password)
            if pw_err:
                return _err(pw_err)
            user.set_password(password)
    if not Tla3bnyCompetitionAdmin.query.filter_by(
        competition_id=comp_id, user_id=user.id
    ).first():
        # The competition's very first organizer becomes its owner (super admin);
        # everyone added after is a regular organizer until the owner promotes them.
        first = Tla3bnyCompetitionAdmin.query.filter_by(competition_id=comp_id).first() is None
        db.session.add(Tla3bnyCompetitionAdmin(
            competition_id=comp_id, user_id=user.id, is_owner=first))
    db.session.commit()
    return jsonify({"message": "assigned", "user": user.to_dict()}), 201


@tla3bny_bp.delete("/competitions/<int:comp_id>/admins/<int:user_id>")
@auth.login_required
def remove_competition_admin(comp_id: int, user_id: int):
    actor = auth.current_user()
    # Only a competition owner (super admin) removes organizers.
    if not auth.is_competition_owner(actor, comp_id):
        return _forbid()
    ca = Tla3bnyCompetitionAdmin.query.filter_by(
        competition_id=comp_id, user_id=user_id
    ).first_or_404()
    # An owner (competition super admin) can only be removed by the SITE super
    # admin — so a regular organizer, or even a co-owner, can't remove the owner.
    if ca.is_owner and actor.role != "super_admin":
        return _err("لا يمكن إزالة المشرف العام للبطولة — يتطلب مشرف الموقع.", 403)
    # A competition admin must not leave the competition with no organiser (they
    # would lock themselves and every co-organiser out). The super admin can,
    # since they retain global access and can reassign anyone afterwards.
    if actor.role != "super_admin":
        remaining = Tla3bnyCompetitionAdmin.query.filter_by(
            competition_id=comp_id
        ).count()
        if remaining <= 1:
            return _err(
                "لا يمكن إزالة آخر منظم للبطولة. أضف منظمًا آخر أولًا.",
                409,
            )
    db.session.delete(ca)
    db.session.commit()
    return jsonify({"message": "removed"})


@tla3bny_bp.put("/competitions/<int:comp_id>/admins/<int:user_id>")
@auth.login_required
def set_competition_admin_permissions(comp_id: int, user_id: int):
    """Set an organizer's permissions / ownership. Permissions (can_remove_punishments,
    can_chat) are set by a competition owner (super admin). Ownership (is_owner) is
    set only by the SITE super admin, so owners are designated centrally."""
    actor = auth.current_user()
    if not auth.is_competition_owner(actor, comp_id):
        return _forbid()
    ca = Tla3bnyCompetitionAdmin.query.filter_by(
        competition_id=comp_id, user_id=user_id
    ).first_or_404()
    data = request.get_json(silent=True) or {}
    if "is_owner" in data:
        if actor.role != "super_admin":
            return _err("تعيين المشرف العام يتطلب مشرف الموقع.", 403)
        ca.is_owner = _bool(data.get("is_owner"))
    if "can_remove_punishments" in data:
        ca.can_remove_punishments = _bool(data.get("can_remove_punishments"))
    if "can_chat" in data:
        ca.can_chat = _bool(data.get("can_chat"))
    db.session.commit()
    return jsonify(ca.to_dict())


# ── competition ages + rules ─────────────────────────────────────────────────
_RULE_FIELDS = (
    "max_players_per_team",
    "lineup_size",
    "players_on_pitch",
    "max_substitutes",
    "num_periods",
    "period_minutes",
    "lineup_deadline_minutes",
    "max_replacements",
)

# Minimum and maximum allowed value for each numeric rule field. Upper bounds
# stop an absurd value (e.g. a billion-player cap) from turning team registration
# into a mass-insert, or breaking lineup/period logic.
_RULE_MINIMUMS = {
    "max_players_per_team": 1,
    "lineup_size": 1,
    "players_on_pitch": 1,
    "max_substitutes": 0,
    "num_periods": 1,
    "period_minutes": 1,
    "lineup_deadline_minutes": 0,
    "max_replacements": 0,
}
_RULE_MAXIMUMS = {
    "max_players_per_team": 100,
    "lineup_size": 40,
    "players_on_pitch": 25,
    "max_substitutes": 40,
    "num_periods": 10,
    "period_minutes": 120,
    "lineup_deadline_minutes": 100_000,  # ~10 weeks, in minutes
    "max_replacements": 100,
}


def _can_see_fee(comp_id: int) -> bool:
    """The per-team subscription fee is for academies deciding whether to enter,
    and for the organizers who set it — not the anonymous public. True for an
    academy account or any admin of this competition."""
    user = auth.current_user()
    if user is None:
        return False
    return user.role == "academy" or auth.is_competition_admin(user, comp_id)


def _parse_fee(value) -> Decimal | None:
    """A non-negative money amount, or None to clear it. Rejects junk/negatives."""
    if value is None or value == "":
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    if amount < 0:
        return None
    return amount


def _apply_extra_time(cage, data) -> None:
    """Extra time is optional: a blank or non-positive value clears it, so a level
    knockout tie goes straight to penalties. Values are clamped to sane caps."""
    for field, cap in (("et_num_periods", 4), ("et_period_minutes", 60)):
        if field in data:
            v = _int(data.get(field))
            setattr(cage, field, min(v, cap) if v and v > 0 else None)


def _validate_rule_fields(data: dict) -> str | None:
    """Return an error message if any rule field is out of range, else None."""
    for f, minimum in _RULE_MINIMUMS.items():
        if f not in data:
            continue
        val = _int(data.get(f))
        if val is None:
            continue
        if val < minimum:
            return f"'{f}' must be ≥ {minimum} (got {val})"
        maximum = _RULE_MAXIMUMS.get(f)
        if maximum is not None and val > maximum:
            return f"'{f}' must be ≤ {maximum} (got {val})"
    return None


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
    rule_err = _validate_rule_fields(data)
    if rule_err:
        return _err(rule_err, 400)
    cage = Tla3bnyCompetitionAge(
        competition_id=comp_id,
        age_category_id=age_id,
        name=(data.get("name") or "").strip() or None,
        description=(data.get("description") or "").strip() or None,
        organizer_name=_clip(data.get("organizer_name"), 200),
        field_size=_clip(data.get("field_size"), 100),
        player_registration_deadline=_parse_date(data.get("player_registration_deadline")),
    )
    if "subscription_fee" in data:
        cage.subscription_fee = _parse_fee(data.get("subscription_fee"))
    for f in _RULE_FIELDS:
        if f in data and _int(data.get(f)) is not None:
            setattr(cage, f, _int(data.get(f)))
    _apply_extra_time(cage, data)
    if "required_documents" in data:
        cage.required_documents = _clean_docs(data.get("required_documents"))
    if "replacements_open" in data:
        cage.replacements_open = bool(data.get("replacements_open"))
    if "formation_required" in data:
        cage.formation_required = bool(data.get("formation_required"))
    db.session.add(cage)
    db.session.commit()
    return jsonify(cage.to_dict(include_fee=True)), 201


@tla3bny_bp.put("/competition-ages/<int:cage_id>")
@auth.login_required
def update_competition_age(cage_id: int):
    cage = Tla3bnyCompetitionAge.query.get_or_404(cage_id)
    if not auth.is_competition_admin(auth.current_user(), cage.competition_id):
        return _forbid()
    data = request.get_json(silent=True) or {}
    rule_err = _validate_rule_fields(data)
    if rule_err:
        return _err(rule_err, 400)
    if "name" in data:
        cage.name = (data.get("name") or "").strip() or None
    if "description" in data:
        cage.description = (data.get("description") or "").strip() or None
    if "organizer_name" in data:
        cage.organizer_name = _clip(data.get("organizer_name"), 200)
    if "field_size" in data:
        cage.field_size = _clip(data.get("field_size"), 100)
    if "organizer_photo_path" in data and not (data.get("organizer_photo_path") or "").strip():
        # The photo is set only via the multipart upload endpoint; an empty value
        # here is how the form clears it (the actual file is uploaded separately).
        cage.organizer_photo_path = None
    if "subscription_fee" in data:
        cage.subscription_fee = _parse_fee(data.get("subscription_fee"))
    if "player_registration_deadline" in data:
        cage.player_registration_deadline = _parse_date(data.get("player_registration_deadline"))
    for f in _RULE_FIELDS:
        if f in data and _int(data.get(f)) is not None:
            setattr(cage, f, _int(data.get(f)))
    _apply_extra_time(cage, data)
    if "required_documents" in data:
        cage.required_documents = _clean_docs(data.get("required_documents"))
    if "replacements_open" in data:
        cage.replacements_open = bool(data.get("replacements_open"))
    if "formation_required" in data:
        cage.formation_required = bool(data.get("formation_required"))
    db.session.commit()
    return jsonify(cage.to_dict(include_fee=True))


@tla3bny_bp.post("/competition-ages/<int:cage_id>/organizer-photo")
@auth.login_required
def set_competition_age_organizer_photo(cage_id: int):
    """Set (or replace) this sub-competition's organizer photo. Multipart, so it
    is its own endpoint rather than the JSON create/update: send the image under
    ``photo``. Clearing the photo is done through the JSON update (empty
    ``organizer_photo_path``)."""
    cage = Tla3bnyCompetitionAge.query.get_or_404(cage_id)
    if not auth.is_competition_admin(auth.current_user(), cage.competition_id):
        return _forbid()
    _data, files = _read_payload()
    if files is None or not files.get("photo"):
        return _err("لم يتم إرفاق صورة", 400)
    try:
        cage.organizer_photo_path = save_upload(files.get("photo"), kind="image")
    except ValueError as e:
        return _err(str(e))
    db.session.commit()
    return jsonify(cage.to_dict(include_fee=True))


@tla3bny_bp.delete("/competition-ages/<int:cage_id>")
@auth.login_required
def delete_competition_age(cage_id: int):
    cage = Tla3bnyCompetitionAge.query.get_or_404(cage_id)
    if not auth.is_competition_admin(auth.current_user(), cage.competition_id):
        return _forbid()
    # The match / team-entry FKs to a sub-competition are SET NULL, so deleting a
    # cage with live fixtures or registered teams silently detaches them (matches
    # keep counting in standings under age_category_id but lose their rules, and
    # entries lose their sub-comp link). Block it, like delete_team does for a
    # team that has played — remove the fixtures / teams first.
    if Tla3bnyMatch.query.filter_by(competition_age_id=cage_id).first():
        return _err("لا يمكن حذف فئة لها مباريات. احذف مبارياتها أولًا.", 409)
    if Tla3bnyCompetitionTeam.query.filter_by(competition_age_id=cage_id).first():
        return _err("لا يمكن حذف فئة مسجّل بها فرق. أزل الفرق أولًا.", 409)
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


def _validate_stage_team(stage: Tla3bnyStage, team_id: int) -> str | None:
    """A team may only be placed in a stage/group if it is an active registered
    entry in that stage's competition *and* its age. Without this, fixtures get
    generated between teams that never registered / are the wrong age, corrupting
    standings and the bracket. Returns an error message, or None if valid."""
    cage = stage.competition_age
    if cage is None:
        return "Stage is not attached to a sub-competition"
    entry = Tla3bnyCompetitionTeam.query.filter_by(
        competition_id=cage.competition_id,
        team_id=team_id,
        age_category_id=cage.age_category_id,
        status="active",
    ).first()
    if entry is None:
        return "Team is not an active registered entry in this competition/age"
    return None


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


@tla3bny_bp.route("/groups/<int:group_id>", methods=["PUT", "DELETE"])
@auth.login_required
def group_endpoint(group_id: int):
    g = Tla3bnyGroup.query.get_or_404(group_id)
    if not auth.is_competition_admin(auth.current_user(), _stage_comp_id(g.stage)):
        return _forbid()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        g.name = (data.get("name") or "").strip() or None
        db.session.commit()
        return jsonify(g.to_dict())
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
    err = _validate_stage_team(g.stage, team_id)
    if err:
        return _err(err, 409)
    # A team may sit in only one group per stage — two groups would show it in
    # two tables and generate its fixtures twice.
    for other in g.stage.groups:
        if Tla3bnyGroupTeam.query.filter_by(group_id=other.id, team_id=team_id).first():
            return _err("Team is already in a group of this stage", 409)
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


@tla3bny_bp.post("/stages/<int:stage_id>/teams")
@auth.login_required
def add_stage_team(stage_id: int):
    """Add a team to a league or knockout stage (flat pool, no named groups).

    Group stages use named groups instead — assign teams there via the group-team
    endpoints. Only the competition admin may call this.
    """
    stage = Tla3bnyStage.query.get_or_404(stage_id)
    if stage.type == "group":
        return _err("Group stages use named groups — add teams via the group-team endpoints", 400)
    if not auth.is_competition_admin(auth.current_user(), _stage_comp_id(stage)):
        return _forbid()
    team_id = _int((request.get_json(silent=True) or {}).get("team_id"))
    if not team_id or not Tla3bnyTeam.query.get(team_id):
        return _err("valid team_id is required")
    err = _validate_stage_team(stage, team_id)
    if err:
        return _err(err, 409)
    # Reject duplicate (team already in any group of this stage).
    for g in stage.groups:
        if Tla3bnyGroupTeam.query.filter_by(group_id=g.id, team_id=team_id).first():
            return _err("Team is already in this stage", 409)
    # Find or auto-create the single pool group for this stage.
    pool = stage.groups[0] if stage.groups else None
    if pool is None:
        pool = Tla3bnyGroup(stage_id=stage_id, name=None)
        db.session.add(pool)
        db.session.flush()
    db.session.add(Tla3bnyGroupTeam(group_id=pool.id, team_id=team_id))
    db.session.commit()
    return jsonify({"team_id": team_id, "group_id": pool.id}), 201


@tla3bny_bp.delete("/stages/<int:stage_id>/teams/<int:team_id>")
@auth.login_required
def remove_stage_team(stage_id: int, team_id: int):
    """Remove a team from a knockout stage (across all pool groups)."""
    stage = Tla3bnyStage.query.get_or_404(stage_id)
    if not auth.is_competition_admin(auth.current_user(), _stage_comp_id(stage)):
        return _forbid()
    removed = False
    for g in stage.groups:
        gt = Tla3bnyGroupTeam.query.filter_by(group_id=g.id, team_id=team_id).first()
        if gt:
            db.session.delete(gt)
            removed = True
    if not removed:
        return _err("Team not found in this stage", 404)
    db.session.commit()
    return jsonify({"message": "removed"})


# ── competition registration + roster approval ───────────────────────────────
@tla3bny_bp.get("/competitions/<int:comp_id>/teams")
def list_competition_teams(comp_id: int):
    is_admin = auth.is_competition_admin(auth.current_user(), comp_id)
    q = Tla3bnyCompetitionTeam.query.filter_by(competition_id=comp_id)
    if not is_admin:
        # Public view: only active teams.
        q = q.filter_by(status="active")
    age_id = request.args.get("age_category_id", type=int)
    if age_id:
        q = q.filter_by(age_category_id=age_id)
    cage_id = request.args.get("competition_age_id", type=int)
    cage: "Tla3bnyCompetitionAge | None" = None
    if cage_id:
        cage = Tla3bnyCompetitionAge.query.get(cage_id)
        if cage:
            # Include teams explicitly in this sub-comp, or (for legacy rows that
            # pre-date competition_age_id) teams with no sub-comp assigned whose
            # age matches this sub-comp's age.
            q = q.filter(
                sa.or_(
                    Tla3bnyCompetitionTeam.competition_age_id == cage_id,
                    sa.and_(
                        Tla3bnyCompetitionTeam.competition_age_id.is_(None),
                        Tla3bnyCompetitionTeam.age_category_id == cage.age_category_id,
                    ),
                )
            )
        else:
            q = q.filter_by(competition_age_id=cage_id)
    entries = q.all()
    # NB: legacy rows with a NULL competition_age_id are matched by the OR
    # fallback above; we deliberately do not back-fill/commit here — a GET must
    # not write (it races concurrent readers and breaks on read replicas).
    with_roster = request.args.get("roster") == "1"
    # Papers are for this competition's admin panel only, never the public list.
    return jsonify(
        [
            e.to_dict(with_roster=with_roster, with_files=is_admin)
            for e in entries
        ]
    )


@tla3bny_bp.post("/competitions/<int:comp_id>/teams")
@auth.login_required
def register_team(comp_id: int):
    """A competition admin registers a team (its age must run in this comp)."""
    if not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    comp = Tla3bnyCompetition.query.get_or_404(comp_id)
    data = request.get_json(silent=True) or {}
    team_id = _int(data.get("team_id"))
    team = Tla3bnyTeam.query.get(team_id) if team_id else None
    if team is None:
        return _err("valid team_id is required")
    # Accept an explicit sub-competition; fall back to first matching age.
    cage_id = _int(data.get("competition_age_id"))
    if cage_id:
        cage = Tla3bnyCompetitionAge.query.filter_by(
            id=cage_id, competition_id=comp_id
        ).first()
        if not cage:
            return _err("Sub-competition not found", 404)
        if cage.age_category_id != team.age_category_id:
            return _err("Team age does not match sub-competition age", 409)
    else:
        cage = Tla3bnyCompetitionAge.query.filter_by(
            competition_id=comp_id, age_category_id=team.age_category_id
        ).first()
        if not cage:
            return _err("This competition does not run the team's age", 409)
    if Tla3bnyCompetitionTeam.query.filter_by(
        competition_id=comp_id, team_id=team_id
    ).first():
        return _err("Team already registered", 409)
    entry = Tla3bnyCompetitionTeam(
        competition_id=comp_id, team_id=team_id,
        age_category_id=team.age_category_id,
        competition_age_id=cage.id,
    )
    db.session.add(entry)
    db.session.flush()  # get entry.id before auto-enqueue
    # Auto-enqueue all existing active players as pending for the organiser to approve.
    if comp.registration_open:
        cap = cage.max_players_per_team if cage else None
        count = 0
        for mem in Tla3bnyPlayerTeam.query.filter_by(
            team_id=team_id, end_date=None, status="active"
        ):
            if cap is not None and count >= cap:
                break
            db.session.add(Tla3bnyCompetitionPlayer(
                competition_team_id=entry.id, player_id=mem.player_id, status="pending"
            ))
            count += 1
    db.session.commit()
    notifications.notify_tla3bny_team_registered(entry)
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
    user = auth.current_user()
    with_files = auth.is_competition_admin(
        user, entry.competition_id
    ) or auth.can_manage_team(user, entry.team_id)
    return jsonify(entry.to_dict(with_roster=True, with_files=with_files))


@tla3bny_bp.post("/competition-teams/<int:entry_id>/players")
@auth.login_required
def add_roster_player(entry_id: int):
    """The team's academy/coach enters one of its squad players in this
    competition — pending approval by the competition admin.

    This competition's required papers may ride along (multipart ``documents`` +
    ``document_labels``); they are stored against this registration only, so a
    new competition — or the same one next season — gets its own fresh set. More
    papers can be added later via ``POST /competition-players/<id>/documents``.
    """
    entry = Tla3bnyCompetitionTeam.query.get_or_404(entry_id)
    if not auth.can_manage_team(auth.current_user(), entry.team_id):
        return _forbid()
    data, files = _read_payload()
    player_id = _int(data.get("player_id"))
    player = Tla3bnyPlayer.query.get(player_id) if player_id else None
    if player is None:
        return _err("valid player_id is required")
    if _player_team_id(player) != entry.team_id:
        return _err("Player is not on this team", 409)
    if Tla3bnyCompetitionPlayer.query.filter_by(
        competition_team_id=entry_id, player_id=player_id
    ).first():
        return _err("Player already on the roster", 409)

    # One person, one academy, per competition. The national ID identifies the
    # real player, so if the same ID is already actively entered on any roster in
    # this competition — by this academy's other team or a rival academy — this is
    # the same child being double-registered, which the rule forbids. Legacy
    # players predating the field have no ID to match on, so require one first.
    if not player.national_id:
        return _err(
            "أضِف الرقم القومي للاعب من ملفه أولًا قبل تسجيله في البطولة", 409
        )
    clash = _national_id_clash_in_competition(player, entry.competition_id)
    if clash is not None:
        other = clash.entry.team.academy if clash.entry and clash.entry.team else None
        where = f" ({other.name})" if other else ""
        return _err(
            "هذا اللاعب (بنفس الرقم القومي) مسجّل بالفعل في هذه البطولة"
            f" مع أكاديمية أخرى{where} — لا يمكن تسجيله مرتين في نفس البطولة",
            409,
        )

    # Use the entry's own sub-competition (fall back to age match only for legacy
    # rows) so a cap from a different sub-competition sharing this age isn't applied.
    cage = entry.competition_age or Tla3bnyCompetitionAge.query.filter_by(
        competition_id=entry.competition_id, age_category_id=entry.age_category_id
    ).first()
    # Freeze the roster once the registration deadline passes; the competition's
    # own admins may still add.
    if (cage and cage.registration_deadline_passed
            and not auth.is_competition_admin(auth.current_user(), entry.competition_id)):
        return _err("انتهى موعد تسجيل اللاعبين في هذه البطولة", 403)
    cap = cage.max_players_per_team if cage else None
    if cap is not None:
        # Lock the entry row so concurrent adds to this roster serialize — the
        # count-then-insert below would otherwise let two requests both pass the
        # cap check and overshoot max_players_per_team.
        db.session.query(Tla3bnyCompetitionTeam.id).filter_by(
            id=entry_id
        ).with_for_update().first()
        # Count only active (pending + approved) rows — rejected/replaced players
        # don't occupy a slot, matching every other cap check in the module.
        count = Tla3bnyCompetitionPlayer.query.filter(
            Tla3bnyCompetitionPlayer.competition_team_id == entry_id,
            Tla3bnyCompetitionPlayer.status.in_(("pending", "approved")),
        ).count()
        if count >= cap:
            return _err(f"Roster is full (max {cap})", 409)

    cp = Tla3bnyCompetitionPlayer(
        competition_team_id=entry_id, player_id=player_id, status="pending"
    )
    db.session.add(cp)
    db.session.flush()
    try:
        _save_documents(player, data, files, competition_player=cp)
    except ValueError as e:
        return _err(str(e))
    db.session.commit()
    notifications.notify_tla3bny_player_pending(cp)
    return jsonify(cp.to_dict(with_files=True)), 201


@tla3bny_bp.delete("/competition-players/<int:cp_id>")
@auth.login_required
def remove_roster_player(cp_id: int):
    cp = Tla3bnyCompetitionPlayer.query.get_or_404(cp_id)
    entry = cp.entry
    user = auth.current_user()
    is_admin = auth.is_competition_admin(user, entry.competition_id)
    if not (is_admin or auth.can_manage_team(user, entry.team_id)):
        return _forbid()
    # Once the registration deadline passes the squad is frozen for the team;
    # only the competition's admins can still change it.
    if not is_admin and entry.competition_age and entry.competition_age.registration_deadline_passed:
        return _err("انتهى موعد تعديل اللاعبين في هذه البطولة", 403)
    db.session.delete(cp)
    db.session.commit()
    return jsonify({"message": "deleted"})


def _approved_player_count(comp_id: int) -> int:
    """Players currently approved across the whole competition — the number
    tla3bny is priced on, and the count the ``max_players`` cap limits."""
    return (
        db.session.query(func.count(Tla3bnyCompetitionPlayer.id))
        .join(
            Tla3bnyCompetitionTeam,
            Tla3bnyCompetitionPlayer.competition_team_id == Tla3bnyCompetitionTeam.id,
        )
        .filter(
            Tla3bnyCompetitionTeam.competition_id == comp_id,
            Tla3bnyCompetitionPlayer.status == "approved",
        )
        .scalar()
    ) or 0


@tla3bny_bp.post("/competition-players/<int:cp_id>/approve")
@auth.login_required
def approve_roster_player(cp_id: int):
    cp = Tla3bnyCompetitionPlayer.query.get_or_404(cp_id)
    if not auth.is_competition_admin(auth.current_user(), cp.entry.competition_id):
        return _forbid()

    # Guard: check that all required documents have been uploaded.
    # Pass "force": true in the body to approve anyway (e.g. papers verified
    # physically and not yet scanned).
    player = cp.player
    entry = cp.entry
    if player and entry and entry.competition:
        cage = next(
            (a for a in entry.competition.ages
             if a.age_category_id == entry.age_category_id),
            None,
        )
        required = cage.documents if cage else entry.competition.documents
        # This registration's papers, plus the player's global identity papers.
        supplied = {f.label for f in cp.effective_files if f.label}
        missing = [d for d in required if d not in supplied]
        force = bool((request.get_json(silent=True) or {}).get("force"))
        if missing and not force:
            return _err(
                f"Missing documents: {', '.join(missing)}. "
                'Pass "force": true to approve without them.',
                409,
            )

    # Competition-wide player cap — the priced limit the super admin set.
    # Approving a not-yet-approved player must not push the competition's
    # approved-player count past it. This is a hard limit, not force-overridable.
    comp = entry.competition if entry else None
    if comp and comp.max_players is not None and cp.status != "approved":
        # Lock the competition row so concurrent approvals serialize; otherwise
        # two approvals both read the old count, both pass, and both commit —
        # overshooting the priced cap the business bills on.
        db.session.query(Tla3bnyCompetition.id).filter_by(
            id=comp.id
        ).with_for_update().first()
        if _approved_player_count(comp.id) >= comp.max_players:
            return _err(
                f"Competition player limit reached ({comp.max_players} players). "
                "Raise the limit or remove an approved player first.",
                409,
            )

    cp.status = "approved"
    cp.rejection_reason = None
    cp.approved_by_user_id = auth.current_user().id
    _log("player_approved", "competition_player", cp.id, {
        "player_id": cp.player_id,
        "player_name": cp.player.name if cp.player else None,
        "team_id": cp.entry.team_id if cp.entry else None,
        "team_name": cp.entry.team.display_name() if cp.entry and cp.entry.team else None,
    }, competition_id=cp.entry.competition_id if cp.entry else None)
    db.session.commit()
    notifications.notify_tla3bny_player_decision(cp, True)
    return jsonify(cp.to_dict(with_files=True))


@tla3bny_bp.post("/competition-players/<int:cp_id>/reject")
@auth.login_required
def reject_roster_player(cp_id: int):
    cp = Tla3bnyCompetitionPlayer.query.get_or_404(cp_id)
    if not auth.is_competition_admin(auth.current_user(), cp.entry.competition_id):
        return _forbid()
    cp.status = "rejected"
    cp.rejection_reason = (request.get_json(silent=True) or {}).get("reason") or None
    cp.approved_by_user_id = auth.current_user().id
    _log("player_rejected", "competition_player", cp.id, {
        "player_id": cp.player_id,
        "player_name": cp.player.name if cp.player else None,
        "team_id": cp.entry.team_id if cp.entry else None,
        "team_name": cp.entry.team.display_name() if cp.entry and cp.entry.team else None,
        "reason": cp.rejection_reason,
    }, competition_id=cp.entry.competition_id if cp.entry else None)
    db.session.commit()
    notifications.notify_tla3bny_player_decision(cp, False)
    return jsonify(cp.to_dict(with_files=True))


# ── bulk approval / rejection ─────────────────────────────────────────────────

def _load_cps_for_bulk(ids: list[int]):
    """Load competition players with all relationships needed for bulk actions."""
    return (
        Tla3bnyCompetitionPlayer.query
        .options(
            # Load the player's global identity papers too — effective_files needs
            # them for the document-completeness guard.
            selectinload(Tla3bnyCompetitionPlayer.player)
            .selectinload(Tla3bnyPlayer.files),
            selectinload(Tla3bnyCompetitionPlayer.files),
            selectinload(Tla3bnyCompetitionPlayer.entry)
            .selectinload(Tla3bnyCompetitionTeam.competition)
            .selectinload(Tla3bnyCompetition.ages),
            selectinload(Tla3bnyCompetitionPlayer.entry)
            .selectinload(Tla3bnyCompetitionTeam.team),
        )
        .filter(Tla3bnyCompetitionPlayer.id.in_(ids))
        .all()
    )


def _assert_admin_for_all(user, cps: list) -> bool:
    """Return False if the user is not a competition admin for every affected
    competition. Caller should return _forbid() when False."""
    comp_ids = {cp.entry.competition_id for cp in cps if cp.entry}
    return all(auth.is_competition_admin(user, cid) for cid in comp_ids)


@tla3bny_bp.post("/competition-players/bulk-approve")
@auth.login_required
def bulk_approve_roster_players():
    """Approve up to 100 competition players in one call.

    Body:
        ids    [int]  IDs of Tla3bnyCompetitionPlayer rows to approve
        force  bool   approve even when required documents are missing
                      (useful when papers are verified physically)

    Response:
        approved  [int]  IDs successfully approved this call
        skipped   [int]  IDs already approved — no change needed
        errors    [{id, player_name, missing_documents}]  blocked by docs
    """
    data = request.get_json(silent=True) or {}
    ids = [v for v in (_int(i) for i in (data.get("ids") or [])) if v]
    if not ids:
        return _err("ids is required")
    if len(ids) > 100:
        return _err("Cannot approve more than 100 players at once")

    force = bool(data.get("force"))
    user = auth.current_user()
    cps = _load_cps_for_bulk(ids)

    if not _assert_admin_for_all(user, cps):
        return _forbid()

    approved, skipped, errors = [], [], []

    # Competition-wide caps: seed each competition's current approved count and
    # its priced limit once, then spend the headroom as we approve within this
    # call so a bulk approve can't overshoot the limit. Lock each competition row
    # first (in id order to avoid deadlocks between concurrent bulk approvals) so
    # the seeded count can't be raced by another approval running in parallel.
    comp_counts: dict[int, int] = {}
    comp_caps: dict[int, int | None] = {}
    for cid in sorted({cp.entry.competition_id for cp in cps if cp.entry}):
        comp = (
            db.session.query(Tla3bnyCompetition)
            .filter_by(id=cid)
            .with_for_update()
            .first()
        )
        if comp is None:
            continue
        comp_counts[cid] = _approved_player_count(cid)
        comp_caps[cid] = comp.max_players

    for cp in cps:
        if cp.status == "approved":
            skipped.append(cp.id)
            continue

        # Document completeness check (same logic as single approve).
        player = cp.player
        entry = cp.entry
        if not force and player and entry and entry.competition:
            cage = next(
                (a for a in entry.competition.ages
                 if a.age_category_id == entry.age_category_id),
                None,
            )
            required = cage.documents if cage else entry.competition.documents
            # This registration's papers, plus the player's global identity papers.
            supplied = {f.label for f in cp.effective_files if f.label}
            missing = [d for d in required if d not in supplied]
            if missing:
                errors.append({
                    "id": cp.id,
                    "player_name": player.name if player else None,
                    "missing_documents": missing,
                })
                continue

        # Competition-wide player cap (the priced limit). Stop approving into a
        # competition once its approved count reaches max_players.
        cid = entry.competition_id if entry else None
        cap = comp_caps.get(cid)
        if cap is not None and comp_counts.get(cid, 0) >= cap:
            errors.append({
                "id": cp.id,
                "player_name": player.name if player else None,
                "competition_limit": cap,
            })
            continue

        cp.status = "approved"
        cp.rejection_reason = None
        cp.approved_by_user_id = user.id
        _log("player_approved", "competition_player", cp.id, {
            "player_id": cp.player_id,
            "player_name": player.name if player else None,
            "team_id": entry.team_id if entry else None,
            "team_name": entry.team.display_name() if entry and entry.team else None,
            "bulk": True,
        }, competition_id=entry.competition_id if entry else None)
        approved.append(cp.id)
        if cid is not None:
            comp_counts[cid] = comp_counts.get(cid, 0) + 1

    db.session.commit()
    return jsonify({"approved": approved, "skipped": skipped, "errors": errors})


@tla3bny_bp.post("/competition-players/bulk-reject")
@auth.login_required
def bulk_reject_roster_players():
    """Reject up to 100 competition players in one call.

    Body:
        ids     [int]  IDs of Tla3bnyCompetitionPlayer rows to reject
        reason  str    rejection reason shown to the academy (optional)
    """
    data = request.get_json(silent=True) or {}
    ids = [v for v in (_int(i) for i in (data.get("ids") or [])) if v]
    reason = (data.get("reason") or "").strip() or None
    if not ids:
        return _err("ids is required")
    if len(ids) > 100:
        return _err("Cannot reject more than 100 players at once")

    user = auth.current_user()
    cps = _load_cps_for_bulk(ids)

    if not _assert_admin_for_all(user, cps):
        return _forbid()

    rejected = []
    for cp in cps:
        cp.status = "rejected"
        cp.rejection_reason = reason
        cp.approved_by_user_id = user.id
        entry = cp.entry
        _log("player_rejected", "competition_player", cp.id, {
            "player_id": cp.player_id,
            "player_name": cp.player.name if cp.player else None,
            "team_id": entry.team_id if entry else None,
            "team_name": entry.team.display_name() if entry and entry.team else None,
            "reason": reason,
            "bulk": True,
        }, competition_id=entry.competition_id if entry else None)
        rejected.append(cp.id)

    db.session.commit()
    return jsonify({"rejected": rejected})


# ── registration documents: bulk export & cleanup ────────────────────────────
# Registration papers belong to a single competition registration
# (Tla3bnyCompetitionPlayer): each paper carries that entry's id, so a player who
# plays several competitions — or the same one next season — keeps a separate set
# for each, and the sets never overlap. A single competition's papers can run to
# gigabytes, so the primary tools work per **sub-competition** (Tla3bnyCompetitionAge):
# once the parent competition is ``finished``, download that sub-competition's
# papers as one right-sized ZIP (to burn to CD/flash), then delete them to stop
# paying to store them. Competition-level variants export or sweep everything at
# once. Because papers are per registration, deleting one scope can never touch
# another competition's papers or a player's global identity papers (those carry
# no competition_player_id) — and player photos are never touched.

def _document_regs_query():
    """Base query: registrations joined to their team entry, with each entry's own
    papers, plus player, team and academy eager-loaded (so an export is a few
    queries, not N+1)."""
    return (
        Tla3bnyCompetitionPlayer.query
        .join(
            Tla3bnyCompetitionTeam,
            Tla3bnyCompetitionPlayer.competition_team_id == Tla3bnyCompetitionTeam.id,
        )
        .options(
            joinedload(Tla3bnyCompetitionPlayer.player),
            selectinload(Tla3bnyCompetitionPlayer.files),
            joinedload(Tla3bnyCompetitionPlayer.entry)
            .joinedload(Tla3bnyCompetitionTeam.team)
            .joinedload(Tla3bnyTeam.academy),
        )
    )


def _cage_match(cage: Tla3bnyCompetitionAge):
    """SQL condition selecting the team entries that belong to sub-competition
    ``cage`` — by the explicit link, or (for legacy rows without it) by the
    competition + age category."""
    return sa.or_(
        Tla3bnyCompetitionTeam.competition_age_id == cage.id,
        sa.and_(
            Tla3bnyCompetitionTeam.competition_age_id.is_(None),
            Tla3bnyCompetitionTeam.competition_id == cage.competition_id,
            Tla3bnyCompetitionTeam.age_category_id == cage.age_category_id,
        ),
    )


def _safe_segment(value: str | None, fallback: str) -> str:
    """A filename-safe path segment. Keeps Arabic/word characters, spaces, dot
    and dash; replaces path separators and anything else with '_'."""
    cleaned = re.sub(r"[^\w\-. ]", "_", (value or "").strip(), flags=re.UNICODE)
    return cleaned or fallback


def _build_documents_zip(regs) -> tuple[str, int, int]:
    """Write every distinct player's papers in ``regs`` to a temp ZIP, organised
    academy/team/player, plus a manifest.csv. Returns (temp_path, files, players).
    The caller streams the file and is responsible for deleting it afterwards."""
    tmp = tempfile.NamedTemporaryFile(prefix="tla3bny_docs_", suffix=".zip", delete=False)
    tmp_path = tmp.name
    tmp.close()

    manifest = [(
        "academy", "team", "player", "player_id",
        "label", "original_name", "stored_path", "status",
    )]
    seen: set[int] = set()
    file_count = 0
    try:
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for reg in regs:
                player = reg.player
                if not player:
                    continue
                seen.add(player.id)
                entry = reg.entry
                team = entry.team if entry else None
                academy = team.academy if team else None
                acad = _safe_segment(academy.name if academy else None, "no_academy")
                team_name = _safe_segment(
                    team.display_name() if team else None, "no_team"
                )
                pname = _safe_segment(player.name, f"player_{player.id}")
                folder = f"{acad}/{team_name}/{pname}"
                # This registration's own papers only — not the player's global set.
                for f in reg.files:
                    ext = os.path.splitext(f.file_path)[1] or os.path.splitext(
                        f.original_name or ""
                    )[1]
                    label = _safe_segment(f.label, f"document_{f.id}")
                    base = _safe_segment(f.original_name, f"{label}{ext}")
                    arcname = f"{folder}/{f.id}_{label}__{base}"
                    try:
                        data = storage.read_bytes(f.file_path)
                    except Exception:  # noqa: BLE001 - a missing object mustn't abort the whole export
                        manifest.append((acad, team_name, pname, player.id,
                                         f.label or "", f.original_name or "",
                                         f.file_path, "MISSING"))
                        continue
                    zf.writestr(arcname, data)
                    manifest.append((acad, team_name, pname, player.id,
                                     f.label or "", f.original_name or "",
                                     f.file_path, "ok"))
                    file_count += 1

            buf = io.StringIO()
            csv.writer(buf).writerows(manifest)
            # utf-8-sig so Excel opens the Arabic labels correctly.
            zf.writestr("manifest.csv", buf.getvalue().encode("utf-8-sig"))
    except Exception:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise
    return tmp_path, file_count, len(seen)


def _send_documents_zip(regs, competition_id, cage_id, download_name):
    """Build, log, stream and clean up a documents archive for a set of regs."""
    tmp_path, file_count, players = _build_documents_zip(regs)

    @after_this_request
    def _cleanup(response):
        # The response holds an open fd to the file; on the Linux host unlinking
        # it now is safe (the inode lives until the stream finishes).
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        return response

    _log(
        "documents_exported",
        "competition_age" if cage_id else "competition",
        cage_id or competition_id,
        {"files": file_count, "players": players},
        competition_id=competition_id,
    )
    db.session.commit()
    return send_file(
        tmp_path, mimetype="application/zip",
        as_attachment=True, download_name=download_name,
    )


def _delete_documents(reg_ids, competition_id, cage_id):
    """Delete the papers uploaded for the registrations in ``reg_ids`` — each
    paper carries its ``competition_player_id``, so this only ever clears this
    scope's papers, never another competition's set nor a player's global identity
    papers (those have no ``competition_player_id``). Returns the JSON body."""
    files = (
        Tla3bnyPlayerFile.query.filter(
            Tla3bnyPlayerFile.competition_player_id.in_(reg_ids)
        ).all()
        if reg_ids
        else []
    )
    deleted_files = 0
    failed: list[str] = []
    for f in files:
        try:
            ok = storage.delete_file(f.file_path)
        except Exception:  # noqa: BLE001 - one bad object mustn't abort the batch
            ok = False
        if ok:
            db.session.delete(f)
            deleted_files += 1
        else:
            failed.append(f.file_path)

    _log(
        "documents_deleted",
        "competition_age" if cage_id else "competition",
        cage_id or competition_id,
        {"deleted_files": deleted_files, "failed": len(failed)},
        competition_id=competition_id,
    )
    db.session.commit()
    return jsonify({
        "deleted_files": deleted_files,
        "skipped_players": [],
        "failed": failed,
    })


# ── sub-competition (primary: right-sized per age) ───────────────────────────
@tla3bny_bp.get("/competition-ages/<int:cage_id>/documents/archive")
def download_subcompetition_documents(cage_id: int):
    """ZIP of one sub-competition's registration papers (parent must be finished).
    Keeps each archive small enough to download and burn to CD/flash."""
    cage = Tla3bnyCompetitionAge.query.get_or_404(cage_id)
    if not auth.is_competition_admin(auth.current_user(), cage.competition_id):
        return _forbid()
    if not cage.competition or cage.competition.status != "finished":
        return _err("يمكن تنزيل المستندات بعد انتهاء البطولة فقط", 409)
    regs = _document_regs_query().filter(_cage_match(cage)).all()
    name = f"competition_{cage.competition_id}_sub_{cage_id}_documents.zip"
    return _send_documents_zip(regs, cage.competition_id, cage_id, name)


@tla3bny_bp.delete("/competition-ages/<int:cage_id>/documents")
@auth.super_admin_required
def delete_subcompetition_documents(cage_id: int):
    """Delete one sub-competition's registration papers to reclaim storage. Papers
    are per registration, so this clears exactly this sub-competition's set and
    leaves every other competition's papers (and player photos) untouched."""
    cage = Tla3bnyCompetitionAge.query.get_or_404(cage_id)
    if not cage.competition or cage.competition.status != "finished":
        return _err("يمكن حذف المستندات بعد انتهاء البطولة فقط", 409)

    reg_ids = [
        r.id for r in
        Tla3bnyCompetitionPlayer.query.join(
            Tla3bnyCompetitionTeam,
            Tla3bnyCompetitionPlayer.competition_team_id == Tla3bnyCompetitionTeam.id,
        ).filter(_cage_match(cage)).all()
    ]
    if not reg_ids:
        return jsonify({"deleted_files": 0, "skipped_players": [], "failed": [],
                        "message": "لا توجد مستندات لهذه البطولة الفرعية"})
    return _delete_documents(reg_ids, cage.competition_id, cage_id)


# ── whole competition (export all at once / final sweep) ─────────────────────
@tla3bny_bp.get("/competitions/<int:comp_id>/documents/archive")
def download_competition_documents(comp_id: int):
    """ZIP of every registration paper in a finished competition (all
    sub-competitions at once). For large competitions prefer the per-
    sub-competition archive above."""
    if not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    comp = Tla3bnyCompetition.query.get_or_404(comp_id)
    if comp.status != "finished":
        return _err("يمكن تنزيل المستندات بعد انتهاء البطولة فقط", 409)
    regs = _document_regs_query().filter(
        Tla3bnyCompetitionTeam.competition_id == comp_id
    ).all()
    return _send_documents_zip(regs, comp_id, None, f"competition_{comp_id}_documents.zip")


@tla3bny_bp.delete("/competitions/<int:comp_id>/documents")
@auth.super_admin_required
def delete_competition_documents(comp_id: int):
    """Sweep every registration paper of a finished competition (all its
    sub-competitions at once). Papers are per registration, so this only clears
    this competition's set — another competition the same players are in keeps its
    own papers, and player photos are never touched."""
    comp = Tla3bnyCompetition.query.get_or_404(comp_id)
    if comp.status != "finished":
        return _err("يمكن حذف المستندات بعد انتهاء البطولة فقط", 409)

    reg_ids = [
        r.id for r in
        Tla3bnyCompetitionPlayer.query.join(
            Tla3bnyCompetitionTeam,
            Tla3bnyCompetitionPlayer.competition_team_id == Tla3bnyCompetitionTeam.id,
        ).filter(Tla3bnyCompetitionTeam.competition_id == comp_id).all()
    ]
    if not reg_ids:
        return jsonify({"deleted_files": 0, "skipped_players": [], "failed": [],
                        "message": "لا توجد مستندات لهذه البطولة"})
    return _delete_documents(reg_ids, comp_id, None)
