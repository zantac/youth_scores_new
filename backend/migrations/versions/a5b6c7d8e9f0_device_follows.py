"""Add device_follows table: anonymous per-install follower tally.

One row per (anonymous device, followed competition/team), written best-effort
by the public /api/follows endpoint so the admin dashboard can count how many
devices follow each competition and team. No FCM token or personal data stored.

Idempotent: guarded by a table-existence check.

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-08-23
"""
from alembic import op
import sqlalchemy as sa

revision = 'a5b6c7d8e9f0'
down_revision = 'f4a5b6c7d8e9'
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in sa.inspect(op.get_bind()).get_table_names()


def upgrade():
    if _has_table('device_follows'):
        return
    op.create_table(
        'device_follows',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('device_id', sa.String(length=64), nullable=False),
        sa.Column('kind', sa.String(length=8), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('device_id', 'kind', 'target_id',
                            name='uq_device_follow'),
    )
    op.create_index('ix_device_follows_target', 'device_follows',
                    ['kind', 'target_id'])


def downgrade():
    if _has_table('device_follows'):
        op.drop_index('ix_device_follows_target', table_name='device_follows')
        op.drop_table('device_follows')
