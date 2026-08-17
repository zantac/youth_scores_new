"""Admin write endpoints, guarded by bearer-token role checks.

- Managing admin users requires the superadmin role.
- Content (news, venues) requires editor or above; creating news/venue also
  broadcasts a notification.

The ADMIN_API_KEY still works as a master key (see services/auth) for scripts.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import sqlalchemy as sa
from flask import Blueprint, current_app, jsonify, request

from app.extensions import db, limiter
from app.models import Ad, AdEvent, AdminUser, AppVersion, Match, News, Venue
from app.models import codes
from app.services import auth, images, notifications

admin_bp = Blueprint("admin", __name__)


def _base_url() -> str:
    return (current_app.config.get("API_BASE_URL") or request.host_url).rstrip("/")


# ── admin user management (superadmin) ───────────────────────────────────────

@admin_bp.get("/api/admin/users")
@auth.role_required("superadmin")
def list_users():
    users = AdminUser.query.order_by(AdminUser.id).all()
    return jsonify({"users": [auth.public_user(u) for u in users]})


@admin_bp.post("/api/admin/users")
@limiter.limit("20 per hour")
@auth.role_required("superadmin")
def create_user():
    j = request.get_json(silent=True) or {}
    username = (j.get("username") or "").strip()
    password = j.get("password") or ""
    role = (j.get("role") or "clerk").strip()
    full_name = (j.get("full_name") or "").strip() or None

    if len(username) < 3:
        return jsonify({"error": "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"}), 400
    if len(password) < 8:
        return jsonify({"error": "كلمة المرور يجب أن تكون 8 أحرف على الأقل"}), 400
    if role not in codes.ADMIN_ROLE:
        return jsonify({"error": f"صلاحية غير معروفة: {role}"}), 400
    if AdminUser.query.filter_by(username=username).first():
        return jsonify({"error": "اسم المستخدم مستخدم بالفعل"}), 409

    user = AdminUser(username=username, full_name=full_name, role=role)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify({"user": auth.public_user(user)}), 201


@admin_bp.patch("/api/admin/users/<int:user_id>")
@limiter.limit("30 per hour")
@auth.role_required("superadmin")
def update_user(user_id: int):
    user = db.session.get(AdminUser, user_id)
    if user is None:
        return jsonify({"error": "المستخدم غير موجود"}), 404

    j = request.get_json(silent=True) or {}
    me = auth.current_admin()

    if "full_name" in j:
        user.full_name = (j.get("full_name") or "").strip() or None
    if "username" in j:
        username = (j.get("username") or "").strip()
        if len(username) < 3:
            return jsonify({"error": "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"}), 400
        clash = AdminUser.query.filter_by(username=username).first()
        if clash and clash.id != user.id:
            return jsonify({"error": "اسم المستخدم مستخدم بالفعل"}), 409
        user.username = username
    if "role" in j:
        role = (j.get("role") or "").strip()
        if role not in codes.ADMIN_ROLE:
            return jsonify({"error": f"صلاحية غير معروفة: {role}"}), 400
        # Don't let a superadmin strip their own powers and lock everyone out.
        if me and me.id == user.id and role != "superadmin":
            return jsonify({"error": "لا يمكنك تغيير صلاحية حسابك"}), 400
        user.role = role
    if "is_active" in j:
        active = bool(j.get("is_active"))
        if me and me.id == user.id and not active:
            return jsonify({"error": "لا يمكنك تعطيل حسابك"}), 400
        user.is_active = active
    if j.get("password"):
        if len(j["password"]) < 8:
            return jsonify({"error": "كلمة المرور يجب أن تكون 8 أحرف على الأقل"}), 400
        user.set_password(j["password"])

    db.session.commit()
    return jsonify({"user": auth.public_user(user)})


@admin_bp.delete("/api/admin/users/<int:user_id>")
@limiter.limit("30 per hour")
@auth.role_required("superadmin")
def delete_user(user_id: int):
    user = db.session.get(AdminUser, user_id)
    if user is None:
        return jsonify({"error": "المستخدم غير موجود"}), 404

    me = auth.current_admin()
    if me and me.id == user.id:
        return jsonify({"error": "لا يمكنك حذف حسابك"}), 400
    # Never remove the last superadmin who can still sign in, or the panel
    # locks everyone out.
    if user.role == "superadmin":
        other_active = AdminUser.query.filter(
            AdminUser.role == "superadmin",
            AdminUser.is_active.is_(True),
            AdminUser.id != user.id,
        ).count()
        if other_active == 0:
            return jsonify({"error": "لا يمكن حذف آخر مدير عام نشِط"}), 400

    db.session.delete(user)
    db.session.commit()
    return jsonify({"deleted": user_id})


# ── content (editor+) ────────────────────────────────────────────────────────

def _parse_date(value, default_today=True):
    if value:
        try:
            return date.fromisoformat(str(value))
        except ValueError:
            pass
    return date.today() if default_today else None


def _clean_images(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [u.strip() for u in raw if isinstance(u, str) and u.strip()]


def _news_dto(n: News) -> dict:
    return {
        "id": n.id, "date": n.date.isoformat(),
        "title_ar": n.title_ar, "title_en": n.title_en,
        "details_ar": n.details_ar, "details_en": n.details_en,
        "image_url": n.image_url, "images": n.images or [],
        "is_published": n.is_published,
    }


@admin_bp.post("/api/admin/upload")
@limiter.limit("120 per hour")
@auth.role_required("editor")
def upload_image():
    fs = request.files.get("file")
    if fs is None or not fs.filename:
        return jsonify({"error": "لم يتم اختيار ملف"}), 400
    try:
        name = images.process_upload(fs)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    # process_upload returns a full URL when S3/R2 is configured, else a bare
    # local filename served by the /uploads/ route.
    url = name if name.startswith("http") else f"{_base_url()}/uploads/{name}"
    return jsonify({"url": url})


@admin_bp.get("/api/admin/news")
@auth.role_required("editor")
def list_news():
    items = News.query.order_by(News.date.desc(), News.id.desc()).all()
    return jsonify({"news": [_news_dto(n) for n in items]})


@admin_bp.post("/api/admin/news")
@auth.role_required("editor")
def create_news():
    j = request.get_json(silent=True) or {}
    gallery = _clean_images(j.get("images"))
    news = News(
        date=_parse_date(j.get("date")),
        title_ar=(j.get("title_ar") or None),
        title_en=(j.get("title_en") or None),
        details_ar=(j.get("details_ar") or None),
        details_en=(j.get("details_en") or None),
        # image_url is the thumbnail; default it to the first gallery image.
        image_url=(j.get("image_url") or (gallery[0] if gallery else None)),
        images=(gallery or None),
        is_published=bool(j.get("is_published", True)),
    )
    if not (news.title_ar or news.title_en):
        return jsonify({"error": "العنوان مطلوب"}), 400

    db.session.add(news)
    db.session.commit()
    result = notifications.notify_new_news(news) if news.is_published else {"status": "skipped_draft"}
    return jsonify({"id": news.id, "notification": result, "news": _news_dto(news)}), 201


@admin_bp.patch("/api/admin/news/<int:nid>")
@auth.role_required("editor")
def update_news(nid: int):
    n = db.session.get(News, nid)
    if n is None:
        return jsonify({"error": "الخبر غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    for k in ("title_ar", "title_en", "details_ar", "details_en"):
        if k in j:
            setattr(n, k, (j.get(k) or None))
    if "images" in j:
        gallery = _clean_images(j.get("images"))
        n.images = gallery or None
        n.image_url = j.get("image_url") or (gallery[0] if gallery else None)
    if "date" in j:
        n.date = _parse_date(j.get("date"))
    if "is_published" in j:
        n.is_published = bool(j.get("is_published"))
    db.session.commit()
    return jsonify({"news": _news_dto(n)})


@admin_bp.delete("/api/admin/news/<int:nid>")
@auth.role_required("editor")
def delete_news(nid: int):
    n = db.session.get(News, nid)
    if n is None:
        return jsonify({"error": "الخبر غير موجود"}), 404
    db.session.delete(n)
    db.session.commit()
    return jsonify({"deleted": nid})


@admin_bp.post("/api/admin/venues")
@auth.role_required("editor")
def create_venue():
    j = request.get_json(silent=True) or {}
    if not (j.get("name_ar") or j.get("name_en")):
        return jsonify({"error": "اسم الملعب مطلوب"}), 400

    venue = Venue(
        name_ar=(j.get("name_ar") or None),
        name_en=(j.get("name_en") or None),
        url=(j.get("url") or None),
    )
    db.session.add(venue)
    db.session.commit()
    result = notifications.notify_new_venue(venue)
    return jsonify({"id": venue.id, "notification": result}), 201


def _venue_dto(v: Venue) -> dict:
    return {"id": v.id, "name_ar": v.name_ar, "name_en": v.name_en, "url": v.url}


@admin_bp.get("/api/admin/venues")
@auth.role_required("editor")
def list_venues():
    items = Venue.query.order_by(Venue.name_ar, Venue.name_en, Venue.id).all()
    return jsonify({"venues": [_venue_dto(v) for v in items]})


@admin_bp.patch("/api/admin/venues/<int:vid>")
@auth.role_required("editor")
def update_venue(vid: int):
    v = db.session.get(Venue, vid)
    if v is None:
        return jsonify({"error": "الملعب غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    if "name_ar" in j:
        v.name_ar = (j.get("name_ar") or None)
    if "name_en" in j:
        v.name_en = (j.get("name_en") or None)
    if "url" in j:
        v.url = (j.get("url") or None)
    if not (v.name_ar or v.name_en):
        return jsonify({"error": "اسم الملعب مطلوب"}), 400
    db.session.commit()
    return jsonify({"venue": _venue_dto(v)})


@admin_bp.delete("/api/admin/venues/<int:vid>")
@auth.role_required("editor")
def delete_venue(vid: int):
    v = db.session.get(Venue, vid)
    if v is None:
        return jsonify({"error": "الملعب غير موجود"}), 404
    # Matches keep their free-text venue name (venue_ar/venue_en); only the
    # directory link is cleared. This mirrors the FK's ON DELETE SET NULL and
    # works even where SQLite foreign-key enforcement is off.
    Match.query.filter_by(venue_id=vid).update({"venue_id": None})
    db.session.delete(v)
    db.session.commit()
    return jsonify({"deleted": vid})


# ── ads ──────────────────────────────────────────────────────────────────────
# The interstitial's fields: a name, an optional image, and any of several
# contact/links shown as buttons. No notification — an ad is not news.

# Optional string columns, set together on create and update. `name` is handled
# apart (required); dates, `active` and `weight` are handled by type.
_AD_STR_FIELDS = (
    "image", "youtube_video", "facebook_link", "mobile_number",
    "whatsapp_number", "location", "location_url", "link",
)


def _ad_weight(v) -> int:
    try:
        return max(1, int(v))
    except (TypeError, ValueError):
        return 1


_AD_PLACEMENTS = ("interstitial", "feed", "both")


def _ad_placement(v) -> str:
    return v if v in _AD_PLACEMENTS else "interstitial"


def _ad_position(v) -> int:
    try:
        return max(1, int(v))
    except (TypeError, ValueError):
        return 3


def _ad_repeat(v) -> int | None:
    if v is None or v == "":
        return None
    try:
        return max(1, int(v))
    except (TypeError, ValueError):
        return None


def _ad_dto(a: Ad) -> dict:
    return {
        "id": a.id, "name": a.name, "image": a.image,
        "youtube_video": a.youtube_video, "facebook_link": a.facebook_link,
        "mobile_number": a.mobile_number, "whatsapp_number": a.whatsapp_number,
        "location": a.location, "location_url": a.location_url, "link": a.link,
        "active": a.active, "weight": a.weight, "placement": a.placement,
        "feed_position": a.feed_position, "feed_repeat": a.feed_repeat,
        "start_date": a.start_date.isoformat() if a.start_date else None,
        "expire_date": a.expire_date.isoformat() if a.expire_date else None,
    }


@admin_bp.get("/api/admin/ads")
@auth.role_required("editor")
def list_ads():
    items = Ad.query.order_by(Ad.id.desc()).all()
    return jsonify({"ads": [_ad_dto(a) for a in items]})


@admin_bp.post("/api/admin/ads")
@auth.role_required("editor")
def create_ad():
    j = request.get_json(silent=True) or {}
    name = (j.get("name") or "").strip()
    if not name:
        return jsonify({"error": "اسم الإعلان مطلوب"}), 400
    ad = Ad(
        name=name,
        start_date=_parse_date(j.get("start_date"), default_today=False),
        expire_date=_parse_date(j.get("expire_date"), default_today=False),
        active=bool(j.get("active", True)),
        weight=_ad_weight(j.get("weight", 1)),
        placement=_ad_placement(j.get("placement")),
        feed_position=_ad_position(j.get("feed_position", 3)),
        feed_repeat=_ad_repeat(j.get("feed_repeat")),
    )
    for k in _AD_STR_FIELDS:
        setattr(ad, k, (j.get(k) or None))
    db.session.add(ad)
    db.session.commit()
    return jsonify({"ad": _ad_dto(ad)}), 201


@admin_bp.patch("/api/admin/ads/<int:aid>")
@auth.role_required("editor")
def update_ad(aid: int):
    ad = db.session.get(Ad, aid)
    if ad is None:
        return jsonify({"error": "الإعلان غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    if "name" in j:
        name = (j.get("name") or "").strip()
        if not name:
            return jsonify({"error": "اسم الإعلان مطلوب"}), 400
        ad.name = name
    for k in _AD_STR_FIELDS:
        if k in j:
            setattr(ad, k, (j.get(k) or None))
    if "start_date" in j:
        ad.start_date = _parse_date(j.get("start_date"), default_today=False)
    if "expire_date" in j:
        ad.expire_date = _parse_date(j.get("expire_date"), default_today=False)
    if "active" in j:
        ad.active = bool(j.get("active"))
    if "weight" in j:
        ad.weight = _ad_weight(j.get("weight"))
    if "placement" in j:
        ad.placement = _ad_placement(j.get("placement"))
    if "feed_position" in j:
        ad.feed_position = _ad_position(j.get("feed_position"))
    if "feed_repeat" in j:
        ad.feed_repeat = _ad_repeat(j.get("feed_repeat"))
    db.session.commit()
    return jsonify({"ad": _ad_dto(ad)})


@admin_bp.delete("/api/admin/ads/<int:aid>")
@auth.role_required("editor")
def delete_ad(aid: int):
    ad = db.session.get(Ad, aid)
    if ad is None:
        return jsonify({"error": "الإعلان غير موجود"}), 404
    db.session.delete(ad)
    db.session.commit()
    return jsonify({"deleted": aid})


# ── First-party ad analytics ─────────────────────────────────────────────────
# Public, fire-and-forget: the clients record an impression when an ad is shown
# and a click when a CTA is tapped. One row per event (see AdEvent) so we can
# report per-ad totals and daily trends without a third-party SDK.

def _record_ad_event(ad_id: int, kind: str):
    # Skip unknown ids quietly so a stale cached ad can't spam 404s meaningfully.
    if db.session.get(Ad, ad_id) is None:
        return jsonify({"ok": False}), 404
    j = request.get_json(silent=True) or {}
    platform = ((j.get("platform") or "").strip() or None)
    if platform:
        platform = platform[:16]
    placement = ((j.get("placement") or "").strip() or None)
    if placement:
        placement = placement[:16]
    db.session.add(AdEvent(ad_id=ad_id, kind=kind,
                           platform=platform, placement=placement))
    db.session.commit()
    return jsonify({"ok": True})


@admin_bp.post("/api/ads/<int:ad_id>/impression")
@limiter.limit("300 per minute")
def ad_impression(ad_id: int):
    return _record_ad_event(ad_id, "impression")


@admin_bp.post("/api/ads/<int:ad_id>/click")
@limiter.limit("120 per minute")
def ad_click(ad_id: int):
    return _record_ad_event(ad_id, "click")


@admin_bp.get("/api/admin/ads/stats")
@auth.role_required("editor")
def ad_stats():
    """Per-ad impression/click totals + a 30-day daily series (impr & clicks)."""
    since = datetime.utcnow() - timedelta(days=30)

    totals: dict[int, dict[str, int]] = {}
    for ad_id, kind, n in (
        db.session.query(AdEvent.ad_id, AdEvent.kind, sa.func.count())
        .group_by(AdEvent.ad_id, AdEvent.kind)
    ):
        row = totals.setdefault(ad_id, {"impressions": 0, "clicks": 0})
        if kind == "impression":
            row["impressions"] = n
        elif kind == "click":
            row["clicks"] = n

    ads_out = []
    for a in Ad.query.order_by(Ad.id.desc()).all():
        t = totals.get(a.id, {"impressions": 0, "clicks": 0})
        imp, clk = t["impressions"], t["clicks"]
        ads_out.append({
            "id": a.id,
            "name": a.name,
            "impressions": imp,
            "clicks": clk,
            "ctr": round(clk / imp * 100, 1) if imp else 0.0,
        })

    daily: dict[str, dict[str, int]] = {}
    for d, kind, n in (
        db.session.query(sa.func.date(AdEvent.created_at), AdEvent.kind, sa.func.count())
        .filter(AdEvent.created_at >= since)
        .group_by(sa.func.date(AdEvent.created_at), AdEvent.kind)
    ):
        row = daily.setdefault(str(d), {"impressions": 0, "clicks": 0})
        if kind == "impression":
            row["impressions"] = n
        elif kind == "click":
            row["clicks"] = n
    daily_out = [{"date": k, **v} for k, v in sorted(daily.items())]

    # Split by surface (feed vs interstitial) so the two placements can be
    # compared. Older events have a null placement -> grouped as "unknown".
    by_placement: dict[str, dict[str, int]] = {}
    for placement, kind, n in (
        db.session.query(AdEvent.placement, AdEvent.kind, sa.func.count())
        .group_by(AdEvent.placement, AdEvent.kind)
    ):
        row = by_placement.setdefault(placement or "unknown",
                                      {"impressions": 0, "clicks": 0})
        if kind == "impression":
            row["impressions"] = n
        elif kind == "click":
            row["clicks"] = n
    placement_out = [{"placement": k, **v} for k, v in sorted(by_placement.items())]

    return jsonify({"ads": ads_out, "daily": daily_out, "by_placement": placement_out})


# ── app version gate ─────────────────────────────────────────────────────────

def _app_version_dto(av: AppVersion | None) -> dict:
    return {
        "version_code": av.version_code if av else "1",
        "version_name": av.version_name if av else "1.0.0",
        "force_update": av.force_update if av else False,
    }


@admin_bp.get("/api/admin/app-version")
@auth.role_required("editor")
def get_app_version():
    av = AppVersion.query.filter_by(platform="android").first()
    return jsonify({"app_version": _app_version_dto(av)})


@admin_bp.put("/api/admin/app-version")
@auth.role_required("superadmin")
def set_app_version():
    """Upsert the Android release gate. Set version_code to the build number of
    the release you just published to Google Play; users on an older build then
    see the update dialog on next launch."""
    j = request.get_json(silent=True) or {}
    code = str(j.get("version_code") or "").strip()
    name = str(j.get("version_name") or "").strip()
    if not code.isdigit():
        return jsonify({"error": "رقم الإصدار (version_code) يجب أن يكون رقمًا"}), 400
    if not name:
        return jsonify({"error": "اسم الإصدار (version_name) مطلوب"}), 400

    av = AppVersion.query.filter_by(platform="android").first()
    if av is None:
        av = AppVersion(platform="android", version_code=code, version_name=name)
        db.session.add(av)
    else:
        av.version_code = code
        av.version_name = name
    av.force_update = bool(j.get("force_update"))
    db.session.commit()
    return jsonify({"app_version": _app_version_dto(av)})


def _push_token(j: dict) -> str | None:
    """A plausible FCM registration token from the body, or None.

    Tokens are ~140-200 char URL-safe strings; reject anything implausible before
    spending FCM API calls on it (abuse/amplification guard)."""
    token = (j.get("token") or "").strip()
    return token if 100 <= len(token) <= 400 else None


@admin_bp.post("/api/push/subscribe")
@limiter.limit("30 per minute")
def push_subscribe():
    """Public: a web client posts its FCM token to join the always-on topics.

    News and venues broadcast to everyone. Round results are per-competition now
    (Phase 2) — those are joined via /api/push/follow, not here."""
    token = _push_token(request.get_json(silent=True) or {})
    if not token:
        return jsonify({"error": "token is required"}), 400
    results = {
        topic: notifications.subscribe_token_to_topic(token, topic)
        for topic in (notifications.TOPIC_NEWS, notifications.TOPIC_VENUES)
    }
    return jsonify({"subscribed": results})


@admin_bp.post("/api/push/follow")
@limiter.limit("60 per minute")
def push_follow():
    """Public: subscribe a web client's token to one competition's round-results
    topic (the user tapped "follow" on that league). Idempotent."""
    j = request.get_json(silent=True) or {}
    token = _push_token(j)
    if not token:
        return jsonify({"error": "token is required"}), 400
    try:
        cid = int(j.get("competition_id"))
    except (TypeError, ValueError):
        cid = 0
    if cid <= 0:
        return jsonify({"error": "competition_id is required"}), 400
    result = notifications.subscribe_token_to_topic(token, notifications.competition_topic(cid))
    return jsonify({"followed": cid, "result": result})


@admin_bp.post("/api/push/unfollow")
@limiter.limit("60 per minute")
def push_unfollow():
    """Public: unsubscribe a web client's token from one competition's topic."""
    j = request.get_json(silent=True) or {}
    token = _push_token(j)
    if not token:
        return jsonify({"error": "token is required"}), 400
    try:
        cid = int(j.get("competition_id"))
    except (TypeError, ValueError):
        cid = 0
    if cid <= 0:
        return jsonify({"error": "competition_id is required"}), 400
    result = notifications.unsubscribe_token_from_topic(token, notifications.competition_topic(cid))
    return jsonify({"unfollowed": cid, "result": result})


@admin_bp.post("/api/push/follow-team")
@limiter.limit("60 per minute")
def push_follow_team():
    """Public: subscribe a web client's token to one team's results topic (the
    user tapped "follow" on that team). Idempotent. The native app subscribes to
    team_<id> itself via the FCM SDK; web has no client-side topic API, so it
    routes the follow through the server here."""
    j = request.get_json(silent=True) or {}
    token = _push_token(j)
    if not token:
        return jsonify({"error": "token is required"}), 400
    try:
        tid = int(j.get("team_id"))
    except (TypeError, ValueError):
        tid = 0
    if tid <= 0:
        return jsonify({"error": "team_id is required"}), 400
    result = notifications.subscribe_token_to_topic(token, notifications.team_topic(tid))
    return jsonify({"followed_team": tid, "result": result})


@admin_bp.post("/api/push/unfollow-team")
@limiter.limit("60 per minute")
def push_unfollow_team():
    """Public: unsubscribe a web client's token from one team's topic."""
    j = request.get_json(silent=True) or {}
    token = _push_token(j)
    if not token:
        return jsonify({"error": "token is required"}), 400
    try:
        tid = int(j.get("team_id"))
    except (TypeError, ValueError):
        tid = 0
    if tid <= 0:
        return jsonify({"error": "team_id is required"}), 400
    result = notifications.unsubscribe_token_from_topic(token, notifications.team_topic(tid))
    return jsonify({"unfollowed_team": tid, "result": result})


# ── global admin search ───────────────────────────────────────────────────────

@admin_bp.get("/api/admin/search")
@auth.login_required
def admin_search():
    """Find a club, team or player by name — so an admin can jump straight to it
    to edit or remove. A team has no name of its own (it is a club + age group),
    so teams are matched by their club's name."""
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify({"clubs": [], "teams": [], "players": [], "coaches": []})

    from app.models import Club, Coach, Player, Team

    like = f"%{q}%"
    clubs = (
        Club.query
        .filter(db.or_(Club.name_ar.ilike(like), Club.name_en.ilike(like)))
        .order_by(Club.name_ar)
        .limit(15).all()
    )
    teams = (
        Team.query.join(Club, Team.club_id == Club.id)
        .filter(db.or_(Club.name_ar.ilike(like), Club.name_en.ilike(like)))
        .order_by(Club.name_ar)
        .limit(20).all()
    )
    players = (
        Player.query
        .filter(db.or_(Player.full_name_ar.ilike(like), Player.full_name_en.ilike(like)))
        .order_by(Player.full_name_ar)
        .limit(20).all()
    )
    coaches = (
        Coach.query
        .filter(db.or_(Coach.full_name_ar.ilike(like), Coach.full_name_en.ilike(like)))
        .order_by(Coach.full_name_ar)
        .limit(20).all()
    )

    def team_label(t) -> str:
        club = (t.club.name_ar or t.club.name_en) if t.club else ""
        age = (t.age_group.name_ar or t.age_group.name_en) if t.age_group else ""
        return " — ".join(x for x in (club, age) if x)

    def current_team_id(p):
        cur = next((r for r in p.registrations if r.end_date is None), None)
        return cur.team_id if cur else None

    def coach_team_id(c):
        # Current stint if any, else the most recent one — the team page where
        # this coach is edited (in the technical-staff section).
        cur = next((tc for tc in c.team_roles if tc.end_date is None), None)
        if cur:
            return cur.team_id
        stints = sorted(c.team_roles, key=lambda tc: tc.start_date or date.min, reverse=True)
        return stints[0].team_id if stints else None

    def player_club(p):
        # The club the player currently plays for (else their most recent one),
        # so a search row is not just a name + birth year.
        cur = next((r for r in p.registrations if r.end_date is None), None)
        if cur is None:
            regs = sorted(p.registrations, key=lambda r: r.start_date or date.min, reverse=True)
            cur = regs[0] if regs else None
        club = cur.team.club if cur and cur.team else None
        return (club.name_ar or club.name_en) if club else None

    def coach_role_and_club(c):
        # A person's actual current post + its club — a team-coaching stint or a
        # club youth-sector role, current first then newest — so "مدرب" is not
        # shown for a doctor or an administrator.
        stints = []
        for tc in c.team_roles:
            club = tc.team.club if tc.team else None
            stints.append((tc.end_date is None, tc.start_date or date.min, tc.role_ar or tc.role_en, club))
        for cs in c.club_roles:
            stints.append((cs.end_date is None, cs.start_date or date.min, cs.role_ar or cs.role_en, cs.club))
        if not stints:
            return None, None
        stints.sort(key=lambda s: (s[0], s[1]), reverse=True)
        _, _, role, club = stints[0]
        return role, ((club.name_ar or club.name_en) if club else None)

    coach_meta = {c.id: coach_role_and_club(c) for c in coaches}

    return jsonify({
        "clubs": [{
            "id": c.id,
            "name": c.name_ar or c.name_en or "",
            "city": c.city_ar or c.city_en or "",
            "logo": c.logo_url,
        } for c in clubs],
        "teams": [{
            "id": t.id,
            "name": team_label(t),
            "logo": t.club.logo_url if t.club else None,
        } for t in teams],
        "players": [{
            "id": p.id,
            "name": p.full_name_ar or p.full_name_en or "",
            "birth_year": p.birth_year,
            "club": player_club(p),
            # Players are edited/removed from their team's roster.
            "team_id": current_team_id(p),
        } for p in players],
        "coaches": [{
            "id": c.id,
            "name": c.full_name_ar or c.full_name_en or "",
            "role": coach_meta[c.id][0],
            "club": coach_meta[c.id][1],
            # The team whose technical-staff section edits this coach.
            "team_id": coach_team_id(c),
        } for c in coaches],
    })


# ── dashboard statistics ─────────────────────────────────────────────────────

@admin_bp.get("/api/admin/stats")
@auth.login_required
def stats():
    """Counts for the dashboard, for any signed-in admin.

    Deliberately no user numbers: push goes to an FCM topic and no device
    tokens are stored, so the backend has no idea how many people use the app
    and any figure here would be invented.

    Optional ``season_id`` / ``competition_id`` query params scope every figure
    to a season or a single competition. A competition implies its season, so
    the filter always resolves to exactly one season; counts that have no
    competition link (news) are scoped by that season's date window instead.
    The full season/competition lists ride along under ``filters`` so the
    dashboard's dropdowns work for every admin, including clerks who cannot
    reach the editor-only management endpoints.
    """
    from app.models import (AgeGroup, Club, Coach, Competition,
                            CompetitionTeam, Match, MatchGoal, Player,
                            PlayerTeam, Season, Stage, Team, TeamCoach)

    season_id = request.args.get("season_id", type=int)
    competition_id = request.args.get("competition_id", type=int)

    seasons = Season.query.order_by(Season.start_date.desc()).all()
    active = next((s for s in seasons if s.is_active), None)
    ages = AgeGroup.query.all()
    age_name = {a.id: (a.name_ar or a.name_en or "") for a in ages}

    all_comps = Competition.query.order_by(Competition.code, Competition.id).all()

    # Resolve the filter to a set of competitions (a competition wins over a
    # season, since it already names one).
    if competition_id:
        comps = [c for c in all_comps if c.id == competition_id]
    elif season_id:
        comps = [c for c in all_comps if c.season_id == season_id]
    else:
        comps = all_comps
    filtered = bool(season_id or competition_id)
    comp_ids = [c.id for c in comps]
    filter_season = (
        next((s for s in seasons if s.id == comps[0].season_id), None)
        if filtered and comps else None
    )

    # Stages of the in-scope competitions, fetched once and grouped, so the
    # per-competition rows below don't run a query each.
    stages = (
        Stage.query.filter(Stage.competition_id.in_(comp_ids)).all()
        if comp_ids else []
    )
    stages_by_comp: dict[int, list[int]] = {}
    for st in stages:
        stages_by_comp.setdefault(st.competition_id, []).append(st.id)
    stage_ids = [st.id for st in stages]

    def scoped_matches():
        return Match.query.filter(
            Match.stage_id.in_(stage_ids), Match.deleted_at.is_(None)
        )

    if filtered:
        team_ids = [
            r[0] for r in db.session.query(CompetitionTeam.team_id)
            .filter(CompetitionTeam.competition_id.in_(comp_ids)).distinct()
        ] if comp_ids else []

        if stage_ids:
            total_matches = scoped_matches().count()
            played = scoped_matches().filter_by(
                status=codes.MATCH_STATUS_COMPLETED).count()
            goals = (
                MatchGoal.query.join(Match, MatchGoal.match_id == Match.id)
                .filter(Match.stage_id.in_(stage_ids), Match.deleted_at.is_(None))
                .count()
            )
            venues = (
                db.session.query(Match.venue_id)
                .filter(Match.stage_id.in_(stage_ids), Match.deleted_at.is_(None),
                        Match.venue_id.isnot(None))
                .distinct().count()
            )
        else:
            total_matches = played = goals = venues = 0

        teams = len(team_ids)
        players = (
            db.session.query(PlayerTeam.player_id)
            .filter(PlayerTeam.team_id.in_(team_ids)).distinct().count()
            if team_ids else 0
        )
        clubs = (
            db.session.query(Team.club_id)
            .filter(Team.id.in_(team_ids)).distinct().count()
            if team_ids else 0
        )
        coaches = (
            db.session.query(TeamCoach.coach_id)
            .filter(TeamCoach.team_id.in_(team_ids)).distinct().count()
            if team_ids else 0
        )
        seasons_count = len({c.season_id for c in comps})
        age_groups = len({c.age_group_id for c in comps if c.age_group_id is not None})
        competitions_count = len(comp_ids)
        # News has no competition link, so it's scoped to the season's dates.
        news = (
            News.query.filter(News.date >= filter_season.start_date,
                              News.date <= filter_season.end_date).count()
            if filter_season else 0
        )
    else:
        # Whole-database totals (the unfiltered dashboard).
        total_matches = Match.query.filter(Match.deleted_at.is_(None)).count()
        played = Match.query.filter(
            Match.deleted_at.is_(None),
            Match.status == codes.MATCH_STATUS_COMPLETED,
        ).count()
        goals = (
            MatchGoal.query.join(Match, MatchGoal.match_id == Match.id)
            .filter(Match.deleted_at.is_(None)).count()
        )
        teams = Team.query.count()
        players = Player.query.count()
        clubs = Club.query.count()
        coaches = Coach.query.count()
        seasons_count = len(seasons)
        age_groups = len(ages)
        competitions_count = len(all_comps)
        news = News.query.count()
        venues = Venue.query.count()

    # Per-competition rows, so the dashboard can show where entry is behind.
    per_comp = []
    for c in comps:
        c_stage_ids = stages_by_comp.get(c.id, [])
        if c_stage_ids:
            q = Match.query.filter(
                Match.stage_id.in_(c_stage_ids), Match.deleted_at.is_(None)
            )
            tot = q.count()
            done = q.filter_by(status=codes.MATCH_STATUS_COMPLETED).count()
        else:
            tot = done = 0
        per_comp.append({
            "id": c.id,
            "name": c.name_ar or c.name_en or "",
            "sector": c.sector_ar or c.sector_en or "",
            "played": done, "total": tot,
        })

    return jsonify({
        "counts": {
            "seasons": seasons_count,
            "age_groups": age_groups,
            "competitions": competitions_count,
            "clubs": clubs,
            "teams": teams,
            "players": players,
            "coaches": coaches,
            "matches": total_matches,
            "goals": goals,
            "news": news,
            "venues": venues,
        },
        "matches": {
            "total": total_matches,
            "played": played,
            "remaining": total_matches - played,
        },
        "averages": {
            # Rounded here so every client shows the same figure.
            "goals_per_match": round(goals / played, 2) if played else 0,
            "players_per_team": round(players / teams, 1) if teams else 0,
            "teams_per_competition": round(
                teams / competitions_count, 1) if competitions_count else 0,
        },
        "active_season": (active.name_ar or active.name_en) if active else None,
        "competitions": per_comp,
        # Full lists for the dashboard's season/competition filter, always
        # returned in full so the dropdowns stay populated under any filter.
        "filters": {
            "seasons": [
                {"id": s.id, "name": s.name_ar or s.name_en or ""}
                for s in seasons
            ],
            "competitions": [
                {"id": c.id, "season_id": c.season_id,
                 "name": c.name_ar or c.name_en or "",
                 "sector": c.sector_ar or c.sector_en or "",
                 "age": age_name.get(c.age_group_id, "")}
                for c in all_comps
            ],
        },
    })
