from flask import jsonify, request
from sqlalchemy.orm import selectinload

from app.extensions import db
from app.models import (
    Tla3bnyAgeCategory,
    Tla3bnyCoach,
    Tla3bnyCompetition,
    Tla3bnyCompetitionAge,
    Tla3bnyCompetitionPlayer,
    Tla3bnyCompetitionTeam,
    Tla3bnyPlayerTeam,
    Tla3bnyTeam,
    Tla3bnyUser,
)
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from .audit import _log
from ._helpers import (
    _credentials,
    _claim_login,
    _err,
    _forbid,
    _int,
    _parse_date,
    _read_payload,
    save_upload,
)
from .academies import _resolve_academy_for_write


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
    """The owning academy (or super admin) creates/resets the team manager's
    login — a username and a password they hand to the coach."""
    team = Tla3bnyTeam.query.get_or_404(team_id)
    user = auth.current_user()
    if not auth.can_manage_academy(user, team.academy_id):
        return _forbid()
    data = request.get_json(silent=True) or {}
    username, password = _credentials(data)
    if not username or not password:
        return _err("username and password are required")

    account = Tla3bnyUser.query.filter_by(role="team", team_id=team.id).first()
    taken = _claim_login(
        username, None, exclude_id=account.id if account else None
    )
    if taken:
        return taken
    if account is None:
        account = Tla3bnyUser(
            role="team", status="active", team_id=team.id, academy_id=team.academy_id
        )
        db.session.add(account)
    account.username = username
    if "@" in username:
        account.email = username
    account.set_password(password)
    db.session.commit()
    return (
        jsonify({"message": "saved", "username": username, "team_id": team.id}),
        201,
    )


@tla3bny_bp.get("/teams/<int:team_id>/account")
@auth.login_required
def get_team_account(team_id: int):
    """Whether this team has a login yet, and under which username. Never the
    password — a forgotten one is reset, not read back."""
    team = Tla3bnyTeam.query.get_or_404(team_id)
    if not auth.can_manage_academy(auth.current_user(), team.academy_id):
        return _forbid()
    account = Tla3bnyUser.query.filter_by(role="team", team_id=team.id).first()
    return jsonify(
        {
            "team_id": team.id,
            "has_account": account is not None,
            "username": account.username or account.email if account else None,
        }
    )


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
def _team_required_documents(team: Tla3bnyTeam) -> tuple[list[str], list[dict]]:
    """The papers this team's players must upload, and where each demand comes
    from.

    Every competition the team is entered in states its own list (its admin
    decides), so a team playing in two competitions must satisfy the union. A
    team not entered anywhere yet falls back to its age category's baseline
    list, which itself falls back to ``codes.TLA3BNY_DEFAULT_PLAYER_DOCS``.
    """
    entries = (
        Tla3bnyCompetitionTeam.query
        .options(
            selectinload(Tla3bnyCompetitionTeam.competition)
            .selectinload(Tla3bnyCompetition.ages),
        )
        .filter_by(team_id=team.id)
        .join(Tla3bnyCompetitionTeam.competition)
        .order_by(Tla3bnyCompetition.name.asc())
        .all()
    )
    sources = []
    for e in entries:
        if not e.competition:
            continue
        # Use per-age docs when available, fall back to competition-wide list.
        cage = next(
            (a for a in e.competition.ages if a.age_category_id == e.age_category_id),
            None,
        )
        docs = cage.documents if cage else e.competition.documents
        sources.append({
            "competition_id": e.competition_id,
            "competition_name": e.competition.name,
            "documents": docs,
        })
    if not sources:
        age = team.age_category
        sources = [
            {
                "competition_id": None,
                "competition_name": None,
                "documents": age.documents if age else [],
            }
        ]
    merged: list[str] = []
    for src in sources:
        for doc in src["documents"]:
            if doc not in merged:
                merged.append(doc)
    merged.sort()
    return merged, sources


@tla3bny_bp.get("/teams/<int:team_id>/competition-entries")
@auth.login_required
def team_competition_entries(team_id: int):
    """The competitions this team is registered in (active + pending requests).

    Used by the academy dashboard to gate and display player registration.
    Only the owning academy / team login (or super admin) may call this.
    """
    if not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    entries = Tla3bnyCompetitionTeam.query.filter(
        Tla3bnyCompetitionTeam.team_id == team_id,
        Tla3bnyCompetitionTeam.status.in_(("active", "pending")),
    ).all()
    result = []
    for entry in entries:
        comp = entry.competition
        cage = entry.competition_age or Tla3bnyCompetitionAge.query.filter_by(
            competition_id=entry.competition_id,
            age_category_id=entry.age_category_id,
        ).first()
        count = Tla3bnyCompetitionPlayer.query.filter_by(
            competition_team_id=entry.id
        ).count()
        rejected = Tla3bnyCompetitionPlayer.query.filter_by(
            competition_team_id=entry.id, status="rejected"
        ).all()
        result.append({
            "entry_id": entry.id,
            "competition_id": entry.competition_id,
            "competition_name": comp.name if comp else None,
            "competition_age_id": entry.competition_age_id,
            "sub_competition_name": cage.name if cage else None,
            "status": entry.status,
            "registration_open": comp.registration_open if comp else False,
            "max_players": cage.max_players_per_team if cage else None,
            "player_count": count,
            "rejected_players": [
                {
                    "player_id": cp.player_id,
                    "player_name": cp.player.name if cp.player else None,
                    "rejection_reason": cp.rejection_reason,
                }
                for cp in rejected
            ],
        })
    return jsonify(result)


@tla3bny_bp.get("/teams/<int:team_id>/joinable-competitions")
@auth.login_required
def joinable_competitions(team_id: int):
    """All sub-competitions the team could request to join.

    Returns every sub-competition whose age matches the team's age and the
    team has not already joined (or requested). Includes closed competitions
    so the academy can still send a request — the admin decides.
    """
    if not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    team = Tla3bnyTeam.query.get_or_404(team_id)
    existing_comp_ids = {
        e.competition_id
        for e in Tla3bnyCompetitionTeam.query.filter_by(team_id=team_id).all()
    }
    cages = (
        Tla3bnyCompetitionAge.query
        .join(Tla3bnyCompetitionAge.competition)
        .filter(
            Tla3bnyCompetitionAge.age_category_id == team.age_category_id,
            Tla3bnyCompetition.id.notin_(existing_comp_ids),
        )
        .order_by(Tla3bnyCompetition.name)
        .all()
    )
    return jsonify([
        {
            "competition_age_id": c.id,
            "competition_id": c.competition_id,
            "competition_name": c.competition.name if c.competition else None,
            "registration_open": c.competition.registration_open if c.competition else False,
            "sub_competition_name": c.name,
            "age_category": c.age_category.label if c.age_category else None,
            "player_registration_deadline": (
                c.player_registration_deadline.isoformat()
                if c.player_registration_deadline else None
            ),
        }
        for c in cages
    ])


@tla3bny_bp.post("/teams/<int:team_id>/request-join")
@auth.login_required
def request_join_competition(team_id: int):
    """Academy requests to join a specific sub-competition.

    Creates a TCompetitionTeam with status='pending'. The competition admin
    must approve before the team can register players.
    """
    if not auth.can_manage_team(auth.current_user(), team_id):
        return _forbid()
    team = Tla3bnyTeam.query.get_or_404(team_id)
    data = request.get_json(silent=True) or {}
    cage_id = _int(data.get("competition_age_id"))
    if not cage_id:
        return _err("competition_age_id is required")
    cage = Tla3bnyCompetitionAge.query.get_or_404(cage_id)
    comp = cage.competition
    if not comp:
        return _err("Competition not found", 404)
    if cage.age_category_id != team.age_category_id:
        return _err("Team age does not match sub-competition age", 409)
    if Tla3bnyCompetitionTeam.query.filter_by(
        competition_id=comp.id, team_id=team_id
    ).first():
        return _err("Team has already joined or requested to join this competition", 409)
    entry = Tla3bnyCompetitionTeam(
        competition_id=comp.id,
        team_id=team_id,
        age_category_id=team.age_category_id,
        competition_age_id=cage_id,
        status="pending",
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify(entry.to_dict()), 201


@tla3bny_bp.post("/competition-teams/<int:entry_id>/approve")
@auth.login_required
def approve_team_join(entry_id: int):
    """Competition admin approves a pending team join request."""
    entry = Tla3bnyCompetitionTeam.query.get_or_404(entry_id)
    if not auth.is_competition_admin(auth.current_user(), entry.competition_id):
        return _forbid()
    if entry.status != "pending":
        return _err("Entry is not pending", 409)
    entry.status = "active"
    db.session.flush()
    _log("team_join_approved", "competition_team", entry.id, {
        "team_id": entry.team_id,
        "team_name": entry.team.display_name() if entry.team else None,
        "academy_name": entry.team.academy.name if entry.team and entry.team.academy else None,
    }, competition_id=entry.competition_id)
    # Auto-enqueue existing active players.
    comp = entry.competition
    cage = entry.competition_age or Tla3bnyCompetitionAge.query.filter_by(
        competition_id=entry.competition_id,
        age_category_id=entry.age_category_id,
    ).first()
    if comp and comp.registration_open:
        cap = cage.max_players_per_team if cage else None
        count = 0
        for mem in Tla3bnyPlayerTeam.query.filter_by(
            team_id=entry.team_id, end_date=None, status="active"
        ).all():
            if cap is not None and count >= cap:
                break
            if not Tla3bnyCompetitionPlayer.query.filter_by(
                competition_team_id=entry.id, player_id=mem.player_id
            ).first():
                db.session.add(Tla3bnyCompetitionPlayer(
                    competition_team_id=entry.id,
                    player_id=mem.player_id,
                    status="pending",
                ))
                count += 1
    db.session.commit()
    return jsonify(entry.to_dict())


@tla3bny_bp.post("/competition-teams/<int:entry_id>/reject")
@auth.login_required
def reject_team_join(entry_id: int):
    """Competition admin rejects a pending team join request (deletes it)."""
    entry = Tla3bnyCompetitionTeam.query.get_or_404(entry_id)
    if not auth.is_competition_admin(auth.current_user(), entry.competition_id):
        return _forbid()
    if entry.status != "pending":
        return _err("Entry is not pending", 409)
    _log("team_join_rejected", "competition_team", entry.id, {
        "team_id": entry.team_id,
        "team_name": entry.team.display_name() if entry.team else None,
        "academy_name": entry.team.academy.name if entry.team and entry.team.academy else None,
    }, competition_id=entry.competition_id)
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "rejected"})


@tla3bny_bp.get("/teams/<int:team_id>/required-documents")
def team_required_documents(team_id: int):
    """The labelled upload slots to show for this team's players."""
    team = (
        Tla3bnyTeam.query
        .options(selectinload(Tla3bnyTeam.age_category))
        .filter_by(id=team_id)
        .first_or_404()
    )
    documents, sources = _team_required_documents(team)
    return jsonify({"documents": documents, "sources": sources})
