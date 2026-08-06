from datetime import datetime

from flask import jsonify, request

from app.extensions import db
from app.models import Tla3bnyCompetition, Tla3bnyMatch, Tla3bnyNews
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import _bool, _clip, _err, _forbid, _parse_date, _read_payload, _utcnow, save_upload


def _news_images(data, files) -> list[str] | None:
    """The gallery a news form submitted: any number of already-uploaded paths
    or absolute URLs (``images``) plus freshly attached files (``image`` /
    ``images[]``). Returns None when the form said nothing about images, so an
    edit that leaves them alone keeps what is stored."""
    given: list[str] = []
    said_something = False

    if hasattr(data, "getlist"):
        if "images" in data:
            said_something = True
            given += [str(v).strip() for v in data.getlist("images") if str(v).strip()]
    elif "images" in data:
        said_something = True
        raw = data.get("images")
        if isinstance(raw, list):
            given += [str(v).strip() for v in raw if str(v).strip()]

    if files is not None:
        attached = files.getlist("images") if hasattr(files, "getlist") else []
        if files.get("image"):
            attached = [files.get("image")] + list(attached)
        for f in attached:
            if f is None or not f.filename:
                continue
            said_something = True
            path = save_upload(f, kind="image")
            if path:
                given.append(path)

    if not said_something:
        return None
    return list(dict.fromkeys(given))


def _can_edit_news(n: Tla3bnyNews) -> bool:
    """Site-wide news (no competition) is the super admin's; a competition's
    news is its admins'."""
    user = auth.current_user()
    if n.competition_id is None:
        return bool(user and user.role == "super_admin")
    return auth.is_competition_admin(user, n.competition_id)


@tla3bny_bp.get("/news")
def list_news():
    """Published news, newest first. An editor asks for ``drafts=1`` to see
    their unpublished ones too."""
    q = Tla3bnyNews.query
    comp_id = request.args.get("competition_id", type=int)
    if comp_id:
        q = q.filter_by(competition_id=comp_id)
    if request.args.get("scope") == "site":
        q = q.filter(Tla3bnyNews.competition_id.is_(None))

    user = auth.current_user()
    wants_drafts = request.args.get("drafts") == "1" and user is not None
    if not wants_drafts:
        q = q.filter(Tla3bnyNews.is_published.is_(True))

    limit = min(request.args.get("limit", type=int) or 50, 200)
    # Newest first by the date the editor set, then by when it was written.
    # No NULLS LAST here: MySQL rejects it, and both engines already sort NULL
    # as the smallest value, so a dateless item lands at the bottom of a DESC.
    items = (
        q.order_by(Tla3bnyNews.news_date.desc(), Tla3bnyNews.published_at.desc())
        .limit(limit)
        .all()
    )
    if wants_drafts:
        items = [n for n in items if n.is_published or _can_edit_news(n)]
    return jsonify([n.to_dict() for n in items])


@tla3bny_bp.get("/news/<int:news_id>")
def get_news(news_id: int):
    n = Tla3bnyNews.query.get_or_404(news_id)
    if not n.is_published and not _can_edit_news(n):
        return _err("Not found", 404)
    return jsonify(n.to_dict())


def _write_news(n: Tla3bnyNews, data, files, creating: bool) -> None:
    """Apply a submitted news form to the item (shared by create and edit, so
    the two cannot drift apart)."""
    if data.get("title"):
        n.title = _clip(data.get("title"), 300) or n.title
    if "body" in data:
        n.body = _clip(data.get("body"), 50000)
    if "date" in data:
        n.news_date = _parse_date(data.get("date"))
    elif creating:
        n.news_date = _utcnow().date()
    if "is_published" in data:
        n.is_published = _bool(data.get("is_published"), True)

    images = _news_images(data, files)
    if images is not None:
        n.images = images
        # The cover is simply the first image, which is what the picker's
        # "الغلاف" badge tells the editor.
        n.image_path = images[0] if images else None


@tla3bny_bp.post("/news")
@auth.super_admin_required
def create_site_news():
    """Site-wide news, shown on the home feed and not tied to a competition."""
    data, files = _read_payload()
    if not (data.get("title") or "").strip():
        return _err("title is required")
    n = Tla3bnyNews(title="", author_user_id=auth.current_user().id)
    try:
        _write_news(n, data, files, creating=True)
    except ValueError as e:
        return _err(str(e))
    db.session.add(n)
    db.session.commit()
    return jsonify(n.to_dict()), 201


@tla3bny_bp.post("/competitions/<int:comp_id>/news")
@auth.login_required
def create_news(comp_id: int):
    if not auth.is_competition_admin(auth.current_user(), comp_id):
        return _forbid()
    Tla3bnyCompetition.query.get_or_404(comp_id)
    data, files = _read_payload()
    if not (data.get("title") or "").strip():
        return _err("title is required")
    n = Tla3bnyNews(
        competition_id=comp_id, title="", author_user_id=auth.current_user().id
    )
    try:
        _write_news(n, data, files, creating=True)
    except ValueError as e:
        return _err(str(e))
    db.session.add(n)
    db.session.commit()
    return jsonify(n.to_dict()), 201


@tla3bny_bp.put("/news/<int:news_id>")
@auth.login_required
def update_news(news_id: int):
    n = Tla3bnyNews.query.get_or_404(news_id)
    if not _can_edit_news(n):
        return _forbid()
    data, files = _read_payload()
    try:
        _write_news(n, data, files, creating=False)
    except ValueError as e:
        return _err(str(e))
    db.session.commit()
    return jsonify(n.to_dict())


@tla3bny_bp.delete("/news/<int:news_id>")
@auth.login_required
def delete_news(news_id: int):
    n = Tla3bnyNews.query.get_or_404(news_id)
    if not _can_edit_news(n):
        return _forbid()
    db.session.delete(n)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ── image uploads (news galleries, and anywhere a picker needs a URL) ────────
@tla3bny_bp.post("/uploads/image")
@auth.login_required
def upload_image():
    """Store one image and hand back its path, so a picker can build a gallery
    before the item it belongs to exists."""
    file = request.files.get("image") or request.files.get("file")
    if file is None or not file.filename:
        return _err("image is required")
    try:
        path = save_upload(file, kind="image")
    except ValueError as e:
        return _err(str(e))
    return jsonify({"path": path, "url": path}), 201


# ── home ─────────────────────────────────────────────────────────────────────
@tla3bny_bp.get("/home")
def home():
    """Today's matches + recent news for the tla3bny landing page."""
    today = _utcnow().date()
    todays = (
        Tla3bnyMatch.query.filter(Tla3bnyMatch.date == today)
        .order_by(Tla3bnyMatch.time.asc())
        .all()
    )
    recent_news = (
        Tla3bnyNews.query.filter(Tla3bnyNews.is_published.is_(True))
        .order_by(Tla3bnyNews.published_at.desc())
        .limit(6)
        .all()
    )
    return jsonify(
        {
            "today_matches": [m.to_dict() for m in todays],
            "recent_news": [n.to_dict() for n in recent_news],
        }
    )
