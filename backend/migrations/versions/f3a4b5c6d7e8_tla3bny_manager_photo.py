"""Add photo_path to tla3bny academy managers.

Lets an academy attach a photo to each manager on its profile.

Idempotent: guarded by an existence check.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-08-13 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3a4b5c6d7e8'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_academy_managers'


def _cols() -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade():
    if 'photo_path' not in _cols():
        op.add_column(_TABLE, sa.Column('photo_path', sa.String(length=512), nullable=True))


def downgrade():
    if 'photo_path' in _cols():
        op.drop_column(_TABLE, 'photo_path')
