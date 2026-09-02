"""The social-share card image transform, exercised without a database.

_card_logo makes a club crest safe for WhatsApp: club logos are transparent PNGs
on Cloudinary, which WhatsApp renders as a blank box, so they're flattened onto a
white background and forced to an opaque, bounded format.
"""

from urllib.parse import quote

from app import _card_logo, _og_image_url, _og_sig

CLOUD = "https://res.cloudinary.com/demo/image/upload/v1/logos/ahly.png"


def test_flattens_transparent_cloudinary_logo():
    out = _card_logo(CLOUD)
    assert out.startswith("https://res.cloudinary.com/demo/image/upload/")
    assert "f_jpg,q_auto,c_pad,b_white,w_600,h_600/" in out
    assert out.endswith("/v1/logos/ahly.png")  # public id preserved after the flags


def test_idempotent_when_already_transformed():
    already = ("https://res.cloudinary.com/demo/image/upload/"
               "f_jpg,c_pad,b_white,w_600,h_600/v1/x.png")
    assert _card_logo(already) == already


def test_passthrough_non_cloudinary():
    assert _card_logo("https://cdn.example.com/x.png") == "https://cdn.example.com/x.png"
    assert _card_logo("/uploads/x.png") == "/uploads/x.png"


def test_empty_returns_empty():
    assert _card_logo(None) == ""
    assert _card_logo("") == ""
    assert _card_logo("   ") == ""


# _og_image_url picks the final card image: a Cloudinary crest stays on the CDN,
# any other source is routed through /og-image to be flattened server-side.

BASE = "https://www.youthscores.org"


def test_og_url_cloudinary_passthrough():
    # already inline-flattened by _card_logo → served straight from Cloudinary
    already = ("https://res.cloudinary.com/demo/image/upload/"
               "f_jpg,c_pad,b_white,w_600,h_600/v1/logos/ahly.png")
    assert _og_image_url(BASE, already) == already


def test_og_url_external_goes_through_proxy():
    # non-Cloudinary source → signed /og-image URL (the signature is what makes
    # the endpoint fetch only our own logo URLs).
    with _make_app().app_context():
        ext = "https://www.365scores.com/logos/ahly.png"
        out = _og_image_url(BASE, ext)
        assert out == f"{BASE}/og-image?u={quote(ext, safe='')}&s={_og_sig(ext)}"


def test_og_url_bare_filename_uses_uploads_route():
    with _make_app().app_context():
        absu = BASE + "/uploads/abc.jpg"
        out = _og_image_url(BASE, "abc.jpg")
        assert out == f"{BASE}/og-image?u={quote(absu, safe='')}&s={_og_sig(absu)}"


def test_og_url_root_relative_uses_base():
    with _make_app().app_context():
        absu = BASE + "/uploads/abc.jpg"
        out = _og_image_url(BASE, "/uploads/abc.jpg")
        assert out == f"{BASE}/og-image?u={quote(absu, safe='')}&s={_og_sig(absu)}"


def test_og_url_empty_is_none():
    assert _og_image_url(BASE, None) is None
    assert _og_image_url(BASE, "") is None


# ── /og-image endpoint (fetch → flatten → JPEG) ─────────────────────────────

import io  # noqa: E402
import os  # noqa: E402
import tempfile  # noqa: E402

from PIL import Image  # noqa: E402


def _make_app():
    os.environ.setdefault("FLASK_ENV", "development")
    from app import create_app
    from app.config import DevelopmentConfig

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    orig = DevelopmentConfig.SQLALCHEMY_DATABASE_URI
    DevelopmentConfig.SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp.name}"
    try:
        return create_app("development")
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = orig


def test_endpoint_requires_a_valid_signature():
    # No/invalid signature → 404, so the endpoint can't be used to fetch an
    # arbitrary URL (no open proxy / SSRF).
    client = _make_app().test_client()
    assert client.get("/og-image?u=https://example.com/x.png").status_code == 404
    assert client.get("/og-image?u=https://example.com/x.png&s=deadbeef").status_code == 404
    assert client.get("/og-image").status_code == 404


def test_endpoint_rejects_internal_url_even_when_signed():
    app = _make_app()
    with app.app_context():
        u = "http://127.0.0.1/x.png"
        sig = _og_sig(u)
    r = app.test_client().get(f"/og-image?u={quote(u, safe='')}&s={sig}")
    assert r.status_code == 404  # SSRF guard blocks the loopback address


def test_endpoint_flattens_transparent_png_to_opaque_jpeg(monkeypatch):
    png = io.BytesIO()
    Image.new("RGBA", (50, 50), (255, 0, 0, 128)).save(png, "PNG")  # semi-transparent

    class _FakeResp:
        is_redirect = False

        def raise_for_status(self):
            pass

        def iter_content(self, _n):
            yield png.getvalue()

        def close(self):
            pass

    import requests
    from app.services import storage
    monkeypatch.setattr(requests, "get", lambda *a, **k: _FakeResp())
    # Skip the real DNS lookup in the SSRF guard so the test doesn't need network.
    monkeypatch.setattr(storage, "_is_internal_url", lambda _u: False)

    app = _make_app()
    with app.app_context():
        u = "https://cdn.example.com/logo.png"
        sig = _og_sig(u)
    r = app.test_client().get(f"/og-image?u={quote(u, safe='')}&s={sig}")
    assert r.status_code == 200
    assert r.mimetype == "image/jpeg"
    out = Image.open(io.BytesIO(r.data))
    assert out.size == (600, 600)  # padded to a square
    assert out.mode == "RGB"       # flattened → opaque (JPEG has no alpha)
    # A tiny 50×50 source is UP-scaled to fill the square, so a point well outside
    # the centre is the (flattened) logo colour, not the white background.
    assert out.getpixel((100, 300)) != (255, 255, 255)
