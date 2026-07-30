"""Fixture generator for tla3bny competition stages.

POST /api/tla3bny/stages/<stage_id>/generate-fixtures

Supported modes
---------------
round_robin        — every team in a group plays every other team once
                     (circle method, n-1 rounds for n teams)
double_round_robin — same, but each pair plays home AND away (2*(n-1) rounds)
knockout           — single-elimination round 1 only; later rounds are created
                     by the admin as results come in (model requires non-null
                     team IDs so future shells cannot be pre-created)

Date scheduling
---------------
Pass start_date + match_days (list of isoweekdays 1-Mon…7-Sun) and the engine
fills match.date automatically.  matches_per_day controls how many fixtures
share one calendar date before the scheduler advances to the next allowed day.
Within a round-robin, all rounds are separated by at least one date change so
fixtures from different rounds never land on the same day.

For multi-group stages the rounds are *interleaved* across groups — Group A
round 1 and Group B round 1 share the same calendar day (filling
matches_per_day slots).

Force regeneration
------------------
If fixtures already exist for the stage, the request is rejected with 409
unless "force": true is sent, which deletes and rebuilds them.
"""

from __future__ import annotations

import math
from datetime import date, timedelta

from flask import jsonify, request
from sqlalchemy.orm import selectinload

from app.extensions import db
from app.models import (
    Tla3bnyGroup,
    Tla3bnyMatch,
    Tla3bnyStage,
)
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import _err, _forbid, _int, _parse_date


# ── date scheduling ───────────────────────────────────────────────────────────

def _next_allowed_day(d: date, allowed: list[int]) -> date:
    """Advance d forward until its isoweekday is in allowed (1=Mon … 7=Sun).
    Returns d unchanged when allowed is empty (any day accepted)."""
    if not allowed:
        return d
    for _ in range(7):
        if d.isoweekday() in allowed:
            return d
        d += timedelta(days=1)
    return d  # fallback — should never be reached


def _advance(d: date, allowed: list[int]) -> date:
    """Move one day forward, then land on the next allowed weekday."""
    return _next_allowed_day(d + timedelta(days=1), allowed)


# ── round-robin algorithm (circle method) ─────────────────────────────────────

def _round_robin(teams: list[int]) -> list[list[tuple[int, int]]]:
    """Return n-1 rounds for n teams, each round a list of (home, away) pairs.

    A dummy None entry is appended when len(teams) is odd so the circle method
    still works; pairs involving None are dropped (bye rounds).
    """
    pool = list(teams)
    if len(pool) % 2 == 1:
        pool.append(None)
    n = len(pool)
    fixed = pool[0]
    rotating = pool[1:]
    rounds: list[list[tuple[int, int]]] = []
    for _ in range(n - 1):
        pairs: list[tuple[int, int]] = []
        for j in range(n // 2):
            a = fixed if j == 0 else rotating[j - 1]
            b = rotating[-1] if j == 0 else rotating[n - 2 - j]
            if a is not None and b is not None:
                pairs.append((a, b))
        rounds.append(pairs)
        rotating = [rotating[-1]] + rotating[:-1]
    return rounds


# ── knockout algorithm ────────────────────────────────────────────────────────

def _knockout_pairs(teams: list[int]) -> tuple[list[tuple[int, int]], str]:
    """Generate round-1 pairs for a single-elimination bracket.

    The bracket size is the smallest power of 2 ≥ len(teams).  Top-seeded
    teams (first in the list) receive byes equal to (bracket_size - n) and skip
    to round 2, so only teams without byes are paired here.

    Returns (pairs, arabic_round_label).
    """
    n = len(teams)
    size = 1 << math.ceil(math.log2(max(n, 2)))
    byes = size - n
    playing = teams[byes:]
    pairs = [(playing[i], playing[i + 1]) for i in range(0, len(playing) - 1, 2)]
    total_rounds = int(math.log2(size))
    _labels = {1: "النهائي", 2: "نصف النهائي", 3: "ربع النهائي", 4: "ثمن النهائي"}
    label = _labels.get(total_rounds, f"دور الـ {size}")
    return pairs, label


# ── round label helpers ───────────────────────────────────────────────────────

def _rr_label(n: int) -> str:
    return f"الجولة {n}"


# ── endpoint ──────────────────────────────────────────────────────────────────

@tla3bny_bp.post("/stages/<int:stage_id>/generate-fixtures")
@auth.login_required
def generate_fixtures(stage_id: int):
    """Bulk-create match fixtures for a stage.

    JSON body
    ---------
    mode             "round_robin" | "double_round_robin" | "knockout"
    start_date       "YYYY-MM-DD"  — omit to create fixtures without dates
    match_days       [1-7]         — isoweekdays that matches are played;
                                     omit or [] to allow any day
    matches_per_day  int           — how many matches share one date (default: all)
    default_time     "HH:MM"       — applied to every created match (optional)
    default_venue    str           — applied to every created match (optional)
    force            bool          — delete existing fixtures and regenerate
    """
    stage = (
        Tla3bnyStage.query
        .options(
            selectinload(Tla3bnyStage.competition_age),
            selectinload(Tla3bnyStage.groups)
            .selectinload(Tla3bnyGroup.team_entries),
        )
        .filter_by(id=stage_id)
        .first_or_404()
    )
    cage = stage.competition_age
    if not cage:
        return _err("Stage has no parent sub-competition", 500)
    if not auth.is_competition_admin(auth.current_user(), cage.competition_id):
        return _forbid()

    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "round_robin")
    if mode not in ("round_robin", "double_round_robin", "knockout"):
        return _err("mode must be round_robin, double_round_robin or knockout")

    start_date: date | None = _parse_date(data.get("start_date"))
    match_days: list[int] = [
        v for v in (_int(x) for x in (data.get("match_days") or [])) if v
    ]
    per_day: int = max(1, _int(data.get("matches_per_day"), 9999))
    default_time: str | None = (data.get("default_time") or "").strip() or None
    default_venue: str | None = (data.get("default_venue") or "").strip() or None
    force: bool = bool(data.get("force"))

    # Guard: existing fixtures.
    existing = Tla3bnyMatch.query.filter_by(stage_id=stage_id).count()
    if existing and not force:
        return _err(
            f"{existing} fixture(s) already exist for this stage. "
            'Pass "force": true to delete and regenerate.',
            409,
        )
    if existing:
        Tla3bnyMatch.query.filter_by(stage_id=stage_id).delete()
        db.session.flush()

    created: list[Tla3bnyMatch] = []

    # ── knockout ──────────────────────────────────────────────────────────────
    if mode == "knockout":
        all_team_ids: list[int] = []
        seen: set[int] = set()
        for group in stage.groups:
            for gt in group.team_entries:
                if gt.team_id not in seen:
                    all_team_ids.append(gt.team_id)
                    seen.add(gt.team_id)

        if len(all_team_ids) < 2:
            return _err("Need at least 2 teams in the stage to generate fixtures")

        pairs, label = _knockout_pairs(all_team_ids)
        pool_group_id = stage.groups[0].id if stage.groups else None

        current_date = (
            _next_allowed_day(start_date, match_days) if start_date else None
        )
        day_count = 0
        for home_id, away_id in pairs:
            if current_date is not None and day_count >= per_day:
                current_date = _advance(current_date, match_days)
                day_count = 0
            created.append(_make_match(
                cage, stage_id, pool_group_id,
                home_id, away_id, current_date, default_time, default_venue, label,
            ))
            if current_date is not None:
                day_count += 1

    # ── round-robin (single or double) ───────────────────────────────────────
    else:
        # Build per-group schedules.
        group_schedules: list[tuple[Tla3bnyGroup, list[list[tuple[int, int]]]]] = []
        for group in stage.groups:
            team_ids = [gt.team_id for gt in group.team_entries]
            if len(team_ids) < 2:
                continue
            rounds = _round_robin(team_ids)
            if mode == "double_round_robin":
                rounds = rounds + [[(b, a) for a, b in r] for r in rounds]
            group_schedules.append((group, rounds))

        if not group_schedules:
            return _err("Need at least 2 teams in at least one group")

        max_rounds = max(len(r) for _, r in group_schedules)

        current_date = (
            _next_allowed_day(start_date, match_days) if start_date else None
        )
        day_count = 0

        for round_idx in range(max_rounds):
            label = _rr_label(round_idx + 1)

            for group, rounds in group_schedules:
                if round_idx >= len(rounds):
                    continue
                for home_id, away_id in rounds[round_idx]:
                    if current_date is not None and day_count >= per_day:
                        current_date = _advance(current_date, match_days)
                        day_count = 0
                    created.append(_make_match(
                        cage, stage_id, group.id,
                        home_id, away_id, current_date, default_time, default_venue, label,
                    ))
                    if current_date is not None:
                        day_count += 1

            # Each round starts on a fresh date so fixtures from different
            # rounds never share a calendar day.
            if current_date is not None:
                current_date = _advance(current_date, match_days)
                day_count = 0

    for m in created:
        db.session.add(m)
    db.session.commit()

    return jsonify({
        "created": len(created),
        "matches": [m.to_dict() for m in created],
    }), 201


# ── factory ───────────────────────────────────────────────────────────────────

def _make_match(cage, stage_id, group_id, home_id, away_id, d, time, venue, round_label):
    return Tla3bnyMatch(
        competition_id=cage.competition_id,
        age_category_id=cage.age_category_id,
        competition_age_id=cage.id,
        stage_id=stage_id,
        group_id=group_id,
        home_team_id=home_id,
        away_team_id=away_id,
        date=d,
        time=time,
        venue=venue,
        round=round_label,
        status="scheduled",
    )
