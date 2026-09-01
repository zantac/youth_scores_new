"""Unit coverage for the tla3bny request-parsing helpers.

_clamp_int guards the match scores (0-99) and event minutes (0-130) written by
enter_result, so a stray negative/huge value can't corrupt the standings and
stats those feed. Mirrors youthscores' _clamp_int in entry.py.
"""

from app.api.tla3bny._helpers import _clamp_int


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
