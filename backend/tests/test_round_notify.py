"""The round-results auto-digest transition, exercised without a database.

`_round_settles_now` is the whole decision: given the statuses of the *other*
matches in a round and how one match's status just changed, should the round's
results digest fire now? It must fire exactly once — on the not-settled →
settled edge — and never for a round with nothing actually played.

"Settled" means no match is still `scheduled` or `live` (a live score can still
move) and at least one match is `completed`.
"""

from app.api.entry import _round_settles_now


def fires(others, old, new):
    return _round_settles_now(others, old, new)


class TestFiresOnLastResult:
    def test_last_scheduled_match_completed(self):
        # Two others already completed; the last scheduled match's result lands.
        assert fires(["completed", "completed"], "scheduled", "completed")

    def test_single_match_round(self):
        # A one-match round settles the moment that match is completed.
        assert fires([], "scheduled", "completed")

    def test_last_live_match_completed(self):
        # The other match is already completed; this one goes live → completed.
        assert fires(["completed"], "live", "completed")


class TestBlockedWhileScheduledOrLive:
    def test_not_when_another_still_scheduled(self):
        # This match completes, but a sibling hasn't been played yet.
        assert not fires(["scheduled"], "scheduled", "completed")

    def test_not_when_another_still_live(self):
        # A live sibling's score can still change, so the round isn't settled.
        assert not fires(["live"], "scheduled", "completed")

    def test_not_when_this_match_only_goes_live(self):
        # Clearing the last scheduled match to *live* (not a final result) with
        # nothing completed yet must not fire.
        assert not fires(["live"], "scheduled", "live")


class TestNothingPlayed:
    def test_all_postponed_sends_nothing(self):
        # Last blocking match is postponed and nothing was ever completed.
        assert not fires(["postponed"], "scheduled", "postponed")

    def test_all_cancelled_sends_nothing(self):
        assert not fires(["cancelled", "cancelled"], "scheduled", "cancelled")

    def test_postponed_but_a_sibling_was_played(self):
        # A played result exists, and the last blocking match is postponed → fire.
        assert fires(["completed"], "scheduled", "postponed")


class TestFiresExactlyOnce:
    def test_no_refire_on_score_correction(self):
        # Round already settled (both others completed); re-saving a completed
        # match (e.g. fixing its score) stays completed → must not fire again.
        assert not fires(["completed", "completed"], "completed", "completed")

    def test_no_refire_when_editing_an_already_settled_round(self):
        # Editing a postponed match in a round that was already settled.
        assert not fires(["completed"], "postponed", "postponed")

    def test_reopening_a_match_does_not_fire(self):
        # Pulling a completed match back to scheduled is the reverse edge.
        assert not fires(["completed"], "completed", "scheduled")

    def test_recompleting_after_reopen_fires_again(self):
        # ...and completing it again re-settles the round, so it fires once more.
        assert fires(["completed"], "scheduled", "completed")
