"""Fill UG 2014 (comp 1, sub-competition cage 2) with realistic played data:

  * results for every scheduled group match (7-a-side)
  * lineups (7 starters + subs) with a substitution each
  * goals, assists, yellow/red cards
  * player of the match (per match), player of the round + team of the round
    (best 7, per round), and competition titles / individual awards

Standings & statistics are computed from this on read — nothing to seed there.
Re-runnable: it clears its own previous output for cage 2 first.

Run from the backend directory:  python seed_ug_2014_results.py
"""
import random
import sys

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import func

from app import create_app
from app.extensions import db
from app.models import (
    Tla3bnyMatch, Tla3bnyMatchEvent, Tla3bnyLineup, Tla3bnyLineupSlot,
    Tla3bnyPlayerTeam, Tla3bnyAward, Tla3bnyTeamOfRound, Tla3bnyTeamOfRoundSlot,
)
from app.services import tla3bny_tables as tables

COMP = 1
CAGE = 2
AGE_CAT = 2
STAGE = 1
FORMATION = "2-3-1 (7s)"
SLOTS = ["GK", "CB1", "CB2", "LM", "CM", "RM", "ST"]  # 7-a-side


def round_key(label):
    """Sort 'الجولة 1'..'الجولة 10' numerically by their trailing number."""
    digits = "".join(ch for ch in label if ch.isdigit())
    return int(digits) if digits else 0


app = create_app()
with app.app_context():
    matches = (
        Tla3bnyMatch.query
        .filter_by(competition_age_id=CAGE, stage_id=STAGE)
        .order_by(Tla3bnyMatch.round, Tla3bnyMatch.id)
        .all()
    )
    match_ids = [m.id for m in matches]

    # ── clear previous seed for this sub-competition ──────────────────────────
    Tla3bnyMatchEvent.query.filter(Tla3bnyMatchEvent.match_id.in_(match_ids)).delete(synchronize_session=False)
    lu_ids = [l.id for l in Tla3bnyLineup.query.filter(Tla3bnyLineup.match_id.in_(match_ids)).all()]
    if lu_ids:
        Tla3bnyLineupSlot.query.filter(Tla3bnyLineupSlot.lineup_id.in_(lu_ids)).delete(synchronize_session=False)
    Tla3bnyLineup.query.filter(Tla3bnyLineup.match_id.in_(match_ids)).delete(synchronize_session=False)
    Tla3bnyAward.query.filter_by(competition_id=COMP, competition_age_id=CAGE).delete(synchronize_session=False)
    totr_ids = [t.id for t in Tla3bnyTeamOfRound.query.filter_by(competition_id=COMP, competition_age_id=CAGE).all()]
    if totr_ids:
        Tla3bnyTeamOfRoundSlot.query.filter(Tla3bnyTeamOfRoundSlot.team_of_round_id.in_(totr_ids)).delete(synchronize_session=False)
    Tla3bnyTeamOfRound.query.filter_by(competition_id=COMP, competition_age_id=CAGE).delete(synchronize_session=False)
    db.session.commit()

    def roster(team_id):
        return [
            m.player_id for m in
            Tla3bnyPlayerTeam.query
            .filter_by(team_id=team_id, end_date=None, status="active")
            .order_by(Tla3bnyPlayerTeam.player_id).all()
        ]

    goals_by_player = {}                 # player_id -> total goals (for awards)
    round_scorers = {}                   # round -> {player_id: goals}
    round_players = {}                   # round -> set(player_id) that started

    def bump(d, k, n=1):
        d[k] = d.get(k, 0) + n

    # ── results, lineups, events ──────────────────────────────────────────────
    for m in matches:
        rng = random.Random(m.id * 7 + 13)
        rnd = m.round
        home_pl, away_pl = roster(m.home_team_id), roster(m.away_team_id)

        def make_lineup(team_id, pool):
            starters, subs = pool[:7], pool[7:11]
            lu = Tla3bnyLineup(match_id=m.id, team_id=team_id, formation=FORMATION)
            db.session.add(lu)
            db.session.flush()
            for i, pid in enumerate(starters):
                db.session.add(Tla3bnyLineupSlot(
                    lineup_id=lu.id, player_id=pid,
                    position_slot=SLOTS[i] if i < len(SLOTS) else None,
                    is_substitute=False))
            for pid in subs:
                db.session.add(Tla3bnyLineupSlot(
                    lineup_id=lu.id, player_id=pid, position_slot=None, is_substitute=True))
            return starters, subs

        hs, hsub = make_lineup(m.home_team_id, home_pl)
        as_, asub = make_lineup(m.away_team_id, away_pl)
        round_players.setdefault(rnd, set()).update(hs + as_)

        home_score = rng.choice([0, 1, 1, 2, 2, 3, 4])
        away_score = rng.choice([0, 0, 1, 1, 2, 3])
        m.home_score, m.away_score, m.status = home_score, away_score, "completed"

        def add_goals(n, team_id, starters, subs):
            outfield = starters[1:] + subs  # exclude the GK from scorers
            for _ in range(n):
                scorer = rng.choice(outfield) if outfield else starters[0]
                minute = rng.randint(1, 50)
                db.session.add(Tla3bnyMatchEvent(
                    match_id=m.id, player_id=scorer, team_id=team_id,
                    event_type="goal", minute=minute, is_own_goal=False))
                bump(goals_by_player, scorer)
                bump(round_scorers.setdefault(rnd, {}), scorer)
                if len(outfield) > 1 and rng.random() < 0.6:
                    assister = rng.choice([p for p in outfield if p != scorer])
                    db.session.add(Tla3bnyMatchEvent(
                        match_id=m.id, player_id=assister, team_id=team_id,
                        event_type="assist", minute=minute))

        add_goals(home_score, m.home_team_id, hs, hsub)
        add_goals(away_score, m.away_team_id, as_, asub)

        # cards
        if rng.random() < 0.5:
            db.session.add(Tla3bnyMatchEvent(match_id=m.id, player_id=rng.choice(hs[1:]),
                team_id=m.home_team_id, event_type="yellow", minute=rng.randint(1, 50)))
        if rng.random() < 0.4:
            db.session.add(Tla3bnyMatchEvent(match_id=m.id, player_id=rng.choice(as_[1:]),
                team_id=m.away_team_id, event_type="yellow", minute=rng.randint(1, 50)))
        if rng.random() < 0.12:
            db.session.add(Tla3bnyMatchEvent(match_id=m.id, player_id=rng.choice(hs[1:]),
                team_id=m.home_team_id, event_type="red", minute=rng.randint(30, 50)))

        # one substitution per team
        def add_sub(team_id, starters, subs):
            if subs:
                minute = rng.randint(25, 50)
                out_ev = Tla3bnyMatchEvent(match_id=m.id, player_id=starters[-1],
                    team_id=team_id, event_type="substitution_out", minute=minute)
                db.session.add(out_ev)
                db.session.flush()
                db.session.add(Tla3bnyMatchEvent(match_id=m.id, player_id=subs[0],
                    team_id=team_id, event_type="substitution_in", minute=minute,
                    related_event_id=out_ev.id))

        add_sub(m.home_team_id, hs, hsub)
        add_sub(m.away_team_id, as_, asub)

    db.session.commit()

    # ── player of the match (top scorer, else a starter) ──────────────────────
    for m in matches:
        rows = db.session.query(
            Tla3bnyMatchEvent.player_id, func.count()
        ).filter(
            Tla3bnyMatchEvent.match_id == m.id,
            Tla3bnyMatchEvent.event_type == "goal",
        ).group_by(Tla3bnyMatchEvent.player_id).all()
        if rows:
            pid = max(rows, key=lambda r: r[1])[0]
        else:
            slot = (Tla3bnyLineupSlot.query.join(Tla3bnyLineup)
                    .filter(Tla3bnyLineup.match_id == m.id,
                            Tla3bnyLineupSlot.is_substitute == False)  # noqa: E712
                    .first())
            pid = slot.player_id if slot else None
        if pid:
            db.session.add(Tla3bnyAward(
                competition_id=COMP, competition_age_id=CAGE,
                award_type="player_of_match", match_id=m.id, player_id=pid))

    # ── player of the round + team of the round (best 7) ──────────────────────
    for rnd in sorted({m.round for m in matches}, key=round_key):
        sc = round_scorers.get(rnd, {})
        if sc:
            pid = max(sc.items(), key=lambda kv: (kv[1], -kv[0]))[0]
            db.session.add(Tla3bnyAward(
                competition_id=COMP, competition_age_id=CAGE,
                award_type="player_of_round", round=rnd, player_id=pid))
        pool = sorted(round_players.get(rnd, []), key=lambda p: (-sc.get(p, 0), p))
        chosen = pool[:7]
        if len(chosen) == 7:
            totr = Tla3bnyTeamOfRound(competition_id=COMP, competition_age_id=CAGE,
                                      round=rnd, formation=FORMATION)
            db.session.add(totr)
            db.session.flush()
            for i, pid in enumerate(chosen):
                db.session.add(Tla3bnyTeamOfRoundSlot(
                    team_of_round_id=totr.id, player_id=pid,
                    position_slot=SLOTS[i], sort_order=i))

    # ── competition honours: champion / runner-up + individual awards ─────────
    groups = tables.standings_by_group(COMP, AGE_CAT, cage_id=CAGE)
    allrows = [r for g in groups for r in g["standings"]]
    allrows.sort(key=lambda r: (-r["Pts"], -r["GD"], -r["GF"]))
    if allrows:
        db.session.add(Tla3bnyAward(competition_id=COMP, competition_age_id=CAGE,
            award_type="champion", team_id=allrows[0]["team_id"], note="بطل المجموعات"))
    if len(allrows) > 1:
        db.session.add(Tla3bnyAward(competition_id=COMP, competition_age_id=CAGE,
            award_type="runner_up", team_id=allrows[1]["team_id"]))
    ranked = sorted(goals_by_player.items(), key=lambda kv: (-kv[1], kv[0]))
    if ranked:
        db.session.add(Tla3bnyAward(competition_id=COMP, competition_age_id=CAGE,
            award_type="top_scorer", player_id=ranked[0][0],
            note=f"{ranked[0][1]} أهداف"))
    if len(ranked) > 1:
        db.session.add(Tla3bnyAward(competition_id=COMP, competition_age_id=CAGE,
            award_type="best_player", player_id=ranked[1][0]))

    db.session.commit()

    # ── summary ───────────────────────────────────────────────────────────────
    ev = Tla3bnyMatchEvent.query.filter(Tla3bnyMatchEvent.match_id.in_(match_ids))
    print("UG 2014 (cage 2) seeded:")
    print(f"  matches completed : {len(matches)}")
    print(f"  goals             : {ev.filter_by(event_type='goal').count()}")
    print(f"  assists           : {ev.filter_by(event_type='assist').count()}")
    print(f"  yellow cards      : {ev.filter_by(event_type='yellow').count()}")
    print(f"  red cards         : {ev.filter_by(event_type='red').count()}")
    print(f"  lineups           : {Tla3bnyLineup.query.filter(Tla3bnyLineup.match_id.in_(match_ids)).count()}")
    print(f"  awards            : {Tla3bnyAward.query.filter_by(competition_id=COMP, competition_age_id=CAGE).count()}")
    print(f"  teams of the round: {Tla3bnyTeamOfRound.query.filter_by(competition_id=COMP, competition_age_id=CAGE).count()}")
