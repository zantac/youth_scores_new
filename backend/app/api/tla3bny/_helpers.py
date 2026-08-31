import io
import os
import uuid
from datetime import datetime, timezone

from PIL import Image
from flask import current_app, jsonify, request
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models import Tla3bnyPlayerFile, Tla3bnyUser
from app.services import storage

# Images are resized / recompressed to stay within this budget.
_IMAGE_MAX_BYTES = 500 * 1024   # 500 KB
# Longest side (px) before we scale the image down first.
_IMAGE_MAX_SIDE = 1920
# Hard ceiling on decoded pixels — a decompression-bomb guard. A tiny highly
# compressed file can claim enormous dimensions; decoding it would allocate the
# full bitmap (many GB) and OOM the worker. 40 MP ≈ a 7000×5700 photo.
_MAX_IMAGE_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = _MAX_IMAGE_PIXELS  # make PIL itself raise on decode
# Largest PDF we store (PDFs skip image compression, so cap them explicitly).
_PDF_MAX_BYTES = 5 * 1024 * 1024   # 5 MB
# Minimum length for any account password (every set-password path).
_MIN_PASSWORD_LEN = 8
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

    try:
        img = Image.open(io.BytesIO(raw))
        w, h = img.size
    except Exception:
        raise ValueError("File content is not a readable image")
    # Reject decompression bombs *before* the decode below allocates the full
    # bitmap. Image.open only reads the header, so img.size is available cheaply.
    if w * h > _MAX_IMAGE_PIXELS:
        raise ValueError("Image dimensions are too large")

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


def save_upload(file_storage, kind: str = "image", private: bool = False) -> str | None:
    """Save an uploaded file and return its URL or local path.

    When AWS_S3_BUCKET is configured, the file is sent to S3 and a full
    HTTPS URL is returned — the frontend's mediaUrl() handles it transparently.
    Otherwise the file is saved to UPLOAD_FOLDER and ``uploads/<name>`` is
    returned (served by the Flask /uploads/ static route).

    ``private=True`` (registration documents) stores the file under a ``private/``
    subdir whose public ``/uploads/`` route is blocked, so it is reachable only
    through the signed serve route — the raw path never grants access.

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

    # Compress images; PDFs are stored as-is (but size-capped, since they skip
    # the image compression that would otherwise bound their size).
    if real_ext != "pdf":
        data, final_ext = _compress_image(raw, claimed_ext)
    else:
        if len(raw) > _PDF_MAX_BYTES:
            raise ValueError("PDF is too large (max 5 MB)")
        data, final_ext = raw, claimed_ext

    filename = secure_filename(f"{uuid.uuid4().hex}.{final_ext}")

    if storage.s3_enabled():
        # NOTE: S3 mode stores documents as public objects. This deployment uses
        # local disk for uploads (where private=True segregates documents into a
        # blocked subdir); if S3 is ever adopted for registration papers, switch
        # them to private objects + server-side/pre-signed reads.
        return storage.s3_upload(data, filename, final_ext)

    folder = current_app.config["UPLOAD_FOLDER"]
    if private:
        folder = os.path.join(folder, "private")
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, filename), "wb") as fh:
        fh.write(data)
    return f"uploads/private/{filename}" if private else f"uploads/{filename}"


def _read_payload():
    """Return (data, files) handling both multipart and JSON bodies."""
    if request.content_type and "multipart/form-data" in request.content_type:
        return request.form, request.files
    return (request.get_json(silent=True) or {}), None


def _save_documents(player, data, files, competition_player=None) -> None:
    """Save uploaded registration papers, pairing each with its document label.

    The client sends files under 'documents' and a parallel 'document_labels'
    list (same order) naming which paper each is — birth certificate, school
    letter, national id, health certificate, etc. A legacy single 'papers'
    field is still accepted. Re-uploading a paper replaces the one already held
    under that label, so a player keeps one file per required document.

    ``competition_player`` scopes the papers to one competition registration:
    documents are required *per competition*, so the same label uploaded for a
    new competition (or the same one next season) is a distinct file and never
    overwrites another entry's paper. When omitted, the file is a global identity
    paper (``competition_player_id`` NULL) and replacement stays within that
    global set.
    """
    if files is None:
        return
    uploaded = files.getlist("documents") if hasattr(files, "getlist") else []
    labels = data.getlist("document_labels") if hasattr(data, "getlist") else []
    if files.get("papers"):
        uploaded = list(uploaded) + [files.get("papers")]
    cp_id = competition_player.id if competition_player is not None else None
    for i, f in enumerate(uploaded):
        if f is None or f.filename == "":
            continue
        path = save_upload(f, kind="document", private=True)
        if not path:
            continue
        label = (labels[i] if i < len(labels) else None) or None
        if label:
            for old in [
                x for x in player.files
                if x.label == label and x.competition_player_id == cp_id
            ]:
                db.session.delete(old)
        db.session.add(
            Tla3bnyPlayerFile(
                player_id=player.id,
                competition_player_id=cp_id,
                file_path=path,
                original_name=f.filename,
                label=label,
            )
        )
        # papers_path is the player's global "primary paper" pointer; only a
        # global upload updates it, not a per-competition registration paper.
        if cp_id is None:
            player.papers_path = path


def _parse_date(value):
    from datetime import datetime
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _parse_date_or_error(value):
    """Like ``_parse_date`` but distinguishes "absent/empty" from "present but
    malformed". Returns (date_or_None, error_or_None): an empty value clears the
    field (None, None); a non-empty unparseable value is an error rather than a
    silent None that would wipe a stored date on a typo."""
    if value in (None, ""):
        return None, None
    d = _parse_date(value)
    if d is None:
        return None, "Invalid date (expected YYYY-MM-DD)"
    return d, None


def _validate_password(password: str) -> str | None:
    """Shared password-strength check for every set-password path. Returns an
    error message, or None when acceptable."""
    if not password or len(password) < _MIN_PASSWORD_LEN:
        return f"Password must be at least {_MIN_PASSWORD_LEN} characters"
    return None


def _clean_url(value):
    """Normalise a user-supplied URL. Returns an https-prefixed URL, or None for
    empty/unsafe values — blocks ``javascript:``/``data:`` and other non-http
    schemes that become stored-XSS vectors when rendered as an href."""
    if not value:
        return None
    v = str(value).strip()
    if not v:
        return None
    if v.lower().startswith(("http://", "https://")):
        return v
    # Any other explicit scheme (javascript:, data:, vbscript:, …) is rejected.
    if "://" in v or ":" in v.split("/", 1)[0]:
        return None
    # Bare domain like "facebook.com/page" — assume https.
    return "https://" + v


def _clip(value, maxlen: int):
    """Trim a user string to ``maxlen`` chars — protects String(n) columns from
    500s and caps otherwise-unbounded Text fields. Returns None for empty."""
    if value is None:
        return None
    s = str(value).strip()
    return s[:maxlen] or None


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
