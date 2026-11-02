"""Fixtures generation — the pure round-robin and knockout-bracket math.

`fixtures.py` (byes, seeding, circle method) had no tests, and a wrong bracket or a
missed pairing corrupts a whole competition. These pin the deterministic logic.
"""

from itertools import combinations

import pytest

from app.api.tla3bny.fixtures import (
    _byed_team,
    _knockout_pairs,
    _round_robin,
    _rr_round_num,
)


# ── round robin ──────────────────────────────────────────────────────────────
def _assert_valid_round_robin(n: int):
    teams = list(range(1, n + 1))
    rounds = _round_robin(teams)

    seen = []
    for rnd in rounds:
        appearing = []
        for a, b in rnd:
            appearing += [a, b]
            seen.append(frozenset((a, b)))
        # No team plays twice in the same round.
        assert len(appearing) == len(set(appearing)), f"team twice in a round (n={n})"

    # Every unordered pair meets exactly once.
    expected = {frozenset(c) for c in combinations(teams, 2)}
    assert set(seen) == expected, f"missing/extra pairing (n={n})"
    assert len(seen) == len(expected), f"a pair repeats (n={n})"
    return rounds


@pytest.mark.parametrize("n", [2, 3, 4, 5, 6, 7, 8])
def test_round_robin_every_pair_meets_once(n):
    _assert_valid_round_robin(n)


def test_round_robin_round_count():
    # Even n → n-1 rounds; odd n → n rounds (an extra for the rotating bye).
    assert len(_round_robin([1, 2, 3, 4])) == 3
    assert len(_round_robin([1, 2, 3, 4, 5, 6])) == 5
    assert len(_round_robin([1, 2, 3])) == 3
    assert len(_round_robin([1, 2, 3, 4, 5])) == 5
    assert len(_round_robin([1, 2])) == 1


@pytest.mark.parametrize("n", [3, 5, 7, 9])
def test_each_team_byes_exactly_once_odd(n):
    # The bye feature relies on every team resting exactly once across the
    # schedule — that bijection is what lets the organiser pick who sits out a
    # round by swapping whole rounds.
    teams = list(range(1, n + 1))
    rounds = _round_robin(teams)
    byes = [_byed_team(teams, rnd) for rnd in rounds]
    assert sorted(byes) == teams


def test_no_bye_when_even():
    teams = [1, 2, 3, 4]
    assert all(_byed_team(teams, rnd) is None for rnd in _round_robin(teams))


def test_byed_team_is_the_absent_one():
    assert _byed_team([1, 2, 3, 4, 5], [(1, 2), (3, 4)]) == 5
    assert _byed_team([1, 2, 3, 4], [(1, 2), (3, 4)]) is None


def test_rr_round_num_parses_trailing_number():
    assert _rr_round_num("الجولة 1") == 1
    assert _rr_round_num("الجولة 12") == 12
    assert _rr_round_num(None) == 0
    assert _rr_round_num("") == 0


def test_round_robin_home_away_roughly_balanced():
    # No team should be home (or away) in every one of its games.
    rounds = _round_robin([1, 2, 3, 4, 5, 6])
    home = {t: 0 for t in range(1, 7)}
    played = {t: 0 for t in range(1, 7)}
    for rnd in rounds:
        for h, a in rnd:
            home[h] += 1
            played[h] += 1
            played[a] += 1
    for t in range(1, 7):
        assert 0 < home[t] < played[t], f"team {t} never rotates home/away"


# ── knockout ─────────────────────────────────────────────────────────────────
def test_knockout_final_semi_quarter_have_no_byes():
    for n, pairs_n, label in [(2, 1, "النهائي"), (4, 2, "نصف النهائي"),
                              (8, 4, "ربع النهائي"), (16, 8, "ثمن النهائي")]:
        teams = list(range(1, n + 1))
        pairs, lbl = _knockout_pairs(teams)
        assert len(pairs) == pairs_n
        assert lbl == label
        # No byes: every team is paired, each exactly once.
        flat = [t for pr in pairs for t in pr]
        assert sorted(flat) == teams


@pytest.mark.parametrize("n,size,byes,n_pairs", [
    (3, 4, 1, 1),
    (5, 8, 3, 1),
    (6, 8, 2, 2),
    (7, 8, 1, 3),
    (9, 16, 7, 1),
    (12, 16, 4, 4),
])
def test_knockout_byes_go_to_top_seeds(n, size, byes, n_pairs):
    teams = list(range(1, n + 1))
    pairs, _label = _knockout_pairs(teams)
    assert len(pairs) == n_pairs
    played = [t for pr in pairs for t in pr]
    # The first `byes` teams skip round 1; the rest are paired consecutively.
    assert played == teams[byes:]
    # Bye teams never appear in a round-1 pair.
    assert not (set(teams[:byes]) & set(played))


def test_knockout_label_scales_with_bracket_size():
    # A 12-team bracket rounds up to 16 → its first round is the round of 16.
    _pairs, label = _knockout_pairs(list(range(1, 13)))
    assert label == "ثمن النهائي"  # size 16 → 4 rounds → round of 16
