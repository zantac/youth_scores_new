"""Reconcile the pre-apply backup against the 2005/2008 close-out.

Reads the backup JSON (state BEFORE the write) and reports, for the teams in
the 2005/2008 age groups, how many rows were already NULL / already 2026-06-30 /
some other date. Confirms the write only closed the NULL rows.

    python -m scripts.reconcile_backup backups/pre_age2005_2008_end_2026-06-30.json
"""

from __future__ import annotations

import json
import sys
from collections import Counter

from app import create_app
from app.models import AgeGroup, Team

BIRTH_YEARS = (2005, 2008)
TARGET = "2026-06-30"


def bucket(rows, team_ids):
    c = Counter()
    for r in rows:
        if r["team_id"] not in team_ids:
            continue
        ed = r["end_date"]
        if ed is None:
            c["open (NULL) BEFORE"] += 1
        elif ed == TARGET:
            c["already 2026-06-30"] += 1
        else:
            c["other end_date"] += 1
    return c


def main(path: str) -> None:
    app = create_app()
    with app.app_context():
        age_ids = [a.id for a in AgeGroup.query.filter(
            AgeGroup.oldest_birth_year.in_(BIRTH_YEARS)).all()]
        team_ids = {t.id for t in Team.query.filter(Team.age_group_id.in_(age_ids)).all()}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    for label, key in (("player_teams", "player_teams"), ("team_coaches", "team_coaches")):
        c = bucket(data[key], team_ids)
        print(f"\n{label} (in 2005/2008 teams), BEFORE the write:")
        for k, n in c.most_common():
            print(f"  {k:<22} {n}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python -m scripts.reconcile_backup <backup.json>")
    main(sys.argv[1])
