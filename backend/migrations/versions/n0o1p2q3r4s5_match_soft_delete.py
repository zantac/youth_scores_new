"""Add deleted_at to matches for soft-delete with 24-hour undo window.

Revision ID: n0o1p2q3r4s5
Revises: m9n0o1p2q3r4
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'n0o1p2q3r4s5'
down_revision = 'm9n0o1p2q3r4'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('matches', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('deleted_at', sa.DateTime(), nullable=True)
        )
        batch_op.create_index('ix_matches_deleted_at', ['deleted_at'])


def downgrade():
    with op.batch_alter_table('matches', schema=None) as batch_op:
        batch_op.drop_index('ix_matches_deleted_at')
        batch_op.drop_column('deleted_at')
