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
from collections import Counter
from datetime import datetime, timedelta

import sqlalchemy as sa
from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import (
    AgeGroup,
    Competition,
    CompetitionTeam,
    Group,
    MatchCard,
    MatchGoal,
    MatchPenaltyShootout,
    MatchPlayer,
    MatchSubstitution,
    Match,
    Player,
    PlayerTeam,
    Stage,
    Team,
    Venue,
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
        "deleted_at": m.deleted_at.isoformat() if m.deleted_at else None,
    }


@entry_bp.get("/api/admin/competitions/<int:cid>/matches")
@auth.login_required
def competition_matches(cid: int):
    cutoff = datetime.utcnow() - timedelta(hours=24)
    all_m = (
        Match.query.join(Stage).filter(Stage.competition_id == cid)
        # Undated (TBD) fixtures collect at the end; is_(None) sorts False<True.
        .order_by(Match.match_date.is_(None), Match.match_date.desc(), Match.id).all()
    )
    # Include live matches and those soft-deleted within the 24-hour undo window.
    matches = [m for m in all_m if m.deleted_at is None or m.deleted_at >= cutoff]
    return jsonify({"matches": [_match_row(m) for m in matches]})


def _venue_key(s: str) -> str:
    """A spelling-insensitive key so the same ground groups together.

    Folds the differences that made one ground show up several times in the
    autocomplete: bidi marks and non-breaking space, tatweel, harakat, and the
    alef / ya / ta-marbuta variants (أإآ→ا, ى→ي, ة→ه). Case and repeated
    whitespace are folded too, which also handles Latin names.
    """
    s = s or ""
    s = (s.replace("‏", "").replace("‎", "")
          .replace(" ", " ").replace("ـ", ""))
    s = re.sub(r"[ً-ْ]", "", s)  # harakat / tanwin / sukun / shadda
    s = (s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
          .replace("ى", "ي").replace("ة", "ه"))
    return re.sub(r"\s+", " ", s).strip().lower()


@entry_bp.get("/api/admin/competitions/<int:cid>/match-venues")
@auth.login_required
def competition_match_venues(cid: int):
    """Venue-name suggestions for the entry form, scoped to ONE competition.

    Only the grounds already used on this competition's own matches, so the list
    stays short and relevant — empty for a brand-new competition, growing as
    fixtures are entered — instead of scanning every match in the database.
    Spelling variants are collapsed (preferring the registered directory's
    spelling), and the free-text field still accepts any new ground.
    """
    stage_ids = [s.id for s in Stage.query.filter_by(competition_id=cid).all()]
    if not stage_ids:
        return jsonify({"venues": []})

    typed = []
    for col in (Match.venue_ar, Match.venue_en):
        typed += [
            r[0].strip() for r in
            db.session.query(col).filter(
                Match.stage_id.in_(stage_ids), col.isnot(None), col != ""
            ).all()
            if r[0] and r[0].strip()
        ]

    # Canonical spelling per ground — the registered directory's wins.
    canonical: dict[str, str] = {}
    for n_ar, n_en in db.session.query(Venue.name_ar, Venue.name_en).all():
        for n in (n_ar, n_en):
            if n and n.strip():
                canonical.setdefault(_venue_key(n), n.strip())

    # One entry per ground used in this competition: the directory's spelling
    # when it has one, otherwise the most common way it was typed here.
    rep: dict[str, str] = {}
    for spelling, _ in Counter(typed).most_common():
        key = _venue_key(spelling)
        rep.setdefault(key, canonical.get(key, spelling))

    return jsonify({"venues": sorted(rep.values())})


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

    home_id, away_id = _as_int(j.get("home_team_id")), _as_int(j.get("away_team_id"))
    if not home_id or not away_id or home_id == away_id:
        return jsonify({"error": "اختر فريقين مختلفين"}), 400
    # Both teams must be enrolled in this competition — otherwise an arbitrary
    # (or non-existent) team id lands in the competition's standings and public
    # feed. Enrolment already implies the right age group.
    enrolled = {
        ct.team_id for ct in CompetitionTeam.query.filter(
            CompetitionTeam.competition_id == cid,
            CompetitionTeam.team_id.in_([home_id, away_id]),
        ).all()
    }
    if home_id not in enrolled or away_id not in enrolled:
        return jsonify({"error": "أحد الفريقين غير مسجَّل في هذه البطولة"}), 400
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
    req_group_id = _as_int(j.get("group_id")) or None
    # A group must belong to this match's stage, else its standings are skewed.
    if req_group_id and not Group.query.filter_by(id=req_group_id, stage_id=stage.id).first():
        return jsonify({"error": "المجموعة لا تنتمي لهذا الدور"}), 400

    # Prevent duplicate fixtures: same stage, same pair of teams. Ignore
    # soft-deleted matches so a deleted fixture can be re-created.
    duplicate = Match.query.filter_by(
        stage_id=stage.id, home_team_id=home_id, away_team_id=away_id
    ).filter(Match.deleted_at.is_(None)).first()
    if duplicate:
        return jsonify({"error": "هذه المباراة موجودة بالفعل في هذا الدور"}), 409

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
    shootout = [{
        "id": k.id, "team_id": k.team_id, "side": _side(m, k.team_id),
        "player": (k.player.full_name_ar or k.player.full_name_en) if k.player else "",
        "kick_order": k.kick_order, "result": k.result,
        "is_winning_kick": k.is_winning_kick,
    } for k in m.shootout]
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
        "shootout": shootout,
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


def _clamp_int(v, lo: int, hi: int):
    """Parse and clamp an int into [lo, hi]; None stays None. Keeps a stray
    negative/huge score or minute from corrupting the standings that these feed."""
    n = _as_int(v)
    if n is None:
        return None
    return max(lo, min(hi, n))


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
        m.home_score = _clamp_int(j["home_score"], 0, 99)
    if "away_score" in j:
        m.away_score = _clamp_int(j["away_score"], 0, 99)
    if "home_penalty_score" in j:
        m.home_penalty_score = _clamp_int(j["home_penalty_score"], 0, 99)
    if "away_penalty_score" in j:
        m.away_penalty_score = _clamp_int(j["away_penalty_score"], 0, 99)
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
            # Block clearing the date on a match that already has a result.
            if m.home_score is not None or m.away_score is not None:
                return jsonify({"error": "لا يمكن مسح تاريخ مباراة لها نتيجة مسجّلة"}), 400
            m.match_date = None  # cleared → back to TBD
        else:
            # Keep the existing time when only the date is edited; a TBD match
            # being scheduled for the first time defaults to midnight.
            fallback = m.match_date.strftime("%H:%M") if m.match_date else "00:00"
            dt = _parse_dt(date_s, j.get("time") or fallback)
            if dt:
                m.match_date = dt

    # Correcting the two teams (e.g. a fixture entered with the wrong side).
    if "home_team_id" in j or "away_team_id" in j:
        # Every event carries a team_id that must be one of the two sides
        # (goals, cards, subs, shootout kicks, line-up rows). Swapping a side
        # out would orphan those, so only allow this while none exist yet.
        has_events = bool(
            m.goals or m.cards or m.substitutions or m.shootout
            or MatchPlayer.query.filter_by(match_id=m.id).first()
        )
        if has_events:
            return jsonify({"error": "لا يمكن تغيير الفريقين بعد إدخال الأهداف أو البطاقات أو التبديلات أو التشكيلة — احذفها أولاً أو احذف المباراة وأنشئها من جديد"}), 400
        new_home = _as_int(j.get("home_team_id", m.home_team_id)) or m.home_team_id
        new_away = _as_int(j.get("away_team_id", m.away_team_id)) or m.away_team_id
        if new_home == new_away:
            return jsonify({"error": "اختر فريقين مختلفين"}), 400
        cid = m.stage.competition_id
        enrolled = {
            ct.team_id for ct in CompetitionTeam.query.filter(
                CompetitionTeam.competition_id == cid,
                CompetitionTeam.team_id.in_([new_home, new_away]),
            ).all()
        }
        if new_home not in enrolled or new_away not in enrolled:
            return jsonify({"error": "أحد الفريقين غير مسجَّل في هذه البطولة"}), 400
        # Same guard as creation: no duplicate fixture (same stage, same pair),
        # ignoring this match itself and soft-deleted rows.
        dup = Match.query.filter(
            Match.stage_id == m.stage_id,
            Match.home_team_id == new_home,
            Match.away_team_id == new_away,
            Match.id != m.id,
            Match.deleted_at.is_(None),
        ).first()
        if dup:
            return jsonify({"error": "هذه المباراة موجودة بالفعل في هذا الدور"}), 409
        m.home_team_id = new_home
        m.away_team_id = new_away

    db.session.commit()
    return jsonify(_match_detail(m))


@entry_bp.delete("/api/admin/matches/<int:mid>")
@auth.login_required
def delete_match(mid: int):
    """Soft-delete a match — sets deleted_at so it is hidden from public feeds
    but can be restored within 24 hours.  Standings recalculate on read and so
    correct themselves immediately.
    """
    m = db.session.get(Match, mid)
    if m is None:
        return jsonify({"error": "المباراة غير موجودة"}), 404
    if m.deleted_at is not None:
        return jsonify({"error": "المباراة محذوفة بالفعل"}), 409
    m.deleted_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"deleted": mid, "deleted_at": m.deleted_at.isoformat()})


@entry_bp.post("/api/admin/matches/<int:mid>/restore")
@auth.login_required
def restore_match(mid: int):
    """Undo a soft-delete within the 24-hour window."""
    m = db.session.get(Match, mid)
    if m is None:
        return jsonify({"error": "المباراة غير موجودة"}), 404
    if m.deleted_at is None:
        return jsonify({"error": "المباراة غير محذوفة"}), 400
    if datetime.utcnow() - m.deleted_at > timedelta(hours=24):
        return jsonify({"error": "انتهت مهلة الاسترداد (24 ساعة)"}), 400
    m.deleted_at = None
    db.session.commit()
    return jsonify(_match_detail(m))


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
        minute=_clamp_int(j.get("minute"), 0, 130),
        is_own_goal=is_own_goal,
        is_penalty=False if is_own_goal else bool(j.get("is_penalty")),
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
    g.minute = _clamp_int(j.get("minute"), 0, 130)
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
        card_type=j["card_type"], minute=_clamp_int(j.get("minute"), 0, 130),
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
    c.minute = _clamp_int(j.get("minute"), 0, 130)
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
        minute=_clamp_int(j.get("minute"), 0, 130),
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
    s.minute = _clamp_int(j.get("minute"), 0, 130)
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


# ── penalty shootout ─────────────────────────────────────────────────────────

@entry_bp.post("/api/admin/matches/<int:mid>/shootout")
@auth.login_required
def add_shootout_kick(mid: int):
    m = db.session.get(Match, mid)
    if m is None:
        return jsonify({"error": "المباراة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    team_id = j.get("team_id")
    if team_id not in (m.home_team_id, m.away_team_id):
        return jsonify({"error": "الفريق ليس في هذه المباراة"}), 400
    team = db.session.get(Team, team_id)
    player = _resolve_player(j.get("player", ""), team)
    if player is None:
        return jsonify({"error": "اسم اللاعب مطلوب"}), 400
    result = j.get("result", "scored")
    if result not in codes.PENALTY_RESULT:
        result = "scored"
    kick_order = _as_int(j.get("kick_order"))
    if kick_order is None:
        kick_order = MatchPenaltyShootout.query.filter_by(match_id=mid, team_id=team_id).count() + 1
    db.session.add(MatchPenaltyShootout(
        match_id=mid, team_id=team_id, player_id=player.id,
        kick_order=kick_order, result=result,
        is_winning_kick=bool(j.get("is_winning_kick", False)),
    ))
    db.session.commit()
    return jsonify(_match_detail(m)), 201


@entry_bp.patch("/api/admin/shootout/<int:kid>")
@auth.login_required
def update_shootout_kick(kid: int):
    k = db.session.get(MatchPenaltyShootout, kid)
    if k is None:
        return jsonify({"error": "الركلة غير موجودة"}), 404
    m = k.match
    j = request.get_json(silent=True) or {}
    if "player" in j:
        team = db.session.get(Team, k.team_id)
        player = _resolve_player(j["player"], team)
        if player:
            k.player_id = player.id
    if "result" in j and j["result"] in codes.PENALTY_RESULT:
        k.result = j["result"]
    if "is_winning_kick" in j:
        k.is_winning_kick = bool(j["is_winning_kick"])
    db.session.commit()
    return jsonify(_match_detail(m))


@entry_bp.delete("/api/admin/shootout/<int:kid>")
@auth.login_required
def delete_shootout_kick(kid: int):
    k = db.session.get(MatchPenaltyShootout, kid)
    if k is None:
        return jsonify({"error": "الركلة غير موجودة"}), 404
    mid = k.match_id
    db.session.delete(k)
    db.session.commit()
    return jsonify(_match_detail(db.session.get(Match, mid)))


# ── players ───────────────────────────────────────────────────────────────────

@entry_bp.get("/api/admin/players/search")
@auth.login_required
def search_players():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify({"players": []})
    pattern = f"%{q}%"
    rows = (
        Player.query
        .filter(sa.or_(Player.full_name_ar.ilike(pattern), Player.full_name_en.ilike(pattern)))
        .order_by(Player.full_name_ar)
        .limit(20)
        .all()
    )
    return jsonify({"players": [
        {"id": p.id, "name": p.full_name_ar or p.full_name_en, "birth_year": p.birth_year}
        for p in rows
    ]})


@entry_bp.get("/api/admin/players/<int:pid>/summary")
@auth.login_required
def player_summary(pid: int):
    """Compact profile for the merge tool — birth year, teams (with age, guest
    and goals), and totals — so an admin can confirm two records are the same
    person before merging them."""
    from app.api import serializers

    p = db.session.get(Player, pid)
    if p is None:
        return jsonify({"error": "غير موجود"}), 404
    full = serializers.player_full(p)
    return jsonify({
        "id": p.id,
        "name": p.full_name_ar or p.full_name_en,
        "birth_year": p.birth_year,
        "goals": full["goals"],
        "assists": full["assists"],
        "appearances": full["appearances"],
        "teams": [{
            "club": c["club"],
            "age": (c["age"] or {}).get("ar") or (c["age"] or {}).get("en") if c["age"] else None,
            "current": c["current"],
            "guest": c.get("is_guest", False),
            "goals": c["goals"],
        } for c in full["career"]],
    })


@entry_bp.post("/api/admin/players/<int:source_id>/merge-into/<int:target_id>")
@auth.login_required
def merge_players(source_id: int, target_id: int):
    """Re-point every FK that references source onto target, then delete source.

    Used to clean up duplicate player rows created by name-spelling variants in
    the quick-add flow.  Handles the two edge cases:

    - MatchPlayer has a unique (match_id, player_id) constraint: if target is
      already in the same match's lineup, source's row is dropped instead.
    - MatchSubstitution has a check (player_out_id <> player_in_id): if a sub
      would become a self-substitution after re-pointing, it is dropped.
    - PlayerTeam: if target is already registered with the same team, source's
      registration is dropped to avoid a logical duplicate.
    """
    if source_id == target_id:
        return jsonify({"error": "لا يمكن دمج لاعب مع نفسه"}), 400
    source = db.session.get(Player, source_id)
    target = db.session.get(Player, target_id)
    if source is None:
        return jsonify({"error": "اللاعب المصدر غير موجود"}), 404
    if target is None:
        return jsonify({"error": "اللاعب الهدف غير موجود"}), 404

    # Simple FK columns — no unique constraints, bulk UPDATE is safe.
    MatchGoal.query.filter_by(scorer_id=source_id).update(
        {"scorer_id": target_id}, synchronize_session=False)
    MatchGoal.query.filter_by(assist_id=source_id).update(
        {"assist_id": target_id}, synchronize_session=False)
    # A goal where the two merged players were scorer and assister now has
    # scorer_id == assist_id (a player assisting his own goal — forbidden and
    # double-crediting the merged player). Clear the assist in that case.
    MatchGoal.query.filter(
        MatchGoal.scorer_id == target_id,
        MatchGoal.assist_id == target_id,
    ).update({"assist_id": None}, synchronize_session=False)
    MatchCard.query.filter_by(player_id=source_id).update(
        {"player_id": target_id}, synchronize_session=False)
    MatchPenaltyShootout.query.filter_by(player_id=source_id).update(
        {"player_id": target_id}, synchronize_session=False)

    # Substitutions: re-point row by row to catch self-sub violations.
    for sub in MatchSubstitution.query.filter_by(player_out_id=source_id).all():
        if sub.player_in_id == target_id:
            db.session.delete(sub)
        else:
            sub.player_out_id = target_id
    for sub in MatchSubstitution.query.filter_by(player_in_id=source_id).all():
        if sub.player_out_id == target_id:
            db.session.delete(sub)
        else:
            sub.player_in_id = target_id

    # MatchPlayer: unique (match_id, player_id) — drop source if target is already in that lineup.
    target_match_ids = {mp.match_id for mp in MatchPlayer.query.filter_by(player_id=target_id).all()}
    for mp in MatchPlayer.query.filter_by(player_id=source_id).all():
        if mp.match_id in target_match_ids:
            db.session.delete(mp)
        else:
            mp.player_id = target_id

    # PlayerTeam: drop source's registration if target already belongs to the same team.
    target_team_ids = {pt.team_id for pt in PlayerTeam.query.filter_by(player_id=target_id).all()}
    for pt in PlayerTeam.query.filter_by(player_id=source_id).all():
        if pt.team_id in target_team_ids:
            db.session.delete(pt)
        else:
            pt.player_id = target_id

    target_name = target.full_name_ar or target.full_name_en
    db.session.flush()   # apply re-points before the source row is deleted
    db.session.delete(source)
    db.session.commit()
    return jsonify({"merged": source_id, "into": target_id, "target_name": target_name})
