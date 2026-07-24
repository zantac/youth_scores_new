"""Assemble tla3bny standings out of the database, per (competition, age).

Reuses the youthscores standings engine (`services.standings`) unchanged — the
algorithm and its unusual head-to-head tiebreak are identical — passing tla3bny's
own match vocabulary ("finished" / "knockout"). Each (competition, age) pair is
the tla3bny equivalent of one youthscores competition instance, so stages and
groups are scoped to a ``Tla3bnyCompetitionAge``.
"""

from __future__ import annotations

from sqlalchemy.orm import joinedload

from app.models import (
    Tla3bnyCompetitionAge,
    Tla3bnyCompetitionTeam,
    Tla3bnyGroup,
    Tla3bnyGroupTeam,
    Tla3bnyMatch,
    Tla3bnyStage,
    Tla3bnyTeam,
)
from app.services.standings import Standing, calculate, team_form

_FINISHED = "finished"
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


def age_matches(competition_id: int, age_category_id: int) -> list[Tla3bnyMatch]:
    return (
        Tla3bnyMatch.query.filter_by(
            competition_id=competition_id, age_category_id=age_category_id
        )
        .options(joinedload(Tla3bnyMatch.stage))
        .all()
    )


def age_teams(competition_id: int, age_category_id: int) -> list[Tla3bnyTeam]:
    return (
        Tla3bnyTeam.query.join(
            Tla3bnyCompetitionTeam,
            Tla3bnyCompetitionTeam.team_id == Tla3bnyTeam.id,
        )
        .filter(
            Tla3bnyCompetitionTeam.competition_id == competition_id,
            Tla3bnyCompetitionTeam.age_category_id == age_category_id,
        )
        .order_by(Tla3bnyCompetitionTeam.id)
        .all()
    )


def deductions_of(competition_id: int, age_category_id: int) -> dict[int, int]:
    return {
        ct.team_id: ct.point_deduction
        for ct in Tla3bnyCompetitionTeam.query.filter_by(
            competition_id=competition_id, age_category_id=age_category_id
        ).all()
        if ct.point_deduction
    }


def groups_of(cage: Tla3bnyCompetitionAge) -> list[Tla3bnyGroup]:
    return (
        Tla3bnyGroup.query.join(Tla3bnyStage)
        .filter(Tla3bnyStage.competition_age_id == cage.id)
        .order_by(Tla3bnyGroup.name)
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


def standings_by_group(competition_id: int, age_category_id: int) -> list[dict]:
    """One table per group, or a single unnamed table when there are no groups.

    Mirrors youthscores' ``services.tables.standings_by_group``: teams are
    partitioned by group while their matches against everyone else still count,
    unless the group's stage starts from zero (``carries_points = False``).
    """
    cage = competition_age(competition_id, age_category_id)
    if cage is None:
        return []

    teams = age_teams(competition_id, age_category_id)
    team_by_id = {t.id: t for t in teams}
    matches = age_matches(competition_id, age_category_id)
    docked = deductions_of(competition_id, age_category_id)
    groups = groups_of(cage)

    def rows(standings):
        return [
            _standing_dict(
                s,
                team_by_id.get(s.team_id),
                team_form(s.team_id, matches, completed_status=_FINISHED),
            )
            for s in standings
        ]

    if not groups:
        return [{"group": None, "standings": rows(_calc(matches, teams, deductions=docked))}]

    out = []
    grouped: set[int] = set()
    for g in groups:
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
