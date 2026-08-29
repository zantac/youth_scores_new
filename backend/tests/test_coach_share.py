"""The shared coach/staff card's post label, exercised without a database.

`_coach_post_label` is the whole decision: given a coach's stints — each
(is_current, start_date, role, place) — what single line does the WhatsApp card
show? It must name *where* (club, or club + age group for a team), prefer the
actual current post, and mark a fallen-back past post "(سابقًا)".
"""

from datetime import date

from app import _coach_post_label, _join_place

AR_FORMER = "(سابقًا)"


class TestJoinPlace:
    def test_club_and_age(self):
        assert _join_place("الأهلي", "2011") == "الأهلي - 2011"

    def test_skips_empty_age(self):
        assert _join_place("الأهلي", "") == "الأهلي"

    def test_skips_empty_club(self):
        assert _join_place("", "2011") == "2011"

    def test_all_empty(self):
        assert _join_place("", "") == ""


class TestCurrentPost:
    def test_team_stint_names_club_and_age(self):
        label = _coach_post_label([(True, date(2023, 8, 1), "مدرب", "الأهلي - 2011")])
        assert label == "مدرب — الأهلي - 2011"
        assert AR_FORMER not in label

    def test_club_staff_stint_names_club(self):
        assert _coach_post_label([(True, date(2022, 1, 1), "مدير الكرة", "الأهلي")]) \
            == "مدير الكرة — الأهلي"

    def test_current_wins_over_more_recent_past(self):
        # A current post beats a past one that started later.
        label = _coach_post_label([
            (False, date(2024, 1, 1), "مدرب عام", "الزمالك"),
            (True,  date(2020, 1, 1), "مدرب", "الأهلي - 2011"),
        ])
        assert label == "مدرب — الأهلي - 2011"

    def test_newest_of_several_current(self):
        label = _coach_post_label([
            (True, date(2021, 1, 1), "مدرب", "الأهلي - 2010"),
            (True, date(2023, 1, 1), "مدرب", "الأهلي - 2012"),
        ])
        assert label == "مدرب — الأهلي - 2012"


class TestFormerPost:
    def test_no_current_marks_former(self):
        label = _coach_post_label([(False, date(2019, 6, 1), "مدرب", "الأهلي - 2008")])
        assert label == f"مدرب — الأهلي - 2008 {AR_FORMER}"

    def test_newest_past_wins_when_none_current(self):
        label = _coach_post_label([
            (False, date(2018, 1, 1), "مدرب", "الأهلي"),
            (False, date(2022, 1, 1), "مدير", "الزمالك"),
        ])
        assert label == f"مدير — الزمالك {AR_FORMER}"


class TestDegenerate:
    def test_no_stints_is_empty(self):
        assert _coach_post_label([]) == ""

    def test_role_only_no_place(self):
        assert _coach_post_label([(True, date(2023, 1, 1), "طبيب", "")]) == "طبيب"

    def test_place_only_no_role(self):
        assert _coach_post_label([(True, date(2023, 1, 1), "", "الأهلي")]) == "الأهلي"

    def test_stint_with_neither_is_dropped(self):
        # An empty role+place stint is ignored, so a real one still shows.
        label = _coach_post_label([
            (True, date(2023, 1, 1), "", ""),
            (False, date(2020, 1, 1), "مدرب", "الأهلي"),
        ])
        assert label == f"مدرب — الأهلي {AR_FORMER}"
