"""The round-results auto-digest transition, exercised without a database.

`_round_settles_now` is the whole decision: given the statuses of the *other*
matches in a round and how one match's status just changed, should the round's
results digest fire now? It must fire exactly once — on the not-settled →
settled edge — and never for a round with nothing actually played.

"Settled" means no match is still `scheduled` or `live` (a live score can still
move) and at least one match is `completed` *with a scoreline* — a completed
match that has no scores yet still holds the round back.
"""

from app.api.entry import _round_settles_now, _round_state_from

# The decision now runs on round-states, not raw statuses. Map the statuses the
# tests speak in to their state so every existing case reads unchanged, and add
# a "completed_unscored" token for the completed-but-no-score case.
_STATE = {
    "scheduled": "blocking", "live": "blocking",
    "completed": "scored",              # completed WITH scores (the usual case)
    "completed_unscored": "blocking",   # completed but no scoreline yet
    "postponed": "final", "cancelled": "final",
}


def fires(others, old, new):
    st = _STATE.__getitem__
    return _round_settles_now([st(o) for o in others], st(old), st(new))


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


class TestCompletedButUnscored:
    def test_completed_without_scores_does_not_settle(self):
        # The last blocking match is marked completed but has no scoreline yet —
        # the round is not done, so the digest must not fire.
        assert not fires(["completed"], "scheduled", "completed_unscored")

    def test_a_sibling_unscored_blocks_even_when_this_match_scores(self):
        # This match gets a real result, but a sibling is completed-unscored, so
        # the round is still pending.
        assert not fires(["completed_unscored"], "scheduled", "completed")

    def test_scoring_the_last_unscored_match_fires(self):
        # Adding the missing scores to an already-completed match (unscored →
        # scored) is what finally settles the round.
        assert fires(["completed"], "completed_unscored", "completed")


class TestStateClassification:
    def test_completed_with_scores_is_scored(self):
        assert _round_state_from("completed", True) == "scored"

    def test_completed_without_scores_blocks(self):
        assert _round_state_from("completed", False) == "blocking"

    def test_scheduled_and_live_block(self):
        assert _round_state_from("scheduled", False) == "blocking"
        assert _round_state_from("live", False) == "blocking"

    def test_postponed_and_cancelled_are_final(self):
        assert _round_state_from("postponed", False) == "final"
        assert _round_state_from("cancelled", False) == "final"
