"""Honours: titles, individual awards, and the best XI of a round.

The competition's organizer grants every award; for the stat-based ones (top
scorer / assister) the app suggests the current leader as a one-click shortcut,
but the organizer always confirms. Reads are public — honours show up on player,
team, academy and competition pages.
"""
from collections import defaultdict

from flask import jsonify, request

from app.extensions import db
from app.models import (
    Tla3bnyAward,
    Tla3bnyCoach,
    Tla3bnyCompetition,
    Tla3bnyCompetitionAge,
    Tla3bnyCompetitionPlayer,
    Tla3bnyCompetitionTeam,
    Tla3bnyMatch,
    Tla3bnyMatchEvent,
    Tla3bnyNews,
    Tla3bnyPlayer,
    Tla3bnyPlayerTeam,
    Tla3bnyTeam,
    Tla3bnyTeamOfRound,
    Tla3bnyTeamOfRoundSlot,
)
from app.models.codes import (
    TLA3BNY_AWARD_TYPE,
    TLA3BNY_COACH_AWARD_TYPES,
    TLA3BNY_TEAM_AWARD_TYPES,
)
from app.services import tla3bny_auth as auth
from app.services import tla3bny_tables as tables

from . import tla3bny_bp
from .audit import _log
from ._helpers import _err, _forbid, _int, _utcnow

_FINISHED = ("finished", "completed")


# ── helpers ──────────────────────────────────────────────────────────────────
def _admin(comp_id: int) -> bool:
    return auth.is_competition_admin(auth.current_user(), comp_id)


def _player_row(p: Tla3bnyPlayer | None, count: int | None = None, detail: str | None = None) -> dict:
    if p is None:
        return {}
    cur = p.current_membership()
    team = cur.team if cur else None
    row = {
        "player_id": p.id,
        "player_name": p.name,
        "player_name_en": p.name_en,
        "photo_path": p.photo_path,
        "team_id": team.id if team else None,
        "team_name": team.display_name() if team else None,
    }
    if count is not None:
        row["count"] = count
    if detail is not None:
        row["detail"] = detail
    return row


def _event_counts(comp_id, cage_id=None, round_=None, match_id=None, event_type="goal"):
    """{player_id: count} of an event type over finished matches in scope."""
    mq = db.session.query(Tla3bnyMatch.id).filter(
        Tla3bnyMatch.competition_id == comp_id,
        Tla3bnyMatch.status.in_(_FINISHED),
    )
    if match_id:
        mq = mq.filter(Tla3bnyMatch.id == match_id)
    if cage_id:
        mq = mq.filter(Tla3bnyMatch.competition_age_id == cage_id)
    if round_:
        mq = mq.filter(Tla3bnyMatch.round == round_)
    ids = [r[0] for r in mq.all()]
    counts: dict[int, int] = defaultdict(int)
    if ids:
        for pid, etype, own in db.session.query(
            Tla3bnyMatchEvent.player_id,
            Tla3bnyMatchEvent.event_type,
            Tla3bnyMatchEvent.is_own_goal,
        ).filter(
            Tla3bnyMatchEvent.match_id.in_(ids),
            Tla3bnyMatchEvent.player_id.isnot(None),
            Tla3bnyMatchEvent.event_type == event_type,
        ).all():
            if etype == "goal" and own:
                continue
            counts[pid] += 1
    return counts


def _top_players(counts: dict[int, int], limit: int = 5) -> list[dict]:
    if not counts:
        return []
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:limit]
    players = {
        p.id: p for p in
        Tla3bnyPlayer.query.filter(Tla3bnyPlayer.id.in_([pid for pid, _ in top])).all()
    }
    out = [_player_row(players.get(pid), cnt) for pid, cnt in top]
    return [r for r in out if r]


# ── auto-published news for granted honours ─────────────────────────────────
_AWARD_NEWS = {
    "champion":        ("🏆", "بطل البطولة"),
    "runner_up":       ("🥈", "وصيف البطولة"),
    "third_place":     ("🥉", "صاحب المركز الثالث"),
    "top_scorer":      ("⚽", "هدّاف البطولة"),
    "top_assister":    ("🅰️", "صانع الألعاب"),
    "best_player":     ("⭐", "أفضل لاعب"),
    "best_goalkeeper": ("🧤", "أفضل حارس مرمى"),
    "player_of_round": ("🌟", "لاعب الجولة"),
    "player_of_match": ("🎖️", "رجل المباراة"),
    "best_coach":      ("🎓", "أفضل مدرب"),
    "coach_of_round":  ("📋", "مدرب الجولة"),
}


def _award_recipient(award):
    """(display name, photo) for the winner — a player's profile photo, a coach's
    photo, or a team's own photo (falling back to its academy logo)."""
    if award.team is not None:
        photo = award.team.photo_path or (
            award.team.academy.logo_path if award.team.academy else None)
        return award.team.display_name(), photo
    if award.coach is not None:
        return award.coach.name, award.coach.photo_path
    if award.player is not None:
        return award.player.name, award.player.photo_path
    return "", None


def _announce_award(award):
    """Publish a competition news item for a granted honour, illustrated with the
    winner's photo. Call after the award row is flushed (relationships resolvable)."""
    meta = _AWARD_NEWS.get(award.award_type)
    if meta is None:
        return
    emoji, role = meta
    name, photo = _award_recipient(award)
    if not name:
        return
    scope = (award.competition_age.name if award.competition_age else None) \
        or (award.competition.name if award.competition else "")
    role_full = f"{role} — {award.round}" if award.round else role
    title = f"{emoji} {name} — {role_full}"
    if award.award_type == "player_of_match" and award.match_id:
        mt = Tla3bnyMatch.query.get(award.match_id)
        if mt and mt.home_team and mt.away_team:
            body = f"{name} رجل مباراة {mt.home_team.display_name()} × {mt.away_team.display_name()}."
        else:
            body = f"{name} رجل المباراة."
    else:
        body = f"حصل {name} على لقب «{role_full}»"
        body += f" في {scope}." if scope else "."
    user = auth.current_user()
    db.session.add(Tla3bnyNews(
        competition_id=award.competition_id,
        title=title[:255], body=body, image_path=photo,
        news_date=_utcnow().date(), is_published=True,
        author_user_id=user.id if user else None,
    ))


def _announce_team_of_round(totr):
    """Publish a news item for a team-of-the-round best XI, listing every player
    and the team they play for."""
    lines = []
    for s in sorted(totr.slots, key=lambda x: x.sort_order):
        p = s.player
        if not p:
            continue
        cur = p.current_membership()
        team_name = cur.team.display_name() if cur and cur.team else "—"
        pos = f"{s.position_slot}: " if s.position_slot else ""
        lines.append(f"{pos}{p.name} ({team_name})")
    if not lines:
        return
    scope = totr.competition_age.name if totr.competition_age else ""
    header = f"تشكيلة {totr.round}" + (f" — {scope}" if scope else "")
    user = auth.current_user()
    db.session.add(Tla3bnyNews(
        competition_id=totr.competition_id,
        title=f"👕 {header} — أفضل {len(lines)}"[:255],
        body=header + ":\n" + "\n".join(lines),
        news_date=_utcnow().date(), is_published=True,
        author_user_id=user.id if user else None,
    ))


# ── competition awards: list (public) / grant / revoke (admin) ───────────────
@tla3bny_bp.get("/competitions/<int:comp_id>/awards")
def list_competition_awards(comp_id: int):
    """Every honour in a competition — public (drives the competition Honours tab
    and the player/team profiles)."""
    awards = (
        Tla3bnyAward.query.filter_by(competition_id=comp_id)
        .order_by(Tla3bnyAward.competition_age_id, Tla3bnyAward.award_type)
        .all()
    )
    return jsonify([a.to_dict() for a in awards])


@tla3bny_bp.get("/competitions/<int:comp_id>/coaches")
def competition_coaches(comp_id: int):
    """The coaches of the teams entered in this competition — the pool an organizer
    picks a coach-award (best coach / coach of the round) winner from. Public.
    Optional ``?competition_age_id=`` narrows it to one sub-competition."""
    cage_id = _int(request.args.get("competition_age_id"))
    q = (
        db.session.query(Tla3bnyCoach, Tla3bnyTeam)
        .join(Tla3bnyTeam, Tla3bnyCoach.team_id == Tla3bnyTeam.id)
        .join(Tla3bnyCompetitionTeam, Tla3bnyCompetitionTeam.team_id == Tla3bnyTeam.id)
        .filter(
            Tla3bnyCompetitionTeam.competition_id == comp_id,
            Tla3bnyCoach.end_date.is_(None),  # current staff only
        )
    )
    if cage_id:
        q = q.filter(Tla3bnyCompetitionTeam.competition_age_id == cage_id)
    seen: set[int] = set()
    out = []
    for coach, team in q.order_by(Tla3bnyTeam.id, Tla3bnyCoach.sort_order).all():
        if coach.id in seen:
            continue
        seen.add(coach.id)
        out.append({
            "id": coach.id,
            "name": coach.name,
            "name_en": coach.name_en,
            "photo_path": coach.photo_path,
            "role_ar": coach.role_ar,
            "team_id": team.id,
            "team_name": team.display_name(),
            "team_name_en": team.display_name("en"),
        })
    return jsonify(out)


@tla3bny_bp.post("/competitions/<int:comp_id>/awards")
@auth.login_required
def grant_award(comp_id: int):
    """Grant one honour. Team titles need a team_id; every other type needs a
    player_id. A singular award replaces the previous holder of the same scope:
    per sub-competition for titles/stat/best awards, per match for
    player-of-the-match, per (sub-competition, round) for player-of-the-round."""
    if not _admin(comp_id):
        return _forbid()
    Tla3bnyCompetition.query.get_or_404(comp_id)
    data = request.get_json(silent=True) or {}
    atype = data.get("award_type")
    if atype not in TLA3BNY_AWARD_TYPE:
        return _err("invalid award_type")
    is_team = atype in TLA3BNY_TEAM_AWARD_TYPES
    is_coach = atype in TLA3BNY_COACH_AWARD_TYPES
    player_id = _int(data.get("player_id"))
    team_id = _int(data.get("team_id"))
    coach_id = _int(data.get("coach_id"))
    if is_team and not team_id:
        return _err("team_id is required for a team title")
    if is_coach and not coach_id:
        return _err("coach_id is required for a coach award")
    if not is_team and not is_coach and not player_id:
        return _err("player_id is required for this award")
    cage_id = _int(data.get("competition_age_id"))
    round_ = (data.get("round") or "").strip() or None
    match_id = _int(data.get("match_id"))
    if atype == "player_of_match" and not match_id:
        return _err("match_id is required for player of the match")
    if atype in ("player_of_round", "coach_of_round") and not round_:
        return _err("round is required for a round award")

    # Validate the recipient belongs to this competition. Without this an admin
    # could pin a player award (top scorer, best player, player of the round/
    # match) onto ANY player in the database, and it would surface on that
    # player's public achievements — the same cross-competition pollution
    # enter_result guards against for events. (_approved_in_competition is
    # defined below; resolved at call time.)
    if is_team:
        in_comp = Tla3bnyCompetitionTeam.query.filter_by(
            competition_id=comp_id, team_id=team_id
        ).first()
        if not in_comp:
            return _err("هذا الفريق غير مشارك في البطولة", 409)
    elif is_coach:
        coach = Tla3bnyCoach.query.get_or_404(coach_id)
        # The coach must belong to a team entered in this competition, so a coach
        # award can't be pinned onto an unrelated coach.
        in_comp = Tla3bnyCompetitionTeam.query.filter_by(
            competition_id=comp_id, team_id=coach.team_id
        ).first()
        if not in_comp:
            return _err("هذا المدرب لا يتبع فريقًا مشاركًا في البطولة", 409)
    else:
        Tla3bnyPlayer.query.get_or_404(player_id)
        if not _approved_in_competition(player_id, comp_id):
            return _err("هذا اللاعب غير مسجّل في هذه البطولة", 409)

    # Replace the previous holder of the same singular scope.
    q = Tla3bnyAward.query.filter_by(competition_id=comp_id, award_type=atype)
    if atype == "player_of_match":
        q = q.filter_by(match_id=match_id)
    elif atype in ("player_of_round", "coach_of_round"):
        q = q.filter_by(competition_age_id=cage_id, round=round_)
    else:
        q = q.filter_by(competition_age_id=cage_id)
    existing = q.all()
    new_player = player_id if not is_team and not is_coach else None
    new_team = team_id if is_team else None
    new_coach = coach_id if is_coach else None
    # Re-granting to the same winner shouldn't publish a duplicate announcement.
    same_winner = any(
        o.player_id == new_player and o.team_id == new_team and o.coach_id == new_coach
        for o in existing
    )
    for old in existing:
        db.session.delete(old)

    award = Tla3bnyAward(
        competition_id=comp_id,
        competition_age_id=cage_id,
        award_type=atype,
        round=round_,
        match_id=match_id,
        player_id=new_player,
        team_id=new_team,
        coach_id=new_coach,
        note=(data.get("note") or "").strip() or None,
        created_by_user_id=auth.current_user().id,
    )
    db.session.add(award)
    db.session.flush()
    _log("award_granted", "award", award.id, {
        "award_type": atype, "player_id": award.player_id,
        "team_id": award.team_id, "coach_id": award.coach_id,
    }, competition_id=comp_id)
    if not same_winner:
        _announce_award(award)
    db.session.commit()
    return jsonify(award.to_dict()), 201


@tla3bny_bp.put("/matches/<int:match_id>/player-of-match")
@auth.login_required
def set_player_of_match(match_id: int):
    """Set (or clear) the player of the match, straight from the match's own edit
    panel. ``player_id`` null/absent clears it. Returns the updated match so the
    card and detail refresh with the new pick."""
    match = Tla3bnyMatch.query.get_or_404(match_id)
    if not _admin(match.competition_id):
        return _forbid()
    player_id = _int((request.get_json(silent=True) or {}).get("player_id"))
    # A set (non-clearing) pick must be a real participant of this competition —
    # otherwise any player id could be pinned as player of the match and shown on
    # that player's public achievements.
    if player_id and not _approved_in_competition(player_id, match.competition_id):
        return _err("هذا اللاعب غير مسجّل في هذه البطولة", 409)
    prev = Tla3bnyAward.query.filter_by(
        match_id=match_id, award_type="player_of_match"
    ).first()
    already = prev is not None and prev.player_id == player_id
    Tla3bnyAward.query.filter_by(
        match_id=match_id, award_type="player_of_match"
    ).delete(synchronize_session=False)
    if player_id:
        award = Tla3bnyAward(
            competition_id=match.competition_id,
            competition_age_id=match.competition_age_id,
            award_type="player_of_match",
            match_id=match_id,
            player_id=player_id,
            created_by_user_id=auth.current_user().id,
        )
        db.session.add(award)
        db.session.flush()
        if not already:
            _announce_award(award)
    db.session.commit()
    return jsonify(match.to_dict(include_events=True))


@tla3bny_bp.delete("/awards/<int:award_id>")
@auth.login_required
def revoke_award(award_id: int):
    award = Tla3bnyAward.query.get_or_404(award_id)
    if not _admin(award.competition_id):
        return _forbid()
    _log("award_revoked", "award", award.id, {"award_type": award.award_type},
         competition_id=award.competition_id)
    db.session.delete(award)
    db.session.commit()
    return jsonify({"message": "revoked"})


# ── suggestions (admin) ──────────────────────────────────────────────────────
@tla3bny_bp.get("/competitions/<int:comp_id>/awards/suggestions")
@auth.login_required
def award_suggestions(comp_id: int):
    """Best-guess winners the organizer can accept with one tap. Empty for the
    purely subjective awards (best player / goalkeeper)."""
    if not _admin(comp_id):
        return _forbid()
    atype = request.args.get("award_type", "")
    cage_id = request.args.get("competition_age_id", type=int)
    round_ = request.args.get("round")
    match_id = request.args.get("match_id", type=int)

    if atype == "top_scorer":
        return jsonify({"players": _top_players(_event_counts(comp_id, cage_id, event_type="goal"))})
    if atype == "top_assister":
        return jsonify({"players": _top_players(_event_counts(comp_id, cage_id, event_type="assist"))})
    if atype == "player_of_round":
        return jsonify({"players": _top_players(_event_counts(comp_id, cage_id, round_=round_, event_type="goal"))})
    if atype == "player_of_match":
        return jsonify({"players": _top_players(_event_counts(comp_id, cage_id, match_id=match_id, event_type="goal"))})
    if atype in TLA3BNY_TEAM_AWARD_TYPES:
        # Standings leaders (works for league stages; knockout is picked by hand).
        age_id = 0
        if cage_id:
            cage = Tla3bnyCompetitionAge.query.get(cage_id)
            age_id = cage.age_category_id if cage else 0
        teams: list[dict] = []
        try:
            groups = tables.standings_by_group(comp_id, age_id, cage_id=cage_id)
        except Exception:  # noqa: BLE001 - a standings hiccup shouldn't 500 the picker
            groups = []
        for g in groups:
            for row in g.get("standings", [])[:3]:
                teams.append({
                    "team_id": row.get("team_id"),
                    "team_name": row.get("team_name"),
                    "detail": f"{row.get('Pts', 0)} نقطة",
                })
        return jsonify({"teams": teams})
    return jsonify({"players": [], "teams": []})


# ── round labels (for the admin pickers) ─────────────────────────────────────
@tla3bny_bp.get("/competitions/<int:comp_id>/rounds")
def competition_rounds(comp_id: int):
    """Distinct round labels used by this competition's matches, for the round
    pickers on player-of-the-round and team-of-the-round."""
    cage_id = request.args.get("competition_age_id", type=int)
    q = db.session.query(Tla3bnyMatch.round).filter(
        Tla3bnyMatch.competition_id == comp_id,
        Tla3bnyMatch.round.isnot(None),
    )
    if cage_id:
        q = q.filter(Tla3bnyMatch.competition_age_id == cage_id)
    return jsonify(sorted({r[0] for r in q.all() if r[0]}))


# ── team of the round (best XI) ──────────────────────────────────────────────
@tla3bny_bp.get("/competitions/<int:comp_id>/team-of-round")
def get_team_of_round(comp_id: int):
    """One round's best XI (pass ``round``), or every round's for a scope."""
    cage_id = request.args.get("competition_age_id", type=int)
    round_ = request.args.get("round")
    q = Tla3bnyTeamOfRound.query.filter_by(competition_id=comp_id)
    if cage_id:
        q = q.filter_by(competition_age_id=cage_id)
    if round_:
        totr = q.filter_by(round=round_).first()
        return jsonify(totr.to_dict() if totr else None)
    return jsonify([t.to_dict() for t in q.order_by(Tla3bnyTeamOfRound.round).all()])


@tla3bny_bp.put("/competitions/<int:comp_id>/team-of-round")
@auth.login_required
def upsert_team_of_round(comp_id: int):
    """Create or replace a round's best XI. Body: round, competition_age_id?,
    formation?, slots:[{player_id, position_slot, sort_order}]."""
    if not _admin(comp_id):
        return _forbid()
    Tla3bnyCompetition.query.get_or_404(comp_id)
    data = request.get_json(silent=True) or {}
    round_ = (data.get("round") or "").strip()
    if not round_:
        return _err("round is required")
    cage_id = _int(data.get("competition_age_id"))
    slots = data.get("slots") or []

    totr = Tla3bnyTeamOfRound.query.filter_by(
        competition_id=comp_id, competition_age_id=cage_id, round=round_
    ).first()
    was_new = totr is None
    if totr is None:
        totr = Tla3bnyTeamOfRound(
            competition_id=comp_id, competition_age_id=cage_id, round=round_,
            created_by_user_id=auth.current_user().id,
        )
        db.session.add(totr)
    totr.formation = (data.get("formation") or "").strip() or None
    for old in list(totr.slots):
        db.session.delete(old)
    db.session.flush()
    for i, s in enumerate(slots):
        pid = _int(s.get("player_id"))
        if not pid:
            continue
        db.session.add(Tla3bnyTeamOfRoundSlot(
            team_of_round_id=totr.id,
            player_id=pid,
            position_slot=(s.get("position_slot") or "").strip() or None,
            sort_order=_int(s.get("sort_order")) if s.get("sort_order") is not None else i,
        ))
    db.session.flush()
    _log("team_of_round_set", "team_of_round", totr.id, {"round": round_},
         competition_id=comp_id)
    # Announce a newly published best XI (not on every later edit).
    if was_new:
        _announce_team_of_round(totr)
    db.session.commit()
    return jsonify(totr.to_dict())


@tla3bny_bp.delete("/team-of-round/<int:totr_id>")
@auth.login_required
def delete_team_of_round(totr_id: int):
    totr = Tla3bnyTeamOfRound.query.get_or_404(totr_id)
    if not _admin(totr.competition_id):
        return _forbid()
    db.session.delete(totr)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ── public honours surfaces: player / team / academy ─────────────────────────
def _approved_in_competition(player_id: int, competition_id: int) -> bool:
    return db.session.query(Tla3bnyCompetitionPlayer.id).join(
        Tla3bnyCompetitionTeam,
        Tla3bnyCompetitionPlayer.competition_team_id == Tla3bnyCompetitionTeam.id,
    ).filter(
        Tla3bnyCompetitionTeam.competition_id == competition_id,
        Tla3bnyCompetitionPlayer.player_id == player_id,
        Tla3bnyCompetitionPlayer.status == "approved",
    ).first() is not None


@tla3bny_bp.get("/players/<int:player_id>/achievements")
def player_achievements(player_id: int):
    """A player's honours across competitions: their individual awards, the
    titles their team won while they were in that competition, and the best XIs
    they were picked in."""
    Tla3bnyPlayer.query.get_or_404(player_id)
    individual = (
        Tla3bnyAward.query.filter_by(player_id=player_id)
        .order_by(Tla3bnyAward.competition_id.desc()).all()
    )
    team_ids = {
        m.team_id for m in Tla3bnyPlayerTeam.query.filter_by(player_id=player_id).all()
    }
    titles = []
    if team_ids:
        for a in Tla3bnyAward.query.filter(
            Tla3bnyAward.team_id.in_(team_ids),
            Tla3bnyAward.award_type.in_(TLA3BNY_TEAM_AWARD_TYPES),
        ).all():
            if _approved_in_competition(player_id, a.competition_id):
                titles.append(a)
    totr = []
    for s in Tla3bnyTeamOfRoundSlot.query.filter_by(player_id=player_id).all():
        t = s.team_of_round
        if not t:
            continue
        totr.append({
            "competition_id": t.competition_id,
            "sub_competition_name": t.competition_age.name if t.competition_age else None,
            "round": t.round,
            "position_slot": s.position_slot,
        })
    return jsonify({
        "individual_awards": [a.to_dict() for a in individual],
        "team_titles": [a.to_dict() for a in titles],
        "team_of_round": totr,
    })


@tla3bny_bp.get("/teams/<int:team_id>/honours")
def team_honours(team_id: int):
    """A team's titles, plus the individual awards won by its current squad."""
    Tla3bnyTeam.query.get_or_404(team_id)
    titles = (
        Tla3bnyAward.query.filter(
            Tla3bnyAward.team_id == team_id,
            Tla3bnyAward.award_type.in_(TLA3BNY_TEAM_AWARD_TYPES),
        ).order_by(Tla3bnyAward.competition_id.desc()).all()
    )
    squad_ids = {
        m.player_id for m in
        Tla3bnyPlayerTeam.query.filter_by(team_id=team_id, end_date=None).all()
    }
    player_awards = []
    if squad_ids:
        # Only awards a squad member won *while registered under this team* are
        # this team's honours — a player who won elsewhere before transferring in
        # shouldn't pad this team's trophy list. Individual awards carry no
        # team_id (only titles do), so scope by the competition the player was in
        # this team for: the (player, competition) pairs where the player has an
        # approved registration under this team.
        team_regs = {
            (pid, cid)
            for pid, cid in db.session.query(
                Tla3bnyCompetitionPlayer.player_id,
                Tla3bnyCompetitionTeam.competition_id,
            ).join(
                Tla3bnyCompetitionTeam,
                Tla3bnyCompetitionPlayer.competition_team_id
                == Tla3bnyCompetitionTeam.id,
            ).filter(
                Tla3bnyCompetitionTeam.team_id == team_id,
                Tla3bnyCompetitionPlayer.player_id.in_(squad_ids),
                Tla3bnyCompetitionPlayer.status == "approved",
            ).all()
        }
        if team_regs:
            candidates = Tla3bnyAward.query.filter(
                Tla3bnyAward.player_id.in_(squad_ids)
            ).order_by(Tla3bnyAward.competition_id.desc()).all()
            player_awards = [
                a for a in candidates
                if (a.player_id, a.competition_id) in team_regs
            ]
    return jsonify({
        "titles": [a.to_dict() for a in titles],
        "player_awards": [a.to_dict() for a in player_awards],
    })


@tla3bny_bp.get("/academies/<int:academy_id>/honours")
def academy_honours(academy_id: int):
    """Every title won by any of the academy's teams — the trophy cabinet."""
    team_ids = [t.id for t in Tla3bnyTeam.query.filter_by(academy_id=academy_id).all()]
    if not team_ids:
        return jsonify([])
    titles = (
        Tla3bnyAward.query.filter(
            Tla3bnyAward.team_id.in_(team_ids),
            Tla3bnyAward.award_type.in_(TLA3BNY_TEAM_AWARD_TYPES),
        ).order_by(Tla3bnyAward.competition_id.desc()).all()
    )
    return jsonify([a.to_dict() for a in titles])
