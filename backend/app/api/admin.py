"""Admin write endpoints, guarded by bearer-token role checks.

- Managing admin users requires the superadmin role.
- Content (news, venues) requires editor or above; creating news/venue also
  broadcasts a notification.

The ADMIN_API_KEY still works as a master key (see services/auth) for scripts.
"""

from __future__ import annotations

from datetime import date

from flask import Blueprint, current_app, jsonify, request

from app.extensions import db
from app.models import Ad, AdminUser, News, Venue
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
@auth.role_required("superadmin")
def update_user(user_id: int):
    user = db.session.get(AdminUser, user_id)
    if user is None:
        return jsonify({"error": "المستخدم غير موجود"}), 404

    j = request.get_json(silent=True) or {}
    me = auth.current_admin()

    if "full_name" in j:
        user.full_name = (j.get("full_name") or "").strip() or None
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
        if len(j["password"]) < 6:
            return jsonify({"error": "كلمة المرور يجب أن تكون 6 أحرف على الأقل"}), 400
        user.set_password(j["password"])

    db.session.commit()
    return jsonify({"user": auth.public_user(user)})


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
@auth.role_required("editor")
def upload_image():
    fs = request.files.get("file")
    if fs is None or not fs.filename:
        return jsonify({"error": "لم يتم اختيار ملف"}), 400
    try:
        name = images.process_upload(fs)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"url": f"{_base_url()}/uploads/{name}"})


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


# ── ads ──────────────────────────────────────────────────────────────────────
# The interstitial's fields: a name, an optional image, and any of several
# contact/links shown as buttons. No notification — an ad is not news.

# Optional string columns, set together on create and update. `name` is handled
# apart because it is required; `expire_date` because it is a date.
_AD_STR_FIELDS = (
    "image", "youtube_video", "facebook_link", "mobile_number",
    "whatsapp_number", "location", "location_url",
)


def _ad_dto(a: Ad) -> dict:
    return {
        "id": a.id, "name": a.name, "image": a.image,
        "youtube_video": a.youtube_video, "facebook_link": a.facebook_link,
        "mobile_number": a.mobile_number, "whatsapp_number": a.whatsapp_number,
        "location": a.location, "location_url": a.location_url,
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
    ad = Ad(name=name, expire_date=_parse_date(j.get("expire_date"), default_today=False))
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
    if "expire_date" in j:
        ad.expire_date = _parse_date(j.get("expire_date"), default_today=False)
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


@admin_bp.post("/api/push/subscribe")
def push_subscribe():
    """Public: a web client posts its FCM token to join the broadcast topics."""
    j = request.get_json(silent=True) or {}
    token = (j.get("token") or "").strip()
    if not token:
        return jsonify({"error": "token is required"}), 400
    results = {
        topic: notifications.subscribe_token_to_topic(token, topic)
        for topic in (notifications.TOPIC_NEWS, notifications.TOPIC_VENUES)
    }
    return jsonify({"subscribed": results})


# ── dashboard statistics ─────────────────────────────────────────────────────

@admin_bp.get("/api/admin/stats")
@auth.login_required
def stats():
    """Counts for the dashboard, for any signed-in admin.

    Deliberately no user numbers: push goes to an FCM topic and no device
    tokens are stored, so the backend has no idea how many people use the app
    and any figure here would be invented.
    """
    from app.models import (AgeGroup, Club, Coach, Competition, Match,
                            MatchGoal, Player, Season, Stage, Team)

    total_matches = Match.query.count()
    played = Match.query.filter_by(status=codes.MATCH_STATUS_COMPLETED).count()
    goals = MatchGoal.query.count()
    teams = Team.query.count()
    players = Player.query.count()

    seasons = Season.query.order_by(Season.start_date.desc()).all()
    active = next((s for s in seasons if s.is_active), None)

    # Per-competition rows, so the dashboard can show where entry is behind.
    per_comp = []
    for c in Competition.query.order_by(Competition.code, Competition.id).all():
        stage_ids = [s.id for s in Stage.query.filter_by(competition_id=c.id).all()]
        if stage_ids:
            q = Match.query.filter(Match.stage_id.in_(stage_ids))
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
            "seasons": len(seasons),
            "age_groups": AgeGroup.query.count(),
            "competitions": Competition.query.count(),
            "clubs": Club.query.count(),
            "teams": teams,
            "players": players,
            "coaches": Coach.query.count(),
            "matches": total_matches,
            "goals": goals,
            "news": News.query.count(),
            "venues": Venue.query.count(),
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
                teams / Competition.query.count(), 1) if Competition.query.count() else 0,
        },
        "active_season": (active.name_ar or active.name_en) if active else None,
        "competitions": per_comp,
    })
