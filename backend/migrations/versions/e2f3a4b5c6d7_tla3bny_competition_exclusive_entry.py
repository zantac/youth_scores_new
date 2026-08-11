"""Add tla3bny competition ``exclusive_entry`` flag.

Teams may now play several competitions at once (league + cup) — rosters and
papers are per-competition, so the old always-on "one competition at a time"
lock is dropped. A competition can opt back into exclusivity with this flag
(default False), which re-applies ``Competition.locks_team_entry`` while it is
live.

Idempotent: guarded by an existence check.

Revision ID: e2f3a4b5c6d7
Revises: d157b2c3e4f5
Create Date: 2026-08-11 20:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e2f3a4b5c6d7'
down_revision = 'd157b2c3e4f5'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_competitions'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    if 'exclusive_entry' not in _cols():
        op.add_column(
            _TABLE,
            sa.Column(
                'exclusive_entry', sa.Boolean(), nullable=False,
                server_default=sa.false(),
            ),
        )


def downgrade():
    if 'exclusive_entry' in _cols():
        op.drop_column(_TABLE, 'exclusive_entry')
