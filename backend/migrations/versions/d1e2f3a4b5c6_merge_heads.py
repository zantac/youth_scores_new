"""Merge multiple heads into one.

Three migration branches diverged (c5d6e7f8a9b0, c9e4b7d2a6f1,
f1a2b3c4d5e6). This migration merges them so Alembic has a single head
and 'flask db upgrade head' works again.

Revision ID: d1e2f3a4b5c6
Revises: c5d6e7f8a9b0, c9e4b7d2a6f1, f1a2b3c4d5e6
Create Date: 2026-11-18
"""
from alembic import op

revision = 'd1e2f3a4b5c6'
down_revision = ('c5d6e7f8a9b0', 'c9e4b7d2a6f1', 'f1a2b3c4d5e6')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
