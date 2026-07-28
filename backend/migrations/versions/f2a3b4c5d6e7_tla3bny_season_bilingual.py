"""tla3bny seasons: add Arabic/English name fields.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-28
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade():
    cols = _columns("tla3bny_seasons")
    with op.batch_alter_table("tla3bny_seasons") as batch:
        if "name_ar" not in cols:
            batch.add_column(sa.Column("name_ar", sa.String(120), nullable=True))
        if "name_en" not in cols:
            batch.add_column(sa.Column("name_en", sa.String(120), nullable=True))


def downgrade():
    with op.batch_alter_table("tla3bny_seasons") as batch:
        batch.drop_column("name_en")
        batch.drop_column("name_ar")
