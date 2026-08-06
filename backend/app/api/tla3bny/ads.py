"""Sponsor ads for tla3bny.

Two kinds, distinguished by ``competition_id``:

* **Home ads** (``competition_id`` NULL) — the super admin's own, shown on the
  home screen alongside the cross-competition matches feed.
* **Competition ads** — a competition admin's, shown on that competition's match
  page and on the profiles of players entered in it. They are a paid feature the
  super admin gates two ways: ``max_ads`` (how many the admin may create) and
  ``ads_enabled`` (an instant show/hide switch).

Only fields a sponsor supplies are returned; the client shows a button per
present contact (WhatsApp / call / Facebook / Instagram / website).
"""

import random
from datetime import date

from flask import jsonify
from sqlalchemy import or_

from app.extensions import db
from app.models import (
    Tla3bnyAd,
    Tla3bnyAdSettings,
    Tla3bnyCompetition,
    Tla3bnyCompetitionPlayer,
    Tla3bnyCompetitionTeam,
    Tla3bnyPlayer,
)
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import (
    _bool,
    _clean_url,
    _clip,
    _err,
    _forbid,
    _int,
    _parse_date,
    _read_payload,
    save_upload,
)


def _not_expired():
    """A filter clause: the ad has no expiry, or it has not passed yet."""
    return or_(Tla3bnyAd.expires_at.is_(None), Tla3bnyAd.expires_at >= date.today())


def _shuffled(ads):
    """Order the ads by priority, then randomly within each priority tier, afresh
    on every request. Higher ``sort_order`` always comes first (premium sponsors
    stay on top); ads of equal priority rotate so none is permanently buried and,
    when the layout has fewer slots than ads, which of them appear varies by
    visit. Applies to public reads only — the admin panels keep a stable order.

    Relies on Python's stable sort: shuffle first, then sort by priority, and the
    random order survives within each equal-priority group."""
    ads = list(ads)
    random.shuffle(ads)
    ads.sort(key=lambda a: a.sort_order, reverse=True)
    return ads


# The text/link fields an ad form submits, and how each is cleaned.
_AD_TEXT_FIELDS = (
    "sponsor_name", "caption", "whatsapp_number", "phone",
    "facebook_url", "instagram_url", "website_url", "location_url",
)


def _digits(value: str | None) -> str | None:
    """A phone/WhatsApp number reduced to digits (the form wa.me / tel: want)."""
    if not value:
        return None
    kept = "".join(ch for ch in value if ch.isdigit())
    return kept or None


_AD_URL_FIELDS = {"facebook_url", "instagram_url", "website_url", "location_url"}


def _apply_ad_text(ad: Tla3bnyAd, data) -> None:
    """Copy whichever text/link fields the caller sent onto the ad."""
    for field in _AD_TEXT_FIELDS:
        if field not in data:
            continue
        raw = data.get(field)
        if field in _AD_URL_FIELDS:
            value = _clean_url(raw)
        else:
            value = _clip(raw, 512)
        if field in ("whatsapp_number", "phone"):
            value = _digits(value)
        setattr(ad, field, value)


def _can_edit_ad(ad: Tla3bnyAd) -> bool:
    """A home ad is the super admin's; a competition ad is its admins'."""
    user = auth.current_user()
    if ad.competition_id is None:
        return bool(user and user.role == "super_admin")
    return auth.is_competition_admin(user, ad.competition_id)


# ── display settings (rotation speed + poster size) ──────────────────────────
@tla3bny_bp.get("/ads/settings")
def get_ad_settings():
    """How the carousels rotate/size their posters. Public — the clients read it."""
    return jsonify(Tla3bnyAdSettings.get().to_dict())


@tla3bny_bp.put("/ads/settings")
@auth.login_required
def update_ad_settings():
    """Adjust rotation speed / poster size. Super admin and competition admins may
    change them; the values are clamped to sane bounds."""
    user = auth.current_user()
    if not (user and user.role in ("super_admin", "competition_admin")):
        return _forbid()
    data, _ = _read_payload()
    s = Tla3bnyAdSettings.get()
    if "rotation_seconds" in data:
        s.rotation_seconds = max(1, min(30, _int(data.get("rotation_seconds"), s.rotation_seconds)))
    if "poster_scale" in data:
        s.poster_scale = max(50, min(200, _int(data.get("poster_scale"), s.poster_scale)))
    db.session.commit()
    return jsonify(s.to_dict())


# ── public reads ─────────────────────────────────────────────────────────────
@tla3bny_bp.get("/ads/home")
def list_home_ads():
    """Active home-screen ads (the super admin's), for everyone."""
    ads = (
        Tla3bnyAd.query
        .filter(Tla3bnyAd.competition_id.is_(None), Tla3bnyAd.is_active.is_(True), _not_expired())
        .all()
    )
    return jsonify([a.to_dict() for a in _shuffled(ads)])


@tla3bny_bp.get("/ads/home/all")
@auth.super_admin_required
def list_home_ads_admin():
    """Every home ad — active, hidden or expired — for the super admin's panel.
    The public ``/ads/home`` hides inactive/expired ones, which would make an ad
    vanish from the panel the moment it is hidden or lapses; the manager needs
    them all so they can be toggled back on, renewed or deleted."""
    ads = (
        Tla3bnyAd.query
        .filter(Tla3bnyAd.competition_id.is_(None))
        .order_by(Tla3bnyAd.sort_order.desc(), Tla3bnyAd.id.desc())
        .all()
    )
    return jsonify([a.to_dict() for a in ads])


@tla3bny_bp.get("/competitions/<int:comp_id>/ads")
def list_competition_ads(comp_id: int):
    """A competition's ads. The public sees only active ones, and only while the
    competition's ads are enabled; its admin sees them all (to manage)."""
    comp = Tla3bnyCompetition.query.get_or_404(comp_id)
    is_admin = auth.is_competition_admin(auth.current_user(), comp_id)
    q = Tla3bnyAd.query.filter_by(competition_id=comp_id)
    if not is_admin:
        if not comp.ads_enabled:
            return jsonify([])
        q = q.filter(Tla3bnyAd.is_active.is_(True), _not_expired())
    ads = q.order_by(Tla3bnyAd.sort_order, Tla3bnyAd.id.desc()).all()
    if is_admin:
        # The admin panel keeps a stable order and needs the gate state + allowance.
        return jsonify({
            "ads": [a.to_dict() for a in ads],
            "ads_enabled": comp.ads_enabled,
            "max_ads": comp.max_ads,
            "used": len(ads),
        })
    return jsonify([a.to_dict() for a in _shuffled(ads)])


@tla3bny_bp.get("/players/<int:player_id>/ads")
def list_player_ads(player_id: int):
    """Ads for a player's profile: the active ads of every competition the player
    is entered in, from competitions whose ads are enabled."""
    Tla3bnyPlayer.query.get_or_404(player_id)
    comp_ids = (
        db.session.query(Tla3bnyCompetitionTeam.competition_id)
        .join(
            Tla3bnyCompetitionPlayer,
            Tla3bnyCompetitionPlayer.competition_team_id == Tla3bnyCompetitionTeam.id,
        )
        .filter(Tla3bnyCompetitionPlayer.player_id == player_id)
        .distinct()
        .subquery()
    )
    ads = (
        Tla3bnyAd.query
        .join(Tla3bnyCompetition, Tla3bnyAd.competition_id == Tla3bnyCompetition.id)
        .filter(
            Tla3bnyAd.is_active.is_(True),
            _not_expired(),
            Tla3bnyCompetition.ads_enabled.is_(True),
            Tla3bnyAd.competition_id.in_(db.session.query(comp_ids.c.competition_id)),
        )
        .all()
    )
    return jsonify([a.to_dict() for a in _shuffled(ads)])


# ── writes ───────────────────────────────────────────────────────────────────
def _create_ad(competition_id: int | None):
    """Shared create for a home ad (competition_id None) or a competition ad."""
    data, files = _read_payload()
    poster = None
    try:
        if files is not None and files.get("poster"):
            poster = save_upload(files.get("poster"), kind="image")
    except ValueError as e:
        return _err(str(e))
    if not poster:
        return _err("poster image is required")
    ad = Tla3bnyAd(competition_id=competition_id, poster_path=poster)
    _apply_ad_text(ad, data)
    if "expires_at" in data:
        ad.expires_at = _parse_date(data.get("expires_at"))
    if "is_active" in data:
        ad.is_active = _bool(data.get("is_active"), True)
    if "sort_order" in data:
        ad.sort_order = _int(data.get("sort_order"), 0)
    db.session.add(ad)
    db.session.commit()
    return jsonify(ad.to_dict()), 201


@tla3bny_bp.post("/ads")
@auth.super_admin_required
def create_home_ad():
    """Super admin publishes a home-screen ad."""
    return _create_ad(None)


@tla3bny_bp.post("/competitions/<int:comp_id>/ads")
@auth.login_required
def create_competition_ad(comp_id: int):
    """A competition admin adds a sponsor ad, up to the super admin's allowance."""
    comp = Tla3bnyCompetition.query.get_or_404(comp_id)
    if not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    used = Tla3bnyAd.query.filter_by(competition_id=comp_id).count()
    if used >= comp.max_ads:
        return _err(
            f"Ad limit reached ({comp.max_ads}). Ask the administrator to raise it.",
            409,
        )
    return _create_ad(comp_id)


@tla3bny_bp.put("/ads/<int:ad_id>")
@auth.login_required
def update_ad(ad_id: int):
    ad = Tla3bnyAd.query.get_or_404(ad_id)
    if not _can_edit_ad(ad):
        return _forbid()
    data, files = _read_payload()
    _apply_ad_text(ad, data)
    if "expires_at" in data:
        ad.expires_at = _parse_date(data.get("expires_at"))
    if "is_active" in data:
        ad.is_active = _bool(data.get("is_active"), ad.is_active)
    if "sort_order" in data and _int(data.get("sort_order")) is not None:
        ad.sort_order = _int(data.get("sort_order"))
    try:
        if files is not None and files.get("poster"):
            ad.poster_path = save_upload(files.get("poster"), kind="image")
    except ValueError as e:
        return _err(str(e))
    db.session.commit()
    return jsonify(ad.to_dict())


@tla3bny_bp.delete("/ads/<int:ad_id>")
@auth.login_required
def delete_ad(ad_id: int):
    ad = Tla3bnyAd.query.get_or_404(ad_id)
    if not _can_edit_ad(ad):
        return _forbid()
    db.session.delete(ad)
    db.session.commit()
    return jsonify({"message": "deleted"})
