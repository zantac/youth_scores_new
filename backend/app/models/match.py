from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import codes
from app.models.base import TimestampMixin, code_enum, db


class Match(TimestampMixin, db.Model):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(primary_key=True)

    stage_id: Mapped[int] = mapped_column(
        sa.ForeignKey("stages.id", ondelete="RESTRICT"), nullable=False
    )
    # NULL for stages that are not played in groups.
    group_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("competition_groups.id", ondelete="SET NULL")
    )

    home_team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )
    away_team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )

    # NULL when the fixture is confirmed but its date is not set yet (TBD). A
    # midnight time (00:00) means the date is known but the kick-off time is not.
    match_date: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True)

    # Matchday label. Not in the design doc; the fixtures list groups by it.
    week: Mapped[str | None] = mapped_column(sa.String(40))

    # The feed's match-level "group" is a phase label ("المرحلة الاولي") drawn
    # from a different vocabulary than the team-level group that standings use,
    # and the clients only ever show it as a filter chip. Where it does name a
    # real group, group_id is set as well; this keeps the label either way.
    round_label_en: Mapped[str | None] = mapped_column(sa.String(120))
    round_label_ar: Mapped[str | None] = mapped_column(sa.String(120))

    # Origin key from the JSON feed, so the import can be re-run without
    # duplicating rows.
    source_ref: Mapped[str | None] = mapped_column(sa.String(120), unique=True)

    # Free text, as the design doc has it. venue_id links to the venue directory
    # when the ground is a known one; the text fields cover everything else.
    venue_en: Mapped[str | None] = mapped_column(sa.String(160))
    venue_ar: Mapped[str | None] = mapped_column(sa.String(160))
    venue_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("venues.id", ondelete="SET NULL")
    )

    status: Mapped[str] = mapped_column(
        code_enum(*codes.MATCH_STATUS), nullable=False, default="scheduled"
    )

    home_score: Mapped[int | None] = mapped_column(sa.SmallInteger)
    away_score: Mapped[int | None] = mapped_column(sa.SmallInteger)
    home_penalty_score: Mapped[int | None] = mapped_column(sa.SmallInteger)
    away_penalty_score: Mapped[int | None] = mapped_column(sa.SmallInteger)

    referee_main: Mapped[str | None] = mapped_column(sa.String(120))
    referee_assistant_1: Mapped[str | None] = mapped_column(sa.String(120))
    referee_assistant_2: Mapped[str | None] = mapped_column(sa.String(120))
    referee_fourth: Mapped[str | None] = mapped_column(sa.String(120))

    note_en: Mapped[str | None] = mapped_column(sa.String(255))
    note_ar: Mapped[str | None] = mapped_column(sa.String(255))

    # NULL = live; non-NULL = soft-deleted, eligible for restore within 24 hours.
    deleted_at: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True)

    stage: Mapped["Stage"] = relationship()
    group: Mapped["Group"] = relationship()
    home_team: Mapped["Team"] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped["Team"] = relationship(foreign_keys=[away_team_id])
    venue: Mapped["Venue"] = relationship()

    lineup: Mapped[list["MatchPlayer"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )
    goals: Mapped[list["MatchGoal"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )
    cards: Mapped[list["MatchCard"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )
    substitutions: Mapped[list["MatchSubstitution"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )
    shootout: Mapped[list["MatchPenaltyShootout"]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
        order_by="MatchPenaltyShootout.kick_order",
    )

    __table_args__ = (
        sa.CheckConstraint("home_team_id <> away_team_id", name="ck_match_teams_differ"),
        sa.Index("ix_matches_stage", "stage_id"),
        sa.Index("ix_matches_group", "group_id"),
        sa.Index("ix_matches_date", "match_date"),
        sa.Index("ix_matches_home", "home_team_id"),
        sa.Index("ix_matches_away", "away_team_id"),
        sa.Index("ix_matches_status", "status"),
        sa.Index("ix_matches_deleted_at", "deleted_at"),
    )

    @property
    def is_completed(self) -> bool:
        return self.status == codes.MATCH_STATUS_COMPLETED

    @property
    def counts_for_standings(self) -> bool:
        return (
            self.is_completed
            and not self.stage.is_knockout
            and self.home_score is not None
            and self.away_score is not None
        )

    def __repr__(self) -> str:
        return f"<Match {self.id} {self.home_team_id}v{self.away_team_id}>"


class MatchPlayer(TimestampMixin, db.Model):
    """Line-up and bench for one match, with per-match totals for quick display."""

    __tablename__ = "match_players"

    id: Mapped[int] = mapped_column(primary_key=True)

    match_id: Mapped[int] = mapped_column(
        sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )
    player_id: Mapped[int] = mapped_column(
        sa.ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )

    jersey_number: Mapped[int | None] = mapped_column(sa.SmallInteger)
    position: Mapped[str | None] = mapped_column(code_enum(*codes.POSITION, length=8))
    is_starter: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    # Squad role for match-day entry: 'called' (named in the squad, role not yet
    # decided), 'start' (starting XI) or 'sub' (named substitute). A player is
    # "called up" the moment this row exists; the role is refined later. is_starter
    # is kept in sync (True iff role == 'start') so the public lineup views — which
    # only split starters from the rest — keep working unchanged.
    role: Mapped[str] = mapped_column(sa.String(8), nullable=False, default="called")
    minutes_played: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False, default=0)

    goals: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False, default=0)
    assists: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False, default=0)
    yellow_cards: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False, default=0)
    red_cards: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False, default=0)

    match: Mapped["Match"] = relationship(back_populates="lineup")
    team: Mapped["Team"] = relationship()
    player: Mapped["Player"] = relationship()

    __table_args__ = (
        sa.UniqueConstraint("match_id", "player_id", name="uq_match_player"),
        sa.Index("ix_match_players_player", "player_id"),
        sa.Index("ix_match_players_team", "team_id"),
    )


class MatchGoal(TimestampMixin, db.Model):
    """One goal. team_id is the team credited with the goal.

    For an own goal, team_id is the team that benefits while scorer_id is the
    player who put it in his own net — so top-scorer tables must exclude
    is_own_goal rows.

    team_id also means a transferred player's goals stay with the club he scored
    them for, while his profile follows him to the new club.
    """

    __tablename__ = "match_goals"

    id: Mapped[int] = mapped_column(primary_key=True)

    match_id: Mapped[int] = mapped_column(
        sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )
    scorer_id: Mapped[int] = mapped_column(
        sa.ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )
    assist_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("players.id", ondelete="SET NULL")
    )

    # The design doc has this NOT NULL. The JSON feed being migrated records only
    # scorer names and counts, never minutes, so historical rows have none.
    minute: Mapped[int | None] = mapped_column(sa.SmallInteger)

    is_extra_time: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    is_own_goal: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    is_penalty: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)

    match: Mapped["Match"] = relationship(back_populates="goals")
    team: Mapped["Team"] = relationship()
    scorer: Mapped["Player"] = relationship(foreign_keys=[scorer_id])
    assist: Mapped["Player"] = relationship(foreign_keys=[assist_id])

    # No CHECK "assist_id <> scorer_id": MySQL (err 3823) forbids a CHECK on a
    # column an FK references with ON DELETE SET NULL (assist_id). The "a player
    # cannot assist his own goal" rule is enforced in the data-entry code.
    __table_args__ = (
        sa.Index("ix_match_goals_match", "match_id"),
        sa.Index("ix_match_goals_scorer", "scorer_id"),
        sa.Index("ix_match_goals_assist", "assist_id"),
    )


class MatchCard(TimestampMixin, db.Model):
    __tablename__ = "match_cards"

    id: Mapped[int] = mapped_column(primary_key=True)

    match_id: Mapped[int] = mapped_column(
        sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )
    player_id: Mapped[int] = mapped_column(
        sa.ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )

    card_type: Mapped[str] = mapped_column(code_enum(*codes.CARD_TYPE), nullable=False)
    minute: Mapped[int | None] = mapped_column(sa.SmallInteger)  # see MatchGoal.minute
    is_extra_time: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)

    match: Mapped["Match"] = relationship(back_populates="cards")
    team: Mapped["Team"] = relationship()
    player: Mapped["Player"] = relationship()

    __table_args__ = (
        sa.Index("ix_match_cards_match", "match_id"),
        sa.Index("ix_match_cards_player", "player_id"),
    )


class MatchSubstitution(TimestampMixin, db.Model):
    __tablename__ = "match_substitutions"

    id: Mapped[int] = mapped_column(primary_key=True)

    match_id: Mapped[int] = mapped_column(
        sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )
    player_out_id: Mapped[int] = mapped_column(
        sa.ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )
    player_in_id: Mapped[int] = mapped_column(
        sa.ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )

    minute: Mapped[int | None] = mapped_column(sa.SmallInteger)  # see MatchGoal.minute
    is_extra_time: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)

    match: Mapped["Match"] = relationship(back_populates="substitutions")
    team: Mapped["Team"] = relationship()
    player_out: Mapped["Player"] = relationship(foreign_keys=[player_out_id])
    player_in: Mapped["Player"] = relationship(foreign_keys=[player_in_id])

    __table_args__ = (
        sa.CheckConstraint(
            "player_out_id <> player_in_id", name="ck_sub_players_differ"
        ),
        sa.Index("ix_match_subs_match", "match_id"),
    )


class MatchPenaltyShootout(TimestampMixin, db.Model):
    """One kick in a shootout. Match.home/away_penalty_score hold the summary."""

    __tablename__ = "match_penalty_shootouts"

    id: Mapped[int] = mapped_column(primary_key=True)

    match_id: Mapped[int] = mapped_column(
        sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )
    player_id: Mapped[int] = mapped_column(
        sa.ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )

    kick_order: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False)
    result: Mapped[str] = mapped_column(code_enum(*codes.PENALTY_RESULT), nullable=False)
    is_winning_kick: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False
    )

    match: Mapped["Match"] = relationship(back_populates="shootout")
    team: Mapped["Team"] = relationship()
    player: Mapped["Player"] = relationship()

    __table_args__ = (
        sa.UniqueConstraint(
            "match_id", "team_id", "kick_order", name="uq_shootout_kick"
        ),
        sa.Index("ix_shootout_match", "match_id"),
    )
