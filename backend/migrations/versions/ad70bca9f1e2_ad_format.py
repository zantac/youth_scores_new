"""Ad format: banner (2:1 card) vs square (1:1 tile in a horizontal feed rail).

`ads.format` selects the feed creative shape. "banner" keeps the existing
full-width 2:1 card; "square" renders the ad as a 1:1 tile grouped with the other
square ads into a horizontally-scrolling rail — so square photos show natively
without the top/bottom crop a 2:1 slot forces. Only the feed surface cares about
this; the interstitial is always fullscreen.

Idempotent: the column is guarded by an existence check, defaulting to "banner"
so every existing ad keeps its current look.

Revision ID: ad70bca9f1e2
Revises: f8a9b0c1d2e3
Create Date: 2026-10-11
"""
from alembic import op
import sqlalchemy as sa

revision = 'ad70bca9f1e2'
down_revision = 'f8a9b0c1d2e3'
branch_labels = None
depends_on = None


def _cols(table: str) -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    if 'format' not in _cols('ads'):
        op.add_column('ads', sa.Column('format', sa.String(length=16),
                                       nullable=False, server_default='banner'))


def downgrade():
    if 'format' in _cols('ads'):
        op.drop_column('ads', 'format')
