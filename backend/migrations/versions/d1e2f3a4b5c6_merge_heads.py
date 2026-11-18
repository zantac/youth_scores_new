"""Merge two diverged heads (c5d6e7f8a9b0, c9e4b7d2a6f1) into one.

c9e4b7d2a6f1 (news like_count) branched off z2a3b4c5d6e7, creating a
fork with the main chain head c5d6e7f8a9b0. This no-op migration merges
them so there is a single head after upgrade.

f1a2b3c4d5e6 (widen URL columns) is a third file head on a separate
branch; it was never applied to the production DB so it cannot be listed
here as a down_revision. The Dockerfile uses 'flask db upgrade heads'
(plural) so that branch is applied independently on its own path.

Revision ID: d1e2f3a4b5c6
Revises: c5d6e7f8a9b0, c9e4b7d2a6f1
Create Date: 2026-11-18
"""
from alembic import op

revision = 'd1e2f3a4b5c6'
down_revision = ('c5d6e7f8a9b0', 'c9e4b7d2a6f1')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
