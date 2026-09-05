"""Add tla3bny chat: conversations + messages, and admins.can_chat.

A chat thread per (competition, team) between the team/academy and the
competition's chat-enabled organizers. can_chat gates which organizers may use
it (existing organizers backfilled True; new ones default False).

Idempotent: guarded by table / column existence checks.

Revision ID: bb22cc33dd44
Revises: aa11bb22cc33
Create Date: 2026-09-05
"""
from alembic import op
import sqlalchemy as sa

revision = 'bb22cc33dd44'
down_revision = 'aa11bb22cc33'
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    if not _has_column('tla3bny_competition_admins', 'can_chat'):
        op.add_column('tla3bny_competition_admins',
                      sa.Column('can_chat', sa.Boolean(), nullable=False, server_default='0'))
        op.execute('UPDATE tla3bny_competition_admins SET can_chat = 1')

    if not _has_table('tla3bny_conversations'):
        op.create_table(
            'tla3bny_conversations',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('competition_id', sa.Integer(), nullable=False),
            sa.Column('team_id', sa.Integer(), nullable=False),
            sa.Column('academy_id', sa.Integer(), nullable=True),
            sa.Column('academy_last_read_at', sa.DateTime(), nullable=True),
            sa.Column('organizer_last_read_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['competition_id'], ['tla3bny_competitions.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['team_id'], ['tla3bny_teams.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['academy_id'], ['tla3bny_academies.id'], ondelete='CASCADE'),
            sa.UniqueConstraint('competition_id', 'team_id', name='uq_tla3bny_conversation'),
        )
        op.create_index('ix_tla3bny_conversations_comp', 'tla3bny_conversations', ['competition_id'])

    if not _has_table('tla3bny_messages'):
        op.create_table(
            'tla3bny_messages',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('conversation_id', sa.Integer(), nullable=False),
            sa.Column('sender_user_id', sa.Integer(), nullable=True),
            sa.Column('sender_side', sa.String(length=10), nullable=False),
            sa.Column('body', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['conversation_id'], ['tla3bny_conversations.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['sender_user_id'], ['tla3bny_users.id'], ondelete='SET NULL'),
        )
        op.create_index('ix_tla3bny_messages_conversation', 'tla3bny_messages', ['conversation_id'])


def downgrade():
    if _has_table('tla3bny_messages'):
        op.drop_table('tla3bny_messages')
    if _has_table('tla3bny_conversations'):
        op.drop_table('tla3bny_conversations')
    if _has_column('tla3bny_competition_admins', 'can_chat'):
        op.drop_column('tla3bny_competition_admins', 'can_chat')
