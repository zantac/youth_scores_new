"""Seed 8 academies into UG competition, each with a 2014 team + 12 players.

Run from the backend directory:
    python seed_ug_2014.py
"""

import sqlite3
import sys
from datetime import date, datetime

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = r"instance\youthscores.rehearsal.db"

# UG competition id=1, age category 2014 id=2, sub-competition "2014 A" id=2
COMPETITION_ID = 1
AGE_CATEGORY_ID = 2          # 2014
COMPETITION_AGE_ID = 2       # مواليد ٢٠١٤ - أ

NOW = datetime.utcnow().isoformat()

ACADEMIES = [
    "النجوم",
    "الأهلي",
    "الزمالك",
    "القمة",
    "الفروسية",
    "السيوف",
    "الأسود",
    "الصقور",
]

FIRST_NAMES = [
    "محمد", "أحمد", "عمر", "علي", "يوسف", "إبراهيم", "مصطفى", "عبدالله",
    "خالد", "كريم", "سامي", "طارق", "وليد", "رامي", "فارس", "ناصر",
    "زياد", "ريان", "جاد", "أنس", "تامر", "هاني", "باسم", "سيف",
]

LAST_NAMES = [
    "الشرقاوي", "الغامدي", "العتيبي", "الحربي", "الزهراني", "السعيدي",
    "القحطاني", "المالكي", "العمري", "الشهري", "الدوسري", "المطيري",
    "إبراهيم", "صالح", "سليمان", "عبدالرحمن", "الرشيد", "الحسن",
    "عبدالعزيز", "الفيصل", "البدر", "الراشد", "منصور", "حسن",
]

POSITIONS = ["حارس مرمي", "مدافع", "وسط", "مهاجم"]

# 12 DOBs spread through 2014 (all valid for 2014 age category)
DOBS = [
    "2014-01-10", "2014-02-14", "2014-03-22", "2014-04-05",
    "2014-05-18", "2014-06-30", "2014-07-08", "2014-08-25",
    "2014-09-12", "2014-10-03", "2014-11-19", "2014-12-27",
]


def seed():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    # Find the next available jersey numbers etc by checking existing data
    cur.execute("SELECT MAX(id) FROM tla3bny_academies")
    max_academy_id = cur.fetchone()[0] or 0

    for acad_idx, acad_name in enumerate(ACADEMIES):
        # ── 1. Academy ────────────────────────────────────────────────────────
        cur.execute(
            """INSERT INTO tla3bny_academies
               (name, status, created_at, updated_at)
               VALUES (?, 'approved', ?, ?)""",
            (acad_name, NOW, NOW),
        )
        academy_id = cur.lastrowid

        # ── 2. Team (2014 age) ────────────────────────────────────────────────
        cur.execute(
            """INSERT INTO tla3bny_teams
               (academy_id, age_category_id, created_at, updated_at)
               VALUES (?, ?, ?, ?)""",
            (academy_id, AGE_CATEGORY_ID, NOW, NOW),
        )
        team_id = cur.lastrowid

        # ── 3. Register team in UG competition ───────────────────────────────
        cur.execute(
            """INSERT INTO tla3bny_competition_teams
               (competition_id, team_id, age_category_id, competition_age_id,
                status, point_deduction, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'active', 0, ?, ?)""",
            (COMPETITION_ID, team_id, AGE_CATEGORY_ID, COMPETITION_AGE_ID, NOW, NOW),
        )
        competition_team_id = cur.lastrowid

        # ── 4. Create 12 players ──────────────────────────────────────────────
        for p_idx in range(12):
            # Generate distinct name: first + last picked by offsets
            first = FIRST_NAMES[(acad_idx * 12 + p_idx) % len(FIRST_NAMES)]
            last  = LAST_NAMES[(acad_idx * 5  + p_idx) % len(LAST_NAMES)]
            full_name = f"{first} {last}"
            dob       = DOBS[p_idx]
            position  = POSITIONS[p_idx % len(POSITIONS)]

            cur.execute(
                """INSERT INTO tla3bny_players
                   (name, dob, position, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (full_name, dob, position, NOW, NOW),
            )
            player_id = cur.lastrowid

            # Membership: player → team
            cur.execute(
                """INSERT INTO tla3bny_player_teams
                   (player_id, team_id, jersey_number, start_date, status,
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, 'active', ?, ?)""",
                (player_id, team_id, p_idx + 1, "2024-09-01", NOW, NOW),
            )

            # Competition roster entry (approved so they show up immediately)
            cur.execute(
                """INSERT INTO tla3bny_competition_players
                   (competition_team_id, player_id, status, created_at, updated_at)
                   VALUES (?, ?, 'approved', ?, ?)""",
                (competition_team_id, player_id, NOW, NOW),
            )

        print(f"  Added academy '{acad_name}' (id={academy_id}), "
              f"team id={team_id}, comp_team id={competition_team_id}")

    conn.commit()
    conn.close()
    print("\nDone — 8 academies, 8 teams, 96 players added to UG 2014 A.")


if __name__ == "__main__":
    seed()
