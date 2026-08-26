"""Assemble standings for a competition out of the database."""

from __future__ import annotations

from sqlalchemy.orm import joinedload

from app.models import Competition, CompetitionTeam, Group, GroupTeam, Match, Stage, Team
from app.services.standings import Standing, calculate


def competition_matches(competition_id: int) -> list[Match]:
    return (
        Match.query.join(Stage)
        .filter(Stage.competition_id == competition_id)
        .filter(Match.deleted_at.is_(None))
        .options(joinedload(Match.stage))
        .all()
    )


def competition_teams(competition_id: int) -> list[Team]:
    return (
        Team.query.join(CompetitionTeam)
        .filter(CompetitionTeam.competition_id == competition_id)
        .order_by(CompetitionTeam.id)
        .all()
    )


def deductions_of(competition_id: int) -> dict[int, int]:
    """Points docked from each team in this competition, by team id."""
    return {
        ct.team_id: ct.point_deduction
        for ct in CompetitionTeam.query.filter_by(competition_id=competition_id).all()
        if ct.point_deduction
    }


def groups_of(competition_id: int) -> list[Group]:
    # Order by id (creation order), not name: names like «المجموعة 10» sort before
    # «المجموعة 2» alphabetically. Groups are created in the intended order, and
    # the competition serializer already lists them by id — so the standings match.
    return (
        Group.query.join(Stage)
        .filter(Stage.competition_id == competition_id)
        .order_by(Group.id)
        .all()
    )


def standings_by_group(competition_id: int) -> list[dict]:
    """One table per group, or a single unnamed table when there are no groups.

    Teams are partitioned by their group, while their matches against everyone
    else still count -- unless the group's stage declares that it starts from
    zero (`carries_points = False`), in which case only that stage's matches do.
    """
    teams = competition_teams(competition_id)
    matches = competition_matches(competition_id)
    groups = groups_of(competition_id)
    docked = deductions_of(competition_id)

    if not groups:
        return [{"group": None,
                 "standings": calculate(matches, teams, deductions=docked)}]

    out = []
    grouped: set[int] = set()
    for g in groups:
        ids = {
            gt.team_id for gt in GroupTeam.query.filter_by(group_id=g.id).all()
        }
        if not ids:
            continue
        grouped |= ids
        stage = g.stage
        stage_filter = None if (stage is None or stage.carries_points) else stage.id
        out.append(
            {"group": g,
             "standings": calculate(matches, teams, team_ids=ids,
                                    stage_filter=stage_filter, deductions=docked)}
        )

    # A competition can have groups and still leave some teams out of them.
    ungrouped = {t.id for t in teams} - grouped
    if ungrouped:
        out.append(
            {"group": None, "standings": calculate(matches, teams, team_ids=ungrouped,
                                                   deductions=docked)}
        )
    return out
