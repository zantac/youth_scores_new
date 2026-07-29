"""Match data entry for the admin panel (any signed-in admin).

Pick a competition, create/edit a match, set the score and status, and record
goals and cards. Scorers/carded players are resolved by name within the team —
an unknown name creates the player on the spot (the readme's "quick add"),
inheriting the age group's birth year, flagged unverified.

Standings need no explicit recompute: they are derived from match rows on read,
so saving a score updates every table that depends on it.
"""

from __future__ import annotations

import re
from datetime import datetime

from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import (
    AgeGroup,
    Competition,
    CompetitionTeam,
    MatchCard,
    MatchGoal,
    MatchPlayer,
    MatchSubstitution,
    Match,
    Player,
    PlayerTeam,
    Stage,
    Team,
)
from app.models import codes
from app.api.manage import default_spell_start
from app.services import auth

entry_bp = Blueprint("entry", __name__)


# ── helpers ──────────────────────────────────────────────────────────────────

def _loc(ar, en):
    if not ar and not en:
        return None
    return {"ar": ar or "", "en": en or ""}


def _norm(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"[ً-ْـ]", "", s)
    s = s.translate(str.maketrans("أإآٱ", "اااا"))
    return re.sub(r"\s+", " ", s).strip()


def _team_name(t: Team, competition_id: int | None = None):
    """The name a squad shows under. The second name lives on the competition
    entry now: within a competition use that entry's; otherwise the most recent
    one that carries a name; failing both, the club's own name."""
    if competition_id is not None:
        entry = CompetitionTeam.query.filter_by(
            competition_id=competition_id, team_id=t.id).first()
    else:
        entry = (CompetitionTeam.query
                 .filter(CompetitionTeam.team_id == t.id,
                         CompetitionTeam.name_ar.isnot(None)
                         | CompetitionTeam.name_en.isnot(None))
                 .order_by(CompetitionTeam.id.desc()).first())
    na, ne = (entry.name_ar, entry.name_en) if entry else (None, None)
    return _loc(na or t.club.name_ar, ne or t.club.name_en) or {"ar": "", "en": ""}


def _default_stage(comp: Competition) -> Stage:
    stage = (
        Stage.query.filter_by(competition_id=comp.id)
        .filter(Stage.type != codes.STAGE_TYPE_KNOCKOUT)
        .order_by(Stage.stage_order)
        .first()
    )
    if stage:
        return stage
    stage = Stage.query.filter_by(competition_id=comp.id).order_by(Stage.stage_order).first()
    if stage:
        return stage
    # A competition with no stages yet — give it a league stage.
    stage = Stage(competition_id=comp.id, stage_order=1, type="league",
                  name_ar="الدوري", name_en="League")
    db.session.add(stage)
    db.session.flush()
    return stage


def _resolve_player(name: str, team: Team) -> Player | None:
    name = (name or "").strip()
    if not name:
        return None
    target = _norm(name)
    for pt in PlayerTeam.query.filter_by(team_id=team.id).all():
        p = pt.player
        if _norm(p.full_name_ar or p.full_name_en or "") == target:
            return p
    ag = db.session.get(AgeGroup, team.age_group_id)
    p = Player(
        full_name_ar=name,
        birth_year=ag.oldest_birth_year if ag else 2010,
        birth_year_verified=False,
    )
    db.session.add(p)
    db.session.flush()
    db.session.add(PlayerTeam(
        player_id=p.id, team_id=team.id,
        start_date=default_spell_start(), status="active",
    ))
    return p


def _side(match: Match, team_id: int) -> str:
    return "home" if team_id == match.home_team_id else "away"


def _pname(p) -> str:
    return (p.full_name_ar or p.full_name_en or "") if p else ""


# ── competition + team pickers ───────────────────────────────────────────────

@entry_bp.get("/api/admin/competitions")
@auth.login_required
def competitions():
    ages = {a.id: a for a in AgeGroup.query.all()}
    out = []
    for c in Competition.query.order_by(Competition.code, Competition.id).all():
        ag = ages.get(c.age_group_id)
        out.append({
            "id": c.id,
            "name": _loc(c.name_ar, c.name_en) or {"ar": "", "en": ""},
            "age": (ag.name_en or ag.name_ar) if ag else "",
            "sector": _loc(c.sector_ar, c.sector_en),
            "season": c.season.name_en or c.season.name_ar or "",
        })
    return jsonify({"competitions": out})


@entry_bp.get("/api/admin/competitions/<int:cid>/teams")
@auth.login_required
def competition_teams(cid: int):
    teams = (
        Team.query.join(CompetitionTeam)
        .filter(CompetitionTeam.competition_id == cid)
        .order_by(CompetitionTeam.id)
        .all()
    )
    return jsonify({"teams": [{"id": t.id, "name": _team_name(t, cid), "logo": t.club.logo_url} for t in teams]})


@entry_bp.get("/api/admin/teams/<int:team_id>/players")
@auth.login_required
def team_players(team_id: int):
    rows = PlayerTeam.query.filter_by(team_id=team_id).all()
    names = sorted({(pt.player.full_name_ar or pt.player.full_name_en or "").strip() for pt in rows} - {""})
    return jsonify({"players": names})


# ── matches ──────────────────────────────────────────────────────────────────

def _match_row(m: Match) -> dict:
    comp_id = m.stage.competition_id if m.stage else None
    return {
        "id": m.id,
        "date": m.match_date.strftime("%Y-%m-%d") if m.match_date else "",
        "time": m.match_date.strftime("%H:%M") if m.match_date else "",
        "week": m.week or "",
        "status": m.status,
        "home": {"id": m.home_team_id, "name": _team_name(m.home_team, comp_id)},
        "away": {"id": m.away_team_id, "name": _team_name(m.away_team, comp_id)},
        "home_score": m.home_score,
        "away_score": m.away_score,
        "stage_id": m.stage_id,
        "group_id": m.group_id,
        "stage_name": (m.stage.name_ar or m.stage.name_en) if m.stage else None,
        "group_name": (m.group.name_ar or m.group.name_en) if m.group else None,
    }


@entry_bp.get("/api/admin/competitions/<int:cid>/matches")
@auth.login_required
def competition_matches(cid: int):
    matches = (
        Match.query.join(Stage).filter(Stage.competition_id == cid)
        # Undated (TBD) fixtures collect at the end; is_(None) sorts False<True.
        .order_by(Match.match_date.is_(None), Match.match_date.desc(), Match.id).all()
    )
    return jsonify({"matches": [_match_row(m) for m in matches]})


def _parse_dt(date_s: str, time_s: str) -> datetime | None:
    date_s = (date_s or "").strip()
    if not date_s:
        return None
    time_s = (time_s or "").strip() or "00:00"
    try:
        return datetime.strptime(f"{date_s} {time_s}", "%Y-%m-%d %H:%M")
    except ValueError:
        try:
            return datetime.strptime(date_s, "%Y-%m-%d")
        except ValueError:
            return None


@entry_bp.post("/api/admin/competitions/<int:cid>/matches")
@auth.login_required
def create_match(cid: int):
    comp = db.session.get(Competition, cid)
    if comp is None:
        return jsonify({"error": "البطولة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}

    home_id, away_id = j.get("home_team_id"), j.get("away_team_id")
    if not home_id or not away_id or home_id == away_id:
        return jsonify({"error": "اختر فريقين مختلفين"}), 400
    # A confirmed fixture may have no date yet (TBD). Only a date that was given
    # but does not parse is an error; a blank date stores NULL.
    date_s = (j.get("date") or "").strip()
    dt = _parse_dt(date_s, j.get("time")) if date_s else None
    if date_s and not dt:
        return jsonify({"error": "التاريخ غير صحيح"}), 400

    req_stage_id = j.get("stage_id")
    if req_stage_id:
        stage = Stage.query.filter_by(id=req_stage_id, competition_id=cid).first() or _default_stage(comp)
    else:
        stage = _default_stage(comp)
    req_group_id = j.get("group_id") or None
    week = (j.get("week") or "").strip() or None
    note = (j.get("note") or "").strip()[:255] or None
    m = Match(
        stage_id=stage.id,
        group_id=req_group_id,
        home_team_id=home_id, away_team_id=away_id,
        match_date=dt, week=week,
        round_label_ar=(j.get("round") or None), round_label_en=(j.get("round") or None),
        venue_ar=(j.get("venue") or None), note_ar=note,
        status=(j.get("status") if j.get("status") in codes.MATCH_STATUS else "scheduled"),
    )
    db.session.add(m)
    db.session.commit()
    return jsonify(_match_detail(m)), 201


def _match_detail(m: Match) -> dict:
    goals = [{
        "id": g.id, "team_id": g.team_id, "side": _side(m, g.team_id),
        "scorer": (g.scorer.full_name_ar or g.scorer.full_name_en) if g.scorer else "",
        "assist": (g.assist.full_name_ar or g.assist.full_name_en) if g.assist else None,
        "minute": g.minute, "is_own_goal": g.is_own_goal, "is_penalty": g.is_penalty,
    } for g in sorted(m.goals, key=lambda x: (x.minute or 999))]
    cards = [{
        "id": c.id, "team_id": c.team_id, "side": _side(m, c.team_id),
        "player": (c.player.full_name_ar or c.player.full_name_en) if c.player else "",
        "card_type": c.card_type, "minute": c.minute,
    } for c in sorted(m.cards, key=lambda x: (x.minute or 999))]
    subs = [{
        "id": s.id, "team_id": s.team_id, "side": _side(m, s.team_id),
        "player_out": _pname(s.player_out), "player_in": _pname(s.player_in),
        "minute": s.minute,
    } for s in sorted(m.substitutions, key=lambda x: (x.minute or 999))]
    # Grouped by side and split into XI and bench, which is how it is entered.
    lineup = {}
    for tid, key in ((m.home_team_id, "home"), (m.away_team_id, "away")):
        rows = MatchPlayer.query.filter_by(match_id=m.id, team_id=tid).all()
        lineup[key] = {
            "team_id": tid,
            "starters": [_pname(r.player) for r in rows if r.is_starter],
            "bench": [_pname(r.player) for r in rows if not r.is_starter],
        }
    row = _match_row(m)
    row.update({
        "home_penalty_score": m.home_penalty_score,
        "away_penalty_score": m.away_penalty_score,
        "venue": m.venue_ar or m.venue_en or "",
        "round": m.round_label_ar or m.round_label_en or "",
        # Free-text reason for the result — a team not turning up, no ambulance
        # on site, the ground taken by another match, and so on.
        "note": m.note_ar or m.note_en or "",
        "goals": goals, "cards": cards, "subs": subs, "lineup": lineup,
    })
    return row


@entry_bp.get("/api/admin/matches/<int:mid>")
@auth.login_required
def get_match(mid: int):
    m = db.session.get(Match, mid)
    if m is None:
        return jsonify({"error": "المباراة غير موجودة"}), 404
    return jsonify(_match_detail(m))


def _as_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


@entry_bp.patch("/api/admin/matches/<int:mid>")
@auth.login_required
def update_match(mid: int):
    m = db.session.get(Match, mid)
    if m is None:
        return jsonify({"error": "المباراة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}

    if "status" in j and j["status"] in codes.MATCH_STATUS:
        m.status = j["status"]
    if "home_score" in j:
        m.home_score = _as_int(j["home_score"])
    if "away_score" in j:
        m.away_score = _as_int(j["away_score"])
    if "home_penalty_score" in j:
        m.home_penalty_score = _as_int(j["home_penalty_score"])
    if "away_penalty_score" in j:
        m.away_penalty_score = _as_int(j["away_penalty_score"])
    if "week" in j:
        m.week = (j["week"] or "").strip() or None
    if "round" in j:
        r = (j["round"] or "").strip() or None
        m.round_label_ar = r
        m.round_label_en = r
    if "note" in j:
        m.note_ar = (j["note"] or "").strip()[:255] or None
    if "venue" in j:
        m.venue_ar = (j["venue"] or "").strip() or None
    if "date" in j:
        date_s = (j.get("date") or "").strip()
        if not date_s:
            m.match_date = None  # cleared → back to TBD
        else:
            # Keep the existing time when only the date is edited; a TBD match
            # being scheduled for the first time defaults to midnight.
            fallback = m.match_date.strftime("%H:%M") if m.match_date else "00:00"
            dt = _parse_dt(date_s, j.get("time") or fallback)
            if dt:
                m.match_date = dt

    db.session.commit()
    return jsonify(_match_detail(m))


@entry_bp.delete("/api/admin/matches/<int:mid>")
@auth.login_required
def delete_match(mid: int):
    """Remove a match outright — the fix for a fixture entered by mistake.

    Its goals, cards, substitutions, line-up and shootout kicks all hang off the
    match with ON DELETE CASCADE (and the ORM's delete-orphan), so they go with
    it; nothing else in the schema points back at a match, so it always clears.
    Standings are derived on read, so the tables correct themselves at once.
    """
    m = db.session.get(Match, mid)
    if m is None:
        return jsonify({"error": "المباراة غير موجودة"}), 404
    db.session.delete(m)
    db.session.commit()
    return jsonify({"deleted": mid})


# ── goals & cards ────────────────────────────────────────────────────────────

@entry_bp.post("/api/admin/matches/<int:mid>/goals")
@auth.login_required
def add_goal(mid: int):
    m = db.session.get(Match, mid)
    if m is None:
        return jsonify({"error": "المباراة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    team_id = j.get("team_id")
    if team_id not in (m.home_team_id, m.away_team_id):
        return jsonify({"error": "الفريق ليس في هذه المباراة"}), 400
    is_own_goal = bool(j.get("is_own_goal"))
    # team_id is the side the goal counts for. For an own goal the player who
    # put it in belongs to the *other* side, so he has to be looked up there —
    # resolving him against the credited team would not find him and would
    # create a duplicate of him on the wrong club's roster.
    other_id = m.away_team_id if team_id == m.home_team_id else m.home_team_id
    scorer_team = db.session.get(Team, other_id if is_own_goal else team_id)
    scorer = _resolve_player(j.get("scorer", ""), scorer_team)
    if scorer is None:
        return jsonify({"error": "اسم الهدّاف مطلوب"}), 400

    # Nobody assists an own goal.
    assist = None
    if j.get("assist") and not is_own_goal:
        assist = _resolve_player(j.get("assist", ""), db.session.get(Team, team_id))
        if assist and assist.id == scorer.id:
            assist = None

    db.session.add(MatchGoal(
        match_id=m.id, team_id=team_id, scorer_id=scorer.id,
        assist_id=assist.id if assist else None,
        minute=_as_int(j.get("minute")),
        is_own_goal=is_own_goal,
        is_penalty=bool(j.get("is_penalty")),
    ))
    db.session.commit()
    return jsonify(_match_detail(m)), 201


@entry_bp.patch("/api/admin/goals/<int:gid>")
@auth.login_required
def update_goal(gid: int):
    g = db.session.get(MatchGoal, gid)
    if g is None:
        return jsonify({"error": "غير موجود"}), 404
    m = db.session.get(Match, g.match_id)
    j = request.get_json(silent=True) or {}

    # The side the goal counts for. Defaults to whatever it already was, so a
    # partial edit (just the minute, say) leaves the scoring team untouched.
    team_id = j.get("team_id", g.team_id)
    if team_id not in (m.home_team_id, m.away_team_id):
        return jsonify({"error": "الفريق ليس في هذه المباراة"}), 400
    is_own_goal = bool(j.get("is_own_goal", g.is_own_goal))

    # Same rule as adding: the player who put an own goal in is on the *other*
    # side, so resolve him there — not against the credited team.
    other_id = m.away_team_id if team_id == m.home_team_id else m.home_team_id
    scorer_team = db.session.get(Team, other_id if is_own_goal else team_id)
    scorer = _resolve_player(j.get("scorer", ""), scorer_team)
    if scorer is None:
        return jsonify({"error": "اسم الهدّاف مطلوب"}), 400

    # Nobody assists an own goal.
    assist = None
    if j.get("assist") and not is_own_goal:
        assist = _resolve_player(j.get("assist", ""), db.session.get(Team, team_id))
        if assist and assist.id == scorer.id:
            assist = None

    g.team_id = team_id
    g.scorer_id = scorer.id
    g.assist_id = assist.id if assist else None
    g.minute = _as_int(j.get("minute"))
    g.is_own_goal = is_own_goal
    g.is_penalty = False if is_own_goal else bool(j.get("is_penalty"))
    db.session.commit()
    return jsonify(_match_detail(m))


@entry_bp.delete("/api/admin/goals/<int:gid>")
@auth.login_required
def delete_goal(gid: int):
    g = db.session.get(MatchGoal, gid)
    if g is None:
        return jsonify({"error": "غير موجود"}), 404
    mid = g.match_id
    db.session.delete(g)
    db.session.commit()
    return jsonify(_match_detail(db.session.get(Match, mid)))


@entry_bp.post("/api/admin/matches/<int:mid>/cards")
@auth.login_required
def add_card(mid: int):
    m = db.session.get(Match, mid)
    if m is None:
        return jsonify({"error": "المباراة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    team_id = j.get("team_id")
    if team_id not in (m.home_team_id, m.away_team_id):
        return jsonify({"error": "الفريق ليس في هذه المباراة"}), 400
    if j.get("card_type") not in codes.CARD_TYPE:
        return jsonify({"error": "نوع البطاقة غير صحيح"}), 400
    team = db.session.get(Team, team_id)
    player = _resolve_player(j.get("player", ""), team)
    if player is None:
        return jsonify({"error": "اسم اللاعب مطلوب"}), 400

    db.session.add(MatchCard(
        match_id=m.id, team_id=team_id, player_id=player.id,
        card_type=j["card_type"], minute=_as_int(j.get("minute")),
    ))
    db.session.commit()
    return jsonify(_match_detail(m)), 201


@entry_bp.patch("/api/admin/cards/<int:card_id>")
@auth.login_required
def update_card(card_id: int):
    c = db.session.get(MatchCard, card_id)
    if c is None:
        return jsonify({"error": "غير موجود"}), 404
    m = db.session.get(Match, c.match_id)
    j = request.get_json(silent=True) or {}
    team_id = j.get("team_id", c.team_id)
    if team_id not in (m.home_team_id, m.away_team_id):
        return jsonify({"error": "الفريق ليس في هذه المباراة"}), 400
    card_type = j.get("card_type", c.card_type)
    if card_type not in codes.CARD_TYPE:
        return jsonify({"error": "نوع البطاقة غير صحيح"}), 400
    player = _resolve_player(j.get("player", ""), db.session.get(Team, team_id))
    if player is None:
        return jsonify({"error": "اسم اللاعب مطلوب"}), 400

    c.team_id = team_id
    c.player_id = player.id
    c.card_type = card_type
    c.minute = _as_int(j.get("minute"))
    db.session.commit()
    return jsonify(_match_detail(m))


@entry_bp.delete("/api/admin/cards/<int:card_id>")
@auth.login_required
def delete_card(card_id: int):
    c = db.session.get(MatchCard, card_id)
    if c is None:
        return jsonify({"error": "غير موجود"}), 404
    mid = c.match_id
    db.session.delete(c)
    db.session.commit()
    return jsonify(_match_detail(db.session.get(Match, mid)))


# ── line-up and substitutions ────────────────────────────────────────────────
# Only who started and who sat on the bench is recorded: MatchPlayer also has
# minutes and positions, but those are laborious to keep by hand and minutes can
# be read back off the substitutions when they are ever wanted.


@entry_bp.put("/api/admin/matches/<int:mid>/lineup")
@auth.login_required
def set_lineup(mid: int):
    """Replace one team's line-up for this match.

    The whole side is sent at once rather than a row at a time: an XI is picked
    as a set, and replacing it wholesale cannot leave a half-saved list behind.
    Substitutions are checked afterwards, since dropping a player who came on
    would otherwise leave the sub pointing at nobody.
    """
    m = db.session.get(Match, mid)
    if m is None:
        return jsonify({"error": "المباراة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    team_id = j.get("team_id")
    if team_id not in (m.home_team_id, m.away_team_id):
        return jsonify({"error": "الفريق ليس في هذه المباراة"}), 400
    team = db.session.get(Team, team_id)

    def resolve_all(names):
        out = []
        for n in names or []:
            p = _resolve_player(str(n), team)
            if p is not None and p.id not in [x.id for x in out]:
                out.append(p)
        return out

    starters = resolve_all(j.get("starters"))
    bench = resolve_all(j.get("bench"))
    # A player named on both lists is a slip; the starting XI wins.
    starter_ids = {p.id for p in starters}
    bench = [p for p in bench if p.id not in starter_ids]

    keep = starter_ids | {p.id for p in bench}
    stranded = [
        s for s in MatchSubstitution.query.filter_by(match_id=mid, team_id=team_id).all()
        if s.player_in_id not in keep or s.player_out_id not in keep
    ]
    if stranded:
        return jsonify({"error": f"احذف {len(stranded)} تبديلًا يعتمد على لاعب أزلته أولًا"}), 409

    MatchPlayer.query.filter_by(match_id=mid, team_id=team_id).delete()
    for p in starters:
        db.session.add(MatchPlayer(match_id=mid, team_id=team_id, player_id=p.id,
                                   is_starter=True))
    for p in bench:
        db.session.add(MatchPlayer(match_id=mid, team_id=team_id, player_id=p.id,
                                   is_starter=False))
    db.session.commit()
    return jsonify(_match_detail(m))


@entry_bp.post("/api/admin/matches/<int:mid>/subs")
@auth.login_required
def add_sub(mid: int):
    m = db.session.get(Match, mid)
    if m is None:
        return jsonify({"error": "المباراة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    team_id = j.get("team_id")
    if team_id not in (m.home_team_id, m.away_team_id):
        return jsonify({"error": "الفريق ليس في هذه المباراة"}), 400
    team = db.session.get(Team, team_id)

    out_p = _resolve_player(j.get("player_out", ""), team)
    in_p = _resolve_player(j.get("player_in", ""), team)
    if out_p is None or in_p is None:
        return jsonify({"error": "اسم الداخل والخارج مطلوبان"}), 400
    if out_p.id == in_p.id:
        return jsonify({"error": "لا يمكن أن يكون اللاعب داخلًا وخارجًا"}), 400

    named = {mp.player_id: mp.is_starter for mp in
             MatchPlayer.query.filter_by(match_id=mid, team_id=team_id).all()}
    if named:
        # Only checked once a line-up exists, so subs can still be entered for a
        # match whose line-up was never typed in.
        if in_p.id not in named:
            return jsonify({"error": "الداخل ليس ضمن قائمة الفريق"}), 400
        if out_p.id not in named:
            return jsonify({"error": "الخارج ليس ضمن قائمة الفريق"}), 400

    existing = MatchSubstitution.query.filter_by(match_id=mid, team_id=team_id).all()
    if any(s.player_in_id == in_p.id for s in existing):
        return jsonify({"error": "اللاعب دخل بالفعل"}), 409
    if any(s.player_out_id == out_p.id for s in existing):
        return jsonify({"error": "اللاعب خرج بالفعل"}), 409
    # Someone already replaced cannot be taken off again.
    if any(s.player_out_id == in_p.id for s in existing):
        return jsonify({"error": "اللاعب خرج من المباراة"}), 409

    db.session.add(MatchSubstitution(
        match_id=mid, team_id=team_id,
        player_out_id=out_p.id, player_in_id=in_p.id,
        minute=_as_int(j.get("minute")),
    ))
    db.session.commit()
    return jsonify(_match_detail(m)), 201


@entry_bp.patch("/api/admin/subs/<int:sid>")
@auth.login_required
def update_sub(sid: int):
    s = db.session.get(MatchSubstitution, sid)
    if s is None:
        return jsonify({"error": "غير موجود"}), 404
    m = db.session.get(Match, s.match_id)
    j = request.get_json(silent=True) or {}
    team_id = j.get("team_id", s.team_id)
    if team_id not in (m.home_team_id, m.away_team_id):
        return jsonify({"error": "الفريق ليس في هذه المباراة"}), 400
    team = db.session.get(Team, team_id)

    out_p = _resolve_player(j.get("player_out", ""), team)
    in_p = _resolve_player(j.get("player_in", ""), team)
    if out_p is None or in_p is None:
        return jsonify({"error": "اسم الداخل والخارج مطلوبان"}), 400
    if out_p.id == in_p.id:
        return jsonify({"error": "لا يمكن أن يكون اللاعب داخلًا وخارجًا"}), 400

    named = {mp.player_id: mp.is_starter for mp in
             MatchPlayer.query.filter_by(match_id=m.id, team_id=team_id).all()}
    if named:
        if in_p.id not in named:
            return jsonify({"error": "الداخل ليس ضمن قائمة الفريق"}), 400
        if out_p.id not in named:
            return jsonify({"error": "الخارج ليس ضمن قائمة الفريق"}), 400

    # Conflicts are checked against the *other* subs, so re-saving this one with
    # the same players it already has is not a clash with itself.
    existing = [x for x in MatchSubstitution.query.filter_by(match_id=m.id, team_id=team_id).all()
                if x.id != s.id]
    if any(x.player_in_id == in_p.id for x in existing):
        return jsonify({"error": "اللاعب دخل بالفعل"}), 409
    if any(x.player_out_id == out_p.id for x in existing):
        return jsonify({"error": "اللاعب خرج بالفعل"}), 409
    if any(x.player_out_id == in_p.id for x in existing):
        return jsonify({"error": "اللاعب خرج من المباراة"}), 409

    s.team_id = team_id
    s.player_out_id = out_p.id
    s.player_in_id = in_p.id
    s.minute = _as_int(j.get("minute"))
    db.session.commit()
    return jsonify(_match_detail(m))


@entry_bp.delete("/api/admin/subs/<int:sid>")
@auth.login_required
def delete_sub(sid: int):
    s = db.session.get(MatchSubstitution, sid)
    if s is None:
        return jsonify({"error": "غير موجود"}), 404
    mid = s.match_id
    db.session.delete(s)
    db.session.commit()
    return jsonify(_match_detail(db.session.get(Match, mid)))
