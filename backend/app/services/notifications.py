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
SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"]

# Topics the clients subscribe to.
TOPIC_NEWS = "news"
TOPIC_VENUES = "venues"


def competition_topic(competition_id: int) -> str:
    """The per-competition topic — a client following one league subscribes to
    this, so a round-results digest only reaches its own followers."""
    return f"comp_{competition_id}"

# Cached OAuth token so we don't re-sign every send.
_token_cache: dict = {"access_token": None, "expiry": 0.0, "project_id": None}


def _credentials_path() -> str | None:
    path = current_app.config.get("FIREBASE_CREDENTIALS")
    return path if path and os.path.exists(path) else None


def is_configured() -> bool:
    """True when a usable service-account key is present (real sending on)."""
    return _credentials_path() is not None


def _access_token() -> tuple[str, str]:
    """A cached FCM OAuth access token and the project id, refreshed as needed."""
    now = time.time()
    if _token_cache["access_token"] and _token_cache["expiry"] > now + 60:
        return _token_cache["access_token"], _token_cache["project_id"]

    # Imported lazily so dry-run never needs google-auth installed.
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

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
    """Send one notification to an FCM topic. Never raises — logs and reports."""
    # FCM data values must all be strings.
    str_data = {k: str(v) for k, v in (data or {}).items()}

    if not is_configured():
        current_app.logger.info(
            "[notifications:dry-run] topic=%s title=%r body=%r data=%s",
            topic, title, body, str_data,
        )
        return {"status": "dry_run", "topic": topic, "title": title, "body": body}

    message = {
        "message": {
            "topic": topic,
            "notification": {"title": title, "body": body},
            "data": str_data,
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


# ── event helpers (call these from any create flow) ──────────────────────────

def notify_new_news(news) -> dict:
    title = news.title_ar or news.title_en or "خبر جديد"
    body = (news.details_ar or news.details_en or "").strip()
    body = (body[:117] + "…") if len(body) > 118 else (body or "اضغط لقراءة الخبر")
    return send_to_topic(TOPIC_NEWS, title, body, data={"type": "news", "id": news.id})


def notify_new_venue(venue) -> dict:
    name = venue.name_ar or venue.name_en or "ملعب"
    return send_to_topic(
        TOPIC_VENUES, "ملعب جديد", name, data={"type": "venue", "id": venue.id}
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
    return send_to_topic(
        competition_topic(competition.id), title, body,
        data={
            "type": "round",
            "competition_id": competition.id,
            "week": week,
            "url": f"/competition?id={competition.id}&week={week}",
        },
    )
