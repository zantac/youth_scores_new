import logging
import os

import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
from flask import Flask, abort, jsonify, request, send_from_directory
from flask_compress import Compress

from app.config import CONFIGS
from app.extensions import db, migrate, limiter

# Gzip responses over ~500 bytes (JSON feed + static JS/CSS). Shared instance,
# bound to the app in create_app() like the other extensions.
compress = Compress()


# ── Social-preview (Open Graph) tags for a shared competition link ────────────
# The site is a static export: every page ships the one generic card, so a shared
# /competition link previews the same site-wide blurb on WhatsApp/Facebook. Since
# Flask serves the HTML, we can rewrite that page's tags per request from the
# ?id= (competition) and ?tab= (matches/standings/…) so the preview names the
# competition + age and the specific tab. Crawlers don't run JS, so this must be
# in the served HTML — client metadata wouldn't reach them.
_SHARE_TAB_AR = {
    "matches":   "جدول المباريات و النتائج",
    "standings": "جدول الترتيب",
    "teams":     "الفرق",
    "stats":     "الإحصائيات",
}
# Legacy numeric tabs (?tab=0..3) that may still be shared around.
_SHARE_TAB_ORDER = ["matches", "standings", "teams", "stats"]

# The stats tab's sub-tabs (?tab=stats&stat=…) each get their own description.
_SHARE_STAT_AR = {
    "overview":    "إحصائيات عامة",
    "scorers":     "قائمة الهدافين",
    "assists":     "قائمة صنّاع الأهداف",
    "cleansheets": "الشباك النظيفة",
    "cards":       "البطاقات",
}
_SHARE_STAT_ORDER = ["overview", "scorers", "assists", "cleansheets", "cards"]


def _competition_share_meta(competition_id: int, tab: str | None,
                            stat: str | None = None) -> dict | None:
    """Arabic title (name - age - sector) + the tab's description for the card,
    or None when the competition doesn't exist. On the stats tab, an optional
    ``stat`` sub-tab (scorers / assists / …) refines the description."""
    from app.extensions import db
    from app.models import AgeGroup, Competition

    comp = db.session.get(Competition, competition_id)
    if comp is None:
        return None
    name = (comp.name_ar or comp.name_en or "بطولة").strip()
    age = ""
    if comp.age_group_id:
        ag = db.session.get(AgeGroup, comp.age_group_id)
        if ag:
            age = (ag.name_ar or ag.name_en or "").strip()
    sector = (comp.sector_ar or comp.sector_en or "").strip()
    title = " - ".join(p for p in (name, age, sector) if p) or name

    key = (tab or "matches").lower()
    if key.isdigit():
        i = int(key)
        key = _SHARE_TAB_ORDER[i] if 0 <= i < len(_SHARE_TAB_ORDER) else "matches"
    desc = _SHARE_TAB_AR.get(key, _SHARE_TAB_AR["matches"])
    # On the stats tab, name the specific sub-tab (scorers, assists, …).
    if key == "stats" and stat:
        s = stat.lower()
        if s.isdigit():
            i = int(s)
            s = _SHARE_STAT_ORDER[i] if 0 <= i < len(_SHARE_STAT_ORDER) else ""
        desc = _SHARE_STAT_AR.get(s, desc)
    return {"title": title, "description": desc}


def _abs_url(base: str, raw: str | None) -> str | None:
    """Absolutize an image URL for OG tags: pass http(s) through, prefix a
    same-origin ``/uploads/…`` path with the request base, else give up (None)."""
    if not raw:
        return None
    raw = raw.strip()
    if raw.startswith(("http://", "https://")):
        return raw
    if raw.startswith("/"):
        return base + raw
    return None


def _inject_share_meta(html_text: str, meta: dict, url: str, image: str, og_type: str = "website") -> str:
    """Point the served card at this item: rewrite the generic <title>/description
    (for the browser tab + plain scrapers) and add the OG + Twitter tags the
    social crawlers actually read."""
    import html as _h
    import re

    t = _h.escape(meta["title"])
    d = _h.escape(meta.get("description") or "")
    u, img = _h.escape(url), _h.escape(image)
    tags = [
        f'<meta property="og:type" content="{_h.escape(og_type)}"/>',
        f'<meta property="og:site_name" content="Youth Scores"/>',
        f'<meta property="og:title" content="{t}"/>',
        f'<meta property="og:url" content="{u}"/>',
        f'<meta property="og:image" content="{img}"/>',
        f'<meta property="og:locale" content="ar_AR"/>',
        f'<meta name="twitter:card" content="summary"/>',
        f'<meta name="twitter:title" content="{t}"/>',
        f'<meta name="twitter:image" content="{img}"/>',
    ]
    # Some items (e.g. clubs) are just a name + logo — no description. Omit the
    # description tags entirely then, so no generic blurb leaks into the card.
    if d:
        tags.append(f'<meta property="og:description" content="{d}"/>')
        tags.append(f'<meta name="twitter:description" content="{d}"/>')
    html_text = re.sub(r"<title>.*?</title>", f"<title>{t}</title>", html_text, count=1, flags=re.S)
    html_text = re.sub(
        r'<meta\s+name="description"[^>]*/?>',
        f'<meta name="description" content="{d}"/>',
        html_text, count=1,
    )
    return html_text.replace("</head>", "".join(tags) + "</head>", 1)


def _render_share_page(index_abs: str, meta: dict | None, og_type: str = "website"):
    """Serve a static-export page with per-item preview tags injected from `meta`
    (title / description / optional image), or None to fall back to the plain file.
    A preview tweak must never break page serving, so any error yields None."""
    from flask import request

    if meta is None:
        return None
    try:
        with open(index_abs, encoding="utf-8") as f:
            html_text = f.read()
        base = f"{request.scheme}://{request.host}"
        url = base + request.full_path.rstrip("?")
        image = _abs_url(base, meta.get("image")) or (base + "/icons/icon-512.png")
        return _inject_share_meta(html_text, meta, url, image, og_type=og_type)
    except Exception:  # noqa: BLE001
        return None


def _competition_share_page(index_abs: str):
    """Competition preview: name + age title, tab description."""
    from flask import request

    try:
        meta = _competition_share_meta(
            int(request.args.get("id", "")),
            request.args.get("tab"), request.args.get("stat"))
    except (TypeError, ValueError):
        return None
    return _render_share_page(index_abs, meta)


def _news_share_meta(news_id: int) -> dict | None:
    """Title + snippet + cover image for a shared news item's preview, or None
    when it doesn't exist or isn't published."""
    from app.extensions import db
    from app.models import News

    n = db.session.get(News, news_id)
    if n is None or not n.is_published:
        return None
    title = (n.title_ar or n.title_en or "خبر").strip()
    body = " ".join((n.details_ar or n.details_en or "").split())  # collapse newlines
    if len(body) > 160:
        body = body[:159].rstrip() + "…"
    image = n.image_url or ""
    if not image and isinstance(n.images, list) and n.images:
        image = str(n.images[0] or "")
    return {"title": title, "description": body or "اضغط لقراءة الخبر", "image": image}


def _news_share_page(index_abs: str):
    """News preview: headline title, snippet, cover image."""
    from flask import request

    try:
        meta = _news_share_meta(int(request.args.get("id", "")))
    except (TypeError, ValueError):
        return None
    return _render_share_page(index_abs, meta, og_type="article")


def _club_share_meta(club_id: int) -> dict | None:
    """Title (club name) + logo for a shared club link — no description, just the
    name and crest. None when the club doesn't exist."""
    from app.extensions import db
    from app.models import Club

    club = db.session.get(Club, club_id)
    if club is None:
        return None
    name = (club.name_ar or club.name_en or "نادي").strip()
    return {"title": name, "image": club.logo_url or ""}


def _club_share_page(index_abs: str):
    """Club preview: club name title, club logo (no description)."""
    from flask import request

    try:
        meta = _club_share_meta(int(request.args.get("id", "")))
    except (TypeError, ValueError):
        return None
    return _render_share_page(index_abs, meta)


def _team_share_meta(team_id: int) -> dict | None:
    """Title (club name + age) + the club's logo for a shared team link. A team
    is a club's squad for one age group, so the club owns the name and crest.
    None when the team doesn't exist."""
    from app.extensions import db
    from app.models import AgeGroup, Club, Team

    t = db.session.get(Team, team_id)
    if t is None:
        return None
    club = db.session.get(Club, t.club_id) if t.club_id else None
    name = ((club.name_ar or club.name_en) if club else "").strip() or "فريق"
    logo = (club.logo_url or "") if club else ""
    age = ""
    if t.age_group_id:
        ag = db.session.get(AgeGroup, t.age_group_id)
        if ag:
            age = (ag.name_ar or ag.name_en or "").strip()
    title = " - ".join(p for p in (name, age) if p) or name
    return {"title": title, "image": logo}


def _team_share_page(index_abs: str):
    """Team preview: club name + age title, club logo (no description)."""
    from flask import request

    try:
        meta = _team_share_meta(int(request.args.get("id", "")))
    except (TypeError, ValueError):
        return None
    return _render_share_page(index_abs, meta)


def _player_share_meta(player_id: int) -> dict | None:
    """Title (player name) + position/birth-year line + photo for a shared player
    profile, or None when the player doesn't exist."""
    from app.extensions import db
    from app.models import Player

    p = db.session.get(Player, player_id)
    if p is None:
        return None
    name = (p.full_name_ar or p.full_name_en or "لاعب").strip()
    bits = []
    pos = (p.sub_position_ar or p.sub_position_en
           or p.position_ar or p.position_en or "").strip()
    if pos:
        bits.append(pos)
    if p.birth_year:
        bits.append(f"مواليد {p.birth_year}")
    return {"title": name, "description": " · ".join(bits) or "ملف لاعب",
            "image": p.profile_pic_url or ""}


def _player_share_page(index_abs: str):
    """Player preview: name title, position + birth year, photo."""
    from flask import request

    try:
        meta = _player_share_meta(int(request.args.get("id", "")))
    except (TypeError, ValueError):
        return None
    return _render_share_page(index_abs, meta, og_type="profile")


def _coach_share_meta(coach_id: int) -> dict | None:
    """Title (coach name) + role + photo for a shared coach profile, or None when
    the coach doesn't exist."""
    from app.extensions import db
    from app.models import Coach

    c = db.session.get(Coach, coach_id)
    if c is None:
        return None
    name = (c.full_name_ar or c.full_name_en or "مدرّب").strip()
    # The most recent team role's label, else a generic "مدرّب".
    role = ""
    for tc in sorted(c.team_roles, key=lambda r: r.id, reverse=True):
        role = (tc.role_ar or tc.role_en or "").strip()
        if role:
            break
    return {"title": name, "description": role or "مدرّب",
            "image": c.profile_pic_url or ""}


def _coach_share_page(index_abs: str):
    """Coach preview: name title, role, photo."""
    from flask import request

    try:
        meta = _coach_share_meta(int(request.args.get("id", "")))
    except (TypeError, ValueError):
        return None
    return _render_share_page(index_abs, meta, og_type="profile")


# Static pages (no id) that still deserve their own card instead of the one
# generic site card. Path (without slashes) → (title, description), both Arabic.
_STATIC_SHARE = {
    "competitions": ("البطولات", "كل بطولات الناشئين — المباريات والترتيب والإحصائيات"),
    "clubs": ("الأندية", "دليل الأندية والأكاديميات المشاركة"),
    "news": ("الأخبار", "آخر أخبار بطولات الناشئين"),
    "venues": ("الملاعب", "دليل ملاعب المباريات ومواقعها على الخريطة"),
    "more": ("المزيد", "المفضلة، تواصل معنا، ومعلومات عن التطبيق"),
    "more/favourites": ("المفضلة", "بطولاتك وفرقك المفضّلة في مكان واحد"),
    "contact": ("تواصل معنا", "طرق التواصل مع Youth Scores"),
    "about": ("من نحن", "عن Youth Scores — منصّة متابعة بطولات كرة القدم للناشئين"),
    "privacy-policy": ("سياسة الخصوصية", "سياسة الخصوصية في Youth Scores"),
    "terms": ("الشروط والأحكام", "شروط استخدام Youth Scores"),
}


# SHA-256 signing-cert fingerprints for Android App Links (assetlinks.json). Two
# certs verify the app: Google Play App Signing (Play Store installs) and the
# upload key (a directly-installed release APK). Override via the
# ANDROID_CERT_FINGERPRINTS env (comma-separated) if the keys ever rotate.
_ANDROID_CERT_FINGERPRINTS = [
    "48:7F:05:34:6B:81:53:3D:54:81:39:3F:C2:B8:65:10:F1:84:3F:15:56:5A:94:D3:66:B4:F3:8B:28:44:20:CE",
    "84:79:31:AF:0D:8E:98:C8:9B:22:FD:E6:1E:7A:5E:7F:E4:F2:B5:F7:10:19:ED:9E:CF:C4:F8:10:9E:54:5D:EC",
]


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__)

    config_name = config_name or os.environ.get("FLASK_ENV", "development")
    app.config.from_object(CONFIGS.get(config_name, CONFIGS["development"]))

    _dsn = app.config.get("SENTRY_DSN")
    if _dsn:
        sentry_sdk.init(
            dsn=_dsn,
            integrations=[FlaskIntegration()],
            traces_sample_rate=0.05,  # 5 % of requests sampled for performance
            send_default_pii=False,
        )

    if not app.config.get("DEBUG"):
        if app.config.get("SECRET_KEY") == "dev-only-change-me":
            raise RuntimeError(
                "SECRET_KEY is not set. Set the SECRET_KEY environment variable "
                "to a secure random value before starting in production."
            )
        _api_key = app.config.get("ADMIN_API_KEY")
        if not _api_key or _api_key == "dev-admin-key":
            raise RuntimeError(
                "ADMIN_API_KEY is not set or is still the development default. "
                "Set the ADMIN_API_KEY environment variable to a secure random value."
            )
        # In production the CORS wildcard is disabled (see _cors below): with no
        # ALLOWED_ORIGINS, same-origin requests (the site + API share an origin on
        # Railway) still work, and cross-origin ones get no ACAO header. Only warn
        # so a genuinely cross-origin setup knows it must list its origins.
        if not (app.config.get("ALLOWED_ORIGINS") or "").strip():
            app.logger.warning(
                "ALLOWED_ORIGINS is not set — cross-origin browser clients will be "
                "blocked (same-origin is unaffected). Set it to a comma-separated "
                "list of exact origins if you serve the API cross-origin."
            )
        # Never run production against the throwaway local SQLite fallback.
        if str(app.config.get("SQLALCHEMY_DATABASE_URI", "")).startswith("sqlite"):
            raise RuntimeError(
                "DATABASE_URL is not set — refusing to start production against the "
                "local SQLite fallback. Point DATABASE_URL at the real database."
            )
        # Rate limits stored in per-worker memory don't hold across gunicorn
        # workers or restarts. Warn (don't fail) so limits can be made global.
        if os.environ.get("RATELIMIT_STORAGE_URI", "memory://").startswith("memory"):
            app.logger.warning(
                "RATELIMIT_STORAGE_URI is unset — rate limits are per-worker and "
                "reset on restart. Set it to redis://… so limits are shared."
            )

    # Behind a reverse proxy (Railway), trust X-Forwarded-Proto/Host so
    # request.host_url reflects the real https://<domain> — the config feed
    # embeds absolute data URLs built from it, and an http URL would be blocked
    # as mixed content on the https site.
    from werkzeug.middleware.proxy_fix import ProxyFix

    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

    # Make INFO logs (e.g. notification dry-run lines) visible in development;
    # `flask run` otherwise leaves the app logger at WARNING.
    if app.config.get("DEBUG"):
        logging.basicConfig(level=logging.INFO)
        app.logger.setLevel(logging.INFO)

    # Emit Arabic as UTF-8, not \uXXXX escapes.
    app.json.ensure_ascii = False

    # Where uploaded images live (defaults under the instance folder).
    if not app.config.get("UPLOAD_FOLDER"):
        app.config["UPLOAD_FOLDER"] = os.path.join(app.instance_path, "uploads")
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)
    compress.init_app(app)

    from flask import jsonify as _jsonify
    from werkzeug.exceptions import TooManyRequests

    @app.errorhandler(429)
    def _rate_limit_handler(e):
        return _jsonify({"error": "Too many requests — please slow down."}), 429

    # Registers every mapper before Alembic autogenerate inspects the metadata.
    from app import models  # noqa: F401

    from app.api import api_bp
    from app.api.admin import admin_bp
    from app.api.auth import auth_bp
    from app.api.entry import entry_bp
    from app.api.manage import manage_bp
    from app.api.tla3bny import tla3bny_bp

    app.register_blueprint(api_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(entry_bp)
    app.register_blueprint(manage_bp)
    app.register_blueprint(tla3bny_bp)

    from app.commands import register_commands

    register_commands(app)

    # CORS for the browser clients (public site + admin panel on other ports).
    # In production set ALLOWED_ORIGINS to a comma-separated list of exact
    # origins (e.g. "https://youthscores.org,https://admin.youthscores.org").
    # In development the wildcard is used as a fallback so the Next.js dev
    # server (port 3000) can reach the Flask API (port 5000) without config.
    _raw_origins = app.config.get("ALLOWED_ORIGINS") or ""
    _origin_set = {o.strip() for o in _raw_origins.split(",") if o.strip()}

    @app.before_request
    def _preflight():
        if request.method == "OPTIONS":
            return ("", 204)

    @app.after_request
    def _cors(response):
        origin = request.headers.get("Origin", "")
        if _origin_set:
            if origin in _origin_set:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Vary"] = "Origin"
        elif app.config.get("DEBUG"):
            # Development-only fallback (production requires ALLOWED_ORIGINS).
            response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Admin-Key"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return response

    # Audit log: record every admin write operation (non-GET to /api/admin|manage|entry).
    @app.after_request
    def _audit_admin_mutations(response):
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            path = request.path
            if path.startswith(("/api/admin/", "/api/manage/", "/api/entry/")):
                try:
                    from app.services import auth as _auth
                    u = _auth.current_admin()
                    actor = u.username if u else "master_key"
                except Exception:
                    actor = "unknown"
                app.logger.info(
                    "ADMIN_MUTATION %s %s → %d  actor=%s",
                    request.method, path, response.status_code, actor,
                )
        return response

    @app.get("/uploads/<path:filename>")
    def uploaded_file(filename):
        # Uploads are stored under a random uuid name and never rewritten, so the
        # bytes for a given URL never change — cache them hard to keep repeat
        # image loads off Railway. (When S3/R2 is configured, files are served
        # straight from the bucket/CDN and never reach this route at all.)
        resp = send_from_directory(app.config["UPLOAD_FOLDER"], filename)
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/.well-known/assetlinks.json")
    def assetlinks():
        # Android App Links verification: lets a shared youthscores.org content
        # link (competition/news/club/team) open the native app directly. Served
        # only on the main host — the tla3bny subdomain has no linked app.
        if _is_tla3bny_host():
            abort(404)
        env = os.environ.get("ANDROID_CERT_FINGERPRINTS")
        fingerprints = (
            [f.strip() for f in env.split(",") if f.strip()]
            if env
            else _ANDROID_CERT_FINGERPRINTS
        )
        return jsonify(
            [
                {
                    "relation": ["delegate_permission/common.handle_all_urls"],
                    "target": {
                        "namespace": "android_app",
                        "package_name": "com.waellotfy.youthscores",
                        "sha256_cert_fingerprints": fingerprints,
                    },
                }
            ]
        )

    # ── serve the exported Next.js sites on the same origin(s) as the API ─────
    # Two static exports share one backend, chosen by the request's Host:
    #   • the main youthscores web  → FRONTEND_DIR         (../web/out)
    #   • the tla3bny subdomain app → TLA3BNY_FRONTEND_DIR (../web-tla3bny/out)
    # The tla3bny app's routes are at ITS root (/, /standings, ...), so on
    # tla3bny.youthscores.org it is served straight from its own out/ — no path
    # prefix. The API (/api/…) and /uploads/… are shared by both hosts.
    repo_root = os.path.dirname(os.path.dirname(app.root_path))
    app.config["FRONTEND_DIR"] = os.environ.get("FRONTEND_DIR") or os.path.join(
        repo_root, "web", "out"
    )
    app.config["TLA3BNY_FRONTEND_DIR"] = os.environ.get(
        "TLA3BNY_FRONTEND_DIR"
    ) or os.path.join(repo_root, "web-tla3bny", "out")
    # Hosts that should serve the tla3bny app. Any host starting with "tla3bny."
    # matches automatically (covers the real subdomain and Railway previews);
    # add exact hosts via TLA3BNY_HOSTS (comma-separated) for anything else.
    app.config["TLA3BNY_HOSTS"] = {
        h.strip().lower()
        for h in (os.environ.get("TLA3BNY_HOSTS") or "").split(",")
        if h.strip()
    }

    def _is_tla3bny_host() -> bool:
        host = (request.host or "").split(":")[0].lower()
        return host.startswith("tla3bny.") or host in app.config["TLA3BNY_HOSTS"]

    def _frontend_root() -> str:
        return (
            app.config["TLA3BNY_FRONTEND_DIR"]
            if _is_tla3bny_host()
            else app.config["FRONTEND_DIR"]
        )

    def _serve_frontend(path: str):
        """Serve the static export (for the current Host) for a browser path.

        The export uses trailingSlash, so /standings/ is the file
        standings/index.html. Real files (JS, CSS, manifest, icons) are served
        as-is; an unmatched path returns the exported 404 page.
        """
        root = _frontend_root()
        if not os.path.isdir(root):
            abort(404)
        if path and os.path.isfile(os.path.join(root, path)):
            resp = send_from_directory(root, path)
            # Next.js content-hashes everything under _next/static, so the URL
            # changes whenever the file does — safe to cache forever. Other
            # assets (icons, manifest) get a modest cache. This keeps repeat
            # asset loads off Railway's compute and egress.
            if path.startswith("_next/static/"):
                resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            else:
                resp.headers.setdefault("Cache-Control", "public, max-age=3600")
            return resp
        index = os.path.join(path, "index.html") if path else "index.html"
        if os.path.isfile(os.path.join(root, index)):
            # A shared /competition, /news or /club link (…?id=…) gets per-item
            # Open Graph tags injected so its WhatsApp/social preview names the
            # item, instead of the one generic card every static page ships with.
            # Only on the youthscores host, only when an id is present; any failure
            # falls through to the plain file below.
            _share_builders = {
                "competition": _competition_share_page,
                "news": _news_share_page,
                "club": _club_share_page,
                "team": _team_share_page,
                "player": _player_share_page,
                "coach": _coach_share_page,
            }
            page = path.strip("/")
            shared = None
            if not _is_tla3bny_host():
                builder = _share_builders.get(page)
                if builder is not None and request.args.get("id"):
                    # A per-item page (…?id=…): name the item in the card.
                    shared = builder(os.path.join(root, index))
                elif page in _STATIC_SHARE:
                    # A static section (venues, more, about…): its own fixed card.
                    title, desc = _STATIC_SHARE[page]
                    shared = _render_share_page(
                        os.path.join(root, index),
                        {"title": title, "description": desc},
                    )
            if shared is not None:
                resp = app.response_class(shared, mimetype="text/html")
                resp.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
                return resp
            # HTML shells must revalidate so a deploy's new asset hashes are
            # picked up promptly rather than served from a stale cache.
            resp = send_from_directory(root, index)
            resp.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
            return resp
        if os.path.isfile(os.path.join(root, "404.html")):
            return send_from_directory(root, "404.html"), 404
        abort(404)

    @app.get("/")
    def _frontend_index():
        return _serve_frontend("")

    @app.get("/<path:path>")
    def _frontend_path(path):
        # The API and uploads have their own, more specific routes; guard here so
        # an unknown /api/... path returns a 404 rather than the HTML shell.
        if path.startswith(("api/", "uploads/")):
            abort(404)
        return _serve_frontend(path)

    return app
