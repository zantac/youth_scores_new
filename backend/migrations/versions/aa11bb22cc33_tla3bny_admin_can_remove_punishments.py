"""Add tla3bny_competition_admins.can_remove_punishments.

Not every organizer may remove a punishment. New co-organizers default to False;
existing organizers are backfilled to True so their current ability is preserved.

Idempotent: guarded by a column-existence check.

Revision ID: aa11bb22cc33
Revises: 9ba15dec0f21
Create Date: 2026-09-05
"""
from alembic import op
import sqlalchemy as sa

revision = 'aa11bb22cc33'
down_revision = '9ba15dec0f21'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_competition_admins'
_COL = 'can_remove_punishments'


def _has_column(table: str, column: str) -> bool:
    return column in {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    if _has_column(_TABLE, _COL):
        return
    op.add_column(_TABLE, sa.Column(_COL, sa.Boolean(), nullable=False,
                                    server_default='0'))
    # Existing organizers keep their current ability to remove punishments.
    op.execute(f'UPDATE {_TABLE} SET {_COL} = 1')


def downgrade():
    if _has_column(_TABLE, _COL):
        op.drop_column(_TABLE, _COL)
