import logging
import os

from flask import Flask, abort, request, send_from_directory

from app.config import CONFIGS
from app.extensions import db, migrate, limiter


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__)

    config_name = config_name or os.environ.get("FLASK_ENV", "development")
    app.config.from_object(CONFIGS.get(config_name, CONFIGS["development"]))

    if not app.config.get("DEBUG") and app.config.get("SECRET_KEY") == "dev-only-change-me":
        raise RuntimeError(
            "SECRET_KEY is not set. Set the SECRET_KEY environment variable "
            "to a secure random value before starting in production."
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
    @app.before_request
    def _preflight():
        if request.method == "OPTIONS":
            return ("", 204)

    @app.after_request
    def _cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Admin-Key"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return response

    @app.get("/uploads/<path:filename>")
    def uploaded_file(filename):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

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
            return send_from_directory(root, path)
        index = os.path.join(path, "index.html") if path else "index.html"
        if os.path.isfile(os.path.join(root, index)):
            return send_from_directory(root, index)
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
