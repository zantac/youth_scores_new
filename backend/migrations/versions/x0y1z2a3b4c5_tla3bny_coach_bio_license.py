"""Add tla3bny coach bio + license.

Lets a team describe a coach's career (free text) and the coaching licence
they hold, shown on the public coach profile.

Idempotent: each column is guarded by an existence check.

Revision ID: x0y1z2a3b4c5
Revises: w9x0y1z2a3b4
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = 'x0y1z2a3b4c5'
down_revision = 'w9x0y1z2a3b4'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_coaches'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    have = _cols()
    if 'license' not in have:
        op.add_column(_TABLE, sa.Column('license', sa.String(length=255), nullable=True))
    if 'bio' not in have:
        op.add_column(_TABLE, sa.Column('bio', sa.Text(), nullable=True))


def downgrade():
    have = _cols()
    if 'bio' in have:
        op.drop_column(_TABLE, 'bio')
    if 'license' in have:
        op.drop_column(_TABLE, 'license')
