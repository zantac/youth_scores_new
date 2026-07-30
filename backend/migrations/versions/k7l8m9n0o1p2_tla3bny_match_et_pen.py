"""Add extra-time and penalty-shootout scores to tla3bny_matches

Revision ID: k7l8m9n0o1p2
Revises: j6k7l8m9n0o1
Create Date: 2026-07-30

Adds four nullable integer columns:
  home_score_et / away_score_et  — cumulative score after extra time
  home_score_pen / away_score_pen — penalty-shootout score

All default to NULL (no ET / no shootout), so existing rows are unaffected.
"""

from alembic import op
import sqlalchemy as sa

revision = 'k7l8m9n0o1p2'
down_revision = 'j6k7l8m9n0o1'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tla3bny_matches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('home_score_et',  sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('away_score_et',  sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('home_score_pen', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('away_score_pen', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('tla3bny_matches', schema=None) as batch_op:
        batch_op.drop_column('away_score_pen')
        batch_op.drop_column('home_score_pen')
        batch_op.drop_column('away_score_et')
        batch_op.drop_column('home_score_et')
