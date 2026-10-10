"""Assemble tla3bny standings out of the database, per (competition, age).

Reuses the youthscores standings engine (`services.standings`) unchanged — the
algorithm and its unusual head-to-head tiebreak are identical — passing tla3bny's
own match vocabulary (a result is "completed" or "finished"; knockouts are
"knockout"). Each (competition, age) pair is
the tla3bny equivalent of one youthscores competition instance, so stages and
groups are scoped to a ``Tla3bnyCompetitionAge``.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from sqlalchemy.orm import joinedload

from app.models import (
    Tla3bnyCompetitionAge,
    Tla3bnyCompetitionTeam,
    Tla3bnyGroup,
    Tla3bnyGroupTeam,
    Tla3bnyMatch,
    Tla3bnyPunishment,
    Tla3bnyStage,
    Tla3bnyTeam,
)
from app.models.codes import TLA3BNY_MATCH_DONE
from app.services.standings import Standing, calculate

# A result has been entered under either status ("completed" or the legacy
# "finished"); both must count. Single-sourced in codes.py.
_FINISHED = TLA3BNY_MATCH_DONE
_KNOCKOUT = "knockout"


def _calc(matches, teams, **kw):
    return calculate(
        matches,
        teams,
        completed_status=_FINISHED,
        knockout_type=_KNOCKOUT,
        **kw,
    )


def competition_age(competition_id: int, age_category_id: int):
    return Tla3bnyCompetitionAge.query.filter_by(
        competition_id=competition_id, age_category_id=age_category_id
    ).first()


def age_matches(
    competition_id: int, age_category_id: int, *, cage_id: int | None = None
) -> list[Tla3bnyMatch]:
    q = Tla3bnyMatch.query.filter_by(competition_id=competition_id)
    if cage_id:
        q = q.filter(Tla3bnyMatch.competition_age_id == cage_id)
    else:
        q = q.filter(Tla3bnyMatch.age_category_id == age_category_id)
    return q.options(joinedload(Tla3bnyMatch.stage)).all()


def age_teams(
    competition_id: int, age_category_id: int, *, cage_id: int | None = None
) -> list[Tla3bnyTeam]:
    q = Tla3bnyTeam.query.join(
        Tla3bnyCompetitionTeam,
        Tla3bnyCompetitionTeam.team_id == Tla3bnyTeam.id,
    ).filter(Tla3bnyCompetitionTeam.competition_id == competition_id)
    if cage_id:
        q = q.filter(Tla3bnyCompetitionTeam.competition_age_id == cage_id)
    else:
        q = q.filter(Tla3bnyCompetitionTeam.age_category_id == age_category_id)
    return q.order_by(Tla3bnyCompetitionTeam.id).all()


def disqualified_team_ids(competition_id: int) -> set[int]:
    """Teams removed from the standings by an active team-level disqualification.

    Only the disqualified team's own row is dropped; its matches still count for its
    opponents, who keep the result (the standings engine credits a team even when its
    opponent has no row). Driven by the punishment — like a point deduction — so it's
    reversible if the organizer lifts the disqualification."""
    return {
        p.team_id
        for p in Tla3bnyPunishment.query.filter(
            Tla3bnyPunishment.competition_id == competition_id,
            Tla3bnyPunishment.punishment_type == "disqualification",
            Tla3bnyPunishment.team_id.isnot(None),
        ).all()
    }


def deductions_of(
    competition_id: int, age_category_id: int, *, cage_id: int | None = None
) -> dict[int, int]:
    q = Tla3bnyCompetitionTeam.query.filter_by(competition_id=competition_id)
    if cage_id:
        q = q.filter(Tla3bnyCompetitionTeam.competition_age_id == cage_id)
    else:
        q = q.filter(Tla3bnyCompetitionTeam.age_category_id == age_category_id)
    return {ct.team_id: ct.point_deduction for ct in q.all() if ct.point_deduction}


def _forms_by_team(matches, *, limit: int = 5) -> dict[int, list[str]]:
    """Each team's most-recent W/D/L form, built in ONE pass over ``matches``.

    Replaces calling ``team_form`` once per standing (which re-scans the whole match
    list each time → O(teams x matches)). Output matches ``team_form``: newest first,
    finished matches with both scores, capped to ``limit``."""
    played: dict[int, list] = defaultdict(list)
    for m in matches:
        if (m.status in _FINISHED
                and m.home_score is not None and m.away_score is not None):
            played[m.home_team_id].append(m)
            played[m.away_team_id].append(m)
    forms: dict[int, list[str]] = {}
    for tid, ms in played.items():
        ms.sort(key=lambda m: m.match_date or datetime.min, reverse=True)
        out = []
        for m in ms[:limit]:
            home = m.home_team_id == tid
            gf = m.home_score if home else m.away_score
            ga = m.away_score if home else m.home_score
            out.append("W" if gf > ga else "D" if gf == ga else "L")
        forms[tid] = out
    return forms


def groups_of(cage: Tla3bnyCompetitionAge) -> list[Tla3bnyGroup]:
    # Knockout stages organise the bracket, not the league table — exclude them
    # so their groups don't create duplicate standing blocks.
    return (
        Tla3bnyGroup.query.join(Tla3bnyStage)
        .filter(
            Tla3bnyStage.competition_age_id == cage.id,
            Tla3bnyStage.type != _KNOCKOUT,
        )
        # By the admin's sort_order (then id) — not name, where «المجموعة 10»
        # would sort before «المجموعة 2» — so the standings follow the ▲▼ order.
        .order_by(Tla3bnyGroup.sort_order, Tla3bnyGroup.id)
        .all()
    )


def _standing_dict(s: Standing, team: Tla3bnyTeam | None, form: list[str]) -> dict:
    return {
        "team_id": s.team_id,
        "team_name": team.display_name() if team else None,
        "academy_id": team.academy_id if team else None,
        "academy_logo": (
            team.academy.logo_path if team and team.academy else None
        ),
        "P": s.played,
        "W": s.won,
        "D": s.drawn,
        "L": s.lost,
        "GF": s.goals_for,
        "GA": s.goals_against,
        "GD": s.goal_diff,
        "point_deduction": s.point_deduction,
        "Pts": s.points,
        "rank": s.position,
        "form": form,
    }


def standings_by_group(
    competition_id: int,
    age_category_id: int = 0,
    *,
    cage_id: int | None = None,
) -> list[dict]:
    """One table per group, or a single unnamed table when there are no groups.

    Mirrors youthscores' ``services.tables.standings_by_group``: teams are
    partitioned by group while their matches against everyone else still count,
    unless the group's stage starts from zero (``carries_points = False``).

    Pass ``cage_id`` (competition_age_id) to scope the table to a single
    sub-competition — necessary when several sub-competitions share the same
    age category.
    """
    if cage_id:
        cage = Tla3bnyCompetitionAge.query.filter_by(
            id=cage_id, competition_id=competition_id
        ).first()
    elif age_category_id:
        cage = competition_age(competition_id, age_category_id)
    else:
        return []
    if cage is None:
        return []

    # When the caller supplied cage_id we use the cage's own age_category_id
    # for any fallback lookups that still need it.
    effective_age_id = cage.age_category_id if cage_id else age_category_id

    matches = age_matches(competition_id, effective_age_id, cage_id=cage_id)
    # Keep the table under wraps until the organiser has drawn up the fixtures.
    # With no matches created yet, a standings table would carry nothing but the
    # list of entered teams — which quietly tells every academy how many (and
    # which) rivals have joined before the organiser has chosen to reveal the
    # draw. No fixtures → no table, for everyone.
    if not matches:
        return []

    teams = age_teams(competition_id, effective_age_id, cage_id=cage_id)
    # Drop disqualified teams from the table; their matches still count for opponents.
    disqualified = disqualified_team_ids(competition_id)
    if disqualified:
        teams = [t for t in teams if t.id not in disqualified]
    team_by_id = {t.id: t for t in teams}
    docked = deductions_of(competition_id, effective_age_id, cage_id=cage_id)
    groups = groups_of(cage)
    forms = _forms_by_team(matches)  # one pass, not team_form() re-scanning per row

    def rows(standings):
        return [
            _standing_dict(s, team_by_id.get(s.team_id), forms.get(s.team_id, []))
            for s in standings
        ]

    if not groups:
        return [{"group": None, "standings": rows(_calc(matches, teams, deductions=docked))}]

    # Build a lookup of stage_id → stage_type to avoid lazy-load issues.
    stage_types = {
        s.id: s.type
        for s in Tla3bnyStage.query.filter_by(competition_age_id=cage.id).all()
    }

    out = []
    grouped: set[int] = set()
    for g in groups:
        # Knockout-stage groups organise the bracket, not the league table.
        if stage_types.get(g.stage_id) == _KNOCKOUT:
            continue
        ids = {gt.team_id for gt in Tla3bnyGroupTeam.query.filter_by(group_id=g.id).all()}
        if not ids:
            continue
        grouped |= ids
        stage = g.stage
        stage_filter = None if (stage is None or stage.carries_points) else stage.id
        out.append(
            {
                "group": {"id": g.id, "name": g.name, "stage_id": g.stage_id},
                "standings": rows(
                    _calc(matches, teams, team_ids=ids, stage_filter=stage_filter,
                          deductions=docked)
                ),
            }
        )

    ungrouped = {t.id for t in teams} - grouped
    if ungrouped:
        out.append(
            {"group": None, "standings": rows(_calc(matches, teams, team_ids=ungrouped,
                                                    deductions=docked))}
        )
    return out


def knockout_bracket(competition_id: int, age_category_id: int) -> list[dict]:
    """Knockout stages' fixtures grouped by stage then round, for bracket UI."""
    cage = competition_age(competition_id, age_category_id)
    if cage is None:
        return []
    ko_stages = [s for s in cage.stages if s.type == _KNOCKOUT]
    if not ko_stages:
        return []
    matches = age_matches(competition_id, age_category_id)
    out = []
    for stage in sorted(ko_stages, key=lambda s: s.stage_order):
        stage_matches = [m for m in matches if m.stage_id == stage.id]
        rounds: dict[str, list] = {}
        for m in stage_matches:
            rounds.setdefault(m.round or "", []).append(m.to_dict())
        out.append(
            {
                "stage_id": stage.id,
                "stage_name": stage.name,
                "rounds": [
                    {"round": r, "matches": ms} for r, ms in rounds.items()
                ],
            }
        )
    return out
