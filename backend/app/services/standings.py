"""League table computation.

A port of the identical Dart and TypeScript implementations this replaces
(`lib/core/utils/standings_calculator.dart`, `web/src/lib/utils.ts`). The point
of moving it here is that the rule below now exists once instead of twice, so
the website and the app cannot drift apart on who finished top.

The tiebreak rule is deliberately unusual — see `break_tie`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from itertools import combinations

from app.models import codes
from app.models.match import Match
from app.models.team import Team


@dataclass
class Standing:
    team_id: int
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    goals_for: int = 0
    goals_against: int = 0
    point_deduction: int = 0
    points: int = 0
    position: int = 0

    @property
    def goal_diff(self) -> int:
        return self.goals_for - self.goals_against


@dataclass
class _H2H:
    points: int = 0
    goals_for: int = 0
    goals_against: int = 0

    @property
    def goal_diff(self) -> int:
        return self.goals_for - self.goals_against


def is_eligible(
    m: Match,
    stage_filter: int | set[int] | None = None,
    *,
    completed_status: str = codes.MATCH_STATUS_COMPLETED,
    knockout_type: str = codes.STAGE_TYPE_KNOCKOUT,
) -> bool:
    """Only completed, non-knockout matches with a scoreline count.

    `stage_filter` limits the table to certain stages — one id, or the set of
    stages a table accumulates over (see `tables.counted_stage_ids`).

    `completed_status` / `knockout_type` are the vocabulary of the match's
    subsystem: the defaults are youthscores', and the tla3bny subsystem passes
    its own ("finished" / "knockout") so this engine can be reused unchanged.
    """
    if m.stage is not None and m.stage.type == knockout_type:
        return False
    if stage_filter is not None:
        allowed = stage_filter if isinstance(stage_filter, set) else {stage_filter}
        if m.stage_id not in allowed:
            return False
    if m.status != completed_status:
        return False
    return m.home_score is not None and m.away_score is not None


def calculate(
    matches: list[Match],
    teams: list[Team],
    *,
    team_ids: set[int] | None = None,
    stage_filter: int | None = None,
    deductions: dict[int, int] | None = None,
    completed_status: str = codes.MATCH_STATUS_COMPLETED,
    knockout_type: str = codes.STAGE_TYPE_KNOCKOUT,
) -> list[Standing]:
    """Build the table for `teams` from `matches`.

    `team_ids` restricts the table to one group; the teams' matches against
    everyone else still count, exactly as the original did.

    `deductions` maps team id to points docked in this competition. It is passed
    in rather than read off the team because a team carries on into the next
    season and a penalty does not: the deduction belongs to the entry, not the
    squad.
    """
    docked = deductions or {}
    table: dict[int, Standing] = {}
    for t in teams:
        if team_ids is None or t.id in team_ids:
            # A deduction starts the team below zero rather than being applied
            # after the fact, so it is included in every later comparison.
            penalty = docked.get(t.id, 0)
            table[t.id] = Standing(
                team_id=t.id,
                point_deduction=penalty,
                points=-penalty,
            )

    eligible = [
        m
        for m in matches
        if is_eligible(
            m,
            stage_filter,
            completed_status=completed_status,
            knockout_type=knockout_type,
        )
    ]

    for m in eligible:
        home = table.get(m.home_team_id)
        away = table.get(m.away_team_id)
        if home is None and away is None:
            continue
        hs, aws = m.home_score, m.away_score
        if home is not None:
            home.played += 1
            home.goals_for += hs
            home.goals_against += aws
            if hs > aws:
                home.won += 1
                home.points += 3
            elif hs < aws:
                home.lost += 1
            else:
                home.drawn += 1
                home.points += 1
        if away is not None:
            away.played += 1
            away.goals_for += aws
            away.goals_against += hs
            if aws > hs:
                away.won += 1
                away.points += 3
            elif aws < hs:
                away.lost += 1
            else:
                away.drawn += 1
                away.points += 1

    # Primary sort is points alone; everything level is then resolved as a block.
    # sorted() is stable, so teams that are equal on every criterion keep the
    # order they were given in — matching the JavaScript, whose sort is also
    # stable. (Dart's sort is not, which is why the two clients could already
    # disagree on a total tie.)
    ordered = sorted(table.values(), key=lambda s: -s.points)

    result: list[Standing] = []
    i = 0
    while i < len(ordered):
        j = i + 1
        while j < len(ordered) and ordered[j].points == ordered[i].points:
            j += 1
        block = ordered[i:j]
        result.extend(block if len(block) == 1 else break_tie(block, eligible))
        i = j

    for pos, s in enumerate(result, start=1):
        s.position = pos
    return result


def break_tie(tied: list[Standing], eligible: list[Match]) -> list[Standing]:
    """Order teams level on points.

    Head-to-head is only used when every pair among the tied teams has played
    each other *exactly twice* — i.e. the mini-league is complete and balanced,
    so comparing it is fair. If any pair has played once, three times, or not at
    all, the mini-league would flatter whoever had the easier half of it, and the
    rule falls back to overall goal difference.

    This is a real competition rule, not an implementation detail: keep it.
    """
    tied_ids = {s.team_id for s in tied}

    h2h_matches = [
        m
        for m in eligible
        if m.home_team_id in tied_ids and m.away_team_id in tied_ids
    ]

    all_played_twice = True
    for a, b in combinations(tied_ids, 2):
        n = sum(
            1
            for m in h2h_matches
            if {m.home_team_id, m.away_team_id} == {a, b}
        )
        if n != 2:
            all_played_twice = False
            break

    if not all_played_twice:
        return sorted(tied, key=lambda s: (-s.goal_diff, -s.goals_for))

    h2h: dict[int, _H2H] = {s.team_id: _H2H() for s in tied}
    for m in h2h_matches:
        home, away = h2h[m.home_team_id], h2h[m.away_team_id]
        hs, aws = m.home_score, m.away_score
        home.goals_for += hs
        home.goals_against += aws
        away.goals_for += aws
        away.goals_against += hs
        if hs > aws:
            home.points += 3
        elif hs == aws:
            home.points += 1
            away.points += 1
        else:
            away.points += 3

    return sorted(
        tied,
        key=lambda s: (
            -h2h[s.team_id].points,      # head-to-head points
            -h2h[s.team_id].goal_diff,   # head-to-head goal difference
            -s.goal_diff,                # overall goal difference
            -s.goals_for,                # overall goals scored
        ),
    )


def team_form(
    team_id: int,
    matches: list[Match],
    limit: int = 5,
    *,
    completed_status: str = codes.MATCH_STATUS_COMPLETED,
) -> list[str]:
    """Most recent results first, as W/D/L. Includes knockout matches."""
    played = [
        m
        for m in matches
        if team_id in (m.home_team_id, m.away_team_id)
        and m.status == completed_status
        and m.home_score is not None
        and m.away_score is not None
    ]
    # A completed match normally has a date; guard the rare undated one so the
    # sort never compares None with a datetime.
    played.sort(key=lambda m: m.match_date or datetime.min, reverse=True)

    out = []
    for m in played[:limit]:
        home = m.home_team_id == team_id
        gf = m.home_score if home else m.away_score
        ga = m.away_score if home else m.home_score
        out.append("W" if gf > ga else "D" if gf == ga else "L")
    return out
