"""Define the extra-time format per sub-competition.

Adds ``et_num_periods`` and ``et_period_minutes`` to
``tla3bny_competition_ages``. Both nullable: null means the sub-competition plays
no extra time (a level knockout tie goes straight to penalties).

Idempotent: guarded by a column-existence check.

Revision ID: ce35f9a0b1c3
Revises: cd24e8f9a1b2
Create Date: 2026-08-10 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ce35f9a0b1c3'
down_revision = 'cd24e8f9a1b2'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_competition_ages'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    have = _cols()
    with op.batch_alter_table(_TABLE, schema=None) as batch_op:
        if 'et_num_periods' not in have:
            batch_op.add_column(sa.Column('et_num_periods', sa.Integer(), nullable=True))
        if 'et_period_minutes' not in have:
            batch_op.add_column(sa.Column('et_period_minutes', sa.Integer(), nullable=True))


def downgrade():
    have = _cols()
    with op.batch_alter_table(_TABLE, schema=None) as batch_op:
        if 'et_period_minutes' in have:
            batch_op.drop_column('et_period_minutes')
        if 'et_num_periods' in have:
            batch_op.drop_column('et_num_periods')
