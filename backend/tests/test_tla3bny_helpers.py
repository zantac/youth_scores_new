"""Unit coverage for the tla3bny request-parsing helpers.

_clamp_int guards the match scores (0-99) and event minutes (0-130) written by
enter_result, so a stray negative/huge value can't corrupt the standings and
stats those feed. Mirrors youthscores' _clamp_int in entry.py.
"""

from app.api.tla3bny._helpers import (
    _clamp_int,
    _national_id_or_error,
    _normalize_national_id,
    _safe_photo_path,
)


def test_clamp_int_within_range_unchanged():
    assert _clamp_int(5, 0, 99) == 5
    assert _clamp_int("7", 0, 99) == 7  # string digits parse


def test_clamp_int_bounds_are_inclusive():
    assert _clamp_int(0, 0, 99) == 0
    assert _clamp_int(99, 0, 99) == 99
    assert _clamp_int(130, 0, 130) == 130


def test_clamp_int_out_of_range_is_clamped():
    assert _clamp_int(-4, 0, 99) == 0      # negative score floored
    assert _clamp_int(1000, 0, 99) == 99   # huge score capped
    assert _clamp_int(999, 0, 130) == 130  # huge minute capped


def test_clamp_int_none_or_unparseable_stays_none():
    assert _clamp_int(None, 0, 99) is None
    assert _clamp_int("", 0, 99) is None
    assert _clamp_int("abc", 0, 99) is None


# _safe_photo_path guards client-supplied photo_path / photos before they are
# stored and later rendered as <img src>. Accept http(s) URLs and relative
# uploads/ paths; reject other schemes and path traversal.


def test_safe_photo_path_allows_https_and_upload_paths():
    assert _safe_photo_path("https://res.cloudinary.com/x/a.jpg") == (
        "https://res.cloudinary.com/x/a.jpg"
    )
    assert _safe_photo_path("http://s3.example.com/a.jpg") == (
        "http://s3.example.com/a.jpg"
    )
    assert _safe_photo_path("uploads/abc.jpg") == "uploads/abc.jpg"
    assert _safe_photo_path("/uploads/abc.jpg") == "/uploads/abc.jpg"
    assert _safe_photo_path("  uploads/abc.jpg  ") == "uploads/abc.jpg"  # trimmed


def test_safe_photo_path_rejects_dangerous_schemes():
    assert _safe_photo_path("javascript:alert(1)") is None
    assert _safe_photo_path("data:text/html,<script>") is None
    assert _safe_photo_path("file:///etc/passwd") is None
    assert _safe_photo_path("vbscript:msgbox") is None


def test_safe_photo_path_rejects_traversal_and_foreign_paths():
    assert _safe_photo_path("uploads/../../etc/passwd") is None
    assert _safe_photo_path("../secret.jpg") is None
    assert _safe_photo_path("etc/passwd") is None  # relative but not uploads/


def test_safe_photo_path_none_or_empty_stays_none():
    assert _safe_photo_path(None) is None
    assert _safe_photo_path("") is None
    assert _safe_photo_path("   ") is None


# _national_id_or_error validates the الرقم القومي: an Egyptian national ID is
# exactly 14 digits. It also normalises Arabic-Indic numerals so an ID typed on
# an Arabic keyboard is accepted and stored the same as a Latin one.


def test_national_id_accepts_exactly_14_ascii_digits():
    nid, err = _national_id_or_error("29801011234567")
    assert err is None
    assert nid == "29801011234567"


def test_national_id_normalises_arabic_indic_digits():
    # ٢٩٨٠١٠١١٢٣٤٥٦٧ is the same value in Arabic-Indic numerals.
    nid, err = _national_id_or_error("٢٩٨٠١٠١١٢٣٤٥٦٧")
    assert err is None
    assert nid == "29801011234567"  # stored as ASCII digits


def test_national_id_strips_spaces_and_dashes():
    nid, err = _national_id_or_error(" 298-0101 1234567 ")
    assert err is None
    assert nid == "29801011234567"


def test_national_id_wrong_length_is_an_error():
    for bad in ("123", "2980101123456", "298010112345678"):  # 3, 13, 15 digits
        nid, err = _national_id_or_error(bad)
        assert err is not None, bad


def test_national_id_empty_is_not_an_error_here():
    # Emptiness is the caller's call (required on create, optional on edit), so
    # the validator itself reports no error for a blank value.
    assert _national_id_or_error("") == ("", None)
    assert _national_id_or_error(None) == ("", None)


def test_normalize_national_id_drops_non_digits():
    assert _normalize_national_id("2980-1011") == "29801011"
    assert _normalize_national_id("abc") == ""
