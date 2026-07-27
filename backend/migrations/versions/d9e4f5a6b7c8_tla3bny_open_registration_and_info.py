"""tla3bny: open academy registration, username logins, competition info page,
youthscores-shaped news, labelled player papers.

Five changes land together because they are one product change — the subdomain
becoming self-service:

* ``tla3bny_users`` gains ``username`` (the login organisers, academy owners and
  team managers are handed) and ``email`` becomes optional, since most of those
  accounts never have one.
* academies no longer wait for approval, so any row still sitting at "pending"
  is moved to "approved".
* ``tla3bny_competitions`` gains the fields behind the public info page —
  long ``info`` text, organiser contact, a WhatsApp number/group, a map link and
  a registration-open switch.
* ``tla3bny_news`` gains a gallery, a date and a published flag, and its
  ``competition_id`` becomes optional so the super admin can post site-wide.
* ``tla3bny_player_files`` gains ``label`` (which required paper a file is) and
  ``tla3bny_age_categories`` swaps its ``required_files`` count for a named
  ``required_documents`` list.

Every step is guarded: revision b7c1d2e3f4a5 builds the tla3bny tables from the
*current* model metadata, so a database migrated after these columns were added
already has them and only an older one needs the ALTER.

Revision ID: d9e4f5a6b7c8
Revises: c8d2e3f4a5b6
Create Date: 2026-07-25
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "d9e4f5a6b7c8"
down_revision = "c8d2e3f4a5b6"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    """The columns a table has, or an empty set when it does not exist."""
    inspector = sa.inspect(op.get_bind())
    if table not in inspector.get_table_names():
        return set()
    return {c["name"] for c in inspector.get_columns(table)}


def _add(table: str, *columns: sa.Column) -> None:
    have = _columns(table)
    missing = [c for c in columns if c.name not in have]
    if not have or not missing:
        return
    with op.batch_alter_table(table) as batch:
        for column in missing:
            batch.add_column(column)


def _drop(table: str, *names: str) -> None:
    have = _columns(table)
    present = [n for n in names if n in have]
    if not present:
        return
    with op.batch_alter_table(table) as batch:
        for name in present:
            batch.drop_column(name)


def upgrade():
    # ── accounts: username login, optional email ────────────────────────────
    _add(
        "tla3bny_users",
        sa.Column("username", sa.String(length=120), nullable=True),
    )
    if "tla3bny_users" in sa.inspect(op.get_bind()).get_table_names():
        indexes = {
            i["name"] for i in sa.inspect(op.get_bind()).get_indexes("tla3bny_users")
        }
        if "ix_tla3bny_users_username" not in indexes:
            op.create_index(
                "ix_tla3bny_users_username",
                "tla3bny_users",
                ["username"],
                unique=True,
            )
        # Existing accounts sign in by email; seed the username from it so the
        # single login box keeps working for them.
        op.execute(
            "UPDATE tla3bny_users SET username = email "
            "WHERE username IS NULL AND email IS NOT NULL"
        )
        with op.batch_alter_table("tla3bny_users") as batch:
            batch.alter_column(
                "email", existing_type=sa.String(length=255), nullable=True
            )

    # ── academies: registration is open ─────────────────────────────────────
    if "tla3bny_academies" in sa.inspect(op.get_bind()).get_table_names():
        op.execute(
            "UPDATE tla3bny_academies SET status = 'approved' WHERE status = 'pending'"
        )
        op.execute(
            "UPDATE tla3bny_users SET status = 'active' WHERE status = 'pending'"
        )

    # ── competitions: the public info page ──────────────────────────────────
    _add(
        "tla3bny_competitions",
        sa.Column("info", sa.Text(), nullable=True),
        sa.Column("organizer_name", sa.String(length=255), nullable=True),
        sa.Column("contact_phone", sa.String(length=50), nullable=True),
        sa.Column("whatsapp_number", sa.String(length=50), nullable=True),
        sa.Column("whatsapp_group_url", sa.String(length=512), nullable=True),
        sa.Column("facebook_url", sa.String(length=512), nullable=True),
        sa.Column("location_url", sa.String(length=1024), nullable=True),
        sa.Column(
            "registration_open",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )

    # ── news: gallery, date, draft flag, optional competition ───────────────
    _add(
        "tla3bny_news",
        sa.Column("images", sa.JSON(), nullable=True),
        sa.Column("news_date", sa.Date(), nullable=True),
        sa.Column(
            "is_published", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    if "tla3bny_news" in sa.inspect(op.get_bind()).get_table_names():
        with op.batch_alter_table("tla3bny_news") as batch:
            batch.alter_column(
                "competition_id", existing_type=sa.Integer(), nullable=True
            )
        op.execute(
            "UPDATE tla3bny_news SET news_date = DATE(published_at) "
            "WHERE news_date IS NULL"
        )

    # ── player papers: which required document each file is ─────────────────
    _add(
        "tla3bny_player_files",
        sa.Column("label", sa.String(length=120), nullable=True),
    )
    _add(
        "tla3bny_age_categories",
        sa.Column("required_documents", sa.JSON(), nullable=True),
    )
    _drop("tla3bny_age_categories", "required_files")


def downgrade():
    _add(
        "tla3bny_age_categories",
        sa.Column(
            "required_files", sa.Integer(), nullable=False, server_default="1"
        ),
    )
    _drop("tla3bny_age_categories", "required_documents")
    _drop("tla3bny_player_files", "label")

    if "tla3bny_news" in sa.inspect(op.get_bind()).get_table_names():
        # Site-wide items have no competition to fall back to, so they go.
        op.execute("DELETE FROM tla3bny_news WHERE competition_id IS NULL")
        with op.batch_alter_table("tla3bny_news") as batch:
            batch.alter_column(
                "competition_id", existing_type=sa.Integer(), nullable=False
            )
    _drop("tla3bny_news", "images", "news_date", "is_published")

    _drop(
        "tla3bny_competitions",
        "info",
        "organizer_name",
        "contact_phone",
        "whatsapp_number",
        "whatsapp_group_url",
        "facebook_url",
        "location_url",
        "registration_open",
    )

    if "tla3bny_users" in sa.inspect(op.get_bind()).get_table_names():
        # email carries the login again, so an account without one cannot come
        # back: fill it from the username before making the column required.
        op.execute(
            "UPDATE tla3bny_users SET email = username "
            "WHERE email IS NULL AND username IS NOT NULL"
        )
        indexes = {
            i["name"] for i in sa.inspect(op.get_bind()).get_indexes("tla3bny_users")
        }
        if "ix_tla3bny_users_username" in indexes:
            op.drop_index("ix_tla3bny_users_username", table_name="tla3bny_users")
        with op.batch_alter_table("tla3bny_users") as batch:
            batch.alter_column(
                "email", existing_type=sa.String(length=255), nullable=False
            )
    _drop("tla3bny_users", "username")
