"""Add optional English names (name_en) to tla3bny master data.

Academies, teams, players, coaches and competitions each keep their existing
``name`` as the primary (Arabic) name and gain an optional ``name_en``. Display
falls back to whichever language is present.

Revision ID: q3r4s5t6u7v8
Revises: p2q3r4s5t6u7
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa

revision = 'q3r4s5t6u7v8'
down_revision = 'p2q3r4s5t6u7'
branch_labels = None
depends_on = None

_TABLES = (
    'tla3bny_academies',
    'tla3bny_teams',
    'tla3bny_players',
    'tla3bny_coaches',
    'tla3bny_competitions',
)


def upgrade():
    for table in _TABLES:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.add_column(sa.Column('name_en', sa.String(length=255), nullable=True))


def downgrade():
    for table in _TABLES:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_column('name_en')
