import sqlalchemy as sa
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase

# Without these, Alembic emits constraints with backend-generated names, and
# MySQL cannot later drop a constraint it has no name for.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = sa.MetaData(naming_convention=NAMING_CONVENTION)


db = SQLAlchemy(model_class=Base)
migrate = Migrate()

# Rate limiter — key on the real client IP (ProxyFix in create_app() ensures
# request.remote_addr is the client, not the Railway/Heroku proxy).
# Storage defaults to in-process memory; set RATELIMIT_STORAGE_URI=redis://...
# in production for persistence across workers.
limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")


# Cleared by migrations/env.py for the duration of a migration run. Alembic's
# batch mode rebuilds a table by copying it to a temporary one and dropping the
# original, which SQLite refuses while other tables still reference it. The
# pragma cannot simply be switched off there: SQLite ignores it inside a
# transaction, so it has to be off from the moment the connection opens.
enforce_sqlite_foreign_keys = True


@event.listens_for(Engine, "connect")
def _sqlite_enforce_foreign_keys(dbapi_connection, connection_record):
    """Make SQLite enforce foreign keys, as MySQL does in production.

    SQLite ships with foreign_keys OFF, so ON DELETE CASCADE / RESTRICT are
    silently inert on a developer machine: a delete that production would
    reject instead succeeds and leaves orphaned rows behind. Turning it on
    keeps local behaviour honest about what the deployed database will do.
    """
    if not enforce_sqlite_foreign_keys:
        return
    if type(dbapi_connection).__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
