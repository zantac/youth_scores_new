"""Add tla3bny academy-branch governorate (المحافظة).

Each branch records its Egyptian governorate so the public academies page can be
filtered by governorate — an academy with branches in more than one governorate
appears under each.

Idempotent: the column is guarded by an existence check.

Revision ID: z2a3b4c5d6e7
Revises: y1z2a3b4c5d6
Create Date: 2026-08-08
"""
from alembic import op
import sqlalchemy as sa

revision = 'z2a3b4c5d6e7'
down_revision = 'y1z2a3b4c5d6'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_academy_branches'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    if 'governorate' not in _cols():
        op.add_column(_TABLE, sa.Column('governorate', sa.String(length=60), nullable=True))


def downgrade():
    if 'governorate' in _cols():
        op.drop_column(_TABLE, 'governorate')
