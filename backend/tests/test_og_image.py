"""The social-share card image transform, exercised without a database.

_card_logo makes a club crest safe for WhatsApp: club logos are transparent PNGs
on Cloudinary, which WhatsApp renders as a blank box, so they're flattened onto a
white background and forced to an opaque, bounded format.
"""

from app import _card_logo

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
