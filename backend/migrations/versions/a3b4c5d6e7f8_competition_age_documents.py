"""tla3bny competition ages: per-age required documents.

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-07-28
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "a3b4c5d6e7f8"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade():
    cols = _columns("tla3bny_competition_ages")
    with op.batch_alter_table("tla3bny_competition_ages") as batch:
        if "required_documents" not in cols:
            batch.add_column(sa.Column("required_documents", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("tla3bny_competition_ages") as batch:
        batch.drop_column("required_documents")
