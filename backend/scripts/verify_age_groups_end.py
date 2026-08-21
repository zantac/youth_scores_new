"""Verify the 2005/2008 close-out: report end_date distribution for the
player_teams and team_coaches rows in those age groups' teams.

    python -m scripts.verify_age_groups_end
"""

from __future__ import annotations

import sys
from collections import Counter
from datetime import date

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

from app import create_app
from app.models import AgeGroup, PlayerTeam, Team, TeamCoach

BIRTH_YEARS = (2005, 2008)
TARGET = date(2026, 6, 30)


def summarize(label, rows):
    c = Counter()
    for r in rows:
        if r.end_date is None:
            c["open (NULL)"] += 1
        elif r.end_date == TARGET:
            c[f"{TARGET.isoformat()}"] += 1
        else:
            c["other end_date"] += 1
    print(f"\n{label}: {len(rows)} rows")
    for k, n in c.most_common():
        print(f"  {k:<16} {n}")


def main() -> None:
    app = create_app()
    with app.app_context():
        age_ids = [a.id for a in AgeGroup.query.filter(
            AgeGroup.oldest_birth_year.in_(BIRTH_YEARS)).all()]
        team_ids = [t.id for t in Team.query.filter(Team.age_group_id.in_(age_ids)).all()]
        summarize("player_teams", PlayerTeam.query.filter(
            PlayerTeam.team_id.in_(team_ids)).all())
        summarize("team_coaches", TeamCoach.query.filter(
            TeamCoach.team_id.in_(team_ids)).all())


if __name__ == "__main__":
    main()
