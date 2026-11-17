"""tla3bny_news: add like_count column

Revision ID: a1b2c3d4e5f6
Revises: z2a3b4c5d6e7
Create Date: 2026-11-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'z2a3b4c5d6e7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tla3bny_news', sa.Column('like_count', sa.Integer(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('tla3bny_news', 'like_count')
