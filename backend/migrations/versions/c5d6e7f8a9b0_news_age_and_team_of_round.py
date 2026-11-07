"""Link news to a sub-competition (age), a team-of-the-round, and an award.

Three nullable columns on tla3bny_news:
  * competition_age_id — the sub-competition an auto-published honour belongs to,
    so the card can show the age bracket next to the competition name.
  * team_of_round_id — set on a team-of-the-round announcement, so the article
    can render the best XI on a pitch (the honours-page design).
  * award_id — set on an award announcement, so the organizer can re-publish it
    (regenerate the news with the current winner / the new design) idempotently.

Plain integer columns (no DB-level FK), matching the house style for additive
columns and keeping the ALTER SQLite-safe; the ORM declares the foreign keys for
mapping. Idempotent: each column is guarded by an existence check.

Revision ID: c5d6e7f8a9b0
Revises: a9b8c7d6e5f4
Create Date: 2026-11-07
"""
from alembic import op
import sqlalchemy as sa

revision = 'c5d6e7f8a9b0'
down_revision = 'a9b8c7d6e5f4'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_news'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    have = _cols()
    if 'competition_age_id' not in have:
        op.add_column(_TABLE, sa.Column('competition_age_id', sa.Integer(), nullable=True))
    if 'team_of_round_id' not in have:
        op.add_column(_TABLE, sa.Column('team_of_round_id', sa.Integer(), nullable=True))
    if 'award_id' not in have:
        op.add_column(_TABLE, sa.Column('award_id', sa.Integer(), nullable=True))


def downgrade():
    have = _cols()
    if 'award_id' in have:
        op.drop_column(_TABLE, 'award_id')
    if 'team_of_round_id' in have:
        op.drop_column(_TABLE, 'team_of_round_id')
    if 'competition_age_id' in have:
        op.drop_column(_TABLE, 'competition_age_id')
