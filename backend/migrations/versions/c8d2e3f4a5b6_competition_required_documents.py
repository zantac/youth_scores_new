"""tla3bny: per-competition required player documents

The registration papers a player must upload move from being purely an age
property to something each competition's admin decides for their own
competition (birth certificate, school letter, national id, health
certificate, ... — as many as they need). The age list stays as the baseline
for teams not entered in any competition yet.

Revision ID: c8d2e3f4a5b6
Revises: b7c1d2e3f4a5
Create Date: 2026-07-24
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "c8d2e3f4a5b6"
down_revision = "b7c1d2e3f4a5"
branch_labels = None
depends_on = None


def _has_column() -> bool:
    """b7c1d2e3f4a5 builds the tla3bny tables from the *current* model metadata,
    so a database migrated after this column was added already has it. Only a
    database that ran that revision earlier needs the ALTER."""
    inspector = sa.inspect(op.get_bind())
    if "tla3bny_competitions" not in inspector.get_table_names():
        return True
    cols = {c["name"] for c in inspector.get_columns("tla3bny_competitions")}
    return "required_documents" in cols


def upgrade():
    if _has_column():
        return
    with op.batch_alter_table("tla3bny_competitions") as batch:
        batch.add_column(sa.Column("required_documents", sa.JSON(), nullable=True))


def downgrade():
    if not _has_column():
        return
    with op.batch_alter_table("tla3bny_competitions") as batch:
        batch.drop_column("required_documents")
