"""Push notifications via Firebase Cloud Messaging (topic broadcast).

Both clients subscribe to the topics below; the backend sends one message per
event. No device tokens are stored — the topic is the fan-out.

Without a service-account key configured (`FIREBASE_CREDENTIALS`), everything
runs in **dry-run**: the exact payload is logged and nothing is sent, so the
whole pipeline is testable now and goes live the moment the key is provided.
"""

from __future__ import annotations

import json
import os
import re
import time
from urllib.parse import quote

import requests
from flask import current_app

FCM_SEND_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
IID_TOPIC_URL = "https://iid.googleapis.com/iid/v1/{token}/rel/topics/{topic}"

# FCM topic names are restricted to this charset; validating before use keeps a
# malformed value from altering the IID request path or the /topics/ body.
_TOPIC_RE = re.compile(r"^[a-zA-Z0-9\-_.~%]+$")
IID_BATCH_REMOVE_URL = "https://iid.googleapis.com/iid/v1:batchRemove"
SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"]

# Notification channel the youthscores native Android app creates (see the app's
# NotificationService and AndroidManifest default_notification_channel_id). A
# killed-app push must name it so Android shows it on the high-importance channel.
ANDROID_CHANNEL_ID = "youthscores_default"

# Topics the clients subscribe to.
TOPIC_NEWS = "news"
TOPIC_VENUES = "venues"
# Round-results digests go here for now: with no public accounts and no
# favourites yet, every device subscribes to this one topic (Phase 1). Phase 2
# adds an on-device "follow" that subscribes to competition_topic() instead, so
# a digest reaches only that league's followers.
TOPIC_RESULTS = "results"


def competition_topic(competition_id: int) -> str:
    """The per-competition topic for Phase 2's on-device follow — subscribing a
    device to this means a round-results digest reaches only its followers."""
    return f"comp_{competition_id}"


# ── tla3bny ──────────────────────────────────────────────────────────────────
# tla3bny is a separate app but shares this Firebase project, and its competition
# ids overlap youthscores' — so its topics MUST be namespaced apart, or a follow
# on one app would leak the other's pushes.
TLA3BNY_TOPIC_NEWS = "t3_news"
# Every academy account subscribes to this at login — used to announce a new
# competition they could join.
TLA3BNY_TOPIC_ACADEMIES = "t3_academies"


def tla3bny_competition_topic(competition_id: int) -> str:
    """Per-competition follow topic for tla3bny, namespaced (t3_) so it never
    collides with youthscores' comp_<id>."""
    return f"t3_comp_{competition_id}"


def tla3bny_academy_topic(academy_id: int) -> str:
    """One academy account's private topic (player decisions, subscription news).
    The academy's device subscribes to this at login."""
    return f"t3_academy_{academy_id}"


def tla3bny_compadmin_topic(competition_id: int) -> str:
    """A competition's admins' topic (registrations, players awaiting approval).
    Each competition admin's device subscribes per competition they run, at login."""
    return f"t3_compadmin_{competition_id}"


# Cached OAuth token so we don't re-sign every send.
_token_cache: dict = {"access_token": None, "expiry": 0.0, "project_id": None}


def _credentials_path() -> str | None:
    path = current_app.config.get("FIREBASE_CREDENTIALS")
    return path if path and os.path.exists(path) else None


def _credentials_info() -> dict | None:
    """The service-account JSON supplied inline via FIREBASE_CREDENTIALS_JSON.

    Managed hosts (Railway, etc.) build from the git repo, where the key file is
    gitignored and absent, so the whole JSON is pasted into one env var instead.
    Takes precedence over the file path when both are set."""
    raw = current_app.config.get("FIREBASE_CREDENTIALS_JSON")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        current_app.logger.error("FIREBASE_CREDENTIALS_JSON is not valid JSON; ignoring it.")
        return None


def is_configured() -> bool:
    """True when a usable service-account key is present (real sending on),
    whether inline (FIREBASE_CREDENTIALS_JSON) or a file path (FIREBASE_CREDENTIALS)."""
    return _credentials_info() is not None or _credentials_path() is not None


def _access_token() -> tuple[str, str]:
    """A cached FCM OAuth access token and the project id, refreshed as needed."""
    now = time.time()
    if _token_cache["access_token"] and _token_cache["expiry"] > now + 60:
        return _token_cache["access_token"], _token_cache["project_id"]

    # Imported lazily so dry-run never needs google-auth installed.
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    info = _credentials_info()
    if info is not None:
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    else:
        creds = service_account.Credentials.from_service_account_file(
            _credentials_path(), scopes=SCOPES
        )
    creds.refresh(Request())
    project_id = current_app.config.get("FIREBASE_PROJECT_ID") or creds.project_id
    _token_cache.update(
        access_token=creds.token,
        expiry=creds.expiry.timestamp() if creds.expiry else now + 3300,
        project_id=project_id,
    )
    return creds.token, project_id


def _android_tag(data: dict) -> str:
    """The Android notification tag, mirroring the web SW's notifTag() so a device
    following both sides of a fixture (two topic sends, same match) collapses them
    into one, and a re-sent digest replaces the old one instead of stacking."""
    return f"{data.get('type') or 'msg'}:{data.get('id') or data.get('url') or data.get('title') or ''}"


def send_to_topic(topic: str, title: str, body: str, data: dict | None = None) -> dict:
    """Send one push to an FCM topic. Never raises — logs and reports.

    Web receives a **data-only** message: title/body/url ride inside ``data`` and
    the service worker draws the notification itself. A top-level ``notification``
    block would make the browser pop a SECOND, duplicate one, so it is omitted.

    Native Android additionally gets an ``android.notification`` block: a data-only
    message to a backgrounded or killed app would only wake the (empty) background
    isolate and show nothing, so the OS needs the block to display it. FCM delivers
    ``android`` only to Android tokens, so web still sees a data-only message and
    draws exactly one notification — the two platforms don't collide.
    """
    # FCM data values must all be strings. Title/body travel in data so the
    # service worker can render the notification (see the note above).
    str_data = {k: str(v) for k, v in (data or {}).items()}
    str_data["title"] = title
    str_data["body"] = body

    if not is_configured():
        current_app.logger.info(
            "[notifications:dry-run] topic=%s title=%r body=%r data=%s",
            topic, title, body, str_data,
        )
        return {"status": "dry_run", "topic": topic, "title": title, "body": body}

    message = {
        "message": {
            "topic": topic,
            "data": str_data,
            "android": {
                "priority": "high",
                "notification": {
                    "title": title,
                    "body": body,
                    "channel_id": ANDROID_CHANNEL_ID,
                    "tag": _android_tag(str_data),
                    "default_sound": True,
                },
            },
        }
    }
    try:
        token, project_id = _access_token()
        resp = requests.post(
            FCM_SEND_URL.format(project_id=project_id),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            data=json.dumps(message),
            timeout=10,
        )
        if resp.status_code >= 400:
            current_app.logger.error("FCM send failed %s: %s", resp.status_code, resp.text[:400])
            return {"status": "error", "code": resp.status_code}
        return {"status": "sent", "topic": topic}
    except Exception as exc:  # noqa: BLE001 - a failed push must not break the request
        current_app.logger.exception("FCM send error")
        return {"status": "error", "error": str(exc)}


def subscribe_token_to_topic(token: str, topic: str) -> dict:
    """Subscribe one registration token to a topic (used by web clients).

    Android subscribes to topics itself via the FCM SDK. Web has no client-side
    topic API, so the browser sends its token here and the server subscribes it.
    """
    if not _TOPIC_RE.match(topic or ""):
        return {"status": "error", "error": "invalid topic"}
    if not is_configured():
        current_app.logger.info("[notifications:dry-run] subscribe token->%s", topic)
        return {"status": "dry_run", "topic": topic}
    try:
        access_token, _ = _access_token()
        resp = requests.post(
            IID_TOPIC_URL.format(token=quote(token, safe=""), topic=quote(topic, safe="")),
            headers={"Authorization": f"Bearer {access_token}", "access_token_auth": "true"},
            timeout=10,
        )
        if resp.status_code >= 400:
            current_app.logger.error("IID subscribe failed %s: %s", resp.status_code, resp.text[:300])
            return {"status": "error", "code": resp.status_code}
        return {"status": "subscribed", "topic": topic}
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("IID subscribe error")
        return {"status": "error", "error": str(exc)}


def unsubscribe_token_from_topic(token: str, topic: str) -> dict:
    """Unsubscribe one registration token from a topic (used when a web client
    unfollows a competition). Mirrors subscribe_token_to_topic via the IID API."""
    if not _TOPIC_RE.match(topic or ""):
        return {"status": "error", "error": "invalid topic"}
    if not is_configured():
        current_app.logger.info("[notifications:dry-run] unsubscribe token->%s", topic)
        return {"status": "dry_run", "topic": topic}
    try:
        access_token, _ = _access_token()
        resp = requests.post(
            IID_BATCH_REMOVE_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "access_token_auth": "true",
                "Content-Type": "application/json",
            },
            data=json.dumps({"to": f"/topics/{topic}", "registration_tokens": [token]}),
            timeout=10,
        )
        if resp.status_code >= 400:
            current_app.logger.error("IID unsubscribe failed %s: %s", resp.status_code, resp.text[:300])
            return {"status": "error", "code": resp.status_code}
        return {"status": "unsubscribed", "topic": topic}
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("IID unsubscribe error")
        return {"status": "error", "error": str(exc)}


# ── event helpers (call these from any create flow) ──────────────────────────

def notify_new_news(news) -> dict:
    title = news.title_ar or news.title_en or "خبر جديد"
    body = (news.details_ar or news.details_en or "").strip()
    body = (body[:117] + "…") if len(body) > 118 else (body or "اضغط لقراءة الخبر")
    return send_to_topic(
        TOPIC_NEWS, title, body,
        data={"type": "news", "id": news.id, "url": f"/news?id={news.id}"},
    )


def notify_new_venue(venue) -> dict:
    name = venue.name_ar or venue.name_en or "ملعب"
    return send_to_topic(
        TOPIC_VENUES, "ملعب جديد", name, data={"type": "venue", "id": venue.id, "url": "/venues"}
    )


def notify_round_results(competition, week: str, matches, headline: str | None = None) -> dict:
    """One digest for a whole round's results — the entry workflow enters a
    round at a time, so a single push per round beats one per match. Sent to the
    competition's own topic and deep-links to that round's results.

    `matches` is the round's completed matches (used only for the count and an
    optional headline); `headline` may name the marquee fixture.
    """
    # The same competition name repeats across age groups (and sometimes sector
    # divisions), each its own row — so the label carries the age and sector to
    # say exactly which one this is.
    from app.extensions import db
    from app.models import AgeGroup

    name = competition.name_ar or competition.name_en or "البطولة"
    age = ""
    if competition.age_group_id:
        ag = db.session.get(AgeGroup, competition.age_group_id)
        if ag:
            age = (ag.name_ar or ag.name_en or "").strip()
    sector = (competition.sector_ar or competition.sector_en or "").strip()
    label = " - ".join(p for p in (name, age, sector) if p)

    week = (str(week) or "").strip()
    title = f"نتائج الجولة {week} — {label}" if week else f"النتائج — {label}"
    n = len(matches)
    if headline:
        extra = n - 1
        body = headline + (f" و{extra} مباراة أخرى" if extra > 0 else "")
    else:
        body = f"{n} مباراة — اضغط لعرض النتائج"
    # Followers of this league get it via competition_topic() (web:
    # /api/push/follow -> subscribe_token_to_topic; native: the SDK). Devices that
    # haven't picked ANY favourite yet are instead subscribed to the broadcast
    # TOPIC_RESULTS, so every round still reaches them — until they follow their
    # first competition/team, at which point the client drops the broadcast and
    # only its followed topics remain. The two audiences are disjoint (a device is
    # on one or the other), and the shared android tag collapses any overlap into
    # a single notification, so no one is double-notified.
    data = {
        "type": "round",
        "competition_id": competition.id,
        "week": week,
        "url": f"/competition?id={competition.id}&week={week}",
    }
    result = send_to_topic(competition_topic(competition.id), title, body, data=data)
    send_to_topic(TOPIC_RESULTS, title, body, data=data)
    return result


def team_topic(team_id: int) -> str:
    """Per-team follow topic. The native app subscribes here via the FCM SDK when a
    user follows a team; a match's result is broadcast to both sides' topics so a
    follower of just one club still hears about it."""
    return f"team_{team_id}"


def _ys_team_name(team, competition_id: int) -> str:
    """A team's Arabic name for a competition: the second name it plays under there
    (academy/sponsor branding, which differs per competition) if any, else the
    club's name. Mirrors serializers._team_name for a single competition."""
    if team is None:
        return "فريق"
    from app.extensions import db
    from app.models import CompetitionTeam

    ct = (
        db.session.query(CompetitionTeam)
        .filter_by(competition_id=competition_id, team_id=team.id)
        .first()
    )
    if ct and (ct.name_ar or ct.name_en):
        return ct.name_ar or ct.name_en
    club = getattr(team, "club", None)
    return (club.name_ar or club.name_en or "فريق") if club else "فريق"


def notify_match_result(competition, match) -> dict:
    """A completed match's final score to BOTH sides' followers (team_<id>).

    The round digest (notify_round_results) reaches people who follow the *league*;
    this reaches people who follow just one of the *clubs*. Deep-links to the
    competition, not the match — the clients route by the `id` query param as a
    competition id, so a per-match link would open the wrong screen.
    """
    home = _ys_team_name(match.home_team, competition.id)
    away = _ys_team_name(match.away_team, competition.id)
    hs = match.home_score if match.home_score is not None else 0
    as_ = match.away_score if match.away_score is not None else 0
    body = f"{home} {hs} - {as_} {away}"
    if match.home_penalty_score is not None and match.away_penalty_score is not None:
        body += f" (ركلات {match.home_penalty_score}-{match.away_penalty_score})"
    name = competition.name_ar or competition.name_en or "البطولة"
    title = f"نتيجة — {name}"
    data = {
        "type": "match",
        "id": match.id,
        "competition_id": competition.id,
        "url": f"/competition?id={competition.id}",
    }
    # Same title/body/tag to both topics, so a device following both clubs in this
    # fixture collapses the two into one notification (see _android_tag / web SW).
    return {
        "match_id": match.id,
        "sent": [
            send_to_topic(team_topic(match.home_team_id), title, body, data=data),
            send_to_topic(team_topic(match.away_team_id), title, body, data=data),
        ],
    }


def notify_round_results_to_teams(competition, matches) -> list[dict]:
    """Fan every completed match in a round out to its two teams' followers. Called
    alongside notify_round_results from the admin's round-notify action, so both
    league followers and team followers are covered by the one manual trigger.

    One FCM request per team per match — fine for a round's handful of fixtures;
    topics with no subscribers are a harmless no-op.
    """
    return [notify_match_result(competition, m) for m in matches]


def notify_tla3bny_round_results(competition, round_label, matches, age_label=None) -> dict:
    """One digest for a tla3bny competition round's results, sent to that
    competition's followers (namespaced tla3bny topic). tla3bny competitions have
    a different schema than youthscores (name/name_en, no age_group/sector), so
    this can't reuse notify_round_results."""
    name = competition.name or competition.name_en or "البطولة"
    label = " - ".join(p for p in (name, (age_label or "").strip()) if p)
    rnd = (str(round_label) or "").strip()
    title = f"نتائج الجولة {rnd} — {label}" if rnd else f"النتائج — {label}"
    body = f"{len(matches)} مباراة — اضغط لعرض النتائج"
    return send_to_topic(
        tla3bny_competition_topic(competition.id), title, body,
        data={
            "type": "t3_round",
            "competition_id": competition.id,
            "round": rnd,
            "url": f"/competition?id={competition.id}",
        },
    )


def _t3_comp_name(comp) -> str:
    return (comp.name or comp.name_en or "البطولة") if comp else "البطولة"


def _t3_results_url(match) -> str:
    """Deep-link to where a match's result/lineup shows: the sub-competition view
    when known, else the competition page."""
    if match.competition_age_id:
        return f"/competitions?comp={match.competition_id}&cage={match.competition_age_id}"
    return f"/competition?id={match.competition_id}"


def notify_tla3bny_match_result(match) -> dict:
    """Immediate: a single match's final score, to that competition's followers.
    tla3bny organizers enter results live, so this fires per match, not per round."""
    home = match.home_team.display_name() if match.home_team else "?"
    away = match.away_team.display_name() if match.away_team else "?"
    hs = match.home_score if match.home_score is not None else 0
    as_ = match.away_score if match.away_score is not None else 0
    return send_to_topic(
        tla3bny_competition_topic(match.competition_id),
        f"نتيجة — {_t3_comp_name(match.competition)}",
        f"{home} {hs} - {as_} {away}",
        data={
            "type": "t3_result",
            "id": match.id,
            "competition_id": match.competition_id,
            "url": _t3_results_url(match),
        },
    )


def notify_tla3bny_lineup(match, team) -> dict:
    """Immediate: a team's lineup was posted for a match, to competition followers."""
    team_name = team.display_name() if team else "فريق"
    return send_to_topic(
        tla3bny_competition_topic(match.competition_id),
        f"تشكيلة — {_t3_comp_name(match.competition)}",
        f"تم إضافة تشكيلة {team_name}",
        data={
            "type": "t3_lineup",
            "id": match.id,
            "competition_id": match.competition_id,
            "url": _t3_results_url(match),
        },
    )


def notify_tla3bny_news(news) -> dict:
    """Immediate: a published news item. Competition news reaches that
    competition's followers; site-wide news reaches the global tla3bny topic."""
    title = news.title or "خبر جديد"
    if news.competition_id:
        topic = tla3bny_competition_topic(news.competition_id)
        url = f"/competition?id={news.competition_id}&tab=news"
    else:
        topic = TLA3BNY_TOPIC_NEWS
        url = "/news"
    return send_to_topic(
        topic, title, "اضغط لقراءة الخبر",
        data={"type": "t3_news", "id": news.id, "url": url},
    )


# ── tla3bny account-targeted (academy / competition-admin) ────────────────────

def notify_tla3bny_new_competition(comp) -> dict:
    """To all academies: a new competition they could enter has opened."""
    return send_to_topic(
        TLA3BNY_TOPIC_ACADEMIES,
        "بطولة جديدة",
        _t3_comp_name(comp),
        data={"type": "t3_new_comp", "id": comp.id, "url": f"/competition?id={comp.id}"},
    )


def notify_tla3bny_team_registered(entry) -> dict:
    """To the academy: its team was entered into a competition — add players next."""
    academy_id = entry.team.academy_id if entry.team else None
    if not academy_id:
        return {"status": "skipped"}
    team_name = entry.team.display_name() if entry.team else "فريقك"
    return send_to_topic(
        tla3bny_academy_topic(academy_id),
        "تم تسجيل فريقك في بطولة",
        f"{team_name} — {_t3_comp_name(entry.competition)}",
        data={"type": "t3_team_registered", "competition_id": entry.competition_id, "url": "/dashboard"},
    )


def notify_tla3bny_player_pending(cp) -> dict:
    """To the competition's admins: a player is awaiting their approval."""
    entry = cp.entry
    if not entry:
        return {"status": "skipped"}
    player_name = cp.player.name if cp.player else "لاعب"
    team_name = entry.team.display_name() if entry.team else ""
    return send_to_topic(
        tla3bny_compadmin_topic(entry.competition_id),
        "لاعب بانتظار الموافقة",
        " — ".join(p for p in (player_name, team_name) if p),
        data={"type": "t3_player_pending", "competition_id": entry.competition_id, "url": "/admin"},
    )


def notify_tla3bny_player_decision(cp, approved: bool) -> dict:
    """To the academy: its player was approved or rejected by the competition."""
    entry = cp.entry
    academy_id = entry.team.academy_id if entry and entry.team else None
    if not academy_id:
        return {"status": "skipped"}
    player_name = cp.player.name if cp.player else "اللاعب"
    comp_name = _t3_comp_name(entry.competition) if entry else ""
    if approved:
        title, body = "تم قبول اللاعب", f"{player_name} — {comp_name}"
    else:
        reason = (getattr(cp, "rejection_reason", None) or "").strip()
        title = "تم رفض اللاعب"
        body = f"{player_name} — {comp_name}" + (f"\n{reason}" if reason else "")
    return send_to_topic(
        tla3bny_academy_topic(academy_id),
        title, body,
        data={
            "type": "t3_player_decision",
            "competition_id": entry.competition_id if entry else 0,
            "url": "/dashboard",
        },
    )


def notify_tla3bny_join_request(entry) -> dict:
    """To the competition's admins: an academy requested to enter a team."""
    team_name = entry.team.display_name() if entry.team else "فريق"
    academy = entry.team.academy.name if entry.team and entry.team.academy else ""
    return send_to_topic(
        tla3bny_compadmin_topic(entry.competition_id),
        "طلب اشتراك جديد",
        " — ".join(p for p in (team_name, academy) if p),
        data={"type": "t3_join_request", "competition_id": entry.competition_id, "url": "/admin"},
    )


def notify_tla3bny_subscription_approved(entry) -> dict:
    """To the academy: its join request was approved — add players next."""
    academy_id = entry.team.academy_id if entry.team else None
    if not academy_id:
        return {"status": "skipped"}
    team_name = entry.team.display_name() if entry.team else "فريقك"
    return send_to_topic(
        tla3bny_academy_topic(academy_id),
        "تم قبول اشتراك فريقك",
        f"{team_name} — {_t3_comp_name(entry.competition)}",
        data={"type": "t3_sub_approved", "competition_id": entry.competition_id, "url": "/dashboard"},
    )


def notify_tla3bny_subscription_rejected(entry) -> dict:
    """To the academy: its join request was declined."""
    academy_id = entry.team.academy_id if entry.team else None
    if not academy_id:
        return {"status": "skipped"}
    team_name = entry.team.display_name() if entry.team else "فريقك"
    return send_to_topic(
        tla3bny_academy_topic(academy_id),
        "تم رفض طلب الاشتراك",
        f"{team_name} — {_t3_comp_name(entry.competition)}",
        data={"type": "t3_sub_rejected", "competition_id": entry.competition_id, "url": "/dashboard"},
    )
