"""Rename the assistant-coach role wording: "مساعد مدرب" -> "مدرب مساعد".

The canonical label in COACH_ROLE_ORDER was reordered to read "مدرب مساعد"
(adjective after noun, matching the rest of the list). Rewrite the Arabic on
rows already stored under the old wording so they keep displaying and ranking
as the assistant-coach post rather than dropping to unranked free text.

Only team_coaches carries this role (it is absent from the club-staff list), so
only that table is touched. role_en ("Assistant Coach") is unchanged.

Self-contained: the strings are embedded here, not imported from app code, so
the migration keeps working even if the lists later change.

Revision ID: b3c4d5e6f7a8
Revises: ad70bca9f1e2
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'b3c4d5e6f7a8'
down_revision = 'ad70bca9f1e2'
branch_labels = None
depends_on = None

_OLD = "مساعد مدرب"
_NEW = "مدرب مساعد"


def upgrade():
    op.get_bind().execute(
        sa.text("UPDATE team_coaches SET role_ar = :new WHERE role_ar = :old"),
        {"new": _NEW, "old": _OLD},
    )


def downgrade():
    op.get_bind().execute(
        sa.text("UPDATE team_coaches SET role_ar = :old WHERE role_ar = :new"),
        {"old": _OLD, "new": _NEW},
    )
