"""Add sub_position (ar/en) to players.

A more specific role within the main position (e.g. right-back under defender).
The profile shows it in place of the main position when set.

Idempotent: guarded by existence checks.

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-08-13 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a4b5c6d7e8f9'
down_revision = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None

_TABLE = 'players'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    cols = _cols()
    if 'sub_position_en' not in cols:
        op.add_column(_TABLE, sa.Column('sub_position_en', sa.String(length=60), nullable=True))
    if 'sub_position_ar' not in cols:
        op.add_column(_TABLE, sa.Column('sub_position_ar', sa.String(length=60), nullable=True))


def downgrade():
    cols = _cols()
    if 'sub_position_ar' in cols:
        op.drop_column(_TABLE, 'sub_position_ar')
    if 'sub_position_en' in cols:
        op.drop_column(_TABLE, 'sub_position_en')
