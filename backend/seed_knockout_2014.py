"""Fill not-yet-played knockout matches in UG 2014 (cage 2) with results,
lineups (7-a-side), goals/assists/cards/a substitution, and a player of the
match. Knockout ties are decisive; to exercise the extra-time + penalty-shootout
path, the LAST knockout match goes to ET and is settled on penalties.

Re-runnable: clears its own output for the targeted matches first.
Run from the backend directory:  python seed_knockout_2014.py
"""
import random
import sys

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import func

from app import create_app
from app.extensions import db
from app.models import (
    Tla3bnyMatch, Tla3bnyMatchEvent, Tla3bnyLineup, Tla3bnyLineupSlot,
    Tla3bnyPlayerTeam, Tla3bnyStage, Tla3bnyAward,
)

CAGE = 2
FORMATION = "2-3-1 (7s)"
SLOTS = ["GK", "CB1", "CB2", "LM", "CM", "RM", "ST"]

app = create_app()
with app.app_context():
    ko_stages = Tla3bnyStage.query.filter_by(type="knockout").all()
    stages = {s.id: s for s in ko_stages}
    # Only fill matches that haven't been played yet, so already-completed
    # knockout results (e.g. the semi-finals) are left untouched.
    matches = (
        Tla3bnyMatch.query
        .filter(Tla3bnyMatch.competition_age_id == CAGE,
                Tla3bnyMatch.stage_id.in_(list(stages)),
                Tla3bnyMatch.status == "scheduled")
        .order_by(Tla3bnyMatch.id).all()
    )
    match_ids = [m.id for m in matches]

    # clear previous seed for just these matches
    Tla3bnyMatchEvent.query.filter(Tla3bnyMatchEvent.match_id.in_(match_ids)).delete(synchronize_session=False)
    lu_ids = [l.id for l in Tla3bnyLineup.query.filter(Tla3bnyLineup.match_id.in_(match_ids)).all()]
    if lu_ids:
        Tla3bnyLineupSlot.query.filter(Tla3bnyLineupSlot.lineup_id.in_(lu_ids)).delete(synchronize_session=False)
    Tla3bnyLineup.query.filter(Tla3bnyLineup.match_id.in_(match_ids)).delete(synchronize_session=False)
    Tla3bnyAward.query.filter(
        Tla3bnyAward.match_id.in_(match_ids),
        Tla3bnyAward.award_type == "player_of_match",
    ).delete(synchronize_session=False)
    db.session.commit()

    def roster(team_id):
        return [m.player_id for m in Tla3bnyPlayerTeam.query
                .filter_by(team_id=team_id, end_date=None, status="active")
                .order_by(Tla3bnyPlayerTeam.player_id).all()]

    for m in matches:
        rng = random.Random(m.id * 7 + 13)
        stage = stages.get(m.stage_id)
        # Label the match by its stage (النهائي, تحديد المركز الثالث…) if unset.
        if not m.round and stage and stage.name:
            m.round = stage.name
        # The final is the showcase tie settled on penalties after extra time.
        to_pens = bool(stage and stage.name and "النهائي" in stage.name
                       and "نصف" not in stage.name)
        home_pl, away_pl = roster(m.home_team_id), roster(m.away_team_id)

        def make_lineup(team_id, pool):
            starters, subs = pool[:7], pool[7:11]
            lu = Tla3bnyLineup(match_id=m.id, team_id=team_id, formation=FORMATION)
            db.session.add(lu)
            db.session.flush()
            for i, pid in enumerate(starters):
                db.session.add(Tla3bnyLineupSlot(lineup_id=lu.id, player_id=pid,
                    position_slot=SLOTS[i] if i < len(SLOTS) else None, is_substitute=False))
            for pid in subs:
                db.session.add(Tla3bnyLineupSlot(lineup_id=lu.id, player_id=pid,
                    position_slot=None, is_substitute=True))
            return starters, subs

        hs, hsub = make_lineup(m.home_team_id, home_pl)
        as_, asub = make_lineup(m.away_team_id, away_pl)

        def add_goals(n, team_id, starters, subs, et=False):
            outfield = starters[1:] + subs
            for _ in range(n):
                scorer = rng.choice(outfield) if outfield else starters[0]
                minute = rng.randint(41, 50) if et else rng.randint(1, 40)
                db.session.add(Tla3bnyMatchEvent(match_id=m.id, player_id=scorer, team_id=team_id,
                    event_type="goal", minute=minute, is_own_goal=False, is_extra_time=et))
                if len(outfield) > 1 and rng.random() < 0.6:
                    assister = rng.choice([p for p in outfield if p != scorer])
                    db.session.add(Tla3bnyMatchEvent(match_id=m.id, player_id=assister, team_id=team_id,
                        event_type="assist", minute=minute, is_extra_time=et))

        if to_pens:
            # level after regular time and after extra time, then a shootout.
            reg_h = reg_a = 2
            et_h = et_a = 3  # cumulative after ET
            m.home_score, m.away_score = reg_h, reg_a
            m.home_score_et, m.away_score_et = et_h, et_a
            m.home_score_pen, m.away_score_pen = 4, 3  # home wins the shootout
            add_goals(reg_h, m.home_team_id, hs, hsub, et=False)
            add_goals(reg_a, m.away_team_id, as_, asub, et=False)
            add_goals(et_h - reg_h, m.home_team_id, hs, hsub, et=True)
            add_goals(et_a - reg_a, m.away_team_id, as_, asub, et=True)

            # penalty shootout: 5 kicks each, alternating, home 4/5, away 3/5.
            home_res = ["penalty_scored", "penalty_scored", "penalty_scored",
                        "penalty_missed", "penalty_scored"]
            away_res = ["penalty_scored", "penalty_scored", "penalty_missed",
                        "penalty_scored", "penalty_missed"]
            home_kicks, order = [], 1
            for i in range(5):
                he = Tla3bnyMatchEvent(match_id=m.id, player_id=hs[i % len(hs)],
                    team_id=m.home_team_id, event_type=home_res[i], kick_order=order)
                db.session.add(he); home_kicks.append((he, home_res[i])); order += 1
                db.session.add(Tla3bnyMatchEvent(match_id=m.id, player_id=as_[i % len(as_)],
                    team_id=m.away_team_id, event_type=away_res[i], kick_order=order)); order += 1
            for he, res in reversed(home_kicks):   # the kick that clinched it
                if res == "penalty_scored":
                    he.is_winning_kick = True
                    break
        else:
            home_score = rng.choice([1, 2, 2, 3, 4])
            away_score = rng.choice([0, 1, 1, 2, 3])
            if home_score == away_score:
                home_score += 1
            m.home_score, m.away_score = home_score, away_score
            add_goals(home_score, m.home_team_id, hs, hsub)
            add_goals(away_score, m.away_team_id, as_, asub)

        m.status = "completed"

        # cards
        if rng.random() < 0.6:
            db.session.add(Tla3bnyMatchEvent(match_id=m.id, player_id=rng.choice(hs[1:]),
                team_id=m.home_team_id, event_type="yellow", minute=rng.randint(1, 50)))
        if rng.random() < 0.5:
            db.session.add(Tla3bnyMatchEvent(match_id=m.id, player_id=rng.choice(as_[1:]),
                team_id=m.away_team_id, event_type="yellow", minute=rng.randint(1, 50)))

        # one substitution per team
        for team_id, starters, subs in ((m.home_team_id, hs, hsub), (m.away_team_id, as_, asub)):
            if subs:
                minute = rng.randint(25, 50)
                out_ev = Tla3bnyMatchEvent(match_id=m.id, player_id=starters[-1], team_id=team_id,
                    event_type="substitution_out", minute=minute)
                db.session.add(out_ev)
                db.session.flush()
                db.session.add(Tla3bnyMatchEvent(match_id=m.id, player_id=subs[0], team_id=team_id,
                    event_type="substitution_in", minute=minute, related_event_id=out_ev.id))

    db.session.commit()

    # Player of the match — top scorer (open-play goals) of each match.
    for m in matches:
        rows = db.session.query(Tla3bnyMatchEvent.player_id, func.count()).filter(
            Tla3bnyMatchEvent.match_id == m.id,
            Tla3bnyMatchEvent.event_type == "goal",
        ).group_by(Tla3bnyMatchEvent.player_id).all()
        pid = max(rows, key=lambda r: r[1])[0] if rows else None
        if pid:
            db.session.add(Tla3bnyAward(
                competition_id=m.competition_id, competition_age_id=CAGE,
                award_type="player_of_match", match_id=m.id, player_id=pid))
    db.session.commit()

    print(f"Filled {len(matches)} knockout match(es):")
    for m in matches:
        extra = ""
        if m.home_score_pen is not None:
            extra = f"  (ET {m.home_score_et}-{m.away_score_et}, pens {m.home_score_pen}-{m.away_score_pen})"
        print(f"  m{m.id}: {m.home_team_id} {m.home_score}-{m.away_score} {m.away_team_id} [{m.status}]{extra}")
