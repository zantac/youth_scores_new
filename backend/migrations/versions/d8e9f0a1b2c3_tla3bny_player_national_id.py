"""Add tla3bny_players.national_id (الرقم القومي).

A player's national ID is their real-world identity key. It is mandatory for
every newly-added squad player (enforced in the API, not the DB — legacy rows
predate it and stay NULL) and is what lets the system recognise the same person
across academies: one national ID may appear at most once on the rosters of a
single competition, so a player entered by one academy can't also be entered by
another in that competition.

The column is nullable so the existing player rows migrate cleanly; the API
requires it on create and the competition-registration guard requires it before
a player can be entered.

Idempotent: guarded by a column-existence check.

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = 'd8e9f0a1b2c3'
down_revision = 'c7d8e9f0a1b2'
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c['name'] for c in insp.get_columns(table)}


def upgrade():
    if _has_column('tla3bny_players', 'national_id'):
        return
    op.add_column('tla3bny_players',
                  sa.Column('national_id', sa.String(length=14), nullable=True))


def downgrade():
    if _has_column('tla3bny_players', 'national_id'):
        op.drop_column('tla3bny_players', 'national_id')
