import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import codes
from app.models.base import TimestampMixin, code_enum, db


class Competition(TimestampMixin, db.Model):
    """One competition, for one age group, in one sector.

    The source feed nests competition -> age -> sector, where each sector is a
    geographic division (Cairo / Delta / Upper Egypt) with its own teams,
    matches and standings. A sector is therefore its own competition instance;
    `code` is what groups the instances back together under one heading in the
    UI, the way the feed's competition_id does.
    """

    __tablename__ = "competitions"

    id: Mapped[int] = mapped_column(primary_key=True)

    season_id: Mapped[int] = mapped_column(
        sa.ForeignKey("seasons.id", ondelete="RESTRICT"), nullable=False
    )
    # NULL when the competition is open to more than one age group.
    age_group_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("age_groups.id", ondelete="RESTRICT")
    )

    # Shared across every age/sector instance of the same competition (c001...).
    code: Mapped[str | None] = mapped_column(sa.String(20))

    name_en: Mapped[str | None] = mapped_column(sa.String(160))
    name_ar: Mapped[str | None] = mapped_column(sa.String(160))

    sector_en: Mapped[str | None] = mapped_column(sa.String(120))
    sector_ar: Mapped[str | None] = mapped_column(sa.String(120))
    # Empty string rather than NULL: MySQL treats NULLs as distinct, which would
    # defeat the unique constraint below for sector-less competitions.
    sector_key: Mapped[str] = mapped_column(sa.String(120), nullable=False, default="")

    season: Mapped["Season"] = relationship(back_populates="competitions")
    # ORM-level cascade, not passive_deletes: SQLite runs with foreign_keys
    # OFF, so the schema's ON DELETE CASCADE never fires locally and leaving it
    # to the database would orphan these rows here while working in production.
    stages: Mapped[list["Stage"]] = relationship(
        back_populates="competition", order_by="Stage.stage_order",
        cascade="all, delete-orphan",
    )
    entries: Mapped[list["CompetitionTeam"]] = relationship(
        back_populates="competition", cascade="all, delete-orphan"
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "season_id", "code", "age_group_id", "sector_key", name="uq_competition"
        ),
        sa.Index("ix_competitions_season", "season_id"),
        sa.Index("ix_competitions_code", "code"),
    )

    def __repr__(self) -> str:
        return f"<Competition {self.id} {self.name_ar or self.name_en}>"


class Stage(TimestampMixin, db.Model):
    """A phase of a competition. stage_order drives progression: 1, 2, 3..."""

    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(primary_key=True)

    competition_id: Mapped[int] = mapped_column(
        sa.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False
    )

    name_en: Mapped[str | None] = mapped_column(sa.String(120))
    name_ar: Mapped[str | None] = mapped_column(sa.String(120))
    stage_order: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False)
    type: Mapped[str] = mapped_column(code_enum(*codes.STAGE_TYPE), nullable=False)

    # Whether this stage's table continues from the earlier stages.
    #   True  - teams keep the points and goals they earned before (the usual
    #           second phase: a league splits into a title group and the rest).
    #   False - the table starts from zero, counting only this stage's matches
    #           (e.g. the six qualifiers replay each other from scratch).
    # Ignored for knockout stages, which produce no table at all.
    carries_points: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=True, server_default=sa.true()
    )

    competition: Mapped["Competition"] = relationship(back_populates="stages")
    groups: Mapped[list["Group"]] = relationship(
        back_populates="stage", cascade="all, delete-orphan"
    )

    __table_args__ = (
        sa.UniqueConstraint("competition_id", "stage_order", name="uq_stage_order"),
    )

    @property
    def is_knockout(self) -> bool:
        return self.type == codes.STAGE_TYPE_KNOCKOUT

    def __repr__(self) -> str:
        return f"<Stage {self.id} {self.type} #{self.stage_order}>"


class Group(TimestampMixin, db.Model):
    """A group within a stage — Group A, B, ... up to J."""

    # "group" is reserved in MySQL; every table here is plural to sidestep that
    # (the same applies to "match" -> "matches").
    __tablename__ = "competition_groups"

    id: Mapped[int] = mapped_column(primary_key=True)

    stage_id: Mapped[int] = mapped_column(
        sa.ForeignKey("stages.id", ondelete="CASCADE"), nullable=False
    )

    name_en: Mapped[str | None] = mapped_column(sa.String(80))
    name_ar: Mapped[str | None] = mapped_column(sa.String(80))

    # Admin-controlled display order within the stage: the standings tables and
    # the public group lists order by this (then id), so the admin's up/down
    # arrangement is what everyone sees. Lower shows first.
    sort_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    stage: Mapped["Stage"] = relationship(back_populates="groups")
    entries: Mapped[list["GroupTeam"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )

    __table_args__ = (sa.Index("ix_groups_stage", "stage_id"),)

    def __repr__(self) -> str:
        return f"<Group {self.id} {self.name_ar or self.name_en}>"


class CompetitionTeam(TimestampMixin, db.Model):
    """The teams entered in a competition — its roster.

    Group membership cannot stand in for this: 11 of the 28 imported
    competitions run without groups at all, and a team that has not played yet
    has no matches to infer it from. The source feed says the same thing with a
    `teams` array per competition file.
    """

    __tablename__ = "competition_teams"

    id: Mapped[int] = mapped_column(primary_key=True)

    competition_id: Mapped[int] = mapped_column(
        sa.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )

    # The second name the side plays under in THIS competition (an academy or
    # sponsor brand), shown beneath the club name. NULL means it plays as the
    # club. It sits on the entry, not the squad, because the same squad can run
    # under different branding from one competition or season to the next.
    name_en: Mapped[str | None] = mapped_column(sa.String(160))
    name_ar: Mapped[str | None] = mapped_column(sa.String(160))

    # Subtracted from the team's points in this competition's table. A penalty
    # belongs to the competition it was issued in, not to the squad: a team
    # carries on into the next season, and last season's deduction must not
    # follow it there.
    point_deduction: Mapped[int] = mapped_column(
        sa.SmallInteger, nullable=False, default=0, server_default="0"
    )

    competition: Mapped["Competition"] = relationship(back_populates="entries")
    team: Mapped["Team"] = relationship()

    __table_args__ = (
        sa.CheckConstraint("point_deduction >= 0", name="ck_competition_team_deduction"),
        sa.UniqueConstraint("competition_id", "team_id", name="uq_competition_team"),
        sa.Index("ix_competition_teams_team", "team_id"),
    )


class GroupTeam(TimestampMixin, db.Model):
    """Which teams belong to which group.

    Not in the design doc, which linked groups to matches only. Without it a team
    that has not played yet cannot appear in its own standings table, and a team
    progressing from the group stage into a later stage has nowhere to record
    its second group.
    """

    __tablename__ = "group_teams"

    id: Mapped[int] = mapped_column(primary_key=True)

    group_id: Mapped[int] = mapped_column(
        sa.ForeignKey("competition_groups.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )

    group: Mapped["Group"] = relationship(back_populates="entries")
    team: Mapped["Team"] = relationship()

    __table_args__ = (
        sa.UniqueConstraint("group_id", "team_id", name="uq_group_team"),
        sa.Index("ix_group_teams_team", "team_id"),
    )
