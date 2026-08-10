"""Backfill team-coach / club-staff role_en from role_ar.

Historic rows were saved with role_en defaulted to "Head Coach" for everyone,
even though role_ar held the correct post. This recomputes role_en from role_ar
using the canonical bilingual role lists — the same ar→en pairs the admin forms
auto-fill from — so the English matches the Arabic across data already stored.

Self-contained: the ar→en maps are embedded here rather than imported from app
code, so the migration keeps working even if those lists later change. Only
rows whose role_ar exactly matches a known post are touched; genuinely custom
Arabic roles are left as-is (their English can't be inferred).

Revision ID: d157b2c3e4f5
Revises: ce35f9a0b1c3
Create Date: 2026-08-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'd157b2c3e4f5'
down_revision = 'ce35f9a0b1c3'
branch_labels = None
depends_on = None


# TeamCoach.role_ar → role_en. Mirrors COACH_ROLE_ORDER plus the variant
# wordings in COACH_ROLE_ALIASES (codes.py), each mapped to its canonical
# English.
COACH_ROLE_EN = {
    "المدير الفني": "Head Coach",
    "مدرب": "Coach",
    "مساعد مدرب": "Assistant Coach",
    "مدرب حراس مرمي": "Goalkeeping Coach",
    "محلل اداء": "Performance Analyst",
    "المعد النفسي": "Sports Psychologist",
    "اداري": "Team Administrator",
    "طبيب": "Doctor",
    "اخصائي اصابات": "Injury Specialist",
    "علاج طبيعي": "Physiotherapist",
    "مدلك": "Masseur",
    "مدرب الاحمال": "Fitness Coach",
    "اخصائي": "Specialist",
    "عامل مهمات": "Kit Man",
    # variant wordings (COACH_ROLE_ALIASES) → canonical English
    "مدرب الحراس": "Goalkeeping Coach",
    "مسئول المهمات": "Kit Man",
    "طبيب عظام": "Doctor",
    "محلل الاداء": "Performance Analyst",
    "اخصائي الاصابات": "Injury Specialist",
}

# ClubStaff.role_ar → role_en. Mirrors CLUB_STAFF_ROLE_ORDER (codes.py).
CLUB_STAFF_ROLE_EN = {
    "عضو مجلس الإدارة": "Board Member",
    "رئيس قطاع الناشئين": "Head of Youth Sector",
    "نائب رئيس القطاع": "Vice President of the Sector",
    "مشرف القطاع": "Sector Supervisor",
    "المدير الفني للقطاع": "Technical Director of the Sector",
    "المشرف الفني للقطاع": "Technical Supervisor of the Sector",
    "المدير الاداري للقطاع": "Administrative Director of the Sector",
    "مدير الكرة": "Football Director",
    "نائب رئيس جهاز الكرة": "Deputy Head of Football Staff",
    "مشرف الكرة": "Football Supervisor",
    "مدير حراس المرمى بالقطاع": "Goalkeeping Director",
    "مشرف حراس المرمى": "Goalkeeping Supervisor",
    "رئيس الجهاز الطبي": "Head of Medical Staff",
    "طبيب القطاع": "Sector Doctor",
    "مشرف العلاج الطبيعي": "Physiotherapy Supervisor",
    "اخصائي الفريق": "Team Specialist",
    "مخطط أحمال": "Fitness Load Planner",
    "محلل أداء": "Performance Analyst",
    "مسؤول شئون اللاعبين": "Player Affairs Officer",
    "المدير المالي": "Financial Director",
    "مدير عام النادي": "Club General Manager",
    "مدير رياضي": "Sporting Director",
    "مشرف النشاط الرياضي": "Sports Activity Supervisor",
    "مدير التسويق بالقطاع": "Sector Marketing Manager",
    "المشرف العام علي الالعاب الجماعية": "General Supervisor of Team Sports",
}


def _backfill(table: str, mapping: dict) -> None:
    conn = op.get_bind()
    stmt = sa.text(f"UPDATE {table} SET role_en = :en WHERE role_ar = :ar")
    for ar, en in mapping.items():
        conn.execute(stmt, {"en": en, "ar": ar})


def upgrade():
    _backfill("team_coaches", COACH_ROLE_EN)
    _backfill("club_staff", CLUB_STAFF_ROLE_EN)


def downgrade():
    # Pure data backfill: the previous (incorrect) role_en values are not
    # recoverable, so there is nothing meaningful to revert.
    pass
