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
import re
from collections import defaultdict
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
    """Return n-1 balanced rounds for n teams, each a list of (home, away) pairs.

    The circle method fixes the pairings.  Home/away is then assigned greedily
    so each team's home count stays as equal as possible across rounds: the team
    with fewer home games so far gets home, with round-parity as the tiebreaker
    (even-indexed rounds favour the first team in the canonical pair, odd rounds
    favour the second).  This prevents any team from being home — or away — for
    several consecutive rounds.

    A dummy None entry is appended when len(teams) is odd so the circle method
    still works; pairs involving None are dropped (bye rounds).
    """
    pool = list(teams)
    if len(pool) % 2 == 1:
        pool.append(None)
    n = len(pool)
    fixed = pool[0]
    rotating = pool[1:]

    home_count: dict[int, int] = {t: 0 for t in teams}
    rounds: list[list[tuple[int, int]]] = []

    for r in range(n - 1):
        # Build the canonical pairs for this round (circle method).
        raw: list[tuple] = []
        for j in range(n // 2):
            a = fixed if j == 0 else rotating[j - 1]
            b = rotating[-1] if j == 0 else rotating[n - 2 - j]
            raw.append((a, b))

        # Assign home/away for each valid pair.
        pairs: list[tuple[int, int]] = []
        for a, b in raw:
            if a is None or b is None:
                continue
            ha, hb = home_count[a], home_count[b]
            # Give home to the team with fewer home games; break ties by round
            # parity so the assignment pattern itself alternates each round.
            if ha < hb or (ha == hb and r % 2 == 0):
                pairs.append((a, b))
                home_count[a] += 1
            else:
                pairs.append((b, a))
                home_count[b] += 1

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


# ── time helpers ─────────────────────────────────────────────────────────────

def _add_minutes(time_str: str, minutes: int) -> str:
    """Offset an "HH:MM" string by ``minutes``, wrapping at midnight."""
    try:
        h, m = (int(x) for x in time_str.split(":")[:2])
    except (ValueError, AttributeError):
        return time_str
    total = h * 60 + m + minutes
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def _match_time(base: str | None, day_index: int, interval: int) -> str | None:
    """Return the kickoff time for the nth match (0-based) on a day.

    When ``interval`` is 0 or ``base`` is None every match gets the same
    base time (or None).  Otherwise each successive match shifts forward
    by ``interval`` minutes.
    """
    if not base or interval == 0 or day_index == 0:
        return base
    return _add_minutes(base, day_index * interval)


# ── round label helpers ───────────────────────────────────────────────────────

def _rr_label(n: int) -> str:
    return f"الجولة {n}"


def _rr_round_num(label: str | None) -> int:
    """Pull the trailing round number out of a label like "الجولة 3" (0 if none).
    Used to continue numbering when appending further rounds to a stage."""
    if not label:
        return 0
    m = re.search(r"(\d+)\s*$", label)
    return int(m.group(1)) if m else 0


def _byed_team(team_ids: list[int], round_pairs: list[tuple[int, int]]) -> int | None:
    """The team sitting out a round (odd team count) — the one in ``team_ids``
    that appears in none of the round's pairs. None when every team plays."""
    present = {t for pair in round_pairs for t in pair}
    missing = [t for t in team_ids if t not in present]
    return missing[0] if missing else None


# ── endpoint ──────────────────────────────────────────────────────────────────

@tla3bny_bp.post("/stages/<int:stage_id>/generate-fixtures")
@auth.login_required
def generate_fixtures(stage_id: int):
    """Bulk-create match fixtures for a stage.

    JSON body
    ---------
    mode             "round_robin" | "double_round_robin" | "knockout"
    start_date       "YYYY-MM-DD"  — omit to create fixtures without dates
    match_days       [1-7]         — isoweekdays that matches are played (global fallback)
    matches_per_day  int           — how many matches share one date (global fallback)
    default_time     "HH:MM"       — applied to every created match (global fallback)
    default_venue    str           — applied to every created match (global fallback)
    force            bool          — delete existing fixtures and regenerate from round 1
    rounds           int           — how many rounds to create this call (round-robin
                                     only).  Omit/0 = all remaining.  Without ``force``
                                     the engine APPENDS the next ``rounds`` rounds after
                                     whatever already exists, so an organizer can reveal
                                     the table round by round instead of all at once.
    bye_team_id      int           — for an odd-sized group, the team to rest in the next
                                     round being generated (round-robin only).  The whole
                                     round where that team byes is swapped into position,
                                     so the schedule stays a valid round-robin.  Ignored
                                     when the group is even or the team already rested.
    time_interval_minutes  int     — minutes between consecutive matches on the same day
                                     (global fallback).  Set alongside default_time so the
                                     scheduler can calculate each match's kickoff.
    group_settings   list          — per-group overrides for group-stage scheduling.
                                     Each item: { group_id, match_days, matches_per_day,
                                     default_time, default_venue, time_interval_minutes,
                                     bye_team_id }.
                                     When present the groups are scheduled independently
                                     (each on its own calendar) rather than interleaved.
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
    time_interval: int = max(0, _int(data.get("time_interval_minutes"), 0))
    force: bool = bool(data.get("force"))
    want_rounds: int = max(0, _int(data.get("rounds"), 0))  # 0 = all remaining
    bye_team_id: int | None = _int(data.get("bye_team_id")) or None

    # Per-group scheduling settings (group stage only).
    # Maps group_id → { match_days, per_day, time, venue, interval, bye }.
    per_group: dict[int, dict] = {}
    for gs in (data.get("group_settings") or []):
        gid = _int(gs.get("group_id"))
        if gid:
            per_group[gid] = {
                "match_days": [v for v in (_int(x) for x in (gs.get("match_days") or [])) if v],
                "per_day": max(1, _int(gs.get("matches_per_day"), 9999)),
                "time": (gs.get("default_time") or "").strip() or None,
                "venue": (gs.get("default_venue") or "").strip() or None,
                "interval": max(0, _int(gs.get("time_interval_minutes"), 0)),
                "bye": _int(gs.get("bye_team_id")) or None,
            }

    # Existing fixtures. ``force`` wipes the stage and rebuilds from round 1.
    # Otherwise round-robin APPENDS the next rounds after what already exists (so
    # the organiser can reveal the table round by round); knockout can't append
    # — its later rounds depend on results — so it still needs force to redo.
    existing_matches = Tla3bnyMatch.query.filter_by(stage_id=stage_id).all()
    if force and existing_matches:
        Tla3bnyMatch.query.filter_by(stage_id=stage_id).delete()
        db.session.flush()
        existing_matches = []
    if mode == "knockout" and existing_matches:
        return _err(
            f"{len(existing_matches)} fixture(s) already exist for this stage. "
            'Pass "force": true to delete and regenerate.',
            409,
        )

    existing_by_group: dict[int | None, list[Tla3bnyMatch]] = defaultdict(list)
    for m in existing_matches:
        existing_by_group[m.group_id].append(m)

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
                home_id, away_id, current_date,
                _match_time(default_time, day_count, time_interval),
                default_venue, label,
            ))
            if current_date is not None:
                day_count += 1

    # ── round-robin (single or double) ───────────────────────────────────────
    else:
        # Build each playable group's plan: its canonical schedule, which rounds
        # are already generated, and the slice to emit now (honouring `rounds`
        # and an optional bye pick). Plan = (group, rounds_to_emit, start_label,
        # last_date) where start_label continues the group's round numbering.
        plans: list[tuple[Tla3bnyGroup, list[list[tuple[int, int]]], int, date | None]] = []
        any_playable = False
        for group in stage.groups:
            team_ids = [gt.team_id for gt in group.team_entries]
            if len(team_ids) < 2:
                continue
            any_playable = True
            canonical = _round_robin(team_ids)
            if mode == "double_round_robin":
                canonical = canonical + [[(b, a) for a, b in r] for r in canonical]

            gmatches = existing_by_group.get(group.id, [])
            existing_pairs = {(m.home_team_id, m.away_team_id) for m in gmatches}
            # A canonical round is already generated when all its (home, away)
            # pairs exist. Identifying by pair content (not position) lets a bye
            # pick reorder emission without us losing track of what's done.
            remaining = [
                i for i, r in enumerate(canonical)
                if r and not all(p in existing_pairs for p in r)
            ]

            # Bye pick (odd group, single round-robin only): each team byes
            # exactly once, so pull the round where the chosen team rests to the
            # front — the whole round is swapped, keeping a valid round-robin.
            gbye = per_group.get(group.id, {}).get("bye") if per_group else bye_team_id
            if gbye and len(team_ids) % 2 == 1 and mode == "round_robin":
                if gbye not in team_ids:
                    return _err("Bye team is not in this group", 409)
                target = next(
                    (i for i in remaining if _byed_team(team_ids, canonical[i]) == gbye),
                    None,
                )
                if target is None:
                    return _err(
                        "هذا الفريق استراح بالفعل في جولة سابقة — اختر فريقًا آخر.",
                        409,
                    )
                remaining = [target] + [i for i in remaining if i != target]

            take = remaining[:want_rounds] if want_rounds else remaining
            # Drop any pair that already exists (e.g. a round was partly deleted
            # by hand) so a re-emitted round never duplicates a fixture.
            rounds_to_emit = [
                [p for p in canonical[i] if p not in existing_pairs] for i in take
            ]
            rounds_to_emit = [r for r in rounds_to_emit if r]

            start_label = max((_rr_round_num(m.round) for m in gmatches), default=0)
            last_date = max((m.date for m in gmatches if m.date), default=None)
            plans.append((group, rounds_to_emit, start_label, last_date))

        if not any_playable:
            return _err("Need at least 2 teams in at least one group")

        if per_group:
            # ── independent per-group scheduling ──────────────────────────────
            # Each group runs on its own calendar so different groups can play
            # on different weekdays / venues without interfering with each other.
            for group, rounds, start_label, last_date in plans:
                gs = per_group.get(group.id, {
                    "match_days": match_days,
                    "per_day": per_day,
                    "time": default_time,
                    "venue": default_venue,
                    "interval": time_interval,
                })
                g_days = gs["match_days"]
                g_per_day = gs["per_day"]
                g_time = gs["time"]
                g_venue = gs["venue"]
                g_interval = gs.get("interval", 0)

                # Continue after this group's last dated fixture when appending;
                # an explicit start_date overrides.
                if start_date:
                    g_date = _next_allowed_day(start_date, g_days)
                elif last_date:
                    g_date = _advance(last_date, g_days)
                else:
                    g_date = None
                g_day_count = 0

                for j, round_pairs in enumerate(rounds):
                    label = _rr_label(start_label + j + 1)
                    for home_id, away_id in round_pairs:
                        if g_date is not None and g_day_count >= g_per_day:
                            g_date = _advance(g_date, g_days)
                            g_day_count = 0
                        created.append(_make_match(
                            cage, stage_id, group.id,
                            home_id, away_id, g_date,
                            _match_time(g_time, g_day_count, g_interval),
                            g_venue, label,
                        ))
                        if g_date is not None:
                            g_day_count += 1

                    # New round → fresh date for this group.
                    if g_date is not None:
                        g_date = _advance(g_date, g_days)
                        g_day_count = 0

        else:
            # ── interleaved scheduling (single set of days for all groups) ────
            max_rounds = max((len(r) for _, r, _, _ in plans), default=0)

            stage_last_date = max(
                (m.date for m in existing_matches if m.date), default=None
            )
            if start_date:
                current_date = _next_allowed_day(start_date, match_days)
            elif stage_last_date:
                current_date = _advance(stage_last_date, match_days)
            else:
                current_date = None
            day_count = 0

            for j in range(max_rounds):
                for group, rounds, start_label, last_date in plans:
                    if j >= len(rounds):
                        continue
                    label = _rr_label(start_label + j + 1)
                    for home_id, away_id in rounds[j]:
                        if current_date is not None and day_count >= per_day:
                            current_date = _advance(current_date, match_days)
                            day_count = 0
                        created.append(_make_match(
                            cage, stage_id, group.id,
                            home_id, away_id, current_date,
                            _match_time(default_time, day_count, time_interval),
                            default_venue, label,
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
