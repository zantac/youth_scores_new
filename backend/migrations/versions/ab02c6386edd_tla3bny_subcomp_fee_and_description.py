"""Add tla3bny sub-competition description + per-team subscription fee.

Each sub-competition (tla3bny_competition_ages) gets:
  * ``description`` — public "about this sub-competition" text.
  * ``subscription_fee`` — per-team entry fee (EGP), shown only to academies and
    the competition's admins, never to the anonymous public.

Idempotent: each column is guarded by an existence check.

Revision ID: ab02c6386edd
Revises: z2a3b4c5d6e7
Create Date: 2026-08-09 11:41:20.834204

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ab02c6386edd'
down_revision = 'z2a3b4c5d6e7'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_competition_ages'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    have = _cols()
    if 'description' not in have:
        op.add_column(_TABLE, sa.Column('description', sa.Text(), nullable=True))
    if 'subscription_fee' not in have:
        op.add_column(_TABLE, sa.Column('subscription_fee', sa.Numeric(10, 2), nullable=True))


def downgrade():
    have = _cols()
    if 'subscription_fee' in have:
        op.drop_column(_TABLE, 'subscription_fee')
    if 'description' in have:
        op.drop_column(_TABLE, 'description')
