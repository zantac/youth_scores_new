"""Add indexes on tla3bny hot filter/order columns.

Backs the most-run queries: per-entry roster status counts (cap checks,
dashboards, approved-player totals), the matches feed's competition+age+status
filter and date ordering, and the analysis boards' per-match event-type filter.
These are composite / plain-column indexes that the InnoDB per-FK auto-index
does not cover.

Idempotent: the v2 schema migration builds the tla3bny tables from live model
metadata, so a fresh database already has these indexes (they are declared on
the models). Each create/drop is therefore guarded by an existence check so the
migration is a no-op on a fresh DB and adds the indexes on an already-migrated
one.

Revision ID: t6u7v8w9x0y1
Revises: s5t6u7v8w9x0
Create Date: 2026-08-05
"""
from alembic import op
import sqlalchemy as sa

revision = 't6u7v8w9x0y1'
down_revision = 's5t6u7v8w9x0'
branch_labels = None
depends_on = None

# (index name, table, columns)
_INDEXES = [
    ('ix_tla3bny_competition_players_entry_status',
     'tla3bny_competition_players', ['competition_team_id', 'status']),
    ('ix_tla3bny_matches_comp_age_status',
     'tla3bny_matches', ['competition_id', 'age_category_id', 'status']),
    ('ix_tla3bny_matches_date',
     'tla3bny_matches', ['date']),
    ('ix_tla3bny_match_events_match_type',
     'tla3bny_match_events', ['match_id', 'event_type']),
]


def _existing(table: str) -> set[str]:
    insp = sa.inspect(op.get_bind())
    return {ix['name'] for ix in insp.get_indexes(table)}


def upgrade():
    for name, table, cols in _INDEXES:
        if name not in _existing(table):
            op.create_index(name, table, cols)


def downgrade():
    for name, table, cols in reversed(_INDEXES):
        if name in _existing(table):
            op.drop_index(name, table_name=table)
