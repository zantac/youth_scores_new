"""Add is_extra_time / is_own_goal / is_penalty / kick_order / is_winning_kick
to tla3bny_match_events — bringing parity with youthscores match event tables.

Revision ID: l8m9n0o1p2q3
Revises: k7l8m9n0o1p2
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa

revision = 'l8m9n0o1p2q3'
down_revision = 'k7l8m9n0o1p2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tla3bny_match_events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_extra_time',  sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('is_own_goal',    sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('is_penalty',     sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('kick_order',     sa.SmallInteger(), nullable=True))
        batch_op.add_column(sa.Column('is_winning_kick', sa.Boolean(), nullable=False, server_default='0'))


def downgrade():
    with op.batch_alter_table('tla3bny_match_events', schema=None) as batch_op:
        batch_op.drop_column('is_winning_kick')
        batch_op.drop_column('kick_order')
        batch_op.drop_column('is_penalty')
        batch_op.drop_column('is_own_goal')
        batch_op.drop_column('is_extra_time')
