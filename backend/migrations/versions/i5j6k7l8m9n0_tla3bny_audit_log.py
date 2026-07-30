"""Add tla3bny_audit_log table

Revision ID: i5j6k7l8m9n0
Revises: h4i5j6k7l8m9
Create Date: 2026-07-30

Records every significant admin action (player approval/rejection, team join
approval, result entry, academy suspension) for dispute resolution.
"""

from alembic import op
import sqlalchemy as sa

revision = 'i5j6k7l8m9n0'
down_revision = 'h4i5j6k7l8m9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'tla3bny_audit_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('actor_user_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(80), nullable=False),
        sa.Column('target_type', sa.String(50), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=True),
        sa.Column('competition_id', sa.Integer(), nullable=True),
        sa.Column('detail', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(
            ['actor_user_id'], ['tla3bny_users.id'], ondelete='SET NULL'
        ),
        sa.ForeignKeyConstraint(
            ['competition_id'], ['tla3bny_competitions.id'], ondelete='SET NULL'
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tla3bny_audit_log_action', 'tla3bny_audit_log', ['action'])
    op.create_index(
        'ix_tla3bny_audit_log_competition', 'tla3bny_audit_log', ['competition_id']
    )
    op.create_index(
        'ix_tla3bny_audit_log_target', 'tla3bny_audit_log', ['target_type', 'target_id']
    )


def downgrade():
    op.drop_index('ix_tla3bny_audit_log_target', 'tla3bny_audit_log')
    op.drop_index('ix_tla3bny_audit_log_competition', 'tla3bny_audit_log')
    op.drop_index('ix_tla3bny_audit_log_action', 'tla3bny_audit_log')
    op.drop_table('tla3bny_audit_log')
