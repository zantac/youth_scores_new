"""Ad placement: interstitial / feed / both, and per-event placement.

`ads.placement` controls where an ad runs; `ad_events.placement` records which
surface generated each impression/click so stats can split feed vs interstitial.

Idempotent: each column is guarded by an existence check.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-08-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'e3f4a5b6c7d8'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def _cols(table: str) -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    if 'placement' not in _cols('ads'):
        op.add_column('ads', sa.Column('placement', sa.String(length=16),
                                        nullable=False, server_default='interstitial'))
    if 'placement' not in _cols('ad_events'):
        op.add_column('ad_events', sa.Column('placement', sa.String(length=16),
                                             nullable=True))


def downgrade():
    if 'placement' in _cols('ad_events'):
        op.drop_column('ad_events', 'placement')
    if 'placement' in _cols('ads'):
        op.drop_column('ads', 'placement')
