"""tla3bny v2 schema — season/competition hierarchy

Replaces the flat v1 tla3bny league (academy = the only team) with the full
Season -> Competition -> Age structure: academies + teams (classes) + coaches +
players with dated memberships, seasons/competitions with per-age rules,
per-competition registration & approval, youthscores-style stages/groups for
standings, matches/events/lineups, and news.

The v1 ``tla3bny_*`` tables are empty everywhere (dev + live Railway MySQL), so
this drops them outright and creates the v2 tables. Nothing else in the schema
is touched. The v2 tables are created from the current model metadata (the same
mechanism the whole DB was baselined with) restricted to the ``tla3bny_*``
tables, which are self-contained (no FKs to youthscores tables).

Revision ID: b7c1d2e3f4a5
Revises: f1a2b3c4d5e6
Create Date: 2026-07-24
"""
from alembic import op

from app.extensions import db

# revision identifiers, used by Alembic.
revision = "b7c1d2e3f4a5"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


# v1 tables, child-first (drop order).
_V1_TABLES = [
    "tla3bny_lineup_slots",
    "tla3bny_lineups",
    "tla3bny_match_events",
    "tla3bny_matches",
    "tla3bny_player_files",
    "tla3bny_players",
    "tla3bny_age_categories",
    "tla3bny_users",
]


def _tla3bny_tables():
    """The v2 tla3bny tables from the live model metadata, in dependency order
    (parents before children), so create/drop respect foreign keys."""
    sorted_tables = db.metadata.sorted_tables
    return [t for t in sorted_tables if t.name.startswith("tla3bny_")]


def _drop(names):
    bind = op.get_bind()
    mysql = bind.dialect.name == "mysql"
    if mysql:
        op.execute("SET FOREIGN_KEY_CHECKS=0")
    for name in names:
        op.execute(f"DROP TABLE IF EXISTS {name}")
    if mysql:
        op.execute("SET FOREIGN_KEY_CHECKS=1")


def upgrade():
    # Drop the empty v1 tables (some names are reused by v2 with new columns).
    _drop(_V1_TABLES)
    # Create v2 tables (parents first).
    for table in _tla3bny_tables():
        table.create(bind=op.get_bind(), checkfirst=True)


def downgrade():
    # Lossy: v1 was dead and empty, so downgrade only removes the v2 tables
    # (children first) rather than rebuilding the old flat schema.
    _drop([t.name for t in reversed(_tla3bny_tables())])
