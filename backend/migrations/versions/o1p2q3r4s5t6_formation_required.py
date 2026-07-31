"""Add formation_required to tla3bny_competition_ages.

Revision ID: o1p2q3r4s5t6
Revises: n0o1p2q3r4s5
Create Date: 2026-07-31
"""
from alembic import op
import sqlalchemy as sa

revision = 'o1p2q3r4s5t6'
down_revision = 'n0o1p2q3r4s5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tla3bny_competition_ages', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('formation_required', sa.Boolean(), nullable=False,
                      server_default='0')
        )


def downgrade():
    with op.batch_alter_table('tla3bny_competition_ages', schema=None) as batch_op:
        batch_op.drop_column('formation_required')
