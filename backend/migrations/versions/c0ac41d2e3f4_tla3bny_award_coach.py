"""Add tla3bny_awards.coach_id (coach award recipient).

Two new award types (best_coach, coach_of_round) go to a coach, so the award row
grows a coach_id alongside player_id / team_id. Nullable — existing awards keep
it unset.

Idempotent: guarded by a column-existence check.

Revision ID: c0ac41d2e3f4
Revises: f0a1b2c3d4e5
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = 'c0ac41d2e3f4'
down_revision = 'f0a1b2c3d4e5'
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c['name'] for c in insp.get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return name in {i['name'] for i in insp.get_indexes(table)}


def upgrade():
    if not _has_column('tla3bny_awards', 'coach_id'):
        # SQLite can't add a column with an inline FK via ALTER; batch mode
        # recreates the table so Postgres/MySQL still get a real FK.
        with op.batch_alter_table('tla3bny_awards') as batch:
            batch.add_column(sa.Column('coach_id', sa.Integer(), nullable=True))
            batch.create_foreign_key(
                'fk_tla3bny_awards_coach_id', 'tla3bny_coaches',
                ['coach_id'], ['id'], ondelete='CASCADE',
            )
    if not _has_index('tla3bny_awards', 'ix_tla3bny_awards_coach'):
        op.create_index('ix_tla3bny_awards_coach', 'tla3bny_awards', ['coach_id'])


def downgrade():
    if _has_index('tla3bny_awards', 'ix_tla3bny_awards_coach'):
        op.drop_index('ix_tla3bny_awards_coach', table_name='tla3bny_awards')
    if _has_column('tla3bny_awards', 'coach_id'):
        with op.batch_alter_table('tla3bny_awards') as batch:
            batch.drop_column('coach_id')
