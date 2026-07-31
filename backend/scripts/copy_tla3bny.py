"""Copy all tla3bny_* rows from rehearsal1.db into the main rehearsal.db.

Both databases share the same schema (same Alembic migration head). The
tla3bny_* tables in the main DB are empty, so IDs are copied as-is with no
conflict. Tables are inserted in dependency order so FK constraints are
satisfied if they happen to be enabled.

Usage (from the backend/ directory):
    python -m scripts.copy_tla3bny
"""

import sqlite3
from pathlib import Path

SRC = Path(__file__).parent.parent / "instance" / "youthscores.rehearsal1.db"
DST = Path(__file__).parent.parent / "instance" / "youthscores.rehearsal.db"

# Insertion order respects FK dependencies (parents before children).
TABLES = [
    "tla3bny_age_categories",
    "tla3bny_seasons",
    "tla3bny_academies",
    "tla3bny_academy_managers",
    "tla3bny_teams",
    "tla3bny_coaches",
    "tla3bny_players",
    "tla3bny_player_files",
    "tla3bny_player_teams",
    "tla3bny_users",
    "tla3bny_competitions",
    "tla3bny_competition_ages",
    "tla3bny_competition_admins",
    "tla3bny_stages",
    "tla3bny_groups",
    "tla3bny_group_teams",
    "tla3bny_competition_teams",
    "tla3bny_competition_players",
    "tla3bny_matches",
    "tla3bny_match_events",
    "tla3bny_lineups",
    "tla3bny_lineup_slots",
    "tla3bny_news",
    "tla3bny_audit_log",
]




def main() -> None:
    if not SRC.exists():
        raise FileNotFoundError(f"Source not found: {SRC}")
    if not DST.exists():
        raise FileNotFoundError(f"Target not found: {DST}")

    con = sqlite3.connect(DST)
    con.execute("PRAGMA foreign_keys = OFF")
    con.execute(f"ATTACH DATABASE '{SRC}' AS src")

    try:
        for table in TABLES:
            before = con.execute(f'SELECT COUNT(*) FROM main."{table}"').fetchone()[0]
            if before:
                print(f"  SKIP {table}: already has {before} rows")
                continue
            # Use target column order to avoid positional mismatch (schemas may
            # differ when a column was added at a different migration point).
            dst_cols = [row[1] for row in
                        con.execute(f'PRAGMA main.table_info("{table}")').fetchall()]
            col_list = ", ".join(f'"{c}"' for c in dst_cols)
            con.execute(
                f'INSERT INTO main."{table}" ({col_list}) '
                f'SELECT {col_list} FROM src."{table}"'
            )
            count = con.execute(f'SELECT COUNT(*) FROM main."{table}"').fetchone()[0]
            print(f"  OK   {table}: {count} rows copied")

        con.commit()
        print("\nDone — all tla3bny tables copied into the main database.")
    except Exception as exc:
        con.rollback()
        print(f"\nERROR: {exc}")
        raise
    finally:
        con.execute("DETACH DATABASE src")
        con.execute("PRAGMA foreign_keys = ON")
        con.close()


if __name__ == "__main__":
    main()
