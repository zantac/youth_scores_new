"""Uploaded-image processing with Pillow.

Downscales to a sensible max dimension, honours EXIF orientation, flattens
transparency onto white, and re-encodes as optimised progressive JPEG — so a
10 MB phone photo lands as a ~100–300 KB web image. Returns the stored filename.
"""

from __future__ import annotations

import io
import os
import uuid

from flask import current_app
from PIL import Image, ImageOps

from app.services import storage

MAX_DIM = 1600      # longest side, px
JPEG_QUALITY = 82
# Hard ceiling on decoded pixels — a decompression-bomb guard. A tiny highly
# compressed file can claim enormous dimensions; decoding it allocates the full
# bitmap (many GB) and OOM-kills the worker. 40 MP ≈ a 7000×5700 photo.
_MAX_IMAGE_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = _MAX_IMAGE_PIXELS  # make PIL itself raise on decode


def process_upload(file_storage) -> str:
    """Downscale/encode an upload and store it.

    Returns a full public URL when S3/R2 is configured (served from the
    bucket/CDN, off Railway), otherwise the bare local filename (served by the
    Flask /uploads/ route). Callers distinguish the two by the "http" prefix.
    """
    try:
        img = Image.open(file_storage.stream)
        # Reject decompression bombs before img.load() allocates the full bitmap.
        # Image.open only reads the header, so img.size is available cheaply.
        w, h = img.size
        if w * h > _MAX_IMAGE_PIXELS:
            raise ValueError("الصورة كبيرة جدًا")
        img.load()
    except ValueError:
        raise
    except Exception as exc:  # noqa: BLE001 - anything Pillow can't open isn't an image
        raise ValueError("الملف ليس صورة صالحة") from exc

    try:
        img = ImageOps.exif_transpose(img)          # rotate per camera orientation
        img.thumbnail((MAX_DIM, MAX_DIM))            # shrink only, keep aspect ratio

        if img.mode in ("RGBA", "LA", "P"):
            rgba = img.convert("RGBA")
            flat = Image.new("RGB", rgba.size, (255, 255, 255))
            flat.paste(rgba, mask=rgba.split()[-1])
            img = flat
        else:
            img = img.convert("RGB")

        name = f"{uuid.uuid4().hex}.jpg"
        save_kwargs = dict(quality=JPEG_QUALITY, optimize=True, progressive=True)

        if storage.s3_enabled():
            buf = io.BytesIO()
            img.save(buf, "JPEG", **save_kwargs)
            return storage.s3_upload(buf.getvalue(), name, "jpg")

        folder = current_app.config["UPLOAD_FOLDER"]
        os.makedirs(folder, exist_ok=True)
        img.save(os.path.join(folder, name), "JPEG", **save_kwargs)
        return name
    finally:
        # Release the decoded pixel buffer promptly rather than waiting on GC —
        # a burst of large uploads would otherwise hold many megabytes each.
        img.close()
