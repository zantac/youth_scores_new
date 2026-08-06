"""Add tla3bny academy whatsapp_number + photos (gallery).

For the academy advertising page: a WhatsApp number (chat button) and up to a
few gallery photos.

Idempotent: each column is guarded by an existence check.

Revision ID: w9x0y1z2a3b4
Revises: v8w9x0y1z2a3
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = 'w9x0y1z2a3b4'
down_revision = 'v8w9x0y1z2a3'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_academies'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    have = _cols()
    if 'whatsapp_number' not in have:
        op.add_column(_TABLE, sa.Column('whatsapp_number', sa.String(length=50), nullable=True))
    if 'photos' not in have:
        op.add_column(_TABLE, sa.Column('photos', sa.JSON(), nullable=True))


def downgrade():
    have = _cols()
    if 'photos' in have:
        op.drop_column(_TABLE, 'photos')
    if 'whatsapp_number' in have:
        op.drop_column(_TABLE, 'whatsapp_number')
