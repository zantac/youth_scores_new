"""Tie player registration papers to a specific competition entry.

Documents are required per competition: a team entering a new competition — or
the same competition next season — must upload fresh papers for that entry, and
last season's papers must not be overwritten or silently reused. So each
``tla3bny_player_files`` row gains a nullable ``competition_player_id`` pointing
at the ``tla3bny_competition_players`` registration it was uploaded for. Null
means a legacy/global identity paper (rows created before this change).

Idempotent: guarded by a column-existence check.

Revision ID: bc13d7e8f9a0
Revises: ab02c6386edd
Create Date: 2026-08-10 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'bc13d7e8f9a0'
down_revision = 'ab02c6386edd'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_player_files'
_FK = 'fk_tla3bny_player_files_competition_player'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    if 'competition_player_id' in _cols():
        return
    with op.batch_alter_table(_TABLE, schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('competition_player_id', sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            _FK,
            'tla3bny_competition_players',
            ['competition_player_id'], ['id'],
            ondelete='CASCADE',
        )


def downgrade():
    if 'competition_player_id' not in _cols():
        return
    with op.batch_alter_table(_TABLE, schema=None) as batch_op:
        try:
            batch_op.drop_constraint(_FK, type_='foreignkey')
        except Exception:
            pass
        batch_op.drop_column('competition_player_id')
