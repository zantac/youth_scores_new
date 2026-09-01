"""Coverage for tla3bny image handling.

Specifically that GIF uploads are re-encoded rather than stored verbatim, so an
appended polyglot payload (a valid GIF header with HTML/JS hidden after the
image data) can't ride along into storage and later be sniffed as HTML.
"""

import io

import pytest
from PIL import Image

from app.api.tla3bny._helpers import _compress_image


def _make_gif(frames: int = 1) -> bytes:
    # Distinct per-frame colours so the encoder keeps them as separate frames
    # (identical frames get de-duplicated).
    imgs = [Image.new("RGB", (8, 8), color=(40 + i * 60, 10, 10)) for i in range(frames)]
    buf = io.BytesIO()
    if frames > 1:
        imgs[0].save(
            buf, format="GIF", save_all=True,
            append_images=imgs[1:], duration=100, loop=0,
        )
    else:
        imgs[0].save(buf, format="GIF")
    return buf.getvalue()


def test_gif_polyglot_payload_is_stripped():
    payload = b"<script>alert(document.cookie)</script>"
    raw = _make_gif() + payload
    out, ext = _compress_image(raw, "gif")
    assert ext == "gif"
    assert payload not in out          # trailing HTML/JS dropped by re-encode
    assert out[:4] == b"GIF8"          # still a valid GIF header
    Image.open(io.BytesIO(out)).verify()  # and a decodable image


def test_gif_animation_is_preserved():
    raw = _make_gif(frames=3)
    out, _ = _compress_image(raw, "gif")
    reopened = Image.open(io.BytesIO(out))
    assert getattr(reopened, "is_animated", False)
    assert reopened.n_frames == 3


def test_gif_unreadable_content_raises():
    with pytest.raises(ValueError):
        _compress_image(b"totally not a gif", "gif")
