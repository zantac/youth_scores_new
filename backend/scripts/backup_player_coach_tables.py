"""Dump the player_teams and team_coaches tables to a UTF-8 JSON file.

A safety snapshot taken before a bulk edit, so the exact prior state of every
row (id, dates, status, ...) can be restored if needed. Writes to a file given
on the command line.

    python -m scripts.backup_player_coach_tables backup.json
"""

from __future__ import annotations

import json
import sys
from datetime import date

from app import create_app
from app.extensions import db
from app.models import PlayerTeam, TeamCoach


def _row(obj, cols: list[str]) -> dict:
    out = {}
    for c in cols:
        v = getattr(obj, c)
        out[c] = v.isoformat() if isinstance(v, date) else v
    return out


def main(path: str) -> None:
    app = create_app()
    with app.app_context():
        pt_cols = ["id", "player_id", "team_id", "shirt_number",
                   "start_date", "end_date", "status", "sort_order"]
        tc_cols = ["id", "team_id", "coach_id", "role_en", "role_ar",
                   "start_date", "end_date", "sort_order"]
        data = {
            "player_teams": [_row(r, pt_cols) for r in PlayerTeam.query.all()],
            "team_coaches": [_row(r, tc_cols) for r in TeamCoach.query.all()],
        }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"Backed up {len(data['player_teams'])} player_teams and "
          f"{len(data['team_coaches'])} team_coaches rows -> {path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python -m scripts.backup_player_coach_tables <path.json>")
    main(sys.argv[1])
