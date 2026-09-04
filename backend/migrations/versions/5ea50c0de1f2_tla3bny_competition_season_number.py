"""Add tla3bny_competitions.season_number (edition number, الموسم).

The organizer types the competition series' edition/season number (1, 2, 3…),
shown under the name on the competition hero — distinct from the calendar season
(season_id). Nullable; existing competitions migrate with it unset.

Idempotent: guarded by a column-existence check.

Revision ID: 5ea50c0de1f2
Revises: c0ac41d2e3f4
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = '5ea50c0de1f2'
down_revision = 'c0ac41d2e3f4'
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c['name'] for c in insp.get_columns(table)}


def upgrade():
    if not _has_column('tla3bny_competitions', 'season_number'):
        op.add_column('tla3bny_competitions',
                      sa.Column('season_number', sa.SmallInteger(), nullable=True))


def downgrade():
    if _has_column('tla3bny_competitions', 'season_number'):
        op.drop_column('tla3bny_competitions', 'season_number')
