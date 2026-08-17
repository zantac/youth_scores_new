"""Ad scheduling & rotation: active, weight, start_date, link.

Adds campaign controls to ads — an on/off flag, a rotation weight, a start date
(paired with the existing expire_date), and a primary tap-through link.

Idempotent: each column is guarded by an existence check.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-08-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'd2e3f4a5b6c7'
down_revision = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None

_TABLE = 'ads'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    have = _cols()
    if 'link' not in have:
        op.add_column(_TABLE, sa.Column('link', sa.String(length=1024), nullable=True))
    if 'start_date' not in have:
        op.add_column(_TABLE, sa.Column('start_date', sa.Date(), nullable=True))
    if 'active' not in have:
        op.add_column(_TABLE, sa.Column('active', sa.Boolean(), nullable=False,
                                        server_default=sa.true()))
    if 'weight' not in have:
        op.add_column(_TABLE, sa.Column('weight', sa.Integer(), nullable=False,
                                        server_default='1'))


def downgrade():
    have = _cols()
    for col in ('weight', 'active', 'start_date', 'link'):
        if col in have:
            op.drop_column(_TABLE, col)
