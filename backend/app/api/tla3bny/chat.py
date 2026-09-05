"""Chat between a team (its coach + owning academy) and a competition's
chat-enabled organizers. One thread per (competition, team).

Sending is gated per side: an academy/team login that manages the team, or an
organizer whose can_chat flag is set (see the Organizers tab). A new message
pings the *other* side's push topic so they know to reply.
"""
from flask import jsonify, request

from app.extensions import db
from app.models import (
    Tla3bnyCompetition,
    Tla3bnyCompetitionTeam,
    Tla3bnyConversation,
    Tla3bnyMessage,
    Tla3bnyTeam,
)
from app.services import notifications
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import _err, _forbid, _utcnow


def _user_side(user, comp_id: int, team: Tla3bnyTeam) -> str | None:
    """Which side of the (comp, team) thread the user is on, or None if no access.
    A chat-enabled organizer (or super admin) is 'organizer'; the team's coach or
    owning academy is 'academy'."""
    if auth.can_chat(user, comp_id):
        return "organizer"
    if user and user.role in ("team", "academy") and auth.can_manage_team(user, team.id):
        return "academy"
    return None


def _team_in_comp(comp_id: int, team_id: int) -> bool:
    return bool(Tla3bnyCompetitionTeam.query.filter_by(
        competition_id=comp_id, team_id=team_id).first())


def _get_or_create_conversation(comp_id: int, team: Tla3bnyTeam) -> Tla3bnyConversation:
    conv = Tla3bnyConversation.query.filter_by(
        competition_id=comp_id, team_id=team.id).first()
    if conv is None:
        conv = Tla3bnyConversation(
            competition_id=comp_id, team_id=team.id, academy_id=team.academy_id)
        db.session.add(conv)
        db.session.flush()
    return conv


@tla3bny_bp.get("/competitions/<int:comp_id>/conversations")
@auth.login_required
def list_conversations(comp_id: int):
    """The organizer inbox: every team thread in this competition, newest first,
    with unread counts. Chat-enabled organizers only."""
    if not auth.can_chat(auth.current_user(), comp_id):
        return _forbid()
    convs = Tla3bnyConversation.query.filter_by(competition_id=comp_id).all()
    convs.sort(
        key=lambda c: (c.messages[-1].created_at if c.messages else c.created_at),
        reverse=True,
    )
    return jsonify([c.to_dict(side="organizer") for c in convs])


@tla3bny_bp.get("/my-conversations")
@auth.login_required
def my_conversations():
    """The academy/team side: the caller's team threads across competitions."""
    user = auth.current_user()
    team_ids: set[int] = set()
    if user.role == "team" and user.team_id:
        team_ids.add(user.team_id)
    elif user.role == "academy" and user.academy_id:
        team_ids = {t.id for t in Tla3bnyTeam.query.filter_by(academy_id=user.academy_id)}
    else:
        return jsonify([])
    if not team_ids:
        return jsonify([])
    convs = Tla3bnyConversation.query.filter(
        Tla3bnyConversation.team_id.in_(team_ids)).all()
    convs.sort(
        key=lambda c: (c.messages[-1].created_at if c.messages else c.created_at),
        reverse=True,
    )
    return jsonify([c.to_dict(side="academy") for c in convs])


@tla3bny_bp.get("/competitions/<int:comp_id>/teams/<int:team_id>/messages")
@auth.login_required
def get_thread(comp_id: int, team_id: int):
    """The thread for (comp, team). Marks it read for the caller's side. Returns an
    empty thread (no conversation row yet) before the first message is sent."""
    team = Tla3bnyTeam.query.get_or_404(team_id)
    side = _user_side(auth.current_user(), comp_id, team)
    if side is None:
        return _forbid()
    conv = Tla3bnyConversation.query.filter_by(
        competition_id=comp_id, team_id=team_id).first()
    if conv is None:
        return jsonify({"conversation_id": None, "messages": [], "team_name": team.display_name()})
    if side == "academy":
        conv.academy_last_read_at = _utcnow()
    else:
        conv.organizer_last_read_at = _utcnow()
    db.session.commit()
    return jsonify({
        "conversation_id": conv.id,
        "team_name": team.display_name(),
        "messages": [m.to_dict() for m in conv.messages],
    })


@tla3bny_bp.post("/competitions/<int:comp_id>/teams/<int:team_id>/messages")
@auth.login_required
def send_message(comp_id: int, team_id: int):
    """Send a message in the (comp, team) thread and ping the other side."""
    team = Tla3bnyTeam.query.get_or_404(team_id)
    user = auth.current_user()
    side = _user_side(user, comp_id, team)
    if side is None:
        return _forbid()
    if not _team_in_comp(comp_id, team_id):
        return _err("هذا الفريق غير مشارك في البطولة", 409)
    body = (request.get_json(silent=True) or {}).get("body") or ""
    body = body.strip()[:2000]
    if not body:
        return _err("الرسالة فارغة")

    conv = _get_or_create_conversation(comp_id, team)
    msg = Tla3bnyMessage(
        conversation_id=conv.id, sender_user_id=user.id, sender_side=side, body=body)
    db.session.add(msg)
    now = _utcnow()
    # The sender has, by definition, read the thread up to their own message.
    if side == "academy":
        conv.academy_last_read_at = now
    else:
        conv.organizer_last_read_at = now
    db.session.flush()
    try:
        notifications.notify_tla3bny_chat(
            conv.competition_id, team.id, team.display_name(), side, body[:80])
    except Exception:  # noqa: BLE001 - a push failure must never block the message
        pass
    db.session.commit()
    return jsonify(msg.to_dict()), 201
