"""Push notifications for tla3bny: device topic subscription (public) and the
per-competition round-results digest (competition admin).

Mirrors the youthscores push endpoints (app/api/admin.py) but on the tla3bny
blueprint and with tla3bny-namespaced topics, so a follow here never crosses over
to a youthscores competition of the same id.
"""
from flask import jsonify, request

from app.extensions import db, limiter
from app.models import (
    Tla3bnyCompetition,
    Tla3bnyCompetitionAdmin,
    Tla3bnyCompetitionAge,
    Tla3bnyMatch,
)
from app.services import notifications
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import _err, _forbid, _int

# Both status values mean "a result has been entered" (as elsewhere in tla3bny).
_FINISHED = ("finished", "completed")


def _push_token(j: dict) -> str | None:
    """A plausible FCM registration token from the body, or None (abuse guard)."""
    token = (j.get("token") or "").strip()
    return token if 100 <= len(token) <= 400 else None


@tla3bny_bp.post("/push/subscribe")
@limiter.limit("30 per minute")
def t3_push_subscribe():
    """Public: join the always-on tla3bny news topic."""
    token = _push_token(request.get_json(silent=True) or {})
    if not token:
        return _err("token is required", 400)
    result = notifications.subscribe_token_to_topic(token, notifications.TLA3BNY_TOPIC_NEWS)
    return jsonify({"subscribed": {notifications.TLA3BNY_TOPIC_NEWS: result}})


@tla3bny_bp.post("/push/follow")
@limiter.limit("60 per minute")
def t3_push_follow():
    """Public: subscribe a device token to one competition's results topic."""
    j = request.get_json(silent=True) or {}
    token = _push_token(j)
    if not token:
        return _err("token is required", 400)
    cid = _int(j.get("competition_id")) or 0
    if cid <= 0:
        return _err("competition_id is required", 400)
    result = notifications.subscribe_token_to_topic(
        token, notifications.tla3bny_competition_topic(cid)
    )
    return jsonify({"followed": cid, "result": result})


@tla3bny_bp.post("/push/unfollow")
@limiter.limit("60 per minute")
def t3_push_unfollow():
    """Public: unsubscribe a device token from one competition's results topic."""
    j = request.get_json(silent=True) or {}
    token = _push_token(j)
    if not token:
        return _err("token is required", 400)
    cid = _int(j.get("competition_id")) or 0
    if cid <= 0:
        return _err("competition_id is required", 400)
    result = notifications.unsubscribe_token_from_topic(
        token, notifications.tla3bny_competition_topic(cid)
    )
    return jsonify({"unfollowed": cid, "result": result})


@tla3bny_bp.post("/push/subscribe-account")
@auth.login_required
def t3_push_subscribe_account():
    """Subscribe a logged-in staff/academy device to its private topics. The
    topics are derived from the authenticated user server-side (never trusted from
    the client): an academy gets the academies + its own academy topic; a
    competition admin gets each competition it runs. Called after login."""
    token = _push_token(request.get_json(silent=True) or {})
    if not token:
        return _err("token is required", 400)
    user = auth.current_user()
    topics: list[str] = []
    if user.role == "academy" and user.academy_id:
        topics.append(notifications.TLA3BNY_TOPIC_ACADEMIES)
        topics.append(notifications.tla3bny_academy_topic(user.academy_id))
        # The owner follows every team's chat topic, so a reply to any of its
        # teams reaches them.
        from app.models import Tla3bnyTeam
        for (tid,) in db.session.query(Tla3bnyTeam.id).filter_by(academy_id=user.academy_id):
            topics.append(notifications.tla3bny_team_topic(tid))
    if user.role == "team" and user.team_id:
        topics.append(notifications.tla3bny_team_topic(user.team_id))
    if user.role == "competition_admin":
        for (cid,) in db.session.query(Tla3bnyCompetitionAdmin.competition_id).filter_by(user_id=user.id):
            topics.append(notifications.tla3bny_compadmin_topic(cid))
    results = {t: notifications.subscribe_token_to_topic(token, t) for t in topics}
    return jsonify({"subscribed": results})


@tla3bny_bp.post("/competitions/<int:cid>/notify-round")
@auth.login_required
def t3_notify_round(cid: int):
    """Competition admin: send ONE results digest for a round to this
    competition's followers. `round` (and optional `competition_age_id`) scope
    which completed matches count."""
    comp = Tla3bnyCompetition.query.get(cid)
    if comp is None:
        return _err("البطولة غير موجودة", 404)
    if not auth.is_competition_admin(auth.current_user(), cid):
        return _forbid()

    j = request.get_json(silent=True) or {}
    round_label = (str(j.get("round") or "")).strip()
    cage_id = _int(j.get("competition_age_id"))

    q = Tla3bnyMatch.query.filter(
        Tla3bnyMatch.competition_id == cid,
        Tla3bnyMatch.status.in_(_FINISHED),
    )
    if round_label:
        q = q.filter(Tla3bnyMatch.round == round_label)
    if cage_id:
        q = q.filter(Tla3bnyMatch.competition_age_id == cage_id)
    completed = q.all()
    if not completed:
        return _err("لا توجد مباريات مكتملة في هذه الجولة", 400)

    age_label = None
    if cage_id:
        cage = Tla3bnyCompetitionAge.query.get(cage_id)
        if cage:
            age_label = getattr(cage, "name", None)

    result = notifications.notify_tla3bny_round_results(comp, round_label, completed, age_label)
    return jsonify({"notification": result, "count": len(completed)})
