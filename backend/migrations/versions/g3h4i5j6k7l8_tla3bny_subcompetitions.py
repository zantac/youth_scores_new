"""tla3bny sub-competitions: name, registration deadline, multi-age support

Revision ID: g3h4i5j6k7l8
Revises: f6a7b8c9d0e1
Create Date: 2026-07-29

Changes:
- tla3bny_competition_ages: add `name`, `player_registration_deadline`
- tla3bny_competition_ages: drop unique constraint uq_tla3bny_comp_age
  (same age can now appear in multiple named sub-competitions)
- tla3bny_matches: add `competition_age_id` FK (nullable, backfilled)
"""
from alembic import op
import sqlalchemy as sa

revision = 'g3h4i5j6k7l8'
down_revision = 'b4c5d6e7f8a9'
branch_labels = None
depends_on = None


def upgrade():
    # ── tla3bny_competition_ages ─────────────────────────────────────────────
    with op.batch_alter_table('tla3bny_competition_ages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('name', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('player_registration_deadline', sa.Date(), nullable=True))
        batch_op.drop_constraint('uq_tla3bny_comp_age', type_='unique')

    # ── tla3bny_matches ──────────────────────────────────────────────────────
    with op.batch_alter_table('tla3bny_matches', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'competition_age_id', sa.Integer(),
            sa.ForeignKey('tla3bny_competition_ages.id', ondelete='SET NULL'),
            nullable=True,
        ))

    # Backfill: link existing matches to their competition_age record.
    op.execute("""
        UPDATE tla3bny_matches
        SET competition_age_id = (
            SELECT id FROM tla3bny_competition_ages ca
            WHERE ca.competition_id = tla3bny_matches.competition_id
              AND ca.age_category_id = tla3bny_matches.age_category_id
            LIMIT 1
        )
    """)


def downgrade():
    with op.batch_alter_table('tla3bny_matches', schema=None) as batch_op:
        batch_op.drop_column('competition_age_id')

    with op.batch_alter_table('tla3bny_competition_ages', schema=None) as batch_op:
        batch_op.drop_column('player_registration_deadline')
        batch_op.drop_column('name')
        batch_op.create_unique_constraint(
            'uq_tla3bny_comp_age', ['competition_id', 'age_category_id']
        )
