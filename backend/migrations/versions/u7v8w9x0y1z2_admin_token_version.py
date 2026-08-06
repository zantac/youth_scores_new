"""Add admin_users.token_version for bearer-token revocation.

Bearer tokens embed the version they were issued at; bumping the column on a
password change makes every outstanding token for that user stop verifying (see
app/services/auth.py). Existing rows default to 0, and legacy tokens (issued
without a version) verify as 0, so current sessions survive the migration until
their own next password reset.

Idempotent: guarded by an existence check so it is a no-op if the column is
already present (e.g. on a database built fresh from live model metadata).

Revision ID: u7v8w9x0y1z2
Revises: t6u7v8w9x0y1
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = 'u7v8w9x0y1z2'
down_revision = 't6u7v8w9x0y1'
branch_labels = None
depends_on = None

_TABLE = 'admin_users'
_COLUMN = 'token_version'


def _has_column() -> bool:
    insp = sa.inspect(op.get_bind())
    return _COLUMN in {c['name'] for c in insp.get_columns(_TABLE)}


def upgrade():
    if not _has_column():
        # server_default backfills existing rows and is harmless to keep (the ORM
        # supplies the value on insert; 0 is the correct baseline anyway). Not
        # dropped afterwards because ALTER COLUMN ... DROP DEFAULT isn't portable
        # to SQLite.
        op.add_column(
            _TABLE,
            sa.Column(
                _COLUMN, sa.Integer(), nullable=False, server_default='0'
            ),
        )


def downgrade():
    if _has_column():
        op.drop_column(_TABLE, _COLUMN)
