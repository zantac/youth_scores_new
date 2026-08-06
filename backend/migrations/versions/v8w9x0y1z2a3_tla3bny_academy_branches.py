"""Add tla3bny_academy_branches — an academy's branches/locations.

Lets an academy advertise multiple branches on its public profile (each with a
name, address, map link and phone), alongside its free-text description.

Idempotent: guarded by an existence check so it is a no-op if the table is
already present (e.g. a database built fresh from live model metadata).

Revision ID: v8w9x0y1z2a3
Revises: u7v8w9x0y1z2
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = 'v8w9x0y1z2a3'
down_revision = 'u7v8w9x0y1z2'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_academy_branches'


def _has_table() -> bool:
    return _TABLE in sa.inspect(op.get_bind()).get_table_names()


def upgrade():
    if _has_table():
        return
    op.create_table(
        _TABLE,
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('academy_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('address', sa.String(length=512), nullable=True),
        sa.Column('location_url', sa.String(length=512), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ['academy_id'], ['tla3bny_academies.id'],
            name=op.f('fk_tla3bny_academy_branches_academy_id_tla3bny_academies'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_tla3bny_academy_branches')),
    )
    op.create_index(
        op.f('ix_tla3bny_academy_branches_academy_id'),
        _TABLE, ['academy_id'],
    )


def downgrade():
    if _has_table():
        op.drop_index(op.f('ix_tla3bny_academy_branches_academy_id'), table_name=_TABLE)
        op.drop_table(_TABLE)
