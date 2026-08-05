import logging
import os

import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
from flask import Flask, abort, request, send_from_directory
from flask_compress import Compress

from app.config import CONFIGS
from app.extensions import db, migrate, limiter

# Gzip responses over ~500 bytes (JSON feed + static JS/CSS). Shared instance,
# bound to the app in create_app() like the other extensions.
compress = Compress()


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
        else:
            # Development fallback — wildcard is fine when DEBUG=True.
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
