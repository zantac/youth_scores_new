"""Competition punishments: match bans, fines, and point deductions.

Recorded by the organizer on the Punishments tab. Fines are private — only an
admin and the punished academy see them. Point-deduction punishments drive the
standings: a team's ``Tla3bnyCompetitionTeam.point_deduction`` is kept as the sum
of its active point-deduction punishments.
"""
from decimal import Decimal, InvalidOperation

from flask import jsonify, request

from app.extensions import db
from app.models import (
    Tla3bnyCoach,
    Tla3bnyCompetition,
    Tla3bnyCompetitionTeam,
    Tla3bnyPlayer,
    Tla3bnyPunishment,
    Tla3bnyTeam,
)
from app.models.codes import TLA3BNY_PUNISHMENT_TYPE
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from .audit import _log
from ._helpers import _err, _forbid, _int


def _admin(comp_id: int) -> bool:
    return auth.is_competition_admin(auth.current_user(), comp_id)


def _caller_academy_id() -> int | None:
    """The academy the current user belongs to (academy or team login), else None."""
    u = auth.current_user()
    if u is None:
        return None
    if u.academy_id:
        return u.academy_id
    if u.team_id:
        t = Tla3bnyTeam.query.get(u.team_id)
        return t.academy_id if t else None
    return None


def _recompute_team_deduction(competition_id: int, team_id: int) -> None:
    """Keep the standings deduction in sync: a team's point_deduction is the sum of
    its active point-deduction punishments in this competition (capped 0..100)."""
    total = db.session.query(
        db.func.coalesce(db.func.sum(Tla3bnyPunishment.points), 0)
    ).filter(
        Tla3bnyPunishment.competition_id == competition_id,
        Tla3bnyPunishment.team_id == team_id,
        Tla3bnyPunishment.punishment_type == "point_deduction",
    ).scalar() or 0
    for entry in Tla3bnyCompetitionTeam.query.filter_by(
        competition_id=competition_id, team_id=team_id
    ).all():
        entry.point_deduction = max(0, min(100, int(total)))


@tla3bny_bp.get("/competitions/<int:comp_id>/punishments")
def list_punishments(comp_id: int):
    """Punishments in a competition. Fines are private: an admin sees all; an
    academy/team login also sees its own fines; everyone else sees only the public
    ones (match bans, point deductions)."""
    rows = (
        Tla3bnyPunishment.query.filter_by(competition_id=comp_id)
        .order_by(Tla3bnyPunishment.created_at.desc())
        .all()
    )
    is_admin = _admin(comp_id)
    my_academy = None if is_admin else _caller_academy_id()
    out = []
    for pun in rows:
        if pun.punishment_type == "fine":
            if is_admin or (my_academy is not None and pun.recipient_academy_id() == my_academy):
                out.append(pun.to_dict(include_amount=True))
            # else: private → hidden
        else:
            out.append(pun.to_dict())
    return jsonify(out)


@tla3bny_bp.get("/players/<int:player_id>/bans")
def player_bans(player_id: int):
    """A player's match bans and disqualifications across competitions — public
    (not private, unlike fines). Drives the ban banner on the player profile."""
    rows = (
        Tla3bnyPunishment.query
        .filter(
            Tla3bnyPunishment.player_id == player_id,
            Tla3bnyPunishment.punishment_type.in_(("match_ban", "disqualification")),
        )
        .order_by(Tla3bnyPunishment.created_at.desc())
        .all()
    )
    return jsonify([{
        "id": p.id,
        "competition_id": p.competition_id,
        "competition_name": p.competition.name if p.competition else None,
        "punishment_type": p.punishment_type,
        "matches": p.matches,
        "reason": p.reason,
    } for p in rows])


@tla3bny_bp.post("/competitions/<int:comp_id>/punishments")
@auth.login_required
def create_punishment(comp_id: int):
    if not _admin(comp_id):
        return _forbid()
    Tla3bnyCompetition.query.get_or_404(comp_id)
    data = request.get_json(silent=True) or {}
    ptype = data.get("punishment_type")
    if ptype not in TLA3BNY_PUNISHMENT_TYPE:
        return _err("invalid punishment_type")

    player_id = _int(data.get("player_id"))
    coach_id = _int(data.get("coach_id"))
    team_id = _int(data.get("team_id"))

    def _team_in_comp(tid: int) -> bool:
        return bool(Tla3bnyCompetitionTeam.query.filter_by(
            competition_id=comp_id, team_id=tid).first())

    pun = Tla3bnyPunishment(
        competition_id=comp_id,
        competition_age_id=_int(data.get("competition_age_id")),
        punishment_type=ptype,
        reason=(data.get("reason") or "").strip() or None,
        created_by_user_id=auth.current_user().id,
    )

    if ptype == "point_deduction":
        if not team_id:
            return _err("team_id is required for a point deduction")
        if not _team_in_comp(team_id):
            return _err("هذا الفريق غير مشارك في البطولة", 409)
        pts = _int(data.get("points"))
        if not pts or pts < 1:
            return _err("عدد النقاط يجب أن يكون رقمًا موجبًا")
        pun.team_id, pun.points = team_id, min(100, pts)
    elif ptype == "match_ban":
        if player_id:
            Tla3bnyPlayer.query.get_or_404(player_id)
            pun.player_id = player_id
        elif coach_id:
            c = Tla3bnyCoach.query.get_or_404(coach_id)
            if not _team_in_comp(c.team_id):
                return _err("هذا المدرب لا يتبع فريقًا مشاركًا في البطولة", 409)
            pun.coach_id = coach_id
        else:
            return _err("اختر لاعبًا أو مدربًا للإيقاف")
        n = _int(data.get("matches"))
        if not n or n < 1:
            return _err("عدد المباريات يجب أن يكون رقمًا موجبًا")
        pun.matches = min(100, n)
    elif ptype == "disqualification":
        # A player / coach / team excluded from the competition — no numeric value.
        if team_id:
            if not _team_in_comp(team_id):
                return _err("هذا الفريق غير مشارك في البطولة", 409)
            pun.team_id = team_id
        elif player_id:
            Tla3bnyPlayer.query.get_or_404(player_id)
            pun.player_id = player_id
        elif coach_id:
            Tla3bnyCoach.query.get_or_404(coach_id)
            pun.coach_id = coach_id
        else:
            return _err("اختر مستلمًا للاستبعاد (لاعب / مدرب / فريق)")
    else:  # fine
        if team_id:
            if not _team_in_comp(team_id):
                return _err("هذا الفريق غير مشارك في البطولة", 409)
            pun.team_id = team_id
        elif player_id:
            Tla3bnyPlayer.query.get_or_404(player_id)
            pun.player_id = player_id
        elif coach_id:
            Tla3bnyCoach.query.get_or_404(coach_id)
            pun.coach_id = coach_id
        else:
            return _err("اختر مستلمًا للغرامة (لاعب / مدرب / فريق)")
        try:
            amt = Decimal(str(data.get("amount")))
        except (InvalidOperation, TypeError):
            return _err("قيمة الغرامة يجب أن تكون رقمًا")
        if amt <= 0:
            return _err("قيمة الغرامة يجب أن تكون موجبة")
        pun.amount = amt

    db.session.add(pun)
    db.session.flush()
    if ptype == "point_deduction":
        _recompute_team_deduction(comp_id, team_id)
    _log("punishment_created", "punishment", pun.id, {
        "punishment_type": ptype, "player_id": pun.player_id,
        "coach_id": pun.coach_id, "team_id": pun.team_id,
    }, competition_id=comp_id)
    db.session.commit()
    return jsonify(pun.to_dict(include_amount=True)), 201


@tla3bny_bp.delete("/punishments/<int:pun_id>")
@auth.login_required
def delete_punishment(pun_id: int):
    pun = Tla3bnyPunishment.query.get_or_404(pun_id)
    if not _admin(pun.competition_id):
        return _forbid()
    comp_id, team_id = pun.competition_id, pun.team_id
    ptype = pun.punishment_type
    db.session.delete(pun)
    db.session.flush()
    if ptype == "point_deduction" and team_id:
        _recompute_team_deduction(comp_id, team_id)
    _log("punishment_deleted", "punishment", pun_id,
         {"punishment_type": ptype}, competition_id=comp_id)
    db.session.commit()
    return jsonify({"message": "deleted"})
