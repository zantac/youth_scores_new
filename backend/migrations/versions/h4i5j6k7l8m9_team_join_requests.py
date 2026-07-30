"""Team join requests: pending status + competition_age_id on competition_teams

Revision ID: h4i5j6k7l8m9
Revises: g3h4i5j6k7l8
Create Date: 2026-07-29

Changes:
- tla3bny_competition_teams: add `competition_age_id` FK (nullable)
- SQLite does not enforce CHECK constraints on ALTER, so the new status
  value "pending" works without a DDL change there; MySQL/Postgres use a
  VARCHAR without an inline CHECK in this codebase (code_enum is app-level).
"""
from alembic import op
import sqlalchemy as sa

revision = 'h4i5j6k7l8m9'
down_revision = 'g3h4i5j6k7l8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tla3bny_competition_teams', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'competition_age_id', sa.Integer(),
            sa.ForeignKey('tla3bny_competition_ages.id', ondelete='SET NULL'),
            nullable=True,
        ))

    # Backfill: link existing entries to their sub-competition record.
    op.execute("""
        UPDATE tla3bny_competition_teams
        SET competition_age_id = (
            SELECT id FROM tla3bny_competition_ages ca
            WHERE ca.competition_id = tla3bny_competition_teams.competition_id
              AND ca.age_category_id = tla3bny_competition_teams.age_category_id
            LIMIT 1
        )
    """)


def downgrade():
    with op.batch_alter_table('tla3bny_competition_teams', schema=None) as batch_op:
        batch_op.drop_column('competition_age_id')
