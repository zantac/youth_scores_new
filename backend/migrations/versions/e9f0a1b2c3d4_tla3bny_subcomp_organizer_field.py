"""Add sub-competition organizer + field size to tla3bny_competition_ages.

Each age bracket in a competition is often run by its own organizer and played
on a different-sized pitch, so a sub-competition now carries:
  * organizer_name / organizer_photo_path — who runs this bracket (public)
  * field_size — the pitch size for this age, free text (public)

All nullable; existing sub-competitions migrate cleanly with them unset.

Idempotent: each column is guarded by an existence check.

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = 'e9f0a1b2c3d4'
down_revision = 'd8e9f0a1b2c3'
branch_labels = None
depends_on = None

_TABLE = 'tla3bny_competition_ages'
_COLUMNS = (
    ('organizer_name', sa.String(length=200)),
    ('organizer_photo_path', sa.String(length=512)),
    ('field_size', sa.String(length=100)),
)


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c['name'] for c in insp.get_columns(table)}


def upgrade():
    for name, type_ in _COLUMNS:
        if not _has_column(_TABLE, name):
            op.add_column(_TABLE, sa.Column(name, type_, nullable=True))


def downgrade():
    for name, _type in reversed(_COLUMNS):
        if _has_column(_TABLE, name):
            op.drop_column(_TABLE, name)
