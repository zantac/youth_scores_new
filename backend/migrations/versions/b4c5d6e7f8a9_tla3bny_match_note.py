"""tla3bny matches: add note field.

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-07-28
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "b4c5d6e7f8a9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade():
    cols = _columns("tla3bny_matches")
    with op.batch_alter_table("tla3bny_matches") as batch:
        if "note" not in cols:
            batch.add_column(sa.Column("note", sa.String(512), nullable=True))


def downgrade():
    with op.batch_alter_table("tla3bny_matches") as batch:
        batch.drop_column("note")
