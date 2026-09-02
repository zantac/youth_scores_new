"""_season_for_date maps a date to the season it belongs to.

Season ranges aren't guaranteed contiguous or disjoint, so the helper must not
return None for a date that lands in a gap between seasons — it snaps to the
nearest one — and must resolve an overlap deterministically (newer wins).
"""

from datetime import date
from types import SimpleNamespace

from app.api.serializers import _season_for_date


def _season(name, start, end):
    return SimpleNamespace(name=name, start_date=start, end_date=end)


# Two adjacent seasons with a July gap, passed newest-first as the caller does
# (Season.start_date.desc()).
S2 = _season("2025-26", date(2025, 8, 1), date(2026, 6, 30))
S1 = _season("2024-25", date(2024, 8, 1), date(2025, 6, 30))
SEASONS = [S2, S1]


def test_date_inside_a_season_returns_it():
    assert _season_for_date(SEASONS, date(2025, 3, 1)) is S1
    assert _season_for_date(SEASONS, date(2025, 9, 1)) is S2


def test_date_in_the_summer_gap_snaps_to_nearest_season():
    # 5 days after S1 ended vs 27 before S2 starts -> S1 is nearer.
    assert _season_for_date(SEASONS, date(2025, 7, 5)) is S1
    # 20 days after S1 vs 12 before S2 -> S2 is nearer.
    assert _season_for_date(SEASONS, date(2025, 7, 20)) is S2


def test_date_before_all_and_after_all_seasons():
    assert _season_for_date(SEASONS, date(2023, 1, 1)) is S1   # nearest = earliest
    assert _season_for_date(SEASONS, date(2030, 1, 1)) is S2   # nearest = latest


def test_overlap_prefers_the_newer_season():
    old = _season("old", date(2024, 1, 1), date(2025, 12, 31))
    new = _season("new", date(2025, 1, 1), date(2026, 12, 31))
    seasons = [new, old]  # newest-first
    assert _season_for_date(seasons, date(2025, 6, 1)) is new


def test_none_date_or_empty_list_is_none():
    assert _season_for_date(SEASONS, None) is None
    assert _season_for_date([], date(2025, 1, 1)) is None
