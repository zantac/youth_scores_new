import os

from dotenv import load_dotenv

load_dotenv()


def _normalize_db_url(url: str | None) -> str | None:
    """Accept the connection URLs managed hosts hand out and point them at the
    drivers we actually ship.

    Railway/Heroku give `mysql://…` and `postgres://…`; SQLAlchemy 2.0 needs an
    explicit driver (and rejects the bare `postgres://` scheme). This lets you
    paste Railway's ``${{MySQL.MYSQL_URL}}`` / ``${{Postgres.DATABASE_URL}}``
    straight into DATABASE_URL.
    """
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    elif url.startswith("mysql://"):
        url = "mysql+pymysql://" + url[len("mysql://"):]
        # utf8mb4 is required for Arabic — add it if the URL omits a charset.
        if "charset=" not in url:
            url += ("&" if "?" in url else "?") + "charset=utf8mb4"
    return url


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")

    SQLALCHEMY_DATABASE_URI = _normalize_db_url(
        os.environ.get("DATABASE_URL")
    ) or "sqlite:///youthscores.rehearsal.db"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # PythonAnywhere kills idle MySQL connections after 300s.
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_recycle": 280,
        "pool_pre_ping": True,
    }

    JSON_AS_ASCII = False

    # Push notifications (Firebase Cloud Messaging).
    # Path to the FCM service-account JSON. Unset -> notifications run in
    # dry-run mode: the message is logged, never sent.
    FIREBASE_CREDENTIALS = os.environ.get("FIREBASE_CREDENTIALS")
    # Optional; taken from the service-account JSON when not given.
    FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID")

    # Guards the admin write endpoints (create news/venue, etc.).
    ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY")

    # Uploaded images. UPLOAD_FOLDER defaults to instance/uploads (set in the
    # app factory). Cap request bodies so a huge file can't exhaust memory.
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER")
    MAX_CONTENT_LENGTH = 20 * 1024 * 1024  # 20 MB (tla3bny accepts PDFs too)

    # Upload allow-lists, shared by the tla3bny (LeagueHub) endpoints.
    ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
    ALLOWED_PDF_EXTENSIONS = {"pdf"}

    # ── S3 / S3-compatible object storage ──────────────────────────────────
    # When AWS_S3_BUCKET is set, save_upload() sends files to S3 and returns
    # the full public URL instead of a local path.  Unset → local disk.
    #
    # Works with AWS S3, Cloudflare R2, MinIO, Backblaze B2, etc.:
    #   AWS_ACCESS_KEY_ID     access key (or R2 access key ID)
    #   AWS_SECRET_ACCESS_KEY secret key (or R2 secret access key)
    #   AWS_S3_BUCKET         bucket name
    #   AWS_S3_REGION         region (default us-east-1; irrelevant for R2)
    #   AWS_S3_ENDPOINT_URL   custom endpoint for non-AWS providers, e.g.:
    #                           Cloudflare R2: https://<acct>.r2.cloudflarestorage.com
    #   AWS_S3_PUBLIC_URL     CDN / public base URL for served files, e.g.:
    #                           https://cdn.yourdomain.com  (without trailing slash)
    #                         Falls back to the standard S3 URL when not set.
    AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
    AWS_S3_BUCKET = os.environ.get("AWS_S3_BUCKET")
    AWS_S3_REGION = os.environ.get("AWS_S3_REGION", "us-east-1")
    AWS_S3_ENDPOINT_URL = os.environ.get("AWS_S3_ENDPOINT_URL")
    AWS_S3_PUBLIC_URL = os.environ.get("AWS_S3_PUBLIC_URL")

    # ── Error tracking ──────────────────────────────────────────────────────
    SENTRY_DSN = os.environ.get("SENTRY_DSN")


class ProductionConfig(Config):
    DEBUG = False


class DevelopmentConfig(Config):
    DEBUG = True
    # A predictable key so the admin endpoints are usable locally. Override in
    # any real deployment via the ADMIN_API_KEY env var.
    ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "dev-admin-key")


CONFIGS = {
    "production": ProductionConfig,
    "development": DevelopmentConfig,
}
