from collections import defaultdict
from datetime import datetime, timedelta

from flask import jsonify, request
from sqlalchemy import func
from sqlalchemy.orm import joinedload, selectinload

from app.extensions import db
from app.models import (
    Tla3bnyAward,
    Tla3bnyCompetition,
    Tla3bnyCompetitionAge,
    Tla3bnyCompetitionPlayer,
    Tla3bnyCompetitionTeam,
    Tla3bnyLineup,
    Tla3bnyLineupSlot,
    Tla3bnyMatch,
    Tla3bnyMatchEvent,
    Tla3bnyPlayer,
    Tla3bnyPlayerTeam,
    Tla3bnyStage,
    Tla3bnyTeam,
)
from app.models import codes
from app.services import notifications
from app.services import tla3bny_auth as auth
from app.services import tla3bny_tables as tables

from . import tla3bny_bp
from .audit import _log
from ._helpers import (
    _clamp_int,
    _clip,
    _err,
    _forbid,
    _int,
    _parse_date,
    _parse_date_or_error,
    _utcnow,
)

# Both status values used for "a result has been entered".
_FINISHED = ("finished", "completed")


@tla3bny_bp.get("/matches")
def list_matches():
    # Eager-load every relationship Tla3bnyMatch.to_dict() touches, so a list of
    # N matches costs a handful of queries instead of ~10 per match (N+1). The
    # collection (competition.ages, used by the `rules` property) is loaded with
    # selectinload to avoid multiplying the row count; the rest are 1:1 joins.
    q = Tla3bnyMatch.query.options(
        joinedload(Tla3bnyMatch.competition)
        .selectinload(Tla3bnyCompetition.ages)
        .joinedload(Tla3bnyCompetitionAge.age_category),
        joinedload(Tla3bnyMatch.age_category),
        joinedload(Tla3bnyMatch.competition_age).joinedload(
            Tla3bnyCompetitionAge.age_category
        ),
        joinedload(Tla3bnyMatch.stage),
        joinedload(Tla3bnyMatch.group),
        joinedload(Tla3bnyMatch.home_team).joinedload(Tla3bnyTeam.academy),
        joinedload(Tla3bnyMatch.home_team).joinedload(Tla3bnyTeam.age_category),
        joinedload(Tla3bnyMatch.away_team).joinedload(Tla3bnyTeam.academy),
        joinedload(Tla3bnyMatch.away_team).joinedload(Tla3bnyTeam.age_category),
        selectinload(Tla3bnyMatch.player_of_match_award).joinedload(Tla3bnyAward.player),
    )
    for field in ("competition_id", "age_category_id", "competition_age_id", "stage_id", "group_id"):
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
    d = _parse_date(request.args.get("date"))
    if d:
        q = q.filter(Tla3bnyMatch.date == d)
    # A date window, so the home feed can pull "today onwards" and "before
    # today" separately and page outwards from today the way youthscores does.
    date_from = _parse_date(request.args.get("from"))
    if date_from:
        q = q.filter(Tla3bnyMatch.date >= date_from)
    date_to = _parse_date(request.args.get("to"))
    if date_to:
        q = q.filter(Tla3bnyMatch.date <= date_to)

    ascending = request.args.get("order") == "asc"
    if ascending:
        # Ascending is only ever asked for by the date-window feed, which wants
        # the nearest fixture first; a dateless one has no place in that order.
        q = q.filter(Tla3bnyMatch.date.isnot(None))
        q = q.order_by(Tla3bnyMatch.date.asc(), Tla3bnyMatch.time.asc())
    else:
        # date IS NULL sorts TBD fixtures last — MySQL has no NULLS LAST.
        q = q.order_by(
            Tla3bnyMatch.date.is_(None),
            Tla3bnyMatch.date.desc(),
            Tla3bnyMatch.time.desc(),
        )
    # Always bound the result set — an unfiltered call must not stream the whole
    # matches table. Callers that need more page with limit + from/to windows.
    limit = request.args.get("limit", type=int)
    q = q.limit(min(limit, 500) if limit else 500)
    return jsonify([m.to_dict() for m in q.all()])


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
    # Prefer competition_age_id; derive age_category_id from the sub-competition.
    cage_id = _int(data.get("competition_age_id"))
    cage = Tla3bnyCompetitionAge.query.get(cage_id) if cage_id else None
    age_id = cage.age_category_id if cage else _int(data.get("age_category_id"))
    home_id = _int(data.get("home_team_id"))
    away_id = _int(data.get("away_team_id"))
    err = _validate_match_teams(comp_id, age_id, home_id, away_id)
    if err:
        return _err(err, 409)
    match = Tla3bnyMatch(
        competition_id=comp_id,
        age_category_id=age_id,
        competition_age_id=cage_id,
        stage_id=_int(data.get("stage_id")),
        group_id=_int(data.get("group_id")),
        home_team_id=home_id,
        away_team_id=away_id,
        date=_parse_date(data.get("date")),
        time=_clip(data.get("time"), 10),
        venue=_clip(data.get("venue"), 255),
        round=_clip(data.get("round"), 120),
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
    if "status" in data and data.get("status") not in codes.TLA3BNY_MATCH_STATUS:
        return _err("Invalid match status", 400)
    if "status" in data:
        match.status = data.get("status")
    # Clip the free-text fields to their column lengths — an over-long value
    # would otherwise raise a DataError (500) and poison the session. Column
    # widths: time String(10), venue String(255), round String(120).
    for field, maxlen in (("time", 10), ("venue", 255), ("round", 120)):
        if field in data:
            setattr(match, field, _clip(data.get(field), maxlen))
    if "date" in data:
        d, derr = _parse_date_or_error(data.get("date"))
        if derr:
            return _err(derr, 400)
        match.date = d
    if "note" in data:
        match.note = _clip(data.get("note"), 512)
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
    if match.status in ("cancelled", "postponed"):
        return _err("لا يمكن إدخال نتيجة مباراة ملغاة أو مؤجلة", 409)
    data = request.get_json(silent=True) or {}
    events = data.get("events") or []

    # Validate that every event's team_id belongs to this match.
    valid_team_ids = {match.home_team_id, match.away_team_id} - {None}
    for ev in events:
        ev_team = _int(ev.get("team_id"))
        if ev_team is not None and ev_team not in valid_team_ids:
            return _err(
                f"team_id {ev_team} ليس أحد فريقَي هذه المباراة", 400
            )

    # And that every referenced player is eligible for one of the two teams —
    # otherwise an admin could attribute goals/cards to any player in the system,
    # polluting that player's cross-competition stats (see /analysis, player stats).
    referenced_pids = {_int(ev.get("player_id")) for ev in events} - {None}
    if referenced_pids:
        eligible_pids: set[int] = set()
        for tid in valid_team_ids:
            eligible_pids |= {
                p["player_id"] for p in _lineup_eligible_players(match, tid)
            }
        bad = referenced_pids - eligible_pids
        if bad:
            return _err(
                f"لاعب غير مؤهل للعب في هذه المباراة (player_id {sorted(bad)[0]})",
                400,
            )

    match.home_score = _clamp_int(data.get("home_score"), 0, 99)
    match.away_score = _clamp_int(data.get("away_score"), 0, 99)
    # Extra time — key present means ET was played; absent means it wasn't.
    if "home_score_et" in data:
        match.home_score_et = _clamp_int(data.get("home_score_et"), 0, 99)
        match.away_score_et = _clamp_int(data.get("away_score_et"), 0, 99)
    else:
        match.home_score_et = None
        match.away_score_et = None
    # Penalty shootout — same convention.
    if "home_score_pen" in data:
        match.home_score_pen = _clamp_int(data.get("home_score_pen"), 0, 99)
        match.away_score_pen = _clamp_int(data.get("away_score_pen"), 0, 99)
    else:
        match.home_score_pen = None
        match.away_score_pen = None

    was_finished = match.status in ("completed", "finished")
    # Rebuild the event set in one transaction. If any insert fails (bad enum,
    # dangling related_event_id, …) roll back so the old events aren't left
    # deleted and the session isn't handed on in a broken state.
    try:
        Tla3bnyMatchEvent.query.filter_by(match_id=match.id).delete()
        db.session.flush()

        temp_map: dict = {}
        pending_assists = []
        for ev in events:
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
                minute=_clamp_int(ev.get("minute"), 0, 130),
                is_extra_time=bool(ev.get("is_extra_time", False)),
                is_own_goal=bool(ev.get("is_own_goal", False)),
                is_penalty=bool(ev.get("is_penalty", False)),
                kick_order=_int(ev.get("kick_order")),
                is_winning_kick=bool(ev.get("is_winning_kick", False)),
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
                    minute=_clamp_int(ev.get("minute"), 0, 130),
                    related_event_id=temp_map.get(ev.get("related_temp_id")),
                    is_extra_time=bool(ev.get("is_extra_time", False)),
                )
            )

        # Only auto-finish a scheduled match. Live matches stay live (the admin
        # updates status separately via the match-info save), and already-finished
        # matches keep their status when a result is corrected.
        if match.status == "scheduled":
            match.status = codes.TLA3BNY_MATCH_STATUS_FINISHED
        event_type = "result_corrected" if was_finished else "result_entered"
        _log(event_type, "match", match.id, {
            "home_team_id": match.home_team_id,
            "away_team_id": match.away_team_id,
            "home_team": match.home_team.display_name() if match.home_team else None,
            "away_team": match.away_team.display_name() if match.away_team else None,
            "home_score": match.home_score,
            "away_score": match.away_score,
        }, competition_id=match.competition_id)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    # Immediate push to this competition's followers (organizers enter live).
    if match.home_score is not None and match.away_score is not None:
        notifications.notify_tla3bny_match_result(match)
    return jsonify(match.to_dict(include_events=True))


# ── lineups ──────────────────────────────────────────────────────────────────

def _lineup_eligible_players(match: "Tla3bnyMatch", team_id: int) -> list[dict]:
    """Players a coach may include in the lineup for this match.

    Primary roster: all players approved for this competition entry.
    Guest players: active members of any other team at the same academy
      whose birth year is >= the competition age's oldest_birth_year (younger
      players playing up is allowed; older players playing down is not).
    """
    team = Tla3bnyTeam.query.get_or_404(team_id)
    academy_id = team.academy_id

    # Oldest birth year allowed by this competition's age category.
    oldest_birth_year: int | None = (
        match.age_category.oldest_birth_year if match.age_category else None
    )

    # Primary: approved competition players.
    entry = Tla3bnyCompetitionTeam.query.filter_by(
        competition_id=match.competition_id, team_id=team_id
    ).first()
    approved_cp = (
        Tla3bnyCompetitionPlayer.query.filter_by(
            competition_team_id=entry.id, status="approved"
        ).all()
        if entry
        else []
    )
    seen: set[int] = set()
    result = []
    for cp in approved_cp:
        p = cp.player
        if not p or cp.player_id in seen:
            continue
        seen.add(cp.player_id)
        result.append({
            "player_id": cp.player_id,
            "player_name": p.name,
            "photo_path": p.photo_path,
            "position": p.position,
            "dob": p.dob.isoformat() if p.dob else None,
            "status": "approved",
            "rejection_reason": None,
            "guest": False,
            "guest_team": None,
        })

    # Guests: players from younger teams at the same academy.
    # A team is "younger" if its age category's oldest_birth_year >= the match's
    # oldest_birth_year (higher birth year = more recently born = younger).
    # A team's category is only a hint, though: players are added to teams without
    # an age check, so a "younger" team can still carry a provably over-age member.
    # The individual DOB check below is therefore applied to everyone.
    academy_teams = Tla3bnyTeam.query.filter(
        Tla3bnyTeam.academy_id == academy_id,
        Tla3bnyTeam.id != team_id,
    ).all()
    for other_team in academy_teams:
        team_birth_year: int | None = (
            other_team.age_category.oldest_birth_year
            if other_team.age_category else None
        )
        # If the team's own age category is already younger, all its active
        # members are eligible regardless of individual DOB.
        team_is_younger = (
            oldest_birth_year is None
            or (team_birth_year is not None and team_birth_year >= oldest_birth_year)
        )
        for mem in Tla3bnyPlayerTeam.query.filter_by(
            team_id=other_team.id, end_date=None, status="active"
        ).all():
            p = mem.player
            if not p or p.id in seen:
                continue
            # Older players can never play down: reject anyone whose known birth
            # year is earlier than the age category allows — even from a team whose
            # own category is younger, since a squad can be mixed-age.
            if oldest_birth_year is not None and p.dob and p.dob.year < oldest_birth_year:
                continue
            # A sibling team that isn't itself younger can't be taken on trust: a
            # guest from it also needs a *known* DOB (an unknown age is not assumed
            # young enough). Genuinely younger teams still contribute unknown-DOB members.
            if not team_is_younger and not p.dob:
                continue
            seen.add(p.id)
            result.append({
                "player_id": p.id,
                "player_name": p.name,
                "photo_path": p.photo_path,
                "position": p.position,
                "dob": p.dob.isoformat() if p.dob else None,
                "status": "approved",
                "rejection_reason": None,
                "guest": True,
                "guest_team": other_team.display_name(),
            })

    return result


@tla3bny_bp.get("/lineups/match/<int:match_id>/team/<int:team_id>/eligible-players")
def eligible_lineup_players(match_id: int, team_id: int):
    match = Tla3bnyMatch.query.get_or_404(match_id)
    return jsonify(_lineup_eligible_players(match, team_id))


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
        if _utcnow() > deadline:
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

    # Each player must be eligible: either approved on this team's competition
    # roster, or a younger guest from the same academy.
    eligible = {p["player_id"] for p in _lineup_eligible_players(match, team_id)}
    for s in slots:
        pid = _int(s.get("player_id"))
        if pid and pid not in eligible:
            return _err("Lineup contains a player not eligible for this competition", 409)

    lineup = Tla3bnyLineup.query.filter_by(match_id=match_id, team_id=team_id).first()
    was_new = lineup is None  # only the first submission notifies, not every edit
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
    if was_new:
        notifications.notify_tla3bny_lineup(match, Tla3bnyTeam.query.get(team_id))
    return jsonify(lineup.to_dict())


# ── standings / bracket / analysis ───────────────────────────────────────────
@tla3bny_bp.get("/standings")
def standings():
    comp_id = request.args.get("competition_id", type=int)
    age_id = request.args.get("age_category_id", type=int)
    cage_id = request.args.get("competition_age_id", type=int)
    if not comp_id or (not age_id and not cage_id):
        return _err("competition_id and age_category_id (or competition_age_id) are required")
    return jsonify(tables.standings_by_group(comp_id, age_id or 0, cage_id=cage_id))


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
    cage_id = request.args.get("competition_age_id", type=int)
    if not comp_id or (not age_id and not cage_id):
        return _err(
            "competition_id and age_category_id (or competition_age_id) are required"
        )

    # Both "finished" and "completed" mean a result has been entered. Scope by
    # the specific sub-competition when given, so competitions that run several
    # sub-competitions in the same age don't pool their scorers onto one board.
    match_q = db.session.query(Tla3bnyMatch.id).filter(
        Tla3bnyMatch.competition_id == comp_id,
        Tla3bnyMatch.status.in_(_FINISHED),
    )
    if cage_id:
        match_q = match_q.filter(Tla3bnyMatch.competition_age_id == cage_id)
    else:
        match_q = match_q.filter(Tla3bnyMatch.age_category_id == age_id)
    match_ids = [row[0] for row in match_q.all()]

    goals: dict[int, int] = defaultdict(int)
    assists: dict[int, int] = defaultdict(int)
    yellows: dict[int, int] = defaultdict(int)
    reds: dict[int, int] = defaultdict(int)
    # A second yellow is a sending-off — count it as a red, matching the player
    # career-stats surface (players.py) so the two boards agree.
    _buckets = {
        "goal": goals,
        "assist": assists,
        "yellow": yellows,
        "red": reds,
        "second_yellow": reds,
    }

    if match_ids:
        for pid, etype, is_own in db.session.query(
            Tla3bnyMatchEvent.player_id,
            Tla3bnyMatchEvent.event_type,
            Tla3bnyMatchEvent.is_own_goal,
        ).filter(
            Tla3bnyMatchEvent.match_id.in_(match_ids),
            Tla3bnyMatchEvent.player_id.isnot(None),
            Tla3bnyMatchEvent.event_type.in_(list(_buckets)),
        ).all():
            # Own goals are not credited to the scorer in the top-scorers list,
            # matching youthscores' behaviour (same rule as MatchGoal.is_own_goal).
            if etype == "goal" and is_own:
                continue
            _buckets[etype][pid] += 1

    # Appearances: distinct matches a player has a lineup slot in.
    appearances: dict[int, int] = defaultdict(int)
    if match_ids:
        for pid, cnt in db.session.query(
            Tla3bnyLineupSlot.player_id,
            func.count(func.distinct(Tla3bnyLineup.match_id)),
        ).join(Tla3bnyLineup, Tla3bnyLineupSlot.lineup_id == Tla3bnyLineup.id).filter(
            Tla3bnyLineup.match_id.in_(match_ids),
            Tla3bnyLineupSlot.player_id.isnot(None),
        ).group_by(Tla3bnyLineupSlot.player_id).all():
            appearances[pid] = cnt

    # Batch-load all referenced players in one query.
    all_pids = set(goals) | set(assists) | set(yellows) | set(reds) | set(appearances)
    players: dict[int, Tla3bnyPlayer] = {}
    if all_pids:
        for p in (
            Tla3bnyPlayer.query
            .options(
                selectinload(Tla3bnyPlayer.memberships)
                .selectinload(Tla3bnyPlayerTeam.team)
            )
            .filter(Tla3bnyPlayer.id.in_(all_pids))
            .all()
        ):
            players[p.id] = p

    def _row(pid: int, count: int) -> dict:
        p = players.get(pid)
        if not p:
            return {}
        cur = p.current_membership()
        team = cur.team if cur else None
        return {
            "player_id": pid,
            "player_name": p.name,
            "photo_path": p.photo_path,
            "team_id": team.id if team else None,
            "team_name": team.display_name() if team else None,
            "academy_id": team.academy_id if team else None,
            "count": count,
        }

    def board(counter: dict[int, int]) -> list[dict]:
        rows = [_row(pid, cnt) for pid, cnt in counter.items() if pid in players]
        rows.sort(key=lambda x: (-x["count"], (x["player_name"] or "").lower()))
        return rows

    def appearances_board() -> list[dict]:
        rows = [_row(pid, cnt) for pid, cnt in appearances.items() if pid in players]
        rows.sort(key=lambda x: (-x["count"], (x["player_name"] or "").lower()))
        return rows

    return jsonify({
        "top_scorers": board(goals),
        "top_assisters": board(assists),
        "yellow_cards": board(yellows),
        "red_cards": board(reds),
        "appearances": appearances_board(),
    })
