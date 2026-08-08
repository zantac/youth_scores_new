"""Add tla3bny team photo + description.

Gives a team a badge/photo and a short blurb, shown on the team hero card
(mirroring the competition and academy hero cards).

Idempotent: each column is guarded by an existence check.

Revision ID: y1z2a3b4c5d6
Revises: x0y1z2a3b4c5
Create Date: 2026-08-08
"""
from alembic import op
import sqlalchemy as sa

revision = 'y1z2a3b4c5d6'
down_revision = 'x0y1z2a3b4c5'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_teams'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    have = _cols()
    if 'photo_path' not in have:
        op.add_column(_TABLE, sa.Column('photo_path', sa.String(length=512), nullable=True))
    if 'description' not in have:
        op.add_column(_TABLE, sa.Column('description', sa.String(length=500), nullable=True))


def downgrade():
    have = _cols()
    if 'description' in have:
        op.drop_column(_TABLE, 'description')
    if 'photo_path' in have:
        op.drop_column(_TABLE, 'photo_path')
