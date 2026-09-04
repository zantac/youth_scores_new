"""Add tla3bny_competitions.organizer_photo_path.

The competition info page already names its organizer; this adds a photo of them
alongside, shown on the public page. Nullable — existing competitions migrate
with it unset.

Idempotent: guarded by a column-existence check.

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = 'f0a1b2c3d4e5'
down_revision = 'e9f0a1b2c3d4'
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c['name'] for c in insp.get_columns(table)}


def upgrade():
    if not _has_column('tla3bny_competitions', 'organizer_photo_path'):
        op.add_column('tla3bny_competitions',
                      sa.Column('organizer_photo_path', sa.String(length=512), nullable=True))


def downgrade():
    if _has_column('tla3bny_competitions', 'organizer_photo_path'):
        op.drop_column('tla3bny_competitions', 'organizer_photo_path')
