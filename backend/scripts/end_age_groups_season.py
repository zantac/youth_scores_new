"""Close out the 2005 and 2008 age groups at the end of season 2025-2026.

For season 2026-2027 these two ages are gone: the 2005 side moves up to the
first team, and the EFA is not running the 2008 age this season. Every player
still registered with a 2005 or 2008 team, and every coach still on the staff
of such a team, is given an end_date of 2026-06-30 (the last day of season
2025-2026) so the records read as finished rather than current.

Scope and safety:
  * Age groups are matched by AgeGroup.oldest_birth_year in (2005, 2008).
  * Only *open* rows are touched: PlayerTeam / TeamCoach with end_date IS NULL.
    A row that already has an end_date (an earlier transfer/departure) is left
    exactly as it is — this can be re-run without clobbering that history.
  * A row whose start_date is after the end_date would violate the table's
    CHECK (end_date >= start_date). Those are reported and skipped, never
    written, so one bad row can't fail the whole commit.
  * Club-level sector staff (club_staff) is NOT touched: it is attached to a
    club, not to an age group, so it can't be scoped to 2005/2008.

    python -m scripts.end_age_groups_season            # dry run, prints report
    python -m scripts.end_age_groups_season --apply    # write and commit
"""

from __future__ import annotations

import sys
from datetime import date

# The report prints Arabic club/person names; the Windows console defaults to
# cp1252 and would crash on them. Force UTF-8 on stdout.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

from app import create_app
from app.extensions import db
from app.models import AgeGroup, Club, Coach, Player, PlayerTeam, Team, TeamCoach

BIRTH_YEARS = (2005, 2008)
END_DATE = date(2026, 6, 30)


def _name(person: Player | Coach) -> str:
    return person.full_name_ar or person.full_name_en or "?"


def main(apply: bool) -> None:
    app = create_app()
    with app.app_context():
        age_groups = (
            AgeGroup.query.filter(AgeGroup.oldest_birth_year.in_(BIRTH_YEARS))
            .order_by(AgeGroup.oldest_birth_year)
            .all()
        )
        if not age_groups:
            print(f"No age groups with oldest_birth_year in {BIRTH_YEARS}. Nothing to do.")
            return

        print("Age groups matched:")
        for ag in age_groups:
            print(f"  id={ag.id:<4} birth_year={ag.oldest_birth_year}  "
                  f"{ag.name_ar or ag.name_en or ''}")

        age_ids = [ag.id for ag in age_groups]
        teams = Team.query.filter(Team.age_group_id.in_(age_ids)).all()
        team_ids = [t.id for t in teams]
        print(f"\nTeams in those age groups: {len(teams)}")
        if not team_ids:
            print("No teams. Nothing to do.")
            return

        players = (
            PlayerTeam.query.filter(
                PlayerTeam.team_id.in_(team_ids), PlayerTeam.end_date.is_(None)
            ).all()
        )
        coaches = (
            TeamCoach.query.filter(
                TeamCoach.team_id.in_(team_ids), TeamCoach.end_date.is_(None)
            ).all()
        )

        # Split off rows the CHECK constraint would reject (start_date > END_DATE).
        bad_players = [r for r in players if r.start_date and r.start_date > END_DATE]
        bad_coaches = [r for r in coaches if r.start_date and r.start_date > END_DATE]
        good_players = [r for r in players if r not in bad_players]
        good_coaches = [r for r in coaches if r not in bad_coaches]

        print(f"\nOpen player registrations to close : {len(good_players)}")
        print(f"Open coach assignments to close    : {len(good_coaches)}")

        # Per-team breakdown for an eyeball check.
        club_by_id = {c.id: c for c in Club.query.all()}
        ag_by_id = {ag.id: ag for ag in age_groups}
        print("\nPer team:")
        for t in sorted(teams, key=lambda t: (ag_by_id[t.age_group_id].oldest_birth_year, t.id)):
            club = club_by_id.get(t.club_id)
            club_name = (club.name_ar or club.name_en) if club else f"club {t.club_id}"
            np = sum(1 for r in good_players if r.team_id == t.id)
            nc = sum(1 for r in good_coaches if r.team_id == t.id)
            if np or nc:
                yr = ag_by_id[t.age_group_id].oldest_birth_year
                print(f"  [{yr}] {club_name}: {np} players, {nc} staff")

        if bad_players or bad_coaches:
            print(f"\n!! SKIPPED — start_date after {END_DATE.isoformat()} "
                  f"(would break the date check): "
                  f"{len(bad_players)} players, {len(bad_coaches)} staff")
            for r in bad_players:
                p = Player.query.get(r.player_id)
                print(f"     player_team id={r.id} start={r.start_date} {_name(p)}")
            for r in bad_coaches:
                c = Coach.query.get(r.coach_id)
                print(f"     team_coach  id={r.id} start={r.start_date} {_name(c)}")

        if apply:
            for r in good_players:
                r.end_date = END_DATE
            for r in good_coaches:
                r.end_date = END_DATE
            db.session.commit()
            print(f"\nAPPLIED — set end_date={END_DATE.isoformat()} on "
                  f"{len(good_players)} player rows and {len(good_coaches)} staff rows.")
        else:
            db.session.rollback()
            print("\nDRY RUN — nothing written. Re-run with --apply to commit.")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
