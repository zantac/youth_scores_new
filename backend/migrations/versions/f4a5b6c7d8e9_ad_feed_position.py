"""Ad feed_position / feed_repeat: where the native feed card sits and repeats.

`ads.feed_position` is a 1-based slot counted from the date the home feed lands
on (today/nearest); the native "sponsored" card renders right after that match.
`ads.feed_repeat` (nullable) repeats the card every N matches after that slot;
null means show it once.

Idempotent: each column is guarded by an existence check.

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-08-18
"""
from alembic import op
import sqlalchemy as sa

revision = 'f4a5b6c7d8e9'
down_revision = 'e3f4a5b6c7d8'
branch_labels = None
depends_on = None


def _cols(table: str) -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    if 'feed_position' not in _cols('ads'):
        op.add_column('ads', sa.Column('feed_position', sa.Integer(),
                                        nullable=False, server_default='3'))
    if 'feed_repeat' not in _cols('ads'):
        op.add_column('ads', sa.Column('feed_repeat', sa.Integer(),
                                        nullable=True))


def downgrade():
    if 'feed_repeat' in _cols('ads'):
        op.drop_column('ads', 'feed_repeat')
    if 'feed_position' in _cols('ads'):
        op.drop_column('ads', 'feed_position')
