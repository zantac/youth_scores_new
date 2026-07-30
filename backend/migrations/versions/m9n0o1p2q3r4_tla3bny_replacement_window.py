"""Add replacements_open and max_replacements to tla3bny_competition_ages,
and add 'replaced' to the tla3bny_competition_players status enum.

Revision ID: m9n0o1p2q3r4
Revises: l8m9n0o1p2q3
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa

revision = 'm9n0o1p2q3r4'
down_revision = 'l8m9n0o1p2q3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tla3bny_competition_ages', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'replacements_open', sa.Boolean(), nullable=False, server_default='0'
        ))
        batch_op.add_column(sa.Column(
            'max_replacements', sa.Integer(), nullable=False, server_default='5'
        ))
    # SQLite stores the status as a plain VARCHAR so no enum DDL change is needed;
    # the new 'replaced' value is enforced at the application layer only.


def downgrade():
    with op.batch_alter_table('tla3bny_competition_ages', schema=None) as batch_op:
        batch_op.drop_column('max_replacements')
        batch_op.drop_column('replacements_open')
