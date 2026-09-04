"""Add tla3bny_punishments (competition disciplinary actions).

One table for every punishment an organizer records: a match ban (player/coach),
a fine (player/coach/team), or a point deduction (team). Recipient is polymorphic
(one of player_id / coach_id / team_id). Point-deduction punishments drive the
standings via the existing Tla3bnyCompetitionTeam.point_deduction (recomputed in
the API).

Idempotent: guarded by a table-existence check.

Revision ID: 9ba15dec0f21
Revises: 5ea50c0de1f2
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = '9ba15dec0f21'
down_revision = '5ea50c0de1f2'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_punishments'


def _has_table(name: str) -> bool:
    return name in sa.inspect(op.get_bind()).get_table_names()


def upgrade():
    if _has_table(_TABLE):
        return
    op.create_table(
        _TABLE,
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('competition_id', sa.Integer(), nullable=False),
        sa.Column('competition_age_id', sa.Integer(), nullable=True),
        sa.Column('punishment_type', sa.String(length=30), nullable=False),
        sa.Column('player_id', sa.Integer(), nullable=True),
        sa.Column('coach_id', sa.Integer(), nullable=True),
        sa.Column('team_id', sa.Integer(), nullable=True),
        sa.Column('matches', sa.SmallInteger(), nullable=True),
        sa.Column('points', sa.SmallInteger(), nullable=True),
        sa.Column('amount', sa.Numeric(10, 2), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['competition_id'], ['tla3bny_competitions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['competition_age_id'], ['tla3bny_competition_ages.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['player_id'], ['tla3bny_players.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['coach_id'], ['tla3bny_coaches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['team_id'], ['tla3bny_teams.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['tla3bny_users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_tla3bny_punishments_comp', _TABLE, ['competition_id'])
    op.create_index('ix_tla3bny_punishments_player', _TABLE, ['player_id'])
    op.create_index('ix_tla3bny_punishments_team', _TABLE, ['team_id'])


def downgrade():
    if _has_table(_TABLE):
        op.drop_table(_TABLE)
