"""tla3bny — the youth-academy competitions subdomain (tla3bny.youthscores.org).

A self-contained subsystem for organising *friendly* competitions for young
players (ages ~6-13), kept entirely in ``tla3bny_*`` tables that share nothing
with the youthscores competition data — the two are separate worlds that merely
share a database.

Structure mirrors youthscores' own separation of durable master data from
disposable event data:

* **Master data** (durable, survives deleting a season/competition): academies
  (= clubs), their teams (one per age), coaches, and players. People move
  between academies through *dated memberships* (``tla3bny_player_teams``), just
  like youthscores' ``PlayerTeam`` — the person row is never destroyed.
* **Event data** (disposable): seasons, competitions, the teams/players
  registered into them (with per-competition approval), matches, lineups and
  news. Deleting any of this leaves the master data untouched.

Accounts all live in one ``tla3bny_users`` table with a ``role`` and optional
``academy_id`` / ``team_id`` links, so a single login endpoint + token serves
the super admin, competition admins, academies and team (coach) logins.

Serialization is kept on the models (as ``to_dict``) rather than in a
serializers module, so this subsystem stays a single, self-contained unit.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from werkzeug.security import check_password_hash, generate_password_hash

from app.models import codes
from app.models.base import TimestampMixin, code_enum, db


# ── accounts ────────────────────────────────────────────────────────────────
class Tla3bnyUser(TimestampMixin, db.Model):
    """A tla3bny login account.

    One table serves every actor via ``role``:

    * ``super_admin`` — runs the whole subdomain (seasons, ages, competitions).
    * ``competition_admin`` — assigned to one or more competitions; approves
      that competition's registered players and enters its results/news.
    * ``academy`` — an academy's own login; ``academy_id`` set. Self-registers
      and is active immediately — no approval step.
    * ``team`` — a per-team (coach) login; ``team_id`` + ``academy_id`` set.

    ``name`` is a display name for the super admin / competition admins; academy
    and team accounts take their name from the linked academy/team.

    An account signs in with either a ``username`` or an ``email``, whichever it
    has. Competition organisers, academy owners and team managers are handed a
    username + password by whoever creates the account, so most of them never
    have an email on file; ``email`` therefore stays optional.
    """

    __tablename__ = "tla3bny_users"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Stored lower-cased so a login is case-insensitive (the DB's own
    # collation is not relied on — MySQL and SQLite disagree about it).
    username: Mapped[str | None] = mapped_column(
        sa.String(120), unique=True, index=True
    )
    email: Mapped[str | None] = mapped_column(
        sa.String(255), unique=True, index=True
    )
    password_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_USER_ROLE), nullable=False, default="academy"
    )
    status: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_USER_STATUS), nullable=False, default="pending"
    )
    # Incremented on every suspension so tokens issued before the suspend
    # are immediately rejected by verify_token even within their 30-day window.
    token_version: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)
    name: Mapped[str | None] = mapped_column(sa.String(255))

    academy_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_academies.id", ondelete="CASCADE")
    )
    team_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_teams.id", ondelete="CASCADE")
    )

    academy: Mapped["Tla3bnyAcademy | None"] = relationship(
        foreign_keys=[academy_id]
    )
    team: Mapped["Tla3bnyTeam | None"] = relationship(foreign_keys=[team_id])

    # -- password helpers ---------------------------------------------------
    @staticmethod
    def normalize_login(raw: str | None) -> str | None:
        """The stored form of a username/email: trimmed and lower-cased."""
        value = (raw or "").strip().lower()
        return value or None

    @classmethod
    def by_login(cls, raw: str | None) -> "Tla3bnyUser | None":
        """Find the account for what was typed in the single 'login' box —
        a username or an email, either case."""
        value = cls.normalize_login(raw)
        if not value:
            return None
        return cls.query.filter(
            sa.or_(cls.username == value, cls.email == value)
        ).first()

    def set_password(self, raw: str) -> None:
        self.password_hash = generate_password_hash(raw)
        # Invalidate every previously-issued token (mirrors AdminUser): a password
        # change is the standard "I've been compromised" remedy, so existing
        # 30-day sessions must stop verifying.
        self.token_version = (self.token_version or 0) + 1

    def check_password(self, raw: str) -> bool:
        return check_password_hash(self.password_hash, raw)

    # -- serialization ------------------------------------------------------
    def display_name(self) -> str | None:
        if self.academy:
            return self.academy.name
        if self.team:
            return self.team.display_name()
        return self.name

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "login": self.username or self.email,
            "role": self.role,
            "status": self.status,
            "name": self.display_name(),
            "academy_id": self.academy_id,
            "team_id": self.team_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<Tla3bnyUser {self.id} {self.role} {self.username or self.email}>"


# ── master data: academies, teams, coaches, players ─────────────────────────
class Tla3bnyAcademy(TimestampMixin, db.Model):
    """An academy (the tla3bny equivalent of a youthscores club).

    Durable master data: it owns teams/players and is never deleted by removing
    a season or competition. Any academy may self-register and is live at once —
    there is no approval queue. The only thing an organiser vets is the players
    a team enters into their competition (see Tla3bnyCompetitionPlayer).
    """

    __tablename__ = "tla3bny_academies"

    id: Mapped[int] = mapped_column(primary_key=True)
    # ``name`` is the primary (Arabic) name; ``name_en`` is the optional English
    # one. Display falls back to the other language when one is missing.
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    name_en: Mapped[str | None] = mapped_column(sa.String(255))
    logo_path: Mapped[str | None] = mapped_column(sa.String(512))

    # Public profile. A phone number is required at registration — it is how an
    # organiser reaches the academy about its entries.
    phone: Mapped[str | None] = mapped_column(sa.String(50))
    # WhatsApp number for the chat button on the public advertising page.
    whatsapp_number: Mapped[str | None] = mapped_column(sa.String(50))
    facebook_url: Mapped[str | None] = mapped_column(sa.String(512))
    training_place: Mapped[str | None] = mapped_column(sa.String(255))
    address: Mapped[str | None] = mapped_column(sa.String(255))
    description: Mapped[str | None] = mapped_column(sa.Text)
    # Up to 3 gallery photos (list of stored image paths/URLs) for the ad page.
    photos: Mapped[list | None] = mapped_column(sa.JSON)

    # Registration is open, so an academy starts "approved". The status is kept
    # so the super admin can still suspend one that misbehaves.
    status: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_ACADEMY_STATUS), nullable=False, default="approved"
    )
    rejection_reason: Mapped[str | None] = mapped_column(sa.String(512))

    teams: Mapped[list["Tla3bnyTeam"]] = relationship(
        back_populates="academy", cascade="all, delete-orphan"
    )
    managers: Mapped[list["Tla3bnyAcademyManager"]] = relationship(
        back_populates="academy",
        cascade="all, delete-orphan",
        order_by="Tla3bnyAcademyManager.sort_order",
    )
    branches: Mapped[list["Tla3bnyAcademyBranch"]] = relationship(
        back_populates="academy",
        cascade="all, delete-orphan",
        order_by="Tla3bnyAcademyBranch.sort_order",
    )

    def to_dict(self, public: bool = False, with_teams: bool = False) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "name_en": self.name_en,
            "logo_path": self.logo_path,
            "phone": self.phone,
            "whatsapp_number": self.whatsapp_number,
            "facebook_url": self.facebook_url,
            "training_place": self.training_place,
            "address": self.address,
            "description": self.description,
            "photos": self.photos or [],
            "status": self.status,
            "managers": [m.to_dict() for m in self.managers],
            "branches": [b.to_dict() for b in self.branches],
        }
        if not public:
            data["rejection_reason"] = self.rejection_reason
            data["created_at"] = (
                self.created_at.isoformat() if self.created_at else None
            )
        if with_teams:
            data["teams"] = [t.to_dict() for t in teams_by_age(self.teams)]
        return data

    def __repr__(self) -> str:
        return f"<Tla3bnyAcademy {self.id} {self.name}>"


class Tla3bnyAcademyManager(TimestampMixin, db.Model):
    """A named manager shown on an academy's public profile."""

    __tablename__ = "tla3bny_academy_managers"

    id: Mapped[int] = mapped_column(primary_key=True)
    academy_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_academies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    role: Mapped[str | None] = mapped_column(sa.String(120))
    phone: Mapped[str | None] = mapped_column(sa.String(50))
    photo_path: Mapped[str | None] = mapped_column(sa.String(512))
    sort_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    academy: Mapped["Tla3bnyAcademy"] = relationship(back_populates="managers")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "academy_id": self.academy_id,
            "name": self.name,
            "role": self.role,
            "phone": self.phone,
            "photo_path": self.photo_path,
            "sort_order": self.sort_order,
        }


class Tla3bnyAcademyBranch(TimestampMixin, db.Model):
    """A branch/location of an academy, shown on its public advertising page —
    a name plus where it is (address + map link) and an optional phone."""

    __tablename__ = "tla3bny_academy_branches"

    id: Mapped[int] = mapped_column(primary_key=True)
    academy_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_academies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    # Egyptian governorate (المحافظة) — drives the academies-page filter.
    governorate: Mapped[str | None] = mapped_column(sa.String(60))
    address: Mapped[str | None] = mapped_column(sa.String(512))
    # A maps link (Google Maps, etc.) — scheme-sanitised on write.
    location_url: Mapped[str | None] = mapped_column(sa.String(512))
    phone: Mapped[str | None] = mapped_column(sa.String(50))
    sort_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    academy: Mapped["Tla3bnyAcademy"] = relationship(back_populates="branches")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "academy_id": self.academy_id,
            "name": self.name,
            "governorate": self.governorate,
            "address": self.address,
            "location_url": self.location_url,
            "phone": self.phone,
            "sort_order": self.sort_order,
        }


class Tla3bnyAgeCategory(TimestampMixin, db.Model):
    """A global age bracket (e.g. "U10"), editable by the super admin at any
    time. Shared across every season and competition."""

    __tablename__ = "tla3bny_age_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(sa.String(50), nullable=False, unique=True)
    label_ar: Mapped[str | None] = mapped_column(sa.String(100))
    label_en: Mapped[str | None] = mapped_column(sa.String(100))
    # Players born in this year or later are eligible for this age bracket.
    oldest_birth_year: Mapped[int | None] = mapped_column(sa.SmallInteger)
    # The baseline registration papers a player in this age must upload (e.g.
    # birth certificate, school letter, national id, health certificate). Null
    # falls back to codes.TLA3BNY_DEFAULT_PLAYER_DOCS. Each competition the
    # team enters adds its own list on top (Tla3bnyCompetition.documents).
    required_documents: Mapped[list | None] = mapped_column(sa.JSON)
    sort_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    @property
    def documents(self) -> list[str]:
        return self.required_documents or list(codes.TLA3BNY_DEFAULT_PLAYER_DOCS)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "label_ar": self.label_ar,
            "label_en": self.label_en,
            "oldest_birth_year": self.oldest_birth_year,
            "required_documents": self.documents,
            "required_files": len(self.documents),
            "sort_order": self.sort_order,
        }

    def __repr__(self) -> str:
        return f"<Tla3bnyAgeCategory {self.id} {self.label}>"


class Tla3bnyTeam(TimestampMixin, db.Model):
    """An academy's squad in one age group.

    An academy may run several squads in the same age — distinguished by
    ``class_label`` ("A", "B", "C", ...) — so there is no one-team-per-age
    constraint. Durable master data. May carry its own login
    (``Tla3bnyUser`` role="team") so the coach edits it directly. Its roster is
    the set of *active* ``Tla3bnyPlayerTeam`` memberships.
    """

    __tablename__ = "tla3bny_teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    academy_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_academies.id", ondelete="CASCADE"), nullable=False
    )
    age_category_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_age_categories.id"), nullable=False
    )
    # A class within the age when an academy runs several squads (e.g. "A").
    class_label: Mapped[str | None] = mapped_column(sa.String(30))
    # Optional free-text override; otherwise the display name is derived.
    name: Mapped[str | None] = mapped_column(sa.String(255))
    name_en: Mapped[str | None] = mapped_column(sa.String(255))
    # Team badge/photo and a short blurb, shown on the team hero card.
    photo_path: Mapped[str | None] = mapped_column(sa.String(512))
    description: Mapped[str | None] = mapped_column(sa.String(500))

    academy: Mapped["Tla3bnyAcademy"] = relationship(back_populates="teams")
    age_category: Mapped["Tla3bnyAgeCategory"] = relationship()
    coaches: Mapped[list["Tla3bnyCoach"]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )
    memberships: Mapped[list["Tla3bnyPlayerTeam"]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )

    def display_name(self, lang: str = "ar") -> str:
        """The team's shown name. ``lang="en"`` prefers the English override /
        academy / age label, falling back to the Arabic/primary when missing."""
        if lang == "en":
            if self.name_en or self.name:
                return self.name_en or self.name
            age = (self.age_category.label_en or self.age_category.label) if self.age_category else ""
            acad = (self.academy.name_en or self.academy.name) if self.academy else ""
        else:
            if self.name:
                return self.name
            age = self.age_category.label if self.age_category else ""
            acad = self.academy.name if self.academy else ""
        base = f"{acad} {age}".strip()
        if self.class_label:
            return f"{base} {self.class_label}".strip()
        return base

    def to_dict(self, with_roster: bool = False) -> dict:
        data = {
            "id": self.id,
            "academy_id": self.academy_id,
            "academy_name": self.academy.name if self.academy else None,
            "academy_name_en": self.academy.name_en if self.academy else None,
            "academy_logo": self.academy.logo_path if self.academy else None,
            "age_category_id": self.age_category_id,
            "age_category": self.age_category.label if self.age_category else None,
            "oldest_birth_year": (
                self.age_category.oldest_birth_year if self.age_category else None
            ),
            "class_label": self.class_label,
            "name": self.name,
            "name_en": self.name_en,
            "photo_path": self.photo_path,
            "description": self.description,
            "display_name": self.display_name(),
            "display_name_en": self.display_name("en"),
        }
        if with_roster:
            data["coaches"] = [c.to_dict() for c in sorted_coaches(self.coaches)]
            data["players"] = [
                m.to_dict() for m in self.memberships if m.end_date is None
            ]
        return data

    def __repr__(self) -> str:
        return f"<Tla3bnyTeam {self.id} {self.display_name()}>"


def teams_by_age(teams: list["Tla3bnyTeam"]) -> list["Tla3bnyTeam"]:
    """An academy's squads ordered by age, oldest players first.

    Age labels are birth years (2013 is an older group than 2016), so "older to
    younger" means ascending birth year. We sort on the age category's
    ``oldest_birth_year``, falling back to the numeric label, and break ties by
    class label so multiple squads in one age keep a stable order. Ages with no
    year fall to the end.
    """
    def key(t: "Tla3bnyTeam"):
        ac = t.age_category
        year = ac.oldest_birth_year if ac else None
        if year is None and ac and ac.label:
            try:
                year = int(ac.label)
            except (TypeError, ValueError):
                year = None
        return (year is None, year or 0, t.class_label or "", t.display_name())

    return sorted(teams, key=key)


def sorted_coaches(coaches: list["Tla3bnyCoach"]) -> list["Tla3bnyCoach"]:
    """Current coaches first, then by seniority rank, then manual sort_order."""
    current = [c for c in coaches if c.end_date is None]
    return sorted(
        current,
        key=lambda c: (
            c.sort_order,
            codes.COACH_ROLE_RANK.get(c.role_ar or "", codes.UNRANKED_COACH_ROLE),
            c.name or "",
        ),
    )


class Tla3bnyCoach(TimestampMixin, db.Model):
    """A coach/technical-staff member on a team, with a dated stint so they can
    move between academies (end the stint, start a new one elsewhere)."""

    __tablename__ = "tla3bny_coaches"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_teams.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    name_en: Mapped[str | None] = mapped_column(sa.String(255))
    role_ar: Mapped[str | None] = mapped_column(sa.String(120))
    license: Mapped[str | None] = mapped_column(sa.String(255))
    bio: Mapped[str | None] = mapped_column(sa.Text)
    phone: Mapped[str | None] = mapped_column(sa.String(50))
    photo_path: Mapped[str | None] = mapped_column(sa.String(512))
    start_date: Mapped[date | None] = mapped_column(sa.Date)
    end_date: Mapped[date | None] = mapped_column(sa.Date)
    sort_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    team: Mapped["Tla3bnyTeam"] = relationship(back_populates="coaches")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "team_id": self.team_id,
            "name": self.name,
            "name_en": self.name_en,
            "role_ar": self.role_ar,
            "license": self.license,
            "bio": self.bio,
            "phone": self.phone,
            "photo_path": self.photo_path,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "sort_order": self.sort_order,
        }


class Tla3bnyPlayer(TimestampMixin, db.Model):
    """A player *person*: stable identity + documents. Which team they're on
    (and when) lives in ``Tla3bnyPlayerTeam``, so moving academies never
    destroys the person, their papers, or their career events."""

    __tablename__ = "tla3bny_players"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    name_en: Mapped[str | None] = mapped_column(sa.String(255))
    dob: Mapped[date | None] = mapped_column(sa.Date)
    position: Mapped[str | None] = mapped_column(sa.String(50))
    sub_position: Mapped[str | None] = mapped_column(sa.String(50))
    photo_path: Mapped[str | None] = mapped_column(sa.String(512))
    # Convenience pointer to the primary uploaded document; full set in `files`.
    papers_path: Mapped[str | None] = mapped_column(sa.String(512))

    files: Mapped[list["Tla3bnyPlayerFile"]] = relationship(
        back_populates="player", cascade="all, delete-orphan"
    )
    memberships: Mapped[list["Tla3bnyPlayerTeam"]] = relationship(
        back_populates="player", cascade="all, delete-orphan"
    )

    def current_membership(self) -> "Tla3bnyPlayerTeam | None":
        for m in self.memberships:
            if m.end_date is None:
                return m
        return None

    def to_dict(self, with_files: bool = False) -> dict:
        """Public shape by default. The registration papers are private — pass
        ``with_files=True`` only for a caller the API has authorised (the owning
        academy/team, or an admin of a competition the player is entered in)."""
        cur = self.current_membership()
        data = {
            "id": self.id,
            "name": self.name,
            "name_en": self.name_en,
            "dob": self.dob.isoformat() if self.dob else None,
            "position": self.position,
            "sub_position": self.sub_position,
            "photo_path": self.photo_path,
            "current_team_id": cur.team_id if cur else None,
            "current_academy_id": (
                cur.team.academy_id if cur and cur.team else None
            ),
            "jersey_number": cur.jersey_number if cur else None,
        }
        if with_files:
            # papers_path (a legacy raw path) is intentionally not emitted: it now
            # points into the private upload dir and is superseded by files[], each
            # of which carries its own signed URL.
            data["files"] = [f.to_dict() for f in self.files]
            data["file_count"] = len(self.files)
        return data

    def __repr__(self) -> str:
        return f"<Tla3bnyPlayer {self.id} {self.name}>"


class Tla3bnyPlayerFile(TimestampMixin, db.Model):
    """A registration document uploaded for a player."""

    __tablename__ = "tla3bny_player_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_players.id", ondelete="CASCADE"), nullable=False
    )
    # The competition registration this paper was uploaded *for*. Documents are
    # required per competition (a new competition — or the same one next season —
    # needs its own fresh papers), so a file belongs to one Tla3bnyCompetitionPlayer
    # entry. Null means a legacy/global identity paper not tied to a competition.
    competition_player_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_competition_players.id", ondelete="CASCADE")
    )
    file_path: Mapped[str] = mapped_column(sa.String(512), nullable=False)
    original_name: Mapped[str | None] = mapped_column(sa.String(255))
    # Which required paper this file is (e.g. "شهادة الميلاد"); null for a
    # generic/legacy upload.
    label: Mapped[str | None] = mapped_column(sa.String(120))

    player: Mapped["Tla3bnyPlayer"] = relationship(back_populates="files")

    def to_dict(self) -> dict:
        # A short-lived signed URL, never the raw storage path: the document lives
        # under a private upload dir reachable only through the signed serve route,
        # so a leaked link expires instead of granting permanent public access.
        from app.services.tla3bny_auth import player_file_url

        return {
            "id": self.id,
            "player_id": self.player_id,
            "competition_player_id": self.competition_player_id,
            "file_path": player_file_url(self.id),
            "original_name": self.original_name,
            "label": self.label,
        }


class Tla3bnyPlayerTeam(TimestampMixin, db.Model):
    """A dated membership tying a player to a team (an academy's age squad).

    An open membership (``end_date`` is NULL) is the player's current team;
    moving academies means closing it and opening a new one elsewhere.
    """

    __tablename__ = "tla3bny_player_teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_players.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_teams.id", ondelete="CASCADE"), nullable=False
    )
    jersey_number: Mapped[int | None] = mapped_column(sa.Integer)
    start_date: Mapped[date | None] = mapped_column(sa.Date)
    end_date: Mapped[date | None] = mapped_column(sa.Date)
    status: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_MEMBERSHIP_STATUS),
        nullable=False,
        default="active",
    )

    player: Mapped["Tla3bnyPlayer"] = relationship(back_populates="memberships")
    team: Mapped["Tla3bnyTeam"] = relationship(back_populates="memberships")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "player_id": self.player_id,
            "player_name": self.player.name if self.player else None,
            "player_name_en": self.player.name_en if self.player else None,
            "photo_path": self.player.photo_path if self.player else None,
            "position": self.player.position if self.player else None,
            "team_id": self.team_id,
            "academy_id": self.team.academy_id if self.team else None,
            "jersey_number": self.jersey_number,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "status": self.status,
        }


# ── event data: seasons, competitions, registration ─────────────────────────
class Tla3bnySeason(TimestampMixin, db.Model):
    __tablename__ = "tla3bny_seasons"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(120), nullable=False, unique=True)
    name_ar: Mapped[str | None] = mapped_column(sa.String(120))
    name_en: Mapped[str | None] = mapped_column(sa.String(120))
    start_date: Mapped[date | None] = mapped_column(sa.Date)
    end_date: Mapped[date | None] = mapped_column(sa.Date)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    competitions: Mapped[list["Tla3bnyCompetition"]] = relationship(
        back_populates="season", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "name_ar": self.name_ar,
            "name_en": self.name_en,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "is_active": self.is_active,
            "sort_order": self.sort_order,
        }

    def __repr__(self) -> str:
        return f"<Tla3bnySeason {self.id} {self.name}>"


class Tla3bnyCompetition(TimestampMixin, db.Model):
    """A friendly competition inside a season. Covers one or more ages
    (``ages``), is run by one or more ``admins``, and carries its own news."""

    __tablename__ = "tla3bny_competitions"

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_seasons.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    name_en: Mapped[str | None] = mapped_column(sa.String(255))
    description: Mapped[str | None] = mapped_column(sa.Text)
    logo_path: Mapped[str | None] = mapped_column(sa.String(512))
    location: Mapped[str | None] = mapped_column(sa.String(255))
    start_date: Mapped[date | None] = mapped_column(sa.Date)
    end_date: Mapped[date | None] = mapped_column(sa.Date)
    status: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_COMPETITION_STATUS),
        nullable=False,
        default="draft",
    )
    # The registration papers this competition's admin demands for every player
    # entered into it — a free list, as long as they need (birth certificate,
    # school letter, national id, health certificate, ...). Null falls back to
    # codes.TLA3BNY_DEFAULT_PLAYER_DOCS. Each name becomes a labelled upload
    # slot on the player, and the uploads are visible to admins only.
    required_documents: Mapped[list | None] = mapped_column(sa.JSON)

    # ── the public "about this competition" page ────────────────────────────
    # ``description`` above is the one-line blurb shown on cards; ``info`` is
    # the long text of the info page (format, rules, fees, how to enter).
    info: Mapped[str | None] = mapped_column(sa.Text)
    organizer_name: Mapped[str | None] = mapped_column(sa.String(255))
    contact_phone: Mapped[str | None] = mapped_column(sa.String(50))
    # Digits only, international form (e.g. 201234567890). The frontend turns it
    # into a wa.me link; storing the number rather than a URL keeps the two ways
    # of reaching the organiser (call / chat) from drifting apart.
    whatsapp_number: Mapped[str | None] = mapped_column(sa.String(50))
    # A group/community invite (chat.whatsapp.com/...), when the organiser runs
    # one. Shown next to the direct-chat button.
    whatsapp_group_url: Mapped[str | None] = mapped_column(sa.String(512))
    facebook_url: Mapped[str | None] = mapped_column(sa.String(512))
    location_url: Mapped[str | None] = mapped_column(sa.String(1024))
    registration_open: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=True
    )
    # When True, a team entered here may not enter any other competition while
    # this one is live (see locks_team_entry). Default False: teams may play
    # several competitions at once (league + cup), since rosters and papers are
    # per-competition now. Organizers who want an exclusive competition opt in.
    exclusive_entry: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False, server_default=sa.false()
    )
    # The cap on how many players may take part in this competition across every
    # team. Set by the super admin at creation: tla3bny is billed on the number
    # of contributing players, so this is the size the organiser is paying for.
    # NULL means no cap has been set (unlimited / unpriced).
    max_players: Mapped[int | None] = mapped_column(sa.Integer)

    # ── sponsor ads (super-admin controlled, a paid feature) ────────────────
    # ``max_ads`` is how many sponsor ads this competition's admin may run —
    # the allowance the super admin grants per fees (0 = none yet).
    # ``ads_enabled`` is the instant kill switch: when False none of this
    # competition's ads show publicly, even if some exist (e.g. fees unpaid).
    max_ads: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=0, server_default="0"
    )
    ads_enabled: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=True, server_default=sa.true()
    )

    season: Mapped["Tla3bnySeason"] = relationship(back_populates="competitions")
    admins: Mapped[list["Tla3bnyCompetitionAdmin"]] = relationship(
        back_populates="competition", cascade="all, delete-orphan"
    )
    ages: Mapped[list["Tla3bnyCompetitionAge"]] = relationship(
        back_populates="competition", cascade="all, delete-orphan"
    )
    team_entries: Mapped[list["Tla3bnyCompetitionTeam"]] = relationship(
        back_populates="competition", cascade="all, delete-orphan"
    )
    news: Mapped[list["Tla3bnyNews"]] = relationship(
        back_populates="competition", cascade="all, delete-orphan"
    )
    ads: Mapped[list["Tla3bnyAd"]] = relationship(
        back_populates="competition", cascade="all, delete-orphan"
    )

    @property
    def documents(self) -> list[str]:
        return self.required_documents or list(codes.TLA3BNY_DEFAULT_PLAYER_DOCS)

    @property
    def locks_team_entry(self) -> bool:
        """While True, a team already entered here may not enter any other
        competition. Only competitions explicitly marked ``exclusive_entry`` lock,
        and only while still live — the competition is treated as over on the
        *second day after* its end date (open-ended with no end date keeps the
        lock). Non-exclusive competitions (the default) never lock, so a team may
        play several at once; its rosters and papers are per-competition anyway."""
        if not self.exclusive_entry:
            return False
        if self.end_date is None:
            return True
        return date.today() <= self.end_date + timedelta(days=1)

    def to_dict(self, with_ages: bool = False) -> dict:
        data = {
            "id": self.id,
            "season_id": self.season_id,
            "season_name": self.season.name if self.season else None,
            "name": self.name,
            "name_en": self.name_en,
            "description": self.description,
            "logo_path": self.logo_path,
            "location": self.location,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "status": self.status,
            "required_documents": self.documents,
            "info": self.info,
            "organizer_name": self.organizer_name,
            "contact_phone": self.contact_phone,
            "whatsapp_number": self.whatsapp_number,
            "whatsapp_group_url": self.whatsapp_group_url,
            "facebook_url": self.facebook_url,
            "location_url": self.location_url,
            "registration_open": self.registration_open,
            "exclusive_entry": self.exclusive_entry,
            "max_players": self.max_players,
            "max_ads": self.max_ads,
            "ads_enabled": self.ads_enabled,
        }
        if with_ages:
            data["ages"] = [a.to_dict() for a in self.ages]
        return data

    def __repr__(self) -> str:
        return f"<Tla3bnyCompetition {self.id} {self.name}>"


class Tla3bnyCompetitionAdmin(TimestampMixin, db.Model):
    """Assigns a ``competition_admin`` user to a competition (many-to-many)."""

    __tablename__ = "tla3bny_competition_admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_competitions.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_users.id", ondelete="CASCADE"), nullable=False
    )

    competition: Mapped["Tla3bnyCompetition"] = relationship(
        back_populates="admins"
    )
    user: Mapped["Tla3bnyUser"] = relationship()

    __table_args__ = (
        sa.UniqueConstraint(
            "competition_id", "user_id", name="uq_tla3bny_comp_admin"
        ),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "competition_id": self.competition_id,
            "user_id": self.user_id,
            "user_username": self.user.username if self.user else None,
            "user_login": (self.user.username or self.user.email) if self.user else None,
            "user_email": self.user.email if self.user else None,
            "user_name": self.user.name if self.user else None,
        }


class Tla3bnyCompetitionAge(TimestampMixin, db.Model):
    """A named sub-competition within a competition for a specific age bracket.

    The same age bracket may appear in multiple sub-competitions (e.g. "Class A
    2014" and "Class B 2014"). Each sub-competition carries its own rules and
    optional player-registration deadline.
    """

    __tablename__ = "tla3bny_competition_ages"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_competitions.id", ondelete="CASCADE"),
        nullable=False,
    )
    age_category_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_age_categories.id"), nullable=False
    )
    # Display name for this sub-competition (e.g. "Class A", "Elite Group").
    name: Mapped[str | None] = mapped_column(sa.String(200))
    # Public "about this sub-competition" text — shown to everyone, describing
    # what this bracket is (format, who it's for, notes). Set by the organizer.
    description: Mapped[str | None] = mapped_column(sa.Text)
    # Per-team entry fee for this sub-competition, in EGP. Shown ONLY to academy
    # accounts and the competition's admins — never to the anonymous public.
    subscription_fee: Mapped[Decimal | None] = mapped_column(sa.Numeric(10, 2))
    # Last day a player may be added or edited in this sub-competition's roster.
    player_registration_deadline: Mapped[date | None] = mapped_column(sa.Date)

    # Rules, set by the competition admin. Four independent caps:
    #   max_players_per_team — the team's registration list (e.g. 30)
    #   lineup_size          — players a coach names for one match (e.g. 12)
    #   players_on_pitch     — starters on the field (e.g. 5/6/7)
    #   max_substitutes      — substitutes named for the match (e.g. 3)
    max_players_per_team: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=30
    )
    lineup_size: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=12
    )
    players_on_pitch: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=5
    )
    max_substitutes: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=3
    )
    num_periods: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=2)
    period_minutes: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=20
    )
    # Extra-time format for knockout ties. Null means this sub-competition does
    # not play extra time (a level knockout goes straight to penalties).
    et_num_periods: Mapped[int | None] = mapped_column(sa.Integer)
    et_period_minutes: Mapped[int | None] = mapped_column(sa.Integer)
    # How long before kickoff a coach must have submitted the lineup.
    lineup_deadline_minutes: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=60
    )
    # Registration papers required for players in this sub-competition.
    # Null falls back to the competition's global list, then the age category default.
    required_documents: Mapped[list | None] = mapped_column(sa.JSON)

    # Replacement window: organizer opens this mid-season so academies can swap
    # up to max_replacements approved players for new ones.
    replacements_open: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False, server_default="0"
    )
    max_replacements: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=5, server_default="5"
    )
    # When True the coach must submit a formation (position assignments) with
    # the lineup, not just a player list.
    formation_required: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False, server_default="0"
    )

    competition: Mapped["Tla3bnyCompetition"] = relationship(back_populates="ages")
    age_category: Mapped["Tla3bnyAgeCategory"] = relationship()
    stages: Mapped[list["Tla3bnyStage"]] = relationship(
        back_populates="competition_age",
        cascade="all, delete-orphan",
        order_by="Tla3bnyStage.stage_order",
    )

    # No unique constraint — multiple sub-competitions per age are intentional.

    @property
    def display_name(self) -> str:
        age = self.age_category.label if self.age_category else ""
        return f"{self.name} · {age}" if self.name else age

    @property
    def documents(self) -> list[str]:
        """Falls back: per-sub-comp → competition global → age-category default."""
        if self.required_documents:
            return self.required_documents
        if self.competition and self.competition.required_documents:
            return self.competition.required_documents
        if self.age_category:
            return self.age_category.documents
        return list(codes.TLA3BNY_DEFAULT_PLAYER_DOCS)

    @property
    def registration_deadline_passed(self) -> bool:
        """True once the player-registration deadline is behind us. After it, a
        team can no longer add, remove or register players in this
        sub-competition (only the competition's admins still can)."""
        return bool(
            self.player_registration_deadline
            and date.today() > self.player_registration_deadline
        )

    def to_dict(self, with_stages: bool = False, include_fee: bool = False) -> dict:
        data = {
            "id": self.id,
            "competition_id": self.competition_id,
            "age_category_id": self.age_category_id,
            "age_category": (
                self.age_category.label if self.age_category else None
            ),
            "name": self.name,
            "description": self.description,
            "player_registration_deadline": (
                self.player_registration_deadline.isoformat()
                if self.player_registration_deadline else None
            ),
            "required_documents": self.documents,
            "max_players_per_team": self.max_players_per_team,
            "lineup_size": self.lineup_size,
            "players_on_pitch": self.players_on_pitch,
            "max_substitutes": self.max_substitutes,
            "num_periods": self.num_periods,
            "period_minutes": self.period_minutes,
            "et_num_periods": self.et_num_periods,
            "et_period_minutes": self.et_period_minutes,
            "lineup_deadline_minutes": self.lineup_deadline_minutes,
            "replacements_open": self.replacements_open,
            "max_replacements": self.max_replacements,
            "formation_required": self.formation_required,
            "oldest_birth_year": (
                self.age_category.oldest_birth_year if self.age_category else None
            ),
        }
        # The fee is entered by the organizer and shown to academies deciding
        # whether to enter — the caller (endpoint) decides who may see it. It is
        # omitted entirely for the public, not just nulled, so the client can tell
        # "not allowed to see" apart from "no fee set".
        if include_fee:
            data["subscription_fee"] = (
                float(self.subscription_fee)
                if self.subscription_fee is not None else None
            )
        if with_stages:
            data["stages"] = [s.to_dict(with_groups=True) for s in self.stages]
        return data


class Tla3bnyStage(TimestampMixin, db.Model):
    """A phase of a competition-age. ``stage_order`` drives progression 1,2,3…

    Mirrors youthscores' ``Stage``: type is group / league / knockout, and
    ``carries_points`` says whether a later stage's table continues from the
    earlier ones (True) or starts from zero counting only this stage's matches
    (False). Knockout stages produce a bracket, not a table.
    """

    __tablename__ = "tla3bny_stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_age_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_competition_ages.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str | None] = mapped_column(sa.String(120))
    stage_order: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False)
    type: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_STAGE_TYPE), nullable=False, default="league"
    )
    carries_points: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=True
    )

    competition_age: Mapped["Tla3bnyCompetitionAge"] = relationship(
        back_populates="stages"
    )
    groups: Mapped[list["Tla3bnyGroup"]] = relationship(
        back_populates="stage", cascade="all, delete-orphan"
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "competition_age_id", "stage_order", name="uq_tla3bny_stage_order"
        ),
    )

    @property
    def is_knockout(self) -> bool:
        return self.type == codes.TLA3BNY_STAGE_TYPE_KNOCKOUT

    def to_dict(self, with_groups: bool = False) -> dict:
        data = {
            "id": self.id,
            "competition_age_id": self.competition_age_id,
            "name": self.name,
            "stage_order": self.stage_order,
            "type": self.type,
            "carries_points": self.carries_points,
        }
        if with_groups:
            data["groups"] = [g.to_dict() for g in self.groups]
        return data

    def __repr__(self) -> str:
        return f"<Tla3bnyStage {self.id} {self.type} #{self.stage_order}>"


class Tla3bnyGroup(TimestampMixin, db.Model):
    """A group within a stage — Group A, B, …"""

    __tablename__ = "tla3bny_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    stage_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_stages.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str | None] = mapped_column(sa.String(80))

    stage: Mapped["Tla3bnyStage"] = relationship(back_populates="groups")
    team_entries: Mapped[list["Tla3bnyGroupTeam"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "stage_id": self.stage_id,
            "name": self.name,
            "team_ids": [gt.team_id for gt in self.team_entries],
        }

    def __repr__(self) -> str:
        return f"<Tla3bnyGroup {self.id} {self.name}>"


class Tla3bnyGroupTeam(TimestampMixin, db.Model):
    """Which teams belong to which group (lets a not-yet-played team still
    appear in its own table)."""

    __tablename__ = "tla3bny_group_teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_groups.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_teams.id", ondelete="CASCADE"), nullable=False
    )

    group: Mapped["Tla3bnyGroup"] = relationship(back_populates="team_entries")
    team: Mapped["Tla3bnyTeam"] = relationship()

    __table_args__ = (
        sa.UniqueConstraint("group_id", "team_id", name="uq_tla3bny_group_team"),
        sa.Index("ix_tla3bny_group_teams_team", "team_id"),
    )


class Tla3bnyCompetitionTeam(TimestampMixin, db.Model):
    """A team registered into a competition (added by a competition manager).

    ``age_category_id`` is copied from the team for convenient filtering. Its
    per-competition roster (with approval) lives in ``Tla3bnyCompetitionPlayer``.
    """

    __tablename__ = "tla3bny_competition_teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_competitions.id", ondelete="CASCADE"),
        nullable=False,
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_teams.id", ondelete="CASCADE"), nullable=False
    )
    age_category_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_age_categories.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_ENTRY_STATUS), nullable=False, default="active"
    )
    # Which sub-competition this team joined (nullable for legacy rows).
    competition_age_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_competition_ages.id", ondelete="SET NULL")
    )
    # Points docked from this team's table in this competition (belongs to the
    # entry, not the durable team).
    point_deduction: Mapped[int] = mapped_column(
        sa.SmallInteger, nullable=False, default=0
    )

    competition: Mapped["Tla3bnyCompetition"] = relationship(
        back_populates="team_entries"
    )
    team: Mapped["Tla3bnyTeam"] = relationship()
    competition_age: Mapped["Tla3bnyCompetitionAge | None"] = relationship()
    roster: Mapped[list["Tla3bnyCompetitionPlayer"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "competition_id", "team_id", name="uq_tla3bny_comp_team"
        ),
    )

    def to_dict(self, with_roster: bool = False, with_files: bool = False) -> dict:
        cage = self.competition_age
        data = {
            "id": self.id,
            "competition_id": self.competition_id,
            "competition_name": self.competition.name if self.competition else None,
            "team_id": self.team_id,
            "team_name": self.team.display_name() if self.team else None,
            "team_name_en": self.team.display_name("en") if self.team else None,
            "academy_id": self.team.academy_id if self.team else None,
            "academy_name": (
                self.team.academy.name if self.team and self.team.academy else None
            ),
            "academy_name_en": (
                self.team.academy.name_en if self.team and self.team.academy else None
            ),
            "academy_logo": (
                self.team.academy.logo_path
                if self.team and self.team.academy
                else None
            ),
            "age_category_id": self.age_category_id,
            "competition_age_id": self.competition_age_id,
            "sub_competition_name": cage.name if cage else None,
            "status": self.status,
            "point_deduction": self.point_deduction,
        }
        if with_roster:
            data["roster"] = [r.to_dict(with_files=with_files) for r in self.roster]
        return data


class Tla3bnyCompetitionPlayer(TimestampMixin, db.Model):
    """A player added to a team's roster *for a specific competition*, pending
    approval by that competition's admin (per-competition approval)."""

    __tablename__ = "tla3bny_competition_players"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_competition_teams.id", ondelete="CASCADE"),
        nullable=False,
    )
    player_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_players.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_PLAYER_STATUS), nullable=False, default="pending"
    )
    rejection_reason: Mapped[str | None] = mapped_column(sa.String(512))
    approved_by_user_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_users.id", ondelete="SET NULL")
    )

    entry: Mapped["Tla3bnyCompetitionTeam"] = relationship(back_populates="roster")
    player: Mapped["Tla3bnyPlayer"] = relationship()
    # The papers uploaded for *this* registration. Documents are per-competition,
    # so a player entered in two competitions keeps a separate set for each.
    files: Mapped[list["Tla3bnyPlayerFile"]] = relationship(
        "Tla3bnyPlayerFile",
        primaryjoin="Tla3bnyCompetitionPlayer.id == Tla3bnyPlayerFile.competition_player_id",
        viewonly=True,
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "competition_team_id", "player_id", name="uq_tla3bny_comp_player"
        ),
        # Backs the constant per-entry status counts (cap checks, dashboards,
        # approved-player totals) — the most-counted table in the module.
        sa.Index(
            "ix_tla3bny_competition_players_entry_status",
            "competition_team_id", "status",
        ),
    )

    @property
    def effective_files(self) -> list["Tla3bnyPlayerFile"]:
        """Papers that count for this registration: the ones uploaded *for it*,
        plus the player's global identity papers (``competition_player_id`` NULL,
        e.g. uploaded from the player's own profile). Either satisfies a required
        document — an organizer shouldn't see "no document" for a paper the player
        clearly has."""
        own = list(self.files)
        globals_ = [
            f for f in (self.player.files if self.player else [])
            if f.competition_player_id is None
        ]
        return own + globals_

    def to_dict(self, with_files: bool = False) -> dict:
        """The player's papers are private: ``with_files=True`` is for this
        competition's admin only, never the public roster."""
        p = self.player
        data = {
            "id": self.id,
            "competition_team_id": self.competition_team_id,
            "player_id": self.player_id,
            "player_name": p.name if p else None,
            "player_name_en": p.name_en if p else None,
            "photo_path": p.photo_path if p else None,
            "position": p.position if p else None,
            "dob": p.dob.isoformat() if p and p.dob else None,
            "status": self.status,
            "rejection_reason": self.rejection_reason,
        }
        if with_files:
            # This registration's own papers plus the player's global identity
            # papers — either satisfies a required document.
            files = self.effective_files
            # Per-age documents take precedence over the competition's global list.
            required = []
            if self.entry and self.entry.competition:
                cage = next(
                    (a for a in self.entry.competition.ages
                     if a.age_category_id == self.entry.age_category_id),
                    None,
                )
                required = cage.documents if cage else self.entry.competition.documents
            supplied = {f.label for f in files if f.label}
            data["files"] = [f.to_dict() for f in files]
            data["required_documents"] = required
            data["missing_documents"] = [d for d in required if d not in supplied]
        return data


# ── event data: matches, events, lineups, news ──────────────────────────────
class Tla3bnyMatch(TimestampMixin, db.Model):
    __tablename__ = "tla3bny_matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_competitions.id", ondelete="CASCADE"),
        nullable=False,
    )
    age_category_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_age_categories.id"), nullable=False
    )
    # The specific sub-competition this match belongs to (nullable for legacy rows).
    competition_age_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_competition_ages.id", ondelete="SET NULL")
    )
    # Which phase/group the fixture belongs to (null for a flat competition).
    stage_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_stages.id", ondelete="SET NULL")
    )
    group_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_groups.id", ondelete="SET NULL")
    )
    home_team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_teams.id"), nullable=False
    )
    away_team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_teams.id"), nullable=False
    )

    # Nullable: a fixture may be scheduled before its date is set (feed orders
    # with nullslast). Column name shadows the imported `date` type, so state it.
    date: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    time: Mapped[str | None] = mapped_column(sa.String(10))
    venue: Mapped[str | None] = mapped_column(sa.String(255))
    round: Mapped[str | None] = mapped_column(sa.String(120))

    # Match format (periods, players-per-side, substitutes, lineup deadline) is
    # not stored per match — it comes from this competition+age's
    # Tla3bnyCompetitionAge rules. See `rules` below.

    status: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_MATCH_STATUS), nullable=False, default="scheduled"
    )
    home_score: Mapped[int | None] = mapped_column(sa.Integer)
    away_score: Mapped[int | None] = mapped_column(sa.Integer)
    # Extra-time scores (cumulative from kick-off, e.g. 2-2 if 1-1 at 90 min
    # and each team scores once in ET). NULL means no extra time was played.
    home_score_et: Mapped[int | None] = mapped_column(sa.Integer)
    away_score_et: Mapped[int | None] = mapped_column(sa.Integer)
    # Penalty-shootout scores (e.g. 4-3). NULL means no shootout was played.
    home_score_pen: Mapped[int | None] = mapped_column(sa.Integer)
    away_score_pen: Mapped[int | None] = mapped_column(sa.Integer)
    note: Mapped[str | None] = mapped_column(sa.String(512))

    competition: Mapped["Tla3bnyCompetition"] = relationship()
    age_category: Mapped["Tla3bnyAgeCategory"] = relationship()
    competition_age: Mapped["Tla3bnyCompetitionAge | None"] = relationship()
    stage: Mapped["Tla3bnyStage | None"] = relationship()
    group: Mapped["Tla3bnyGroup | None"] = relationship()
    home_team: Mapped["Tla3bnyTeam"] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped["Tla3bnyTeam"] = relationship(foreign_keys=[away_team_id])
    events: Mapped[list["Tla3bnyMatchEvent"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )
    lineups: Mapped[list["Tla3bnyLineup"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )
    # The player-of-the-match honour for this match, if the organizer set one.
    player_of_match_award: Mapped["Tla3bnyAward | None"] = relationship(
        "Tla3bnyAward",
        primaryjoin=(
            "and_(Tla3bnyMatch.id == Tla3bnyAward.match_id, "
            "Tla3bnyAward.award_type == 'player_of_match')"
        ),
        viewonly=True,
        uselist=False,
    )

    __table_args__ = (
        # The matches feed and dashboards filter by competition + age + status…
        sa.Index(
            "ix_tla3bny_matches_comp_age_status",
            "competition_id", "age_category_id", "status",
        ),
        # …and order/range by date (no FK auto-index covers a plain column).
        sa.Index("ix_tla3bny_matches_date", "date"),
    )

    @property
    def match_date(self) -> datetime | None:
        """A datetime for sorting (combines date + optional HH:MM time). Named
        to match youthscores' Match so the shared standings engine can reuse it."""
        if self.date is None:
            return None
        hh, mm = 0, 0
        if self.time and ":" in self.time:
            try:
                hh, mm = (int(x) for x in self.time.split(":")[:2])
            except ValueError:
                hh, mm = 0, 0
        return datetime(self.date.year, self.date.month, self.date.day, hh, mm)

    @property
    def rules(self) -> "Tla3bnyCompetitionAge | None":
        """The sub-competition rules for this match.

        Prefers the explicit competition_age_id link (set on new matches).
        Falls back to the first matching age_category_id for legacy rows.
        """
        if self.competition_age_id and self.competition_age:
            return self.competition_age
        if not self.competition:
            return None
        for a in self.competition.ages:
            if a.age_category_id == self.age_category_id:
                return a
        return None

    def to_dict(self, include_events: bool = False) -> dict:
        home, away = self.home_team, self.away_team
        rules = self.rules
        data = {
            "id": self.id,
            "competition_id": self.competition_id,
            "competition_name": self.competition.name if self.competition else None,
            "age_category_id": self.age_category_id,
            "age_category": self.age_category.label if self.age_category else None,
            "competition_age_id": self.competition_age_id,
            "stage_id": self.stage_id,
            "stage_name": self.stage.name if self.stage else None,
            "stage_type": self.stage.type if self.stage else None,
            "group_id": self.group_id,
            "group_name": self.group.name if self.group else None,
            "home_team_id": self.home_team_id,
            "away_team_id": self.away_team_id,
            "home_team_name": home.display_name() if home else None,
            "away_team_name": away.display_name() if away else None,
            "home_team_name_en": home.display_name("en") if home else None,
            "away_team_name_en": away.display_name("en") if away else None,
            "home_academy_id": home.academy_id if home else None,
            "away_academy_id": away.academy_id if away else None,
            "home_logo": home.academy.logo_path if home and home.academy else None,
            "away_logo": away.academy.logo_path if away and away.academy else None,
            "date": self.date.isoformat() if self.date else None,
            "time": self.time,
            "venue": self.venue,
            "round": self.round,
            "rules": rules.to_dict() if rules else None,
            "status": self.status,
            "home_score": self.home_score,
            "away_score": self.away_score,
            "home_score_et": self.home_score_et,
            "away_score_et": self.away_score_et,
            "home_score_pen": self.home_score_pen,
            "away_score_pen": self.away_score_pen,
            "note": self.note,
        }
        pom = self.player_of_match_award
        data["player_of_match"] = (
            {
                "player_id": pom.player_id,
                "player_name": pom.player.name if pom.player else None,
                "player_name_en": pom.player.name_en if pom.player else None,
                "photo_path": pom.player.photo_path if pom.player else None,
            }
            if pom is not None and pom.player_id else None
        )
        if include_events:
            data["events"] = [
                e.to_dict()
                for e in sorted(
                    self.events,
                    key=lambda x: (x.minute if x.minute is not None else 999),
                )
            ]
        return data

    def __repr__(self) -> str:
        return f"<Tla3bnyMatch {self.id}>"


class Tla3bnyMatchEvent(TimestampMixin, db.Model):
    __tablename__ = "tla3bny_match_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_matches.id", ondelete="CASCADE"), nullable=False
    )
    player_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_players.id", ondelete="SET NULL")
    )
    team_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_teams.id", ondelete="SET NULL")
    )

    event_type: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_EVENT_TYPE), nullable=False
    )
    minute: Mapped[int | None] = mapped_column(sa.Integer)
    related_event_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_match_events.id", ondelete="SET NULL")
    )
    # Flags matching youthscores' MatchGoal / MatchCard / MatchSubstitution.
    is_extra_time: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    # Goal-only flags.
    is_own_goal: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    is_penalty: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    # Penalty-shootout-only fields (penalty_scored / penalty_missed event types).
    kick_order: Mapped[int | None] = mapped_column(sa.SmallInteger)
    is_winning_kick: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)

    match: Mapped["Tla3bnyMatch"] = relationship(back_populates="events")
    player: Mapped["Tla3bnyPlayer | None"] = relationship()

    __table_args__ = (
        # Analysis / top-scorer boards filter a match's events by type.
        sa.Index(
            "ix_tla3bny_match_events_match_type", "match_id", "event_type"
        ),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "match_id": self.match_id,
            "player_id": self.player_id,
            "player_name": self.player.name if self.player else None,
            "player_name_en": self.player.name_en if self.player else None,
            "team_id": self.team_id,
            "event_type": self.event_type,
            "minute": self.minute,
            "related_event_id": self.related_event_id,
            "is_extra_time": self.is_extra_time,
            "is_own_goal": self.is_own_goal,
            "is_penalty": self.is_penalty,
            "kick_order": self.kick_order,
            "is_winning_kick": self.is_winning_kick,
        }


class Tla3bnyLineup(TimestampMixin, db.Model):
    __tablename__ = "tla3bny_lineups"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_matches.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_teams.id", ondelete="CASCADE"), nullable=False
    )
    formation: Mapped[str | None] = mapped_column(sa.String(20))

    match: Mapped["Tla3bnyMatch"] = relationship(back_populates="lineups")
    team: Mapped["Tla3bnyTeam"] = relationship()
    slots: Mapped[list["Tla3bnyLineupSlot"]] = relationship(
        back_populates="lineup", cascade="all, delete-orphan"
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "match_id", "team_id", name="uq_tla3bny_lineup_match_team"
        ),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "match_id": self.match_id,
            "team_id": self.team_id,
            "team_name": self.team.display_name() if self.team else None,
            "formation": self.formation,
            "slots": [s.to_dict() for s in self.slots],
        }


class Tla3bnyLineupSlot(TimestampMixin, db.Model):
    __tablename__ = "tla3bny_lineup_slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    lineup_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_lineups.id", ondelete="CASCADE"), nullable=False
    )
    position_slot: Mapped[str | None] = mapped_column(sa.String(20))
    player_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_players.id", ondelete="SET NULL")
    )
    is_substitute: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False
    )

    lineup: Mapped["Tla3bnyLineup"] = relationship(back_populates="slots")
    player: Mapped["Tla3bnyPlayer | None"] = relationship()

    def to_dict(self) -> dict:
        p = self.player
        return {
            "id": self.id,
            "lineup_id": self.lineup_id,
            "position_slot": self.position_slot,
            "player_id": self.player_id,
            "player_name": p.name if p else None,
            "photo_path": p.photo_path if p else None,
            "is_substitute": self.is_substitute,
        }


class Tla3bnyNews(TimestampMixin, db.Model):
    """A news item, shaped like a youthscores one: a headline, a body, a date, a
    gallery of images and a published flag.

    ``competition_id`` is optional — a super admin posts site-wide news with it
    empty, while a competition admin posts to their own competition. The home
    page shows the combined feed; a competition's page filters to its own.
    """

    __tablename__ = "tla3bny_news"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_competitions.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(sa.Text)
    # The cover image — kept as its own column (rather than images[0]) because
    # every list view reads it and the gallery is optional.
    image_path: Mapped[str | None] = mapped_column(sa.String(512))
    # The rest of the gallery, uploaded paths or absolute URLs, cover first.
    images: Mapped[list | None] = mapped_column(sa.JSON)
    # The date the item is *about*, which the editor sets; published_at is when
    # it was written. Youthscores sorts and shows the former.
    news_date: Mapped[date | None] = mapped_column(sa.Date)
    is_published: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=True
    )
    published_at: Mapped[datetime] = mapped_column(
        sa.DateTime, nullable=False, default=datetime.utcnow
    )
    author_user_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_users.id", ondelete="SET NULL")
    )

    competition: Mapped["Tla3bnyCompetition | None"] = relationship(
        back_populates="news"
    )

    @property
    def gallery(self) -> list[str]:
        """Every image, cover first, with no duplicate of the cover."""
        rest = [i for i in (self.images or []) if i and i != self.image_path]
        return ([self.image_path] if self.image_path else []) + rest

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "competition_id": self.competition_id,
            "competition_name": self.competition.name if self.competition else None,
            "title": self.title,
            "body": self.body,
            "image_path": self.image_path,
            "images": self.gallery,
            "date": self.news_date.isoformat() if self.news_date else None,
            "is_published": self.is_published,
            "published_at": (
                self.published_at.isoformat() if self.published_at else None
            ),
        }

    def __repr__(self) -> str:
        return f"<Tla3bnyNews {self.id} {self.title}>"


class Tla3bnyAd(TimestampMixin, db.Model):
    """A sponsor advertisement: a poster plus contact/social buttons.

    ``competition_id`` is optional. NULL is a **home-screen ad**, owned by the
    super admin and shown to everyone alongside the cross-competition matches
    feed. A set ``competition_id`` is that competition's ad, managed by its
    admin and shown on the competition's match page and on the profiles of
    players entered in it — but only while the competition's ``ads_enabled`` is
    on and within its ``max_ads`` allowance (a paid feature the super admin
    controls).

    Only the fields a sponsor supplies are shown: each of the WhatsApp / phone /
    Facebook / Instagram / website buttons appears only when it has a value.
    """

    __tablename__ = "tla3bny_ads"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_competitions.id", ondelete="CASCADE"), index=True
    )
    sponsor_name: Mapped[str | None] = mapped_column(sa.String(255))
    caption: Mapped[str | None] = mapped_column(sa.String(512))
    poster_path: Mapped[str] = mapped_column(sa.String(512), nullable=False)

    # Contact / social. whatsapp_number and phone are digits; the rest are URLs.
    whatsapp_number: Mapped[str | None] = mapped_column(sa.String(50))
    phone: Mapped[str | None] = mapped_column(sa.String(50))
    facebook_url: Mapped[str | None] = mapped_column(sa.String(512))
    instagram_url: Mapped[str | None] = mapped_column(sa.String(512))
    website_url: Mapped[str | None] = mapped_column(sa.String(512))
    # A map link (typically a Google Maps URL) for the sponsor's location.
    location_url: Mapped[str | None] = mapped_column(sa.String(512))

    # Optional last day the ad is shown; NULL never expires. Past this date the
    # public reads drop the ad, but the owner still sees it (to renew or delete).
    expires_at: Mapped[date | None] = mapped_column(sa.Date)

    # The owner's own show/hide toggle (distinct from the super admin's
    # per-competition ads_enabled kill switch). sort_order ranks sponsors.
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=True, server_default=sa.true()
    )
    sort_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    competition: Mapped["Tla3bnyCompetition | None"] = relationship(
        back_populates="ads"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "competition_id": self.competition_id,
            "competition_name": self.competition.name if self.competition else None,
            "sponsor_name": self.sponsor_name,
            "caption": self.caption,
            "poster_path": self.poster_path,
            "whatsapp_number": self.whatsapp_number,
            "phone": self.phone,
            "facebook_url": self.facebook_url,
            "instagram_url": self.instagram_url,
            "website_url": self.website_url,
            "location_url": self.location_url,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "is_active": self.is_active,
            "sort_order": self.sort_order,
        }

    def __repr__(self) -> str:
        return f"<Tla3bnyAd {self.id} {self.sponsor_name or ''}>"


class Tla3bnyAdSettings(TimestampMixin, db.Model):
    """How the sponsor carousels display, as a single shared row (id=1): how many
    seconds each ad stays before rotating, and the poster size as a percentage.
    The super admin and competition admins both adjust these; they apply to every
    ad carousel (home and competition)."""

    __tablename__ = "tla3bny_ad_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    rotation_seconds: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=3, server_default="3"
    )
    poster_scale: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=100, server_default="100"
    )

    def to_dict(self) -> dict:
        return {"rotation_seconds": self.rotation_seconds, "poster_scale": self.poster_scale}

    @classmethod
    def get(cls) -> "Tla3bnyAdSettings":
        """The singleton settings row, created with defaults on first access."""
        obj = db.session.get(cls, 1)
        if obj is None:
            obj = cls(id=1)
            db.session.add(obj)
            db.session.commit()
        return obj


class Tla3bnyAuditLog(db.Model):
    """Immutable record of every significant admin action in the tla3bny system.

    Rows are only ever inserted, never updated or deleted.  The ``detail``
    JSON column stores human-readable context (names, scores, reasons) so the
    log remains readable even if the source rows are later changed or deleted.
    ``competition_id`` is indexed for fast per-competition history queries.
    """

    __tablename__ = "tla3bny_audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime, nullable=False, default=datetime.utcnow
    )
    actor_user_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(sa.String(80), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    target_id: Mapped[int | None] = mapped_column(sa.Integer)
    competition_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_competitions.id", ondelete="SET NULL"), index=True
    )
    detail: Mapped[dict | None] = mapped_column(sa.JSON)

    actor: Mapped["Tla3bnyUser | None"] = relationship(foreign_keys=[actor_user_id])

    def to_dict(self) -> dict:
        actor = self.actor
        return {
            "id": self.id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "actor_user_id": self.actor_user_id,
            "actor_name": actor.display_name() if actor else None,
            "actor_login": (actor.username or actor.email) if actor else None,
            "action": self.action,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "competition_id": self.competition_id,
            "detail": self.detail or {},
        }


# ── honours: titles, individual awards, best XI of the round ──────────────────
class Tla3bnyAward(TimestampMixin, db.Model):
    """One honour granted by a competition's organizer: a team title (champion,
    runner-up, third place) or an individual award (top scorer/assister, best
    player/goalkeeper, player of the match, player of the round).

    Scope is a sub-competition (``competition_age_id``) — each age bracket has its
    own champion and awards. ``match_id`` pins a player-of-the-match; ``round``
    (the free-text round label used on matches) pins a player-of-the-round. The
    recipient is a team for the title types (see ``codes.TLA3BNY_TEAM_AWARD_TYPES``)
    and a player for the rest. The "team of the round" best XI is a separate model.
    """

    __tablename__ = "tla3bny_awards"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_competitions.id", ondelete="CASCADE"), nullable=False
    )
    competition_age_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_competition_ages.id", ondelete="SET NULL")
    )
    award_type: Mapped[str] = mapped_column(
        code_enum(*codes.TLA3BNY_AWARD_TYPE), nullable=False
    )
    # player_of_round: the round label; player_of_match: the match.
    round: Mapped[str | None] = mapped_column(sa.String(120))
    match_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_matches.id", ondelete="CASCADE")
    )
    player_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_players.id", ondelete="CASCADE")
    )
    team_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_teams.id", ondelete="CASCADE")
    )
    note: Mapped[str | None] = mapped_column(sa.String(255))
    created_by_user_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_users.id", ondelete="SET NULL")
    )

    competition: Mapped["Tla3bnyCompetition"] = relationship()
    competition_age: Mapped["Tla3bnyCompetitionAge | None"] = relationship()
    player: Mapped["Tla3bnyPlayer | None"] = relationship()
    team: Mapped["Tla3bnyTeam | None"] = relationship()

    __table_args__ = (
        sa.Index("ix_tla3bny_awards_player", "player_id"),
        sa.Index("ix_tla3bny_awards_team", "team_id"),
        sa.Index("ix_tla3bny_awards_comp_age", "competition_id", "competition_age_id"),
    )

    def to_dict(self) -> dict:
        p = self.player
        t = self.team
        comp = self.competition
        cage = self.competition_age
        return {
            "id": self.id,
            "competition_id": self.competition_id,
            "competition_name": comp.name if comp else None,
            "competition_age_id": self.competition_age_id,
            "sub_competition_name": cage.name if cage else None,
            "age_label": cage.age_category.label if cage and cage.age_category else None,
            "award_type": self.award_type,
            "round": self.round,
            "match_id": self.match_id,
            "note": self.note,
            "player_id": self.player_id,
            "player_name": p.name if p else None,
            "player_name_en": p.name_en if p else None,
            "player_photo": p.photo_path if p else None,
            "team_id": self.team_id,
            "team_name": t.display_name() if t else None,
            "team_logo": (t.academy.logo_path if t and t.academy else None),
            "academy_id": (t.academy_id if t else None),
        }


class Tla3bnyTeamOfRound(TimestampMixin, db.Model):
    """The best XI of one round — a fantasy line-up the organizer picks from the
    standout players across *all* teams that played that round, placed by
    position. Scoped to a sub-competition + round label; one per (sub-comp, round).
    """

    __tablename__ = "tla3bny_team_of_round"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_competitions.id", ondelete="CASCADE"), nullable=False
    )
    competition_age_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_competition_ages.id", ondelete="SET NULL")
    )
    round: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    formation: Mapped[str | None] = mapped_column(sa.String(20))
    created_by_user_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_users.id", ondelete="SET NULL")
    )

    competition: Mapped["Tla3bnyCompetition"] = relationship()
    competition_age: Mapped["Tla3bnyCompetitionAge | None"] = relationship()
    slots: Mapped[list["Tla3bnyTeamOfRoundSlot"]] = relationship(
        back_populates="team_of_round", cascade="all, delete-orphan"
    )

    __table_args__ = (
        sa.Index(
            "ix_tla3bny_totr_comp_age_round",
            "competition_id", "competition_age_id", "round",
        ),
    )

    def to_dict(self) -> dict:
        cage = self.competition_age
        return {
            "id": self.id,
            "competition_id": self.competition_id,
            "competition_age_id": self.competition_age_id,
            "sub_competition_name": cage.name if cage else None,
            "round": self.round,
            "formation": self.formation,
            "slots": [s.to_dict() for s in sorted(self.slots, key=lambda x: x.sort_order)],
        }


class Tla3bnyTeamOfRoundSlot(TimestampMixin, db.Model):
    """One position in a team-of-the-round best XI: a player and where they sit."""

    __tablename__ = "tla3bny_team_of_round_slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_of_round_id: Mapped[int] = mapped_column(
        sa.ForeignKey("tla3bny_team_of_round.id", ondelete="CASCADE"), nullable=False
    )
    player_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("tla3bny_players.id", ondelete="SET NULL")
    )
    position_slot: Mapped[str | None] = mapped_column(sa.String(20))
    sort_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    team_of_round: Mapped["Tla3bnyTeamOfRound"] = relationship(back_populates="slots")
    player: Mapped["Tla3bnyPlayer | None"] = relationship()

    def to_dict(self) -> dict:
        p = self.player
        cur = p.current_membership() if p else None
        team = cur.team if cur else None
        return {
            "id": self.id,
            "team_of_round_id": self.team_of_round_id,
            "position_slot": self.position_slot,
            "sort_order": self.sort_order,
            "player_id": self.player_id,
            "player_name": p.name if p else None,
            "player_name_en": p.name_en if p else None,
            "photo_path": p.photo_path if p else None,
            "team_id": team.id if team else None,
            "team_name": team.display_name() if team else None,
        }
