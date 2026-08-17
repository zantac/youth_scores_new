"""Add ad_events table for first-party ad impression/click counters.

One row per impression or click, written fire-and-forget by the public clients.
Keeps full history so the admin can report per-ad totals and daily time-series.

Idempotent: guarded by a table-existence check.

Revision ID: c1d2e3f4a5b6
Revises: a4b5c6d7e8f9
Create Date: 2026-08-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'c1d2e3f4a5b6'
down_revision = 'a4b5c6d7e8f9'
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in sa.inspect(op.get_bind()).get_table_names()


def upgrade():
    if _has_table('ad_events'):
        return
    op.create_table(
        'ad_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('ad_id', sa.Integer(),
                  sa.ForeignKey('ads.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('platform', sa.String(length=16), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_ad_events_ad_kind_ts', 'ad_events',
                    ['ad_id', 'kind', 'created_at'])


def downgrade():
    if _has_table('ad_events'):
        op.drop_index('ix_ad_events_ad_kind_ts', table_name='ad_events')
        op.drop_table('ad_events')
