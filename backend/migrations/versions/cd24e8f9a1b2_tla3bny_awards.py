"""Honours: titles, individual awards, and best XI of the round.

Adds three tables:
  * ``tla3bny_awards`` — one honour granted by an organizer (team title or
    individual award; player-of-match pins a match, player-of-round a round).
  * ``tla3bny_team_of_round`` — the best XI of a round (a fantasy line-up).
  * ``tla3bny_team_of_round_slots`` — one player + position in that best XI.

Idempotent: each table is guarded by an existence check.

Revision ID: cd24e8f9a1b2
Revises: bc13d7e8f9a0
Create Date: 2026-08-10 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cd24e8f9a1b2'
down_revision = 'bc13d7e8f9a0'
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade():
    have = _tables()

    if 'tla3bny_awards' not in have:
        op.create_table(
            'tla3bny_awards',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('competition_id', sa.Integer(), nullable=False),
            sa.Column('competition_age_id', sa.Integer(), nullable=True),
            sa.Column('award_type', sa.String(length=32), nullable=False),
            sa.Column('round', sa.String(length=120), nullable=True),
            sa.Column('match_id', sa.Integer(), nullable=True),
            sa.Column('player_id', sa.Integer(), nullable=True),
            sa.Column('team_id', sa.Integer(), nullable=True),
            sa.Column('note', sa.String(length=255), nullable=True),
            sa.Column('created_by_user_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['competition_id'], ['tla3bny_competitions.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['competition_age_id'], ['tla3bny_competition_ages.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['match_id'], ['tla3bny_matches.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['player_id'], ['tla3bny_players.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['team_id'], ['tla3bny_teams.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['created_by_user_id'], ['tla3bny_users.id'], ondelete='SET NULL'),
        )
        op.create_index('ix_tla3bny_awards_player', 'tla3bny_awards', ['player_id'])
        op.create_index('ix_tla3bny_awards_team', 'tla3bny_awards', ['team_id'])
        op.create_index('ix_tla3bny_awards_comp_age', 'tla3bny_awards',
                        ['competition_id', 'competition_age_id'])

    if 'tla3bny_team_of_round' not in have:
        op.create_table(
            'tla3bny_team_of_round',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('competition_id', sa.Integer(), nullable=False),
            sa.Column('competition_age_id', sa.Integer(), nullable=True),
            sa.Column('round', sa.String(length=120), nullable=False),
            sa.Column('formation', sa.String(length=20), nullable=True),
            sa.Column('created_by_user_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['competition_id'], ['tla3bny_competitions.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['competition_age_id'], ['tla3bny_competition_ages.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['created_by_user_id'], ['tla3bny_users.id'], ondelete='SET NULL'),
        )
        op.create_index('ix_tla3bny_totr_comp_age_round', 'tla3bny_team_of_round',
                        ['competition_id', 'competition_age_id', 'round'])

    if 'tla3bny_team_of_round_slots' not in have:
        op.create_table(
            'tla3bny_team_of_round_slots',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('team_of_round_id', sa.Integer(), nullable=False),
            sa.Column('player_id', sa.Integer(), nullable=True),
            sa.Column('position_slot', sa.String(length=20), nullable=True),
            sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['team_of_round_id'], ['tla3bny_team_of_round.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['player_id'], ['tla3bny_players.id'], ondelete='SET NULL'),
        )


def downgrade():
    have = _tables()
    if 'tla3bny_team_of_round_slots' in have:
        op.drop_table('tla3bny_team_of_round_slots')
    if 'tla3bny_team_of_round' in have:
        op.drop_table('tla3bny_team_of_round')
    if 'tla3bny_awards' in have:
        op.drop_table('tla3bny_awards')
