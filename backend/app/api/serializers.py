"""Rebuild the legacy feed JSON out of the normalised database.

The website and the Android app both parse the shape the old static feed used
(see web/src/lib/api.ts). Reproducing that shape here lets them run against the
backend with nothing changed but a base URL. IDs in the output are the database's
own — they only have to be consistent within one response, which they are.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time as day_time

import sqlalchemy as sa
from sqlalchemy.orm import joinedload, selectinload

from app.models import (
    Ad,
    AgeGroup,
    AppVersion,
    Club,
    ClubStaff,
    Coach,
    Competition,
    CompetitionTeam,
    Group,
    GroupTeam,
    Match,
    MatchCard,
    MatchGoal,
    MatchPlayer,
    MatchSubstitution,
    News,
    Player,
    PlayerTeam,
    Season,
    Stage,
    Team,
    TeamCoach,
    Venue,
)
from app.models import codes

ASSIST_DELIMITER = "صناعة الاهداف"

# DB status -> the vocabulary the clients expect.
STATUS_OUT = {
    "completed": "completed",
    "scheduled": "upcoming",
    "live": "live",
    # Kept distinct (not collapsed to a generic "delayed") so clients can show a
    # proper "postponed" vs "cancelled" label instead of falling back to a date.
    "postponed": "postponed",
    "cancelled": "cancelled",
}


def _loc(ar, en):
    """A bilingual value in the feed's {ar, en} form, dropped when both empty."""
    if not ar and not en:
        return None
    return {"ar": ar or "", "en": en or ""}


# ── config blob ─────────────────────────────────────────────────────────────

def config_blob(base_url: str) -> dict:
    return {
        "seasons": [_season(s, base_url) for s in Season.query.order_by(Season.id.desc()).all()],
        "venues": [_venue(v) for v in Venue.query.order_by(Venue.id).all()],
        "news": [_news(n) for n in News.query.order_by(News.date.desc()).all()],
        # Serve only ads that are active and within their start/expiry window.
        "Ads": [_ad(a) for a in Ad.query
                .filter(Ad.active.is_(True),
                        sa.or_(Ad.start_date.is_(None), Ad.start_date <= date.today()),
                        sa.or_(Ad.expire_date.is_(None), Ad.expire_date >= date.today()))
                .order_by(Ad.id).all()],
        "app_version": _app_version(),
    }


def _app_version() -> dict:
    """The Android release gate the app polls on startup. Bumping the row's
    version_code above the installed build makes the app show its update
    dialog; force_update makes that dialog non-dismissible."""
    av = AppVersion.query.filter_by(platform="android").first()
    if av is None:
        return {"version_code": "1", "version_name": "1.0.0", "force_update": False}
    return {
        "version_code": av.version_code,
        "version_name": av.version_name,
        "force_update": av.force_update,
    }


def _season(season: Season, base_url: str) -> dict:
    # Regroup the per-(code, age, sector) competition rows back into the feed's
    # competition -> age -> sector nesting.
    by_code: dict[str, list[Competition]] = defaultdict(list)
    for c in season.competitions:
        by_code[c.code or f"comp{c.id}"].append(c)

    # Fetched once rather than per age inside the loop below.
    age_groups = {a.id: a for a in AgeGroup.query.all()}

    def age_order(age_id: int | None) -> int:
        """Sort key putting the oldest age group first.

        Not the group's id: 2008 and 2010 were added after 2011 and carry
        higher ids, so ordering by id would leave them trailing the original
        groups instead of slotting in by age. A competition open to every age
        has no group at all and leads.
        """
        ag = age_groups.get(age_id) if age_id else None
        return ag.oldest_birth_year if ag else -1

    competitions = []
    for code, comps in by_code.items():
        first = comps[0]
        by_age: dict[int | None, list[Competition]] = defaultdict(list)
        for c in comps:
            by_age[c.age_group_id].append(c)

        ages = [
            _age(age_groups.get(age_id) if age_id else None, by_age[age_id], base_url)
            for age_id in sorted(by_age, key=age_order)
        ]

        competitions.append({
            "competition_id": code,
            "name": _loc(first.name_ar, first.name_en) or {"ar": "", "en": ""},
            "ages": ages,
        })

    return {"season": _loc(season.name_ar, season.name_en) or {"ar": "", "en": ""}, "competitions": competitions}


def _age(ag: AgeGroup | None, comps: list[Competition], base_url: str) -> dict:
    # `age` stays a plain string (prefers English) for older clients; `age_name`
    # is the bilingual {ar, en} form newer clients localize.
    age_label = (ag.name_en or ag.name_ar) if ag else ""
    age_name = _loc(ag.name_ar, ag.name_en) if ag else None
    sectored = [c for c in comps if c.sector_key]

    if sectored:
        sectored.sort(key=lambda c: c.id)
        return {
            "age": age_label,
            "age_name": age_name,
            "sector": {
                "ar": [c.sector_ar or "" for c in sectored],
                "en": [c.sector_en or c.sector_ar or "" for c in sectored],
            },
            "matchesurl": [f"{base_url}/api/competitions/{c.id}/data" for c in sectored],
        }

    # A single flat competition for this age.
    c = comps[0]
    return {"age": age_label, "age_name": age_name, "matchesurl": f"{base_url}/api/competitions/{c.id}/data"}


def _venue(v: Venue) -> dict:
    return {"venue_id": str(v.id), "name": _loc(v.name_ar, v.name_en) or "", "url": v.url}


def _news(n: News) -> dict:
    return {
        "id": n.id,
        "date": n.date.isoformat(),
        "title": _loc(n.title_ar, n.title_en) or "",
        "image": n.image_url,
        "details": _loc(n.details_ar, n.details_en),
        "images": n.images or [],
    }


def _ad(a: Ad) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "image": a.image,
        "youtube_video": a.youtube_video,
        "facebook_link": a.facebook_link,
        "mobile_number": a.mobile_number,
        "whatsapp_number": a.whatsapp_number,
        "location": a.location,
        "location_url": a.location_url,
        "link": a.link,
        "weight": a.weight,
        "placement": a.placement,
        "feed_position": a.feed_position,
        "feed_repeat": a.feed_repeat,
        "expire_date": a.expire_date.isoformat() if a.expire_date else None,
    }


# ── one competition's matches + teams ────────────────────────────────────────

def competition_data(competition_id: int) -> dict | None:
    comp = Competition.query.get(competition_id)
    if comp is None:
        return None

    teams = (
        Team.query.join(CompetitionTeam)
        .filter(CompetitionTeam.competition_id == competition_id)
        .order_by(CompetitionTeam.id)
        .all()
    )

    # team_id -> every group it belongs to. A side that qualifies for a second
    # phase sits in two groups (e.g. "2A" and "المرحلة التانية"), each with its
    # own table, so this is a list rather than a single group.
    groups_of: dict[int, list[Group]] = {}
    for g in (Group.query.join(Stage)
              .filter(Stage.competition_id == competition_id)
              .order_by(Group.id).all()):
        for gt in GroupTeam.query.filter_by(group_id=g.id).all():
            groups_of.setdefault(gt.team_id, []).append(g)

    matches = (
        Match.query.join(Stage)
        # Eager-load everything _match() reads, so serializing a competition's
        # fixtures is a fixed handful of queries instead of ~10 per match (N+1).
        # Collections use selectinload (a separate IN query, no row blow-up);
        # each collection's player links are joined onto that same query.
        .options(
            joinedload(Match.stage),
            selectinload(Match.goals).joinedload(MatchGoal.scorer),
            selectinload(Match.goals).joinedload(MatchGoal.assist),
            selectinload(Match.cards).joinedload(MatchCard.player),
            selectinload(Match.substitutions).joinedload(MatchSubstitution.player_in),
            selectinload(Match.substitutions).joinedload(MatchSubstitution.player_out),
            selectinload(Match.lineup).joinedload(MatchPlayer.player),
        )
        .filter(Stage.competition_id == competition_id)
        .filter(Match.deleted_at.is_(None))
        # Undated (TBD) fixtures sort last; is_(None) orders False<True.
        .order_by(Match.match_date.is_(None), Match.match_date)
        .all()
    )

    # The deduction and the second name are both held on the entry, since both
    # belong to this competition rather than to the squad.
    docked: dict[int, int] = {}
    names: dict[int, tuple[str | None, str | None]] = {}
    for ct in CompetitionTeam.query.filter_by(competition_id=competition_id).all():
        docked[ct.team_id] = ct.point_deduction
        names[ct.team_id] = (ct.name_ar, ct.name_en)

    # The competition's own identity + title, so a page opened by id alone can
    # render its header without the caller passing the (Arabic) title in the URL.
    ag = AgeGroup.query.get(comp.age_group_id) if comp.age_group_id else None
    age_ar = (ag.name_ar or ag.name_en) if ag else ""
    age_en = (ag.name_en or ag.name_ar) if ag else ""
    return {
        "competition": {
            "id": comp.id,
            "title": _competition_title(comp, age_ar, age_en),
        },
        "teams": [_team(t, groups_of.get(t.id) or [], docked.get(t.id, 0),
                        names.get(t.id, (None, None)))
                  for t in teams],
        "matches": [_match(m) for m in matches],
        "venues": [],
        # Served ready-made: only the server knows whether a stage carries its
        # points forward, so a client recomputing this would get it wrong.
        "standings": _standings_blocks(competition_id),
    }


def _standings_blocks(competition_id: int) -> list[dict]:
    from app.services.tables import standings_by_group

    blocks = []
    for blk in standings_by_group(competition_id):
        g = blk["group"]
        blocks.append({
            "group": _loc(g.name_ar, g.name_en) if g else None,
            "rows": [{
                "team_id": str(s.team_id),
                "position": s.position,
                "played": s.played,
                "won": s.won,
                "drawn": s.drawn,
                "lost": s.lost,
                "goals_for": s.goals_for,
                "goals_against": s.goals_against,
                "goal_diff": s.goal_diff,
                "points": s.points,
                "point_deduction": s.point_deduction,
            } for s in blk["standings"]],
        })
    return blocks


def _squad_second_name(t: Team) -> tuple[str | None, str | None]:
    """The second name to show for a squad where no single competition is in view.

    The name lives on each competition entry now, so on the team page, a club's
    team list, or the global match feed — none of which is scoped to one
    competition — the one to show is the most recent entry that carries a name.
    """
    ct = (CompetitionTeam.query
          .join(Competition, Competition.id == CompetitionTeam.competition_id)
          .join(Season, Season.id == Competition.season_id)
          .filter(CompetitionTeam.team_id == t.id,
                  sa.or_(CompetitionTeam.name_ar.isnot(None),
                         CompetitionTeam.name_en.isnot(None)))
          .order_by(Season.start_date.desc(), CompetitionTeam.id.desc())
          .first())
    return (ct.name_ar, ct.name_en) if ct else (None, None)


def _squad_names_map() -> dict[int, tuple[str | None, str | None]]:
    """team_id -> its most recent entry's second name, resolved in one query."""
    rows = (CompetitionTeam.query
            .join(Competition, Competition.id == CompetitionTeam.competition_id)
            .join(Season, Season.id == Competition.season_id)
            .filter(sa.or_(CompetitionTeam.name_ar.isnot(None),
                           CompetitionTeam.name_en.isnot(None)))
            .order_by(Season.start_date.asc(), CompetitionTeam.id.asc())
            .with_entities(CompetitionTeam.team_id, CompetitionTeam.name_ar,
                           CompetitionTeam.name_en)
            .all())
    out: dict[int, tuple[str | None, str | None]] = {}
    for team_id, na, ne in rows:  # ascending order, so the newest entry wins
        out[team_id] = (na, ne)
    return out


def _team(t: Team, groups: list[Group], point_deduction: int = 0,
          second_name: tuple[str | None, str | None] = (None, None)) -> dict:
    group = groups[0] if groups else None
    club = t.club
    # Role seniority first (head coach → kit man), then any manual reorder within
    # a role, so the head coach always leads however the staff were added. Only
    # *current* staff (no end date) are shown here; a coach who has left drops off
    # — their history stays on their own profile and in the season-scoped team view.
    role_rank = sa.case(codes.COACH_ROLE_RANK, value=TeamCoach.role_ar,
                        else_=codes.UNRANKED_COACH_ROLE)
    tcs = [tc for tc in TeamCoach.query.filter_by(team_id=t.id)
           .options(joinedload(TeamCoach.coach))
           .order_by(role_rank, TeamCoach.sort_order, TeamCoach.id).all()
           if tc.coach and tc.end_date is None]
    coaches = [
        c.coach.full_name_ar or c.coach.full_name_en
        for c in tcs if (c.coach.full_name_ar or c.coach.full_name_en)
    ]
    # `staff` carries coach IDs so newer clients can link to the coach profile;
    # the legacy `players.coach` name list stays for older clients.
    staff = [{
        "id": tc.coach_id,
        "name": _loc(tc.coach.full_name_ar, tc.coach.full_name_en) or {"ar": "", "en": ""},
        "role": _loc(tc.role_ar, tc.role_en),
        "current": tc.end_date is None,
    } for tc in tcs]

    # Current squad only (no end date). A player who has transferred or whose
    # stint ended drops off; their history stays on their profile and in the
    # season-scoped team view.
    regs = (PlayerTeam.query.filter_by(team_id=t.id)
            .options(joinedload(PlayerTeam.player))
            .order_by(PlayerTeam.sort_order, PlayerTeam.shirt_number.asc(), PlayerTeam.id.asc())
            .all())
    roster = [{
        "id": r.player_id,
        "name": _loc(r.player.full_name_ar, r.player.full_name_en) or {"ar": "", "en": ""},
        "shirt": r.shirt_number,
        "position": _loc(r.player.position_ar, r.player.position_en),
        "birth_year": r.player.birth_year,
        "current": r.end_date is None,
    } for r in regs if r.player and r.end_date is None]

    return {
        "team_id": str(t.id),
        "club_id": club.id,
        # `group` stays single-valued for older clients; `groups` carries them all.
        "group": _loc(group.name_ar, group.name_en) if group else None,
        "groups": [_loc(g.name_ar, g.name_en) or {"ar": "", "en": ""} for g in groups],
        "name": _loc(second_name[0] or club.name_ar, second_name[1] or club.name_en) or "",
        # The club's own name, always. `name` above keeps carrying the team's
        # override so older clients are unaffected; a client that reads both
        # shows the club as the identity with the override beneath it — players
        # are registered with the federation under the club, not the academy.
        "club_name": _loc(club.name_ar, club.name_en) or "",
        "logo": club.logo_url,
        "field": None,
        "fieldurl": None,
        "city": _loc(club.city_ar, club.city_en),
        "point_deduction": point_deduction,
        "staff": staff,
        "roster": roster,
        "players": {
            "coach": coaches,
            "goalkeepers": [],
            "defenders": [],
            "midfielders": [],
            "attackers": [],
        },
    }


def _match(m: Match) -> dict:
    home_goals = [g for g in m.goals if g.team_id == m.home_team_id]
    away_goals = [g for g in m.goals if g.team_id == m.away_team_id]
    home_cards = [c for c in m.cards if c.team_id == m.home_team_id]
    away_cards = [c for c in m.cards if c.team_id == m.away_team_id]

    return {
        "match_id": str(m.id),
        "group": m.round_label_ar or m.round_label_en or "",
        "week": m.week or "",
        "date": m.match_date.strftime("%Y-%m-%d") if m.match_date else "",
        "time": m.match_date.strftime("%H:%M") if m.match_date else "",
        "home_team_id": str(m.home_team_id),
        "away_team_id": str(m.away_team_id),
        "venue": m.venue_ar or m.venue_en or "",
        "status": STATUS_OUT.get(m.status, "upcoming"),
        "note": m.note_ar or m.note_en,
        "home_score": m.home_score,
        "away_score": m.away_score,
        "home_penalty": m.home_penalty_score,
        "away_penalty": m.away_penalty_score,
        "home_scorers": _scorers(home_goals),
        "away_scorers": _scorers(away_goals),
        # Named separately so they can be shown without being counted as this
        # team's scorers. Additive: clients that do not read them are unaffected.
        "home_own_goals": _own_goals(home_goals),
        "away_own_goals": _own_goals(away_goals),
        "home_yc": [_name(c.player) for c in home_cards if c.card_type == "yellow"],
        "away_yc": [_name(c.player) for c in away_cards if c.card_type == "yellow"],
        "home_rc": [_name(c.player) for c in home_cards if c.card_type != "yellow"],
        "away_rc": [_name(c.player) for c in away_cards if c.card_type != "yellow"],
        # The feed's four squad/substitute slots, filled from the real rows now
        # that they can be entered. They stayed empty through the import because
        # the source files never carried any.
        "home_sub": _feed_subs(m, m.home_team_id),
        "away_sub": _feed_subs(m, m.away_team_id),
        # The same substitutions with the two players kept apart, so a client
        # can colour who came on and who went off. The string lists above stay
        # for clients that only know those.
        "subs": [{
            "side": "home" if s.team_id == m.home_team_id else "away",
            "in": _name(s.player_in), "out": _name(s.player_out),
            "minute": s.minute,
        } for s in sorted(m.substitutions,
                          key=lambda s: (s.minute if s.minute is not None else 999))],
        "home_squade": _feed_squad(m, m.home_team_id),
        "away_squade": _feed_squad(m, m.away_team_id),
        # The clients only test whether this equals "knockout".
        "stage": "knockout" if (m.stage and m.stage.is_knockout) else "",
    }


def _name(player) -> str:
    return player.full_name_ar or player.full_name_en or "" if player else ""


def _feed_squad(m: Match, team_id: int) -> list[str]:
    """The team's XI then its bench, as the flat name list the feed uses."""
    # Read the eager-loaded lineup relationship rather than issuing a fresh
    # per-team query, so a competition's fixtures don't add 2 queries per match.
    rows = [r for r in m.lineup if r.team_id == team_id]
    return ([_name(r.player) for r in rows if r.is_starter]
            + [_name(r.player) for r in rows if not r.is_starter])


def _feed_subs(m: Match, team_id: int) -> list[str]:
    """Substitutions as one line each, in the order they happened.

    The feed carries these as plain strings, so the arrows do the work: ↑ came
    on, ↓ went off. That reads the same way round in Arabic and English, which
    naming the two sides in one language would not.
    """
    rows = sorted(
        (s for s in m.substitutions if s.team_id == team_id),
        key=lambda s: (s.minute if s.minute is not None else 999),
    )
    out = []
    for s in rows:
        minute = f"{s.minute}' " if s.minute is not None else ""
        out.append(f"{minute}↑ {_name(s.player_in)} ↓ {_name(s.player_out)}")
    return out


# ── one match, full detail (public match centre) ─────────────────────────────

def _person(p):
    return (p.full_name_ar or p.full_name_en) if p else None


def match_full(m: Match) -> dict:
    comp = m.stage.competition if m.stage else None

    def team_side(t):
        return {"id": t.id, "name": _team_name(t), "logo": t.club.logo_url}

    def side(team_id):
        return "home" if team_id == m.home_team_id else "away"

    goals = sorted(m.goals, key=lambda g: (g.minute if g.minute is not None else 999))
    cards = sorted(m.cards, key=lambda c: (c.minute if c.minute is not None else 999))
    subs = sorted(m.substitutions, key=lambda s: (s.minute if s.minute is not None else 999))

    comp_age = (AgeGroup.query.get(comp.age_group_id)
                if comp and comp.age_group_id else None)
    return {
        "id": m.id,
        "competition": (
            {
                "id": comp.id,
                "name": _loc(comp.name_ar, comp.name_en) or {"ar": "", "en": ""},
                "age": _loc(comp_age.name_ar, comp_age.name_en) if comp_age else None,
            }
            if comp else None
        ),
        "date": m.match_date.strftime("%Y-%m-%d") if m.match_date else "",
        "time": m.match_date.strftime("%H:%M") if m.match_date else "",
        "week": m.week,
        "venue": m.venue_ar or m.venue_en,
        "note": m.note_ar or m.note_en,
        "status": STATUS_OUT.get(m.status, "upcoming"),
        "home": team_side(m.home_team),
        "away": team_side(m.away_team),
        "home_score": m.home_score,
        "away_score": m.away_score,
        "home_penalty": m.home_penalty_score,
        "away_penalty": m.away_penalty_score,
        "goals": [{
            "side": side(g.team_id), "scorer": _person(g.scorer), "scorer_id": g.scorer_id,
            "assist": _person(g.assist), "minute": g.minute,
            "is_penalty": g.is_penalty, "is_own_goal": g.is_own_goal,
        } for g in goals],
        "cards": [{
            "side": side(c.team_id), "player": _person(c.player),
            "type": c.card_type, "minute": c.minute,
        } for c in cards],
        "subs": [{
            "side": side(s.team_id), "in": _person(s.player_in),
            "out": _person(s.player_out), "minute": s.minute,
        } for s in subs],
        "lineup": _lineup(m),
    }


def _lineup(m: Match) -> dict:
    """Who started and who sat on the bench, per side.

    Only those two states are recorded — MatchPlayer can also hold minutes and
    positions, but they are not entered. Empty lists mean the line-up was never
    typed in, which is the case for everything imported from the feed.
    """
    from app.models import MatchPlayer
    out = {}
    for tid, key in ((m.home_team_id, "home"), (m.away_team_id, "away")):
        rows = MatchPlayer.query.filter_by(match_id=m.id, team_id=tid).all()
        out[key] = {
            "starters": [_person(r.player) for r in rows if r.is_starter],
            "bench": [_person(r.player) for r in rows if not r.is_starter],
        }
    return out


def _team_name(t):
    na, ne = _squad_second_name(t)
    return _loc(na or t.club.name_ar, ne or t.club.name_en) or {"ar": "", "en": ""}


def _season_on(d):
    """The season a date falls inside, bilingual, or None.

    A team is no longer tied to a season, so a career row's season comes from
    when the spell started rather than from the squad it was with. Seasons are
    few, so they are read and scanned rather than filtered in SQL.
    """
    if d is None:
        return None
    for s in Season.query.order_by(Season.start_date.desc()).all():
        if s.start_date <= d <= s.end_date:
            return _loc(s.name_ar, s.name_en)
    return None


def _team_seasons(t) -> list[dict]:
    """Every season the team played, newest first, from its competitions."""
    seasons = (Season.query.join(Competition, Competition.season_id == Season.id)
               .join(CompetitionTeam, CompetitionTeam.competition_id == Competition.id)
               .filter(CompetitionTeam.team_id == t.id)
               .order_by(Season.start_date.desc()).distinct().all())
    return [_loc(s.name_ar, s.name_en) or {"ar": "", "en": ""} for s in seasons]


def _team_season_list(t) -> list[Season]:
    """The Season rows the team played, newest first — used to build the season
    picker and to scope the team page's roster/staff to one season."""
    return (Season.query.join(Competition, Competition.season_id == Season.id)
            .join(CompetitionTeam, CompetitionTeam.competition_id == Competition.id)
            .filter(CompetitionTeam.team_id == t.id)
            .order_by(Season.start_date.desc()).distinct().all())


def _team_competitions(t) -> list[dict]:
    """Each competition the team entered, newest season first, with its full
    title and season — so the team page can deep-link to that competition's
    in-competition team view for the season."""
    # The age label in the title is the team's own age group (the entry is for
    # that age even when the competition itself spans several).
    tag = t.age_group
    age_ar = (tag.name_ar or tag.name_en) if tag else ""
    age_en = (tag.name_en or tag.name_ar) if tag else ""
    comps = (Competition.query
             .join(CompetitionTeam, CompetitionTeam.competition_id == Competition.id)
             .join(Season, Competition.season_id == Season.id)
             .filter(CompetitionTeam.team_id == t.id)
             .options(joinedload(Competition.season))
             .order_by(Season.start_date.desc(), Competition.id.desc())
             .all())
    return [{
        "competition_id": c.id,
        "title": _competition_title(c, age_ar, age_en),
        "season": (
            _loc(c.season.name_ar, c.season.name_en) or {"ar": "", "en": ""}
            if c.season else {"ar": "", "en": ""}
        ),
    } for c in comps]


# ── player profile / journey ─────────────────────────────────────────────────

def player_full(p) -> dict:
    from app.models import MatchGoal, MatchPlayer, PlayerTeam

    # Aggregate goals/assists/appearances by (team_id, competition_id) in three
    # queries rather than loading every event row.  Own goals are excluded from
    # the scorer tally; they do count against MatchPlayer appearances.
    goal_rows = (
        MatchGoal.query
        .join(Match, Match.id == MatchGoal.match_id)
        .join(Stage, Stage.id == Match.stage_id)
        .filter(
            MatchGoal.scorer_id == p.id,
            MatchGoal.is_own_goal == False,   # noqa: E712
            Match.deleted_at.is_(None),
            Match.status == codes.MATCH_STATUS_COMPLETED,
        )
        .with_entities(MatchGoal.team_id, Stage.competition_id, sa.func.count())
        .group_by(MatchGoal.team_id, Stage.competition_id)
        .all()
    )
    assist_rows = (
        MatchGoal.query
        .join(Match, Match.id == MatchGoal.match_id)
        .join(Stage, Stage.id == Match.stage_id)
        .filter(
            MatchGoal.assist_id == p.id,
            Match.deleted_at.is_(None),
            Match.status == codes.MATCH_STATUS_COMPLETED,
        )
        .with_entities(MatchGoal.team_id, Stage.competition_id, sa.func.count())
        .group_by(MatchGoal.team_id, Stage.competition_id)
        .all()
    )
    app_rows = (
        MatchPlayer.query
        .join(Match, Match.id == MatchPlayer.match_id)
        .join(Stage, Stage.id == Match.stage_id)
        .filter(
            MatchPlayer.player_id == p.id,
            Match.deleted_at.is_(None),
            Match.status == codes.MATCH_STATUS_COMPLETED,
        )
        .with_entities(MatchPlayer.team_id, Stage.competition_id, sa.func.count())
        .group_by(MatchPlayer.team_id, Stage.competition_id)
        .all()
    )

    # Flatten to lookup dicts keyed by (team_id, competition_id).
    goals_tc:   dict[tuple, int] = {(r[0], r[1]): r[2] for r in goal_rows}
    assists_tc: dict[tuple, int] = {(r[0], r[1]): r[2] for r in assist_rows}
    apps_tc:    dict[tuple, int] = {(r[0], r[1]): r[2] for r in app_rows}

    total_goals       = sum(goals_tc.values())
    total_assists     = sum(assists_tc.values())
    total_appearances = sum(apps_tc.values())

    # Competition names — one query for all IDs seen across the three result sets.
    all_comp_ids = (
        {r[1] for r in goal_rows}
        | {r[1] for r in assist_rows}
        | {r[1] for r in app_rows}
    )
    # Competition names + the season each one belongs to, so a team's tally can
    # be split by season rather than lumped together.
    comp_name: dict[int, dict] = {}
    comp_season: dict[int, Season] = {}
    if all_comp_ids:
        for c in Competition.query.filter(Competition.id.in_(all_comp_ids)).all():
            comp_name[c.id] = _loc(c.name_ar, c.name_en) or {"ar": "", "en": ""}
            comp_season[c.id] = c.season

    all_seasons = Season.query.order_by(Season.start_date.desc()).all()

    def _season_for_date(d):
        if d is None:
            return None
        return next((s for s in all_seasons if s.start_date <= d <= s.end_date), None)

    # A career card is one (team, season): a player who stays with a team across
    # seasons gets a card per season, so each season's goals/assists/appearances
    # stand on their own instead of being summed into the starting season.
    regs = (
        PlayerTeam.query.filter_by(player_id=p.id)
        .join(Team).order_by(PlayerTeam.start_date.desc()).all()
    )
    regs_by_team: dict[int, list] = defaultdict(list)
    for r in regs:
        regs_by_team[r.team_id].append(r)

    pairs = set(goals_tc) | set(assists_tc) | set(apps_tc)   # (team_id, comp_id)
    cards: list[tuple] = []   # (sort_key, team_id, card)
    for tid, tregs in regs_by_team.items():
        t = tregs[0].team
        ag = t.age_group
        base = {
            "club":     t.club.name_ar or t.club.name_en,
            "logo":     t.club.logo_url,
            # The team's age group — so two stints at the same club in different
            # ages (a player who plays up) are told apart, not just by season.
            "age":      _loc(ag.name_ar, ag.name_en) if ag else None,
            # "Playing up": a stint on a team older than the player (a guest for
            # an older squad, same club) — not his real team, not a transfer.
            "is_guest": bool(ag and ag.oldest_birth_year is not None
                             and p.birth_year and ag.oldest_birth_year < p.birth_year),
            "status":   tregs[0].status,
        }

        # This team's played competitions, grouped by the season each belongs to.
        by_season: dict = defaultdict(list)
        for (team_id, cid) in pairs:
            if team_id == tid:
                by_season[comp_season.get(cid)].append(cid)
        # No games played yet: still show the stint on the season it started in.
        if not by_season:
            start = max((r.start_date for r in tregs if r.start_date), default=None)
            by_season[_season_for_date(start)] = []

        for s, cids in by_season.items():
            competitions = sorted([
                {
                    "name":        comp_name.get(cid, {"ar": "", "en": ""}),
                    "goals":       goals_tc.get((tid, cid), 0),
                    "assists":     assists_tc.get((tid, cid), 0),
                    "appearances": apps_tc.get((tid, cid), 0),
                }
                for cid in cids
            ], key=lambda x: -x["appearances"])
            cards.append((s.start_date.isoformat() if s else "", tid, {
                **base,
                "season":       _loc(s.name_ar, s.name_en) or {"ar": "", "en": ""} if s else {"ar": "", "en": ""},
                "goals":        sum(goals_tc.get((tid, cid), 0)  for cid in cids),
                "assists":      sum(assists_tc.get((tid, cid), 0) for cid in cids),
                "appearances":  sum(apps_tc.get((tid, cid), 0)   for cid in cids),
                "current":      False,
                "end_date":     None,
                "competitions": competitions,
            }))

    # Newest season first (unknown seasons last).
    cards.sort(key=lambda x: x[0], reverse=True)

    # The newest card of a team that still has an open stint is the "current"
    # one; a team the player has left carries its leaving date on its newest card.
    career = []
    seen_team: set[int] = set()
    for _sort, tid, card in cards:
        if tid not in seen_team:
            seen_team.add(tid)
            tregs = regs_by_team[tid]
            if any(r.end_date is None for r in tregs):
                card["current"] = True
            else:
                le = max((r.end_date for r in tregs if r.end_date), default=None)
                card["end_date"] = le.isoformat() if le else None
        career.append(card)

    # His "current club" is his real (non-guest) team, not a play-up guest stint.
    current = (
        next((c for c in career if c["current"] and not c["is_guest"]), None)
        or next((c for c in career if not c["is_guest"]), None)
        or (career[0] if career else None)
    )
    return {
        "id":           p.id,
        "name":         _loc(p.full_name_ar, p.full_name_en) or {"ar": "", "en": ""},
        "position":     _loc(p.position_ar, p.position_en),
        # More specific role; the profile shows it in place of the main position.
        "sub_position": _loc(p.sub_position_ar, p.sub_position_en),
        "birth_year":   p.birth_year,
        "nationality":  _loc(p.nationality_ar, p.nationality_en),
        "photo":        p.profile_pic_url,
        "current_club": current["club"] if current else None,
        "goals":        total_goals,
        "assists":      total_assists,
        "appearances":  total_appearances,
        "career":       career,
    }


# ── coach / manager profile ──────────────────────────────────────────────────

def coach_full(c: Coach) -> dict:
    """One profile for a person, covering both their team-coaching stints
    (TeamCoach) and their club youth-sector roles (ClubStaff)."""
    career = []

    for tc in TeamCoach.query.filter_by(coach_id=c.id).join(Team).all():
        t = tc.team
        ag = t.age_group
        career.append({
            "type": "coach",
            "club": t.club.name_ar or t.club.name_en,
            "logo": t.club.logo_url,
            "season": _season_on(tc.start_date),
            "age": _loc(ag.name_ar, ag.name_en) if ag else None,
            "role": _loc(tc.role_ar, tc.role_en) or {"ar": "مدرّب", "en": "Coach"},
            "current": tc.end_date is None,
            "start_date": tc.start_date.isoformat() if tc.start_date else None,
        })

    for cs in ClubStaff.query.filter_by(coach_id=c.id).all():
        career.append({
            "type": "manager",
            "club": cs.club.name_ar or cs.club.name_en,
            "logo": cs.club.logo_url,
            "season": None,
            "age": None,
            "role": _loc(cs.role_ar, cs.role_en) or {"ar": "مسؤول", "en": "Staff"},
            "current": cs.end_date is None,
            "start_date": cs.start_date.isoformat() if cs.start_date else None,
        })

    # Most recent first; rows without a start date fall to the end.
    career.sort(key=lambda r: (r["start_date"] or ""), reverse=True)

    return {
        "id": c.id,
        "name": _loc(c.full_name_ar, c.full_name_en) or {"ar": "", "en": ""},
        "birth_year": c.birth_year,
        "nationality": _loc(c.nationality_ar, c.nationality_en),
        "photo": c.profile_pic_url,
        "career": career,
    }


# ── public clubs directory ───────────────────────────────────────────────────

def clubs_index() -> dict:
    """Every club, for the public directory. Light payload: no staff or teams."""
    clubs = Club.query.order_by(Club.id).all()
    return {"clubs": [{
        "id": c.id,
        "name": _loc(c.name_ar, c.name_en) or {"ar": "", "en": ""},
        "city": _loc(c.city_ar, c.city_en),
        "logo": c.logo_url,
    } for c in clubs]}


# ── public team profile (staff + roster) ─────────────────────────────────────

def team_public(t: Team, season_id: int | None = None) -> dict:
    ag, club = t.age_group, t.club
    role_rank = sa.case(codes.COACH_ROLE_RANK, value=TeamCoach.role_ar,
                        else_=codes.UNRANKED_COACH_ROLE)
    tcs = [tc for tc in TeamCoach.query.filter_by(team_id=t.id)
           .options(joinedload(TeamCoach.coach))
           .order_by(role_rank, TeamCoach.sort_order, TeamCoach.id).all() if tc.coach]
    regs = (PlayerTeam.query.filter_by(team_id=t.id)
            .options(joinedload(PlayerTeam.player))
            .order_by(PlayerTeam.sort_order, PlayerTeam.shirt_number.asc(), PlayerTeam.id.asc())
            .all())

    seasons = _team_season_list(t)
    # Scope the roster/staff to one season when asked (and only if the team
    # actually played it): keep the stints whose dates overlap the season window.
    active = next((s for s in seasons if s.id == season_id), None) if season_id else None
    if active is not None:
        ss, se = active.start_date, active.end_date

        def _overlaps(row) -> bool:
            return row.start_date <= se and (row.end_date is None or row.end_date >= ss)

        tcs = [tc for tc in tcs if _overlaps(tc)]
        regs = [r for r in regs if _overlaps(r)]
    else:
        # No season chosen: the team's *current* squad and staff only. Anyone
        # who has left (end_date set) drops off the list — their stint stays in
        # the database and still shows on their own profile and in season views.
        tcs = [tc for tc in tcs if tc.end_date is None]
        regs = [r for r in regs if r.end_date is None]

    return {
        "id": t.id,
        "name": _team_name(t),
        "logo": club.logo_url,
        "club": {
            "id": club.id,
            "name": _loc(club.name_ar, club.name_en) or {"ar": "", "en": ""},
        },
        "age": _loc(ag.name_ar, ag.name_en) if ag else None,
        "season_id": active.id if active else None,
        "seasons": [
            {"id": s.id, "name": _loc(s.name_ar, s.name_en) or {"ar": "", "en": ""}}
            for s in seasons
        ],
        "competitions": _team_competitions(t),
        "staff": [{
            "id": tc.coach_id,
            "name": _loc(tc.coach.full_name_ar, tc.coach.full_name_en) or {"ar": "", "en": ""},
            "photo": tc.coach.profile_pic_url,
            "role": _loc(tc.role_ar, tc.role_en),
            "current": tc.end_date is None,
        } for tc in tcs],
        "roster": [{
            "id": r.player_id,
            "name": _loc(r.player.full_name_ar, r.player.full_name_en) or {"ar": "", "en": ""},
            "photo": r.player.profile_pic_url,
            "shirt": r.shirt_number,
            "position": _loc(r.player.position_ar, r.player.position_en),
            "birth_year": r.player.birth_year,
            "current": r.end_date is None,
            # Younger player guesting up for this (older) team, same club.
            "guest": bool(ag and ag.oldest_birth_year is not None and r.player.birth_year
                          and ag.oldest_birth_year < r.player.birth_year),
        } for r in regs if r.player],
    }


# ── public club profile (info + managers + teams) ────────────────────────────

def club_public(c: Club) -> dict:
    staff_rank = sa.case(codes.CLUB_STAFF_ROLE_RANK, value=ClubStaff.role_ar,
                         else_=codes.UNRANKED_CLUB_STAFF_ROLE)
    # Current youth-sector staff only — someone who has left (end_date set)
    # drops off the club's public list. Their record survives for their profile.
    managers = (ClubStaff.query.filter_by(club_id=c.id)
                .filter(ClubStaff.end_date.is_(None))
                .order_by(staff_rank, ClubStaff.sort_order, ClubStaff.id)
                .all())
    # Oldest age group first — by oldest_birth_year, not age_group_id, which
    # orders by when the group was added rather than by age.
    teams = (Team.query.filter_by(club_id=c.id)
             .join(AgeGroup)
             .order_by(AgeGroup.oldest_birth_year).all())
    return {
        "id": c.id,
        "name": _loc(c.name_ar, c.name_en) or {"ar": "", "en": ""},
        "city": _loc(c.city_ar, c.city_en),
        "logo": c.logo_url,
        "website": c.website_url,
        "facebook": c.facebook_url,
        "instagram": c.instagram_url,
        "youtube": c.youtube_url,
        "twitter": c.twitter_url,
        "established": c.established.isoformat() if c.established else None,
        "managers": [{
            "id": s.coach_id,
            "name": _loc(s.coach.full_name_ar, s.coach.full_name_en) or {"ar": "", "en": ""},
            "photo": s.coach.profile_pic_url,
            "role": _loc(s.role_ar, s.role_en),
            "current": s.end_date is None,
        } for s in managers if s.coach],
        "teams": [{
            "id": t.id,
            "name": _team_name(t),
            "age": _loc(t.age_group.name_ar, t.age_group.name_en) if t.age_group else None,
            "seasons": _team_seasons(t),
        } for t in teams],
    }


# ── global search ─────────────────────────────────────────────────────────────

def search_all(q: str, limit: int = 12) -> dict:
    """Free-text search across clubs, players and coaches by bilingual name.

    Feeds the public search box; each hit carries just enough to render a row and
    deep-link to the matching profile page (/club, /player, /coach).
    """
    from app.models import Club, Coach, Player

    like = f"%{q}%"

    clubs = (
        Club.query
        .filter(sa.or_(Club.name_ar.ilike(like), Club.name_en.ilike(like)))
        .order_by(Club.name_ar, Club.name_en)
        .limit(limit)
        .all()
    )
    players = (
        Player.query
        .filter(sa.or_(Player.full_name_ar.ilike(like), Player.full_name_en.ilike(like)))
        .order_by(Player.full_name_ar, Player.full_name_en)
        .limit(limit)
        .all()
    )
    coaches = (
        Coach.query
        .filter(sa.or_(Coach.full_name_ar.ilike(like), Coach.full_name_en.ilike(like)))
        .order_by(Coach.full_name_ar, Coach.full_name_en)
        .limit(limit)
        .all()
    )

    def player_club(p):
        # The club a player currently plays for (else their most recent), so a
        # search row carries their team, not just name + birth year.
        reg = next((r for r in p.registrations if r.end_date is None), None)
        if reg is None and p.registrations:
            reg = max(p.registrations, key=lambda r: r.start_date or datetime.min.date())
        club = reg.team.club if reg and reg.team else None
        return _loc(club.name_ar, club.name_en) if club else None

    def coach_role_and_club(c):
        # A person's actual current post + its club — a team-coaching stint or a
        # club youth-sector role, current first then newest — so a doctor or an
        # administrator is not labelled a coach.
        stints = []
        for tc in c.team_roles:
            club = tc.team.club if tc.team else None
            stints.append((tc.end_date is None, tc.start_date or datetime.min.date(), tc.role_ar, tc.role_en, club))
        for cs in c.club_roles:
            stints.append((cs.end_date is None, cs.start_date or datetime.min.date(), cs.role_ar, cs.role_en, cs.club))
        if not stints:
            return None, None
        stints.sort(key=lambda s: (s[0], s[1]), reverse=True)
        _, _, role_ar, role_en, club = stints[0]
        return _loc(role_ar, role_en), (_loc(club.name_ar, club.name_en) if club else None)

    return {
        "clubs": [{
            "id": c.id,
            "name": _loc(c.name_ar, c.name_en) or {"ar": "", "en": ""},
            "city": _loc(c.city_ar, c.city_en),
            "logo": c.logo_url,
        } for c in clubs],
        "players": [{
            "id": p.id,
            "name": _loc(p.full_name_ar, p.full_name_en) or {"ar": "", "en": ""},
            "birth_year": p.birth_year,
            "position": _loc(p.position_ar, p.position_en),
            "club": player_club(p),
            "photo": p.profile_pic_url,
        } for p in players],
        "coaches": [
            {
                "id": c.id,
                "name": _loc(c.full_name_ar, c.full_name_en) or {"ar": "", "en": ""},
                "role": role,
                "club": club,
                "photo": c.profile_pic_url,
            }
            for c in coaches
            for role, club in [coach_role_and_club(c)]
        ],
    }


# ── all matches, across every competition ────────────────────────────────────

def _competition_title(c: Competition, age_ar: str, age_en: str) -> dict:
    """The heading the home screen shows and passes on as the page title."""
    parts_ar = [p for p in (c.name_ar or c.name_en, age_ar, c.sector_ar) if p]
    parts_en = [p for p in (c.name_en or c.name_ar, age_en, c.sector_en or c.sector_ar) if p]
    return {"ar": " - ".join(parts_ar), "en": " - ".join(parts_en)}


def all_matches(
    base_url: str,
    date_from=None,
    date_to=None,
    limit: int | None = None,
    order: str = "desc",
) -> dict:
    """Every match with its competition and teams inlined.

    One query plus a few lookup maps — the aggregate view that was impractical
    when each competition was a separate static file.

    `order` matters together with `limit`: the home screen wants the *nearest*
    matches to today in each direction, so it asks for ascending from today
    (soonest upcoming first) and descending before today (most recent first).
    """
    ages = {a.id: a for a in AgeGroup.query.all()}
    stage_comp = {s.id: s.competition_id for s in Stage.query.all()}
    teams = {
        t.id: t for t in Team.query.options(joinedload(Team.club)).all()
    }
    # One query for every squad's second name, rather than one per match side.
    squad_names = _squad_names_map()

    comp_dto: dict[int, dict] = {}

    def competition(cid: int) -> dict:
        if cid not in comp_dto:
            c = Competition.query.get(cid)
            ag = ages.get(c.age_group_id)
            age_ar = (ag.name_ar or ag.name_en) if ag else ""
            age_en = (ag.name_en or ag.name_ar) if ag else ""
            comp_dto[cid] = {
                "id": c.id,
                "code": c.code,
                "name": _loc(c.name_ar, c.name_en) or {"ar": "", "en": ""},
                "age": age_en,
                "age_name": _loc(ag.name_ar, ag.name_en) if ag else None,
                "sector": _loc(c.sector_ar, c.sector_en),
                "title": _competition_title(c, age_ar, age_en),
                "data_url": f"{base_url}/api/competitions/{c.id}/data",
            }
        return comp_dto[cid]

    def team(tid: int) -> dict | None:
        t = teams.get(tid)
        if not t:
            return None
        na, ne = squad_names.get(tid, (None, None))
        return {
            "id": str(tid),
            "name": _loc(na or t.club.name_ar, ne or t.club.name_en) or "",
            "logo": t.club.logo_url,
        }

    q = Match.query.filter(Match.deleted_at.is_(None))
    if date_from:
        q = q.filter(Match.match_date >= datetime.combine(date_from, day_time.min))
    if date_to:
        q = q.filter(Match.match_date <= datetime.combine(date_to, day_time.max))
    # Undated (TBD) fixtures always sort last, regardless of direction.
    if order == "asc":
        q = q.order_by(Match.match_date.is_(None), Match.match_date.asc(), Match.id)
    else:
        q = q.order_by(Match.match_date.is_(None), Match.match_date.desc(), Match.id)
    if limit:
        q = q.limit(limit)

    out = []
    for m in q.all():
        cid = stage_comp.get(m.stage_id)
        if cid is None:
            continue
        out.append({
            "id": str(m.id),
            "date": m.match_date.strftime("%Y-%m-%d") if m.match_date else "",
            "time": m.match_date.strftime("%H:%M") if m.match_date else "",
            "status": STATUS_OUT.get(m.status, "upcoming"),
            "group": m.round_label_ar or m.round_label_en or "",
            "venue": m.venue_ar or m.venue_en or "",
            "note": m.note_ar or m.note_en or None,
            "home_score": m.home_score,
            "away_score": m.away_score,
            "home_penalty": m.home_penalty_score,
            "away_penalty": m.away_penalty_score,
            "competition": competition(cid),
            "home_team": team(m.home_team_id),
            "away_team": team(m.away_team_id),
        })
    return {"matches": out}


def _scorers(goals: list[MatchGoal]) -> list[str]:
    """Scorer names, then the assist delimiter and assist names — the feed shape.

    One entry per goal (repeated names), which the clients' parser sums exactly
    as it would the "(2)" multiplier form.

    Own goals are left out. They are credited to this team but were put in by an
    opponent, and the clients build their top-scorer table from this list keyed
    by team — so including one would award the goal to a player at the club he
    scored against. They are served separately, in `home_own_goals`.
    """
    real = [g for g in goals if not g.is_own_goal]
    scorers = [_name(g.scorer) for g in real if g.scorer]
    assists = [_name(g.assist) for g in real if g.assist_id and g.assist]
    if not assists:
        return scorers
    return scorers + [ASSIST_DELIMITER] + assists


def _own_goals(goals: list[MatchGoal]) -> list[str]:
    """Own goals credited to this team, named by the opponent who scored them."""
    return [_name(g.scorer) for g in goals if g.is_own_goal and g.scorer]
