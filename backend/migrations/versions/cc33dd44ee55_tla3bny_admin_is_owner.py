"""Add tla3bny_competition_admins.is_owner (competition super admin).

An owner is a competition's super admin: they hold every organizer permission and
may only be removed/demoted by the site super admin, so a regular organizer can't
remove the owner. New organizers default False; existing organizers are backfilled
True (they keep full control — the site super admin then demotes as needed).

Idempotent: guarded by a column-existence check.

Revision ID: cc33dd44ee55
Revises: bb22cc33dd44
Create Date: 2026-09-05
"""
from alembic import op
import sqlalchemy as sa

revision = 'cc33dd44ee55'
down_revision = 'bb22cc33dd44'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_competition_admins'
_COL = 'is_owner'


def _has_column(table: str, column: str) -> bool:
    return column in {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    if _has_column(_TABLE, _COL):
        return
    op.add_column(_TABLE, sa.Column(_COL, sa.Boolean(), nullable=False, server_default='0'))
    # Existing organizers keep full control (owners); the site super admin demotes
    # any that should become regular organizers.
    op.execute(f'UPDATE {_TABLE} SET {_COL} = 1')


def downgrade():
    if _has_column(_TABLE, _COL):
        op.drop_column(_TABLE, _COL)
