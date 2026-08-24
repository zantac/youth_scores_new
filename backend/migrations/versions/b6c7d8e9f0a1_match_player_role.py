"""Add match_players.role: called | start | sub (match-day squad role).

A player is "called up" the moment a match_players row exists; role refines it
into the starting XI ('start'), a named substitute ('sub') or an undecided squad
member ('called'). is_starter stays in sync (True iff role == 'start') so the
public lineup views are unaffected.

Backfill: existing starters -> 'start', existing non-starters -> 'sub' (they were
entered as the bench under the old two-bucket model).

Idempotent: guarded by a column-existence check.

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-08-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'b6c7d8e9f0a1'
down_revision = 'a5b6c7d8e9f0'
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c['name'] for c in insp.get_columns(table)}


def upgrade():
    if _has_column('match_players', 'role'):
        return
    op.add_column('match_players',
                  sa.Column('role', sa.String(length=8), nullable=False,
                            server_default='called'))
    # Backfill from the old two-bucket model.
    op.execute("UPDATE match_players SET role = 'start' WHERE is_starter = 1")
    op.execute("UPDATE match_players SET role = 'sub' WHERE is_starter = 0")


def downgrade():
    if _has_column('match_players', 'role'):
        op.drop_column('match_players', 'role')
