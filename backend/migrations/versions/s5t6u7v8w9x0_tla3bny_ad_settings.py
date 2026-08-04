"""Add tla3bny ad display settings (rotation speed + poster size).

A single shared row (id=1) the super admin and competition admins tune; it
drives every sponsor carousel.

Revision ID: s5t6u7v8w9x0
Revises: r4s5t6u7v8w9
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa

revision = 's5t6u7v8w9x0'
down_revision = 'r4s5t6u7v8w9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'tla3bny_ad_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rotation_seconds', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('poster_scale', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_tla3bny_ad_settings')),
    )


def downgrade():
    op.drop_table('tla3bny_ad_settings')
