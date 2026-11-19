"""Add hide_standings to tla3bny_competition_ages.

Organizers can hide the standings tab from the public for a specific
sub-competition (e.g. knockout-only brackets, early rounds).

Idempotent: the column is guarded by an existence check.

Revision ID: b4c5d6e7f8g9
Revises: a3b4c5d6e7f8
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa

revision = 'b4c5d6e7f8g9'
down_revision = 'a3b4c5d6e7f8'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_competition_ages'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    if 'hide_standings' not in _cols():
        op.add_column(_TABLE, sa.Column(
            'hide_standings',
            sa.Boolean(),
            nullable=False,
            server_default='0',
        ))


def downgrade():
    if 'hide_standings' in _cols():
        op.drop_column(_TABLE, 'hide_standings')
