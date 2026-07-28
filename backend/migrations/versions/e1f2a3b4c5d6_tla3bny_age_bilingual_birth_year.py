"""tla3bny age categories: Arabic/English names + oldest birth year.

Adds three columns to ``tla3bny_age_categories``:
* ``label_ar``          — Arabic display name (e.g. "تحت 10")
* ``label_en``          — English display name (e.g. "U10")
* ``oldest_birth_year`` — oldest allowed birth year (nullable int)

Revision ID: e1f2a3b4c5d6
Revises: d9e4f5a6b7c8
Create Date: 2026-07-28
"""
import sqlalchemy as sa
from alembic import op

revision = "e1f2a3b4c5d6"
down_revision = "d9e4f5a6b7c8"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    bind = op.get_bind()
    return {row[1] for row in bind.execute(sa.text(f"PRAGMA table_info({table})"))}


def upgrade():
    cols = _columns("tla3bny_age_categories")
    with op.batch_alter_table("tla3bny_age_categories") as batch:
        if "label_ar" not in cols:
            batch.add_column(sa.Column("label_ar", sa.String(100), nullable=True))
        if "label_en" not in cols:
            batch.add_column(sa.Column("label_en", sa.String(100), nullable=True))
        if "oldest_birth_year" not in cols:
            batch.add_column(sa.Column("oldest_birth_year", sa.SmallInteger(), nullable=True))


def downgrade():
    with op.batch_alter_table("tla3bny_age_categories") as batch:
        batch.drop_column("oldest_birth_year")
        batch.drop_column("label_en")
        batch.drop_column("label_ar")
