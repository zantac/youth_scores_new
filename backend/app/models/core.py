from datetime import date

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import codes
from app.models.base import TimestampMixin, code_enum, db


class Club(TimestampMixin, db.Model):
    __tablename__ = "clubs"

    id: Mapped[int] = mapped_column(primary_key=True)

    name_en: Mapped[str | None] = mapped_column(sa.String(160))
    name_ar: Mapped[str | None] = mapped_column(sa.String(160))
    city_en: Mapped[str | None] = mapped_column(sa.String(120))
    city_ar: Mapped[str | None] = mapped_column(sa.String(120))

    logo_url: Mapped[str | None] = mapped_column(sa.String(512))
    website_url: Mapped[str | None] = mapped_column(sa.String(512))
    facebook_url: Mapped[str | None] = mapped_column(sa.String(512))
    instagram_url: Mapped[str | None] = mapped_column(sa.String(512))
    twitter_url: Mapped[str | None] = mapped_column(sa.String(512))
    youtube_url: Mapped[str | None] = mapped_column(sa.String(512))
    established: Mapped[date | None] = mapped_column(sa.Date)

    # teams deliberately has no cascade: a club with teams must not be deletable.
    teams: Mapped[list["Team"]] = relationship(back_populates="club")
    staff: Mapped[list["ClubStaff"]] = relationship(
        back_populates="club", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Club {self.id} {self.name_ar or self.name_en}>"


class Season(TimestampMixin, db.Model):
    __tablename__ = "seasons"

    id: Mapped[int] = mapped_column(primary_key=True)

    name_en: Mapped[str | None] = mapped_column(sa.String(80))
    name_ar: Mapped[str | None] = mapped_column(sa.String(80))
    start_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    end_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)

    # No `teams`: a team is not scoped to a season. Which seasons it played is
    # read through the competitions it entered.
    competitions: Mapped[list["Competition"]] = relationship(back_populates="season")

    __table_args__ = (
        sa.CheckConstraint("end_date >= start_date", name="ck_season_dates"),
        sa.Index("ix_seasons_is_active", "is_active"),
    )

    def __repr__(self) -> str:
        return f"<Season {self.id} {self.name_en or self.name_ar}>"


class AgeGroup(TimestampMixin, db.Model):
    __tablename__ = "age_groups"

    id: Mapped[int] = mapped_column(primary_key=True)

    name_en: Mapped[str | None] = mapped_column(sa.String(80))
    name_ar: Mapped[str | None] = mapped_column(sa.String(80))

    # The earliest birth year allowed. A player qualifies when
    # player.birth_year >= oldest_birth_year, so younger players may play up
    # but older players can never play down.
    oldest_birth_year: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False)

    teams: Mapped[list["Team"]] = relationship(back_populates="age_group")

    def allows(self, birth_year: int) -> bool:
        return birth_year >= self.oldest_birth_year

    def __repr__(self) -> str:
        return f"<AgeGroup {self.id} {self.oldest_birth_year}>"


class Player(TimestampMixin, db.Model):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)

    full_name_en: Mapped[str | None] = mapped_column(sa.String(160))
    full_name_ar: Mapped[str | None] = mapped_column(sa.String(160))

    birth_year: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False)

    # Migrated players have no birth year in the source JSON, so it is inferred
    # from the age group of the team they appeared for. That guess is wrong for
    # anyone playing up; this flag marks the rows a clerk still needs to confirm.
    birth_year_verified: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False
    )

    full_dob: Mapped[date | None] = mapped_column(sa.Date)
    nationality_en: Mapped[str | None] = mapped_column(sa.String(80))
    nationality_ar: Mapped[str | None] = mapped_column(sa.String(80))
    position_en: Mapped[str | None] = mapped_column(sa.String(60))
    position_ar: Mapped[str | None] = mapped_column(sa.String(60))
    # A more specific role within the main position (e.g. right-back under
    # defender). Shown on the profile in place of the main position when set.
    sub_position_en: Mapped[str | None] = mapped_column(sa.String(60))
    sub_position_ar: Mapped[str | None] = mapped_column(sa.String(60))
    height_cm: Mapped[int | None] = mapped_column(sa.SmallInteger)
    weight_kg: Mapped[int | None] = mapped_column(sa.SmallInteger)
    preferred_foot: Mapped[str | None] = mapped_column(code_enum(*codes.PREFERRED_FOOT))
    profile_pic_url: Mapped[str | None] = mapped_column(sa.String(512))
    registration_number: Mapped[str | None] = mapped_column(sa.String(60))

    registrations: Mapped[list["PlayerTeam"]] = relationship(back_populates="player")

    __table_args__ = (
        sa.Index("ix_players_birth_year", "birth_year"),
        sa.Index("ix_players_name_ar", "full_name_ar"),
        sa.Index("ix_players_name_en", "full_name_en"),
    )

    def __repr__(self) -> str:
        return f"<Player {self.id} {self.full_name_ar or self.full_name_en}>"


class Coach(TimestampMixin, db.Model):
    __tablename__ = "coaches"

    id: Mapped[int] = mapped_column(primary_key=True)

    full_name_en: Mapped[str | None] = mapped_column(sa.String(160))
    full_name_ar: Mapped[str | None] = mapped_column(sa.String(160))
    birth_year: Mapped[int | None] = mapped_column(sa.SmallInteger)
    nationality_en: Mapped[str | None] = mapped_column(sa.String(80))
    nationality_ar: Mapped[str | None] = mapped_column(sa.String(80))
    profile_pic_url: Mapped[str | None] = mapped_column(sa.String(512))

    team_roles: Mapped[list["TeamCoach"]] = relationship(back_populates="coach")
    club_roles: Mapped[list["ClubStaff"]] = relationship(back_populates="coach")

    def __repr__(self) -> str:
        return f"<Coach {self.id} {self.full_name_ar or self.full_name_en}>"
