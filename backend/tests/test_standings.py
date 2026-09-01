"""Standings rules, exercised without a database.

The tiebreak is the part worth pinning down: it only consults head-to-head when
every tied pair has played exactly twice, and silently falls back otherwise.
"""

from dataclasses import dataclass
from datetime import datetime

import pytest

from app.services.standings import calculate, team_form


# Light stand-ins so the rules can be tested without a session.
@dataclass
class FakeStage:
    id: int = 1
    type: str = "league"


@dataclass
class FakeTeam:
    # No point_deduction: it belongs to the competition entry, not the squad,
    # and reaches calculate() through its `deductions` argument.
    id: int


@dataclass
class FakeMatch:
    home_team_id: int
    away_team_id: int
    home_score: int | None
    away_score: int | None
    status: str = "completed"
    stage_id: int = 1
    stage: FakeStage = None
    match_date: datetime = datetime(2025, 9, 1)

    def __post_init__(self):
        if self.stage is None:
            self.stage = FakeStage(id=self.stage_id)


def m(h, a, hs, aws, **kw):
    return FakeMatch(h, a, hs, aws, **kw)


def teams(*ids):
    return [FakeTeam(i) for i in ids]


def positions(standings):
    return [s.team_id for s in standings]


class TestPoints:
    def test_win_draw_loss(self):
        s = calculate([m(1, 2, 2, 0), m(1, 3, 1, 1), m(1, 4, 0, 3)], teams(1, 2, 3, 4))
        t1 = next(x for x in s if x.team_id == 1)
        assert (t1.played, t1.won, t1.drawn, t1.lost) == (3, 1, 1, 1)
        assert t1.points == 4
        assert (t1.goals_for, t1.goals_against, t1.goal_diff) == (3, 4, -1)

    def test_incomplete_and_knockout_ignored(self):
        ms = [
            m(1, 2, 5, 0, status="scheduled"),                  # not played
            m(1, 2, None, None),                                # completed, no score
            m(1, 2, 5, 0, stage=FakeStage(2, "knockout")),      # knockout never counts
        ]
        for s in calculate(ms, teams(1, 2)):
            assert s.played == 0 and s.points == 0

    def test_point_deduction_applies(self):
        s = calculate([m(1, 2, 1, 0)], teams(1, 2), deductions={1: 3})
        # 3 for the win, less the 3-point deduction.
        assert next(x for x in s if x.team_id == 1).points == 0
        # Both on 0; they met once so head-to-head does not apply and the better
        # goal difference (+1) leads.
        assert positions(s) == [1, 2]

    def test_deduction_changes_the_order(self):
        # Team 1 wins, so without a deduction it would lead.
        assert positions(calculate([m(1, 2, 1, 0)], teams(1, 2))) == [1, 2]
        s = calculate([m(1, 2, 1, 0)], teams(1, 2), deductions={1: 6})
        assert next(x for x in s if x.team_id == 1).points == -3
        assert positions(s) == [2, 1]


class TestTiebreak:
    # Teams 1 and 2 finish level on 7 points in both tests below. 2 wins the
    # head-to-head; 1 has by far the better overall goal difference (+8 vs +1).
    # The only difference between the two fixtures is how often 1 and 2 met —
    # which is precisely what decides whether head-to-head is consulted.

    def test_h2h_used_when_every_pair_played_twice(self):
        ms = [
            m(2, 1, 1, 0), m(1, 2, 0, 0),       # the pair, exactly twice
            m(1, 3, 5, 0), m(1, 3, 4, 0),
            m(2, 3, 1, 0), m(3, 2, 1, 0),
        ]
        s = calculate(ms, teams(1, 2, 3))
        one = next(x for x in s if x.team_id == 1)
        two = next(x for x in s if x.team_id == 2)
        assert one.points == two.points == 7, "precondition: level on points"
        assert one.goal_diff == 8 and two.goal_diff == 1, "precondition: 1 has better GD"
        # Head-to-head applies and 2 took 4 points off 1, so 2 leads despite the GD.
        assert positions(s) == [2, 1, 3]

    def test_falls_back_to_goal_difference_when_pair_played_once(self):
        ms = [
            m(2, 1, 1, 0),                      # the pair, only once
            m(1, 3, 5, 0), m(1, 3, 4, 0),
            m(2, 3, 1, 0), m(3, 2, 1, 0),
        ]
        s = calculate(ms, teams(1, 2, 3))
        one = next(x for x in s if x.team_id == 1)
        two = next(x for x in s if x.team_id == 2)
        assert one.points == two.points == 6, "precondition: level on points"
        # 2 won the only meeting, so head-to-head would put 2 first — but the pair
        # did not play twice, so goal difference decides and 1 leads instead.
        assert one.goal_diff == 8 and two.goal_diff == 1
        assert positions(s) == [1, 2, 3]

    def test_goals_for_breaks_equal_goal_difference(self):
        # Level on points and GD, never met; more goals scored leads.
        ms = [m(1, 3, 3, 1), m(2, 3, 2, 0)]
        s = calculate(ms, teams(1, 2, 3))
        a = next(x for x in s if x.team_id == 1)
        b = next(x for x in s if x.team_id == 2)
        assert (a.points, a.goal_diff) == (b.points, b.goal_diff) == (3, 2)
        assert a.goals_for == 3 and b.goals_for == 2
        assert positions(s)[0] == 1

    def test_three_way_tie_uses_mini_league(self):
        # All three level on 3 pts from the mini-league; each pair played twice.
        ms = [
            m(1, 2, 2, 0), m(2, 1, 1, 0),
            m(2, 3, 3, 0), m(3, 2, 1, 0),
            m(3, 1, 2, 0), m(1, 3, 1, 0),
        ]
        s = calculate(ms, teams(1, 2, 3))
        assert len({x.points for x in s}) == 1, "precondition: all level"
        assert len(positions(s)) == 3 and set(positions(s)) == {1, 2, 3}

    def test_pair_that_never_met_falls_back(self):
        ms = [m(1, 3, 1, 0), m(3, 1, 0, 1), m(2, 3, 4, 0), m(3, 2, 0, 4)]
        s = calculate(ms, teams(1, 2, 3))
        # 1 and 2 are level on 6 points but never played; GD decides, so 2 leads.
        assert positions(s)[0] == 2


class TestGrouping:
    def test_group_filter_keeps_matches_against_outsiders(self):
        # Team 3 is outside the group, but the result against it still counts.
        ms = [m(1, 3, 4, 0), m(1, 2, 0, 1)]
        s = calculate(ms, teams(1, 2, 3), team_ids={1, 2})
        assert {x.team_id for x in s} == {1, 2}
        t1 = next(x for x in s if x.team_id == 1)
        assert t1.played == 2 and t1.goals_for == 4

    def test_positions_are_sequential(self):
        s = calculate([m(1, 2, 1, 0), m(3, 4, 2, 0)], teams(1, 2, 3, 4))
        assert [x.position for x in s] == [1, 2, 3, 4]

    def test_team_with_no_matches_still_appears(self):
        s = calculate([], teams(1, 2))
        assert len(s) == 2 and all(x.played == 0 for x in s)


class TestForm:
    def test_most_recent_first_and_capped(self):
        ms = [
            m(1, 2, 1, 0, match_date=datetime(2025, 9, 1)),
            m(2, 1, 2, 0, match_date=datetime(2025, 9, 8)),
            m(1, 3, 1, 1, match_date=datetime(2025, 9, 15)),
        ]
        assert team_form(1, ms) == ["D", "L", "W"]
        assert len(team_form(1, ms, limit=2)) == 2

    def test_ignores_unplayed(self):
        assert team_form(1, [m(1, 2, None, None, status="scheduled")]) == []


class TestCompletedStatusVocabulary:
    # tla3bny stores a played result under either "completed" or "finished"; the
    # table must count both. Passing a single status must still exclude the other,
    # which is exactly the bug this guards: the tla3bny engine passed only
    # "completed", so "finished" matches were silently dropped from the table.
    BOTH = ("completed", "finished")

    def test_single_status_excludes_the_other(self):
        s = calculate([m(1, 2, 3, 0, status="finished")], teams(1, 2))
        # Default counts only "completed", so a "finished" result doesn't register.
        assert all(x.played == 0 for x in s)

    def test_both_statuses_count_when_passed(self):
        ms = [m(1, 2, 3, 0, status="finished"), m(1, 2, 1, 1, status="completed")]
        s = calculate(ms, teams(1, 2), completed_status=self.BOTH)
        one = next(x for x in s if x.team_id == 1)
        assert one.played == 2 and one.points == 4  # a win + a draw

    def test_team_form_counts_both_statuses(self):
        ms = [
            m(1, 2, 1, 0, status="finished",  match_date=datetime(2025, 9, 1)),
            m(2, 1, 2, 0, status="completed", match_date=datetime(2025, 9, 8)),
        ]
        assert team_form(1, ms, completed_status=self.BOTH) == ["L", "W"]
        # With the default single status, the "finished" leg drops out.
        assert team_form(1, ms) == ["L"]
