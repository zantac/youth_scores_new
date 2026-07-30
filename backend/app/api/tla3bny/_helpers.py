import io
import os
import uuid
from datetime import datetime, timezone

from PIL import Image
from flask import current_app, jsonify, request
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models import Tla3bnyUser

# Images are resized / recompressed to stay within this budget.
_IMAGE_MAX_BYTES = 500 * 1024   # 500 KB
# Longest side (px) before we scale the image down first.
_IMAGE_MAX_SIDE = 1920
# PIL format name keyed by canonical extension.
_PIL_FMT = {"jpg": "JPEG", "png": "PNG", "gif": "GIF", "webp": "WEBP"}


def _utcnow() -> datetime:
    """Naive UTC datetime — a drop-in replacement for the deprecated utcnow()."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _allowed(filename: str, allowed_set: set[str]) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_set


# Maps a sniffed content type → the extension label used in ALLOWED_* sets.
# Only types the platform actually accepts need to be listed.
_SNIFF_TO_EXT: dict[str, str] = {
    "jpeg": "jpg",
    "png": "png",
    "gif": "gif",
    "webp": "webp",
    "pdf": "pdf",
}


def _sniff_ext(file_storage) -> str | None:
    """Read the first 12 bytes to identify the real file type.

    Returns a canonical extension string (e.g. "jpg", "png", "pdf") or None
    when the content is unrecognised. Always seeks back to the start so the
    caller can still read the file normally.
    """
    header = file_storage.read(12)
    file_storage.seek(0)
    if header[:3] == b"\xff\xd8\xff":
        return "jpg"
    if header[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if header[:4] in (b"GIF8",):
        return "gif"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "webp"
    if header[:4] == b"%PDF":
        return "pdf"
    return None


def _compress_image(raw: bytes, ext: str) -> tuple[bytes, str]:
    """Resize and recompress image bytes so the result fits within _IMAGE_MAX_BYTES.

    Strategy:
    1. Scale down dimensions if the longest side exceeds _IMAGE_MAX_SIDE.
    2. For JPEG / WebP: reduce quality in steps (85 → 75 → 65 → 55 → 45).
    3. For PNG: run PIL's lossless optimiser; if still too large, convert to JPEG
       and apply the same quality ladder — final extension changes to "jpg".
    4. GIF: returned as-is (frame-by-frame recompression is out of scope).

    Returns (final_bytes, final_ext). ``final_ext`` may differ from ``ext`` only
    when a PNG is converted to JPEG.
    """
    if ext == "gif":
        return raw, ext

    img = Image.open(io.BytesIO(raw))

    # Flatten transparency so JPEG output never errors on RGBA / palette images.
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Step 1: scale down oversized dimensions.
    w, h = img.size
    if max(w, h) > _IMAGE_MAX_SIDE:
        scale = _IMAGE_MAX_SIDE / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    def _encode(image: Image.Image, fmt: str, quality: int | None = None) -> bytes:
        buf = io.BytesIO()
        kwargs: dict = {"format": fmt, "optimize": True}
        if quality is not None:
            kwargs["quality"] = quality
        image.save(buf, **kwargs)
        return buf.getvalue()

    pil_fmt = _PIL_FMT.get(ext, "JPEG")

    # Step 2: PNG — try lossless first, fall back to JPEG.
    if pil_fmt == "PNG":
        out = _encode(img, "PNG")
        if len(out) <= _IMAGE_MAX_BYTES:
            return out, ext
        # PNG can't be quality-reduced; re-encode as JPEG.
        pil_fmt = "JPEG"
        ext = "jpg"

    # Step 3: quality ladder for JPEG / WebP.
    for quality in (85, 75, 65, 55, 45):
        out = _encode(img, pil_fmt, quality=quality)
        if len(out) <= _IMAGE_MAX_BYTES:
            return out, ext

    # Step 4: image is extremely high-resolution even at low quality — keep
    # halving dimensions until it fits or we reach a minimum sensible size.
    while len(out) > _IMAGE_MAX_BYTES and min(img.size) > 200:
        w, h = img.size
        img = img.resize((int(w * 0.75), int(h * 0.75)), Image.LANCZOS)
        out = _encode(img, pil_fmt, quality=45)

    return out, ext


# MIME types for S3 Content-Type header.
_CONTENT_TYPE = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "pdf": "application/pdf",
}


def _s3_upload(data: bytes, filename: str, ext: str) -> str:
    """Upload bytes to S3 (or any S3-compatible store) and return the public URL.

    Tries to set ACL=public-read; silently skips the ACL parameter for
    providers that do not support it (Cloudflare R2, MinIO with no ACL plugin).
    Configure a public bucket policy on those providers instead.
    """
    import boto3  # lazy import — only needed when S3 is configured

    cfg = current_app.config
    client = boto3.client(
        "s3",
        region_name=cfg.get("AWS_S3_REGION", "us-east-1"),
        aws_access_key_id=cfg.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=cfg.get("AWS_SECRET_ACCESS_KEY"),
        endpoint_url=cfg.get("AWS_S3_ENDPOINT_URL"),
    )
    bucket: str = cfg["AWS_S3_BUCKET"]
    content_type = _CONTENT_TYPE.get(ext, "application/octet-stream")

    try:
        client.put_object(
            Bucket=bucket, Key=filename, Body=data,
            ContentType=content_type, ACL="public-read",
        )
    except Exception:
        # ACL not supported by this provider — upload without it.
        client.put_object(
            Bucket=bucket, Key=filename, Body=data, ContentType=content_type,
        )

    # Resolve the public URL: custom CDN prefix → endpoint → standard AWS URL.
    public_url = (cfg.get("AWS_S3_PUBLIC_URL") or "").rstrip("/")
    if public_url:
        return f"{public_url}/{filename}"
    endpoint = (cfg.get("AWS_S3_ENDPOINT_URL") or "").rstrip("/")
    if endpoint:
        return f"{endpoint}/{bucket}/{filename}"
    region = cfg.get("AWS_S3_REGION", "us-east-1")
    return f"https://{bucket}.s3.{region}.amazonaws.com/{filename}"


def save_upload(file_storage, kind: str = "image") -> str | None:
    """Save an uploaded file and return its URL or local path.

    When AWS_S3_BUCKET is configured, the file is sent to S3 and a full
    HTTPS URL is returned — the frontend's mediaUrl() handles it transparently.
    Otherwise the file is saved to UPLOAD_FOLDER and ``uploads/<name>`` is
    returned (served by the Flask /uploads/ static route).

    Images are automatically resized / recompressed to fit within 500 KB.
    kind: "image", "pdf" or "document" (image or pdf). Returns None when no
    file was submitted. Raises ValueError on a disallowed or mismatched type.
    """
    if file_storage is None or file_storage.filename == "":
        return None

    images = current_app.config["ALLOWED_IMAGE_EXTENSIONS"]
    pdfs = current_app.config["ALLOWED_PDF_EXTENSIONS"]
    if kind == "pdf":
        allowed = pdfs
    elif kind == "document":
        allowed = pdfs | images
    else:
        allowed = images

    if not _allowed(file_storage.filename, allowed):
        raise ValueError(f"File type not allowed for {file_storage.filename}")

    # Validate actual content against claimed extension (magic bytes).
    real_ext = _sniff_ext(file_storage)
    if real_ext is None:
        raise ValueError("File content is not a recognised image or PDF")
    claimed_ext = file_storage.filename.rsplit(".", 1)[1].lower()
    if claimed_ext == "jpeg":
        claimed_ext = "jpg"
    if real_ext != claimed_ext:
        raise ValueError(
            f"File content does not match its extension "
            f"(claimed: {claimed_ext}, detected: {real_ext})"
        )

    raw = file_storage.read()

    # Compress images; PDFs are stored as-is.
    if real_ext != "pdf":
        data, final_ext = _compress_image(raw, claimed_ext)
    else:
        data, final_ext = raw, claimed_ext

    filename = secure_filename(f"{uuid.uuid4().hex}.{final_ext}")

    if current_app.config.get("AWS_S3_BUCKET"):
        return _s3_upload(data, filename, final_ext)

    folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, filename), "wb") as fh:
        fh.write(data)
    return f"uploads/{filename}"


def _read_payload():
    """Return (data, files) handling both multipart and JSON bodies."""
    if request.content_type and "multipart/form-data" in request.content_type:
        return request.form, request.files
    return (request.get_json(silent=True) or {}), None


def _parse_date(value):
    from datetime import datetime
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _int(value, default=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _bool(value, default=False):
    """A checkbox from either body shape: JSON sends a real bool, a multipart
    form sends the string "true"/"1"/"on"."""
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def _clean_docs(value):
    """A list of non-empty document-type labels, or None to use the default."""
    if not isinstance(value, list):
        return None
    cleaned = [str(x).strip() for x in value if str(x).strip()]
    # De-duplicate, keeping the admin's order.
    return list(dict.fromkeys(cleaned)) or None


def _docs_field(data):
    """Read a ``required_documents`` list from a JSON or multipart body.

    Multipart senders repeat the field once per document; JSON senders send a
    list. Returns (present, cleaned_list_or_None).
    """
    if hasattr(data, "getlist"):
        if "required_documents" not in data:
            return False, None
        return True, _clean_docs(data.getlist("required_documents"))
    if "required_documents" not in data:
        return False, None
    return True, _clean_docs(data.get("required_documents"))


def _err(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


def _forbid():
    return jsonify({"error": "Insufficient permissions"}), 403


def _credentials(data):
    """The username/email + password a caller supplied, normalised.

    Accounts sign in with a username or an email, so every screen posts the
    typed identifier as ``login``; ``username``/``email`` are accepted too so a
    form that knows which one it is can say so.
    """
    raw = data.get("login") or data.get("username") or data.get("email") or ""
    return Tla3bnyUser.normalize_login(raw), (data.get("password") or "")


def _claim_login(username: str | None, email: str | None, exclude_id: int | None = None):
    """Check a username/email pair is free. Returns an error response or None."""
    for field, value in (("username", username), ("email", email)):
        if not value:
            continue
        q = Tla3bnyUser.query.filter(getattr(Tla3bnyUser, field) == value)
        if exclude_id is not None:
            q = q.filter(Tla3bnyUser.id != exclude_id)
        if q.first():
            return _err(f"This {field} is already taken", 409)
    return None
