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
import time

import requests
from flask import current_app

FCM_SEND_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
IID_TOPIC_URL = "https://iid.googleapis.com/iid/v1/{token}/rel/topics/{topic}"
IID_BATCH_REMOVE_URL = "https://iid.googleapis.com/iid/v1:batchRemove"
SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"]

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
    device to this means a round-results digest reaches only its followers.

    Not used yet: results currently broadcast to TOPIC_RESULTS (see above)."""
    return f"comp_{competition_id}"

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


def send_to_topic(topic: str, title: str, body: str, data: dict | None = None) -> dict:
    """Send one push to an FCM topic. Never raises — logs and reports.

    Sent as a **data-only** message: the title and body ride inside ``data`` and
    the web service worker draws the notification itself. A top-level
    ``notification`` block would make the browser pop a SECOND, duplicate one, so
    we deliberately omit it. When the native Android app ships it will add an
    ``android``/``notification`` override here for reliable delivery to a killed
    app (web needs the data-only form; Android's killed-app case needs the block).
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

    message = {"message": {"topic": topic, "data": str_data}}
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
    if not is_configured():
        current_app.logger.info("[notifications:dry-run] subscribe token->%s", topic)
        return {"status": "dry_run", "topic": topic}
    try:
        access_token, _ = _access_token()
        resp = requests.post(
            IID_TOPIC_URL.format(token=token, topic=topic),
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
    # Phase 2: send only to this competition's followers via competition_topic().
    # A device that tapped "follow" on this league is subscribed to that topic
    # (web: /api/push/follow -> subscribe_token_to_topic; native: the SDK). The
    # title still carries the competition/age/sector for the notification text,
    # and competition_id rides in the payload for the deep-link.
    return send_to_topic(
        competition_topic(competition.id), title, body,
        data={
            "type": "round",
            "competition_id": competition.id,
            "week": week,
            "url": f"/competition?id={competition.id}&week={week}",
        },
    )
