"""Add max_players to tla3bny_competitions.

A competition-wide cap on the number of contributing players, set by the super
admin at creation. tla3bny is priced on how many players take part, so this is
the size the organiser is billed for. NULL means no cap set.

Revision ID: p2q3r4s5t6u7
Revises: o1p2q3r4s5t6
Create Date: 2026-08-03
"""
from alembic import op
import sqlalchemy as sa

revision = 'p2q3r4s5t6u7'
down_revision = 'o1p2q3r4s5t6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tla3bny_competitions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('max_players', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('tla3bny_competitions', schema=None) as batch_op:
        batch_op.drop_column('max_players')
