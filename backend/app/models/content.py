"""Content the app serves that the design doc does not cover.

The current JSON feed carries news, ads and a venue directory, and each has its
own screen in both clients, so they need tables to move off the feed.
"""

from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampMixin, db


class Venue(TimestampMixin, db.Model):
    __tablename__ = "venues"

    id: Mapped[int] = mapped_column(primary_key=True)

    name_en: Mapped[str | None] = mapped_column(sa.String(160))
    name_ar: Mapped[str | None] = mapped_column(sa.String(160))
    url: Mapped[str | None] = mapped_column(sa.String(1024))  # map link (can be long)

    def __repr__(self) -> str:
        return f"<Venue {self.id} {self.name_ar or self.name_en}>"


class News(TimestampMixin, db.Model):
    __tablename__ = "news"

    id: Mapped[int] = mapped_column(primary_key=True)

    date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    title_en: Mapped[str | None] = mapped_column(sa.String(255))
    title_ar: Mapped[str | None] = mapped_column(sa.String(255))
    details_en: Mapped[str | None] = mapped_column(sa.Text)
    details_ar: Mapped[str | None] = mapped_column(sa.Text)
    image_url: Mapped[str | None] = mapped_column(sa.String(512))
    images: Mapped[list | None] = mapped_column(sa.JSON)  # gallery URLs
    is_published: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True)

    __table_args__ = (sa.Index("ix_news_date", "date"),)


class Ad(TimestampMixin, db.Model):
    __tablename__ = "ads"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(sa.String(160), nullable=False)
    image: Mapped[str | None] = mapped_column(sa.String(512))
    youtube_video: Mapped[str | None] = mapped_column(sa.String(512))
    facebook_link: Mapped[str | None] = mapped_column(sa.String(512))
    mobile_number: Mapped[str | None] = mapped_column(sa.String(40))
    whatsapp_number: Mapped[str | None] = mapped_column(sa.String(40))
    location: Mapped[str | None] = mapped_column(sa.String(255))
    location_url: Mapped[str | None] = mapped_column(sa.String(1024))  # map link (can be long)
    link: Mapped[str | None] = mapped_column(sa.String(1024))          # primary tap-through URL
    start_date: Mapped[date | None] = mapped_column(sa.Date)           # campaign start (null = now)
    expire_date: Mapped[date | None] = mapped_column(sa.Date)
    active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True)
    weight: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=1)  # rotation weight
    # Where the ad runs: interstitial (fullscreen), feed (native card), or both.
    placement: Mapped[str] = mapped_column(
        sa.String(16), nullable=False, default="interstitial")
    # Feed card slot: show the native card after the Nth match, counted from the
    # date the home feed lands on (today/nearest). 1 = right after the first match.
    feed_position: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=3)
    # Repeat the feed card every N matches after the first slot. Null = show once.
    feed_repeat: Mapped[int | None] = mapped_column(sa.Integer)

    __table_args__ = (sa.Index("ix_ads_expire", "expire_date"),)

    def shows_on(self, surface: str) -> bool:
        return self.placement == surface or self.placement == "both"

    def is_live(self, on: date | None = None) -> bool:
        d = on or date.today()
        if not self.active:
            return False
        if self.start_date is not None and self.start_date > d:
            return False
        if self.expire_date is not None and self.expire_date < d:
            return False
        return True


class AdEvent(db.Model):
    """First-party ad analytics: one row per impression or click.

    Written fire-and-forget from the public clients (no auth). An events table
    (rather than counters) keeps the full history so we can report per-ad totals
    and per-day time-series. Deleting an ad removes its events (CASCADE)."""

    __tablename__ = "ad_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    ad_id: Mapped[int] = mapped_column(
        sa.ForeignKey("ads.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(sa.String(16), nullable=False)  # impression | click
    platform: Mapped[str | None] = mapped_column(sa.String(16))       # android | web | ios
    placement: Mapped[str | None] = mapped_column(sa.String(16))      # interstitial | feed
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime, nullable=False, default=datetime.utcnow
    )

    __table_args__ = (
        sa.Index("ix_ad_events_ad_kind_ts", "ad_id", "kind", "created_at"),
    )


class AppVersion(TimestampMixin, db.Model):
    """Version gate the clients poll on startup."""

    __tablename__ = "app_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    platform: Mapped[str] = mapped_column(sa.String(20), nullable=False)  # android/web
    version_code: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    version_name: Mapped[str] = mapped_column(sa.String(40), nullable=False)
    force_update: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)

    __table_args__ = (sa.UniqueConstraint("platform", name="uq_app_version_platform"),)
