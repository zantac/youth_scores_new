"""Add token_version to tla3bny_users

Revision ID: j6k7l8m9n0o1
Revises: i5j6k7l8m9n0
Create Date: 2026-07-30

Allows immediate invalidation of all existing tokens for a user (e.g. on
suspension) without waiting for the 30-day expiry. Existing rows default to 0,
which matches the "v": 0 that legacy tokens without a "v" field resolve to, so
no one is logged out by this migration.
"""

from alembic import op
import sqlalchemy as sa

revision = 'j6k7l8m9n0o1'
down_revision = 'i5j6k7l8m9n0'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tla3bny_users', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'token_version',
                sa.Integer(),
                nullable=False,
                server_default='0',
            )
        )


def downgrade():
    with op.batch_alter_table('tla3bny_users', schema=None) as batch_op:
        batch_op.drop_column('token_version')
