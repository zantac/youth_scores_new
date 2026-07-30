import sqlalchemy as sa
from collections import defaultdict
from sqlalchemy import func
from sqlalchemy.orm import selectinload

from flask import jsonify, request

from app.extensions import db
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
    Tla3bnySeason,
    Tla3bnyStage,
    Tla3bnyTeam,
    Tla3bnyUser,
    Tla3bnyPlayerTeam,
)
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from .audit import _log
from ._helpers import (
    _bool,
    _clean_docs,
    _docs_field,
    _err,
    _forbid,
    _int,
    _parse_date,
    _read_payload,
    save_upload,
)
from .players import _player_team_id


# The free-text fields of a competition's public info page. Kept in one place so
# create and update always take the same set.
COMPETITION_TEXT_FIELDS = (
    "name",
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
    data["ages"] = [a.to_dict(with_stages=True) for a in comp.ages]
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

    entry_age = {e.id: e.age_category_id for e in entries}
    age_player_counts: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    total_counts: dict[str, int] = defaultdict(int)
    for entry_id, counts in entry_player_counts.items():
        age_id = entry_age.get(entry_id)
        for status, cnt in counts.items():
            if age_id is not None:
                age_player_counts[age_id][status] += cnt
            total_counts[status] += cnt

    total_matches = Tla3bnyMatch.query.filter_by(competition_id=comp_id).count()
    played_matches = Tla3bnyMatch.query.filter_by(
        competition_id=comp_id, status="finished"
    ).count()
    goals = (
        Tla3bnyMatchEvent.query.filter_by(event_type="goal")
        .join(Tla3bnyMatch, Tla3bnyMatchEvent.match_id == Tla3bnyMatch.id)
        .filter(Tla3bnyMatch.competition_id == comp_id)
        .count()
    )

    # One query for match counts by (age_category_id, status).
    match_rows = (
        db.session.query(
            Tla3bnyMatch.age_category_id,
            Tla3bnyMatch.status,
            func.count().label("cnt"),
        )
        .filter(Tla3bnyMatch.competition_id == comp_id)
        .group_by(Tla3bnyMatch.age_category_id, Tla3bnyMatch.status)
        .all()
    )
    age_match_counts: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for age_cat_id, status, cnt in match_rows:
        age_match_counts[age_cat_id][status] = cnt

    # Per-sub-competition breakdown, sorted by age_category year.
    def _sort_key(c):
        try:
            return int(c.age_category.label) if c.age_category else 0
        except (ValueError, TypeError):
            return 0

    ages_data = []
    for cage in sorted(comp.ages, key=_sort_key):
        age_id = cage.age_category_id
        p = age_player_counts[age_id]
        m = age_match_counts[age_id]
        age_entry_ids = [e.id for e in entries if e.age_category_id == age_id]
        ages_data.append({
            "competition_age_id": cage.id,
            "age_category": cage.age_category.label if cage.age_category else None,
            "name": cage.name,
            "teams": len(age_entry_ids),
            "players_approved": p.get("approved", 0),
            "players_pending": p.get("pending", 0),
            "matches_total": sum(m.values()),
            "matches_played": m.get("finished", 0),
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
        name=source.name,
        description=source.description,
        logo_path=source.logo_path,
        location=source.location,
        start_date=None,
        end_date=None,
        status="draft",
        required_documents=list(source.required_documents) if source.required_documents else None,
        info=source.info,
        organizer_name=source.organizer_name,
        contact_phone=source.contact_phone,
        whatsapp_number=source.whatsapp_number,
        whatsapp_group_url=source.whatsapp_group_url,
        facebook_url=source.facebook_url,
        location_url=source.location_url,
        registration_open=False,
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
    comp = Tla3bnyCompetition(
        season_id=season_id,
        name=name,
        logo_path=logo,
        start_date=_parse_date(data.get("start_date")),
        end_date=_parse_date(data.get("end_date")),
        status=data.get("status") or "draft",
        required_documents=docs,
    )
    _apply_competition_text(comp, data)
    if "registration_open" in data:
        comp.registration_open = _bool(data.get("registration_open"), True)
    db.session.add(comp)
    db.session.commit()
    return jsonify(comp.to_dict()), 201


def _apply_competition_text(comp: Tla3bnyCompetition, data) -> None:
    """Copy whichever info-page fields the caller sent onto the competition."""
    for field in COMPETITION_TEXT_FIELDS:
        if field not in data:
            continue
        value = (data.get(field) or "").strip() or None
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
    if not comp.name:
        return _err("name is required")
    if "status" in data and data.get("status"):
        comp.status = data.get("status")
    if "registration_open" in data:
        comp.registration_open = _bool(data.get("registration_open"), comp.registration_open)
    if "start_date" in data:
        comp.start_date = _parse_date(data.get("start_date"))
    if "end_date" in data:
        comp.end_date = _parse_date(data.get("end_date"))
    present, docs = _docs_field(data)
    if present:
        comp.required_documents = docs
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
    """Assign an organiser to this competition.

    The username may be one that already exists (an organiser running several
    competitions) or a brand new one, in which case a password creates it.
    """
    Tla3bnyCompetition.query.get_or_404(comp_id)
    data = request.get_json(silent=True) or {}
    username, password = _credentials(data)
    if not username:
        return _err("username is required")
    user = Tla3bnyUser.by_login(username)
    if user is None:
        if not password:
            return _err("password is required for a new organizer")
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
    elif password:
        # Re-assigning with a password doubles as "reset their password", which
        # is the only way an organiser who forgot theirs gets back in.
        user.set_password(password)
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
    cage = Tla3bnyCompetitionAge(
        competition_id=comp_id,
        age_category_id=age_id,
        name=(data.get("name") or "").strip() or None,
        player_registration_deadline=_parse_date(data.get("player_registration_deadline")),
    )
    for f in _RULE_FIELDS:
        if f in data and _int(data.get(f)) is not None:
            setattr(cage, f, _int(data.get(f)))
    if "required_documents" in data:
        cage.required_documents = _clean_docs(data.get("required_documents"))
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
    if "name" in data:
        cage.name = (data.get("name") or "").strip() or None
    if "player_registration_deadline" in data:
        cage.player_registration_deadline = _parse_date(data.get("player_registration_deadline"))
    for f in _RULE_FIELDS:
        if f in data and _int(data.get(f)) is not None:
            setattr(cage, f, _int(data.get(f)))
    if "required_documents" in data:
        cage.required_documents = _clean_docs(data.get("required_documents"))
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


@tla3bny_bp.post("/stages/<int:stage_id>/teams")
@auth.login_required
def add_stage_team(stage_id: int):
    """Add a team directly to a knockout stage.

    Uses an auto-created unnamed pool group so the data model stays consistent.
    Only the competition admin may call this.
    """
    stage = Tla3bnyStage.query.get_or_404(stage_id)
    if not auth.is_competition_admin(auth.current_user(), _stage_comp_id(stage)):
        return _forbid()
    team_id = _int((request.get_json(silent=True) or {}).get("team_id"))
    if not team_id or not Tla3bnyTeam.query.get(team_id):
        return _err("valid team_id is required")
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
    # Back-fill competition_age_id on any legacy rows (NULL) so that
    # subsequent filtered queries work without the OR fallback.
    if cage_id and cage:
        dirty = False
        for entry in entries:
            if entry.competition_age_id is None:
                entry.competition_age_id = cage_id
                dirty = True
        if dirty:
            db.session.commit()
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
    return jsonify(cp.to_dict(with_files=True)), 201


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
        supplied = {f.label for f in player.files if f.label}
        missing = [d for d in required if d not in supplied]
        force = bool((request.get_json(silent=True) or {}).get("force"))
        if missing and not force:
            return _err(
                f"Missing documents: {', '.join(missing)}. "
                'Pass "force": true to approve without them.',
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
    return jsonify(cp.to_dict(with_files=True))
