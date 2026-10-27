"""Rename the kit-man role wording: "عامل مهمات" -> "مسئول مهمات".

The canonical label in COACH_ROLE_ORDER was reworded to "مسئول مهمات".
Rewrite the Arabic on rows already stored under the old wording so they keep
displaying and ranking as the kit-man post rather than dropping to unranked
free text.

Only team_coaches carries this role (it is absent from the club-staff list), so
only that table is touched. role_en ("Kit Man") is unchanged.

Self-contained: the strings are embedded here, not imported from app code, so
the migration keeps working even if the lists later change.

Revision ID: a9b8c7d6e5f4
Revises: b3c4d5e6f7a8
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'a9b8c7d6e5f4'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None

_OLD = "عامل مهمات"
_NEW = "مسئول مهمات"


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
