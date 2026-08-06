from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from werkzeug.security import check_password_hash, generate_password_hash

from app.models import codes
from app.models.base import TimestampMixin, code_enum, db


class AdminUser(TimestampMixin, db.Model):
    """Who may sign in to the data-entry panel."""

    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(primary_key=True)

    username: Mapped[str] = mapped_column(sa.String(60), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(sa.String(120))
    role: Mapped[str] = mapped_column(
        code_enum(*codes.ADMIN_ROLE), nullable=False, default="clerk"
    )
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(sa.DateTime)
    # Bumped on every password change so outstanding bearer tokens (which embed
    # the version they were issued at) stop verifying — see services/auth.py.
    token_version: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)
        self.token_version = (self.token_version or 0) + 1

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def __repr__(self) -> str:
        return f"<AdminUser {self.username} ({self.role})>"
