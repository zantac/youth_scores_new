"""Tapping a tla3bny push must open the right place: the click handler in
firebase-messaging-sw.js navigates to data.url, so each sender must set a URL
that maps to a real route. These lock the two that were wrong/vague."""

from app.services import notifications as n


def _capture(monkeypatch):
    seen = {}
    monkeypatch.setattr(
        n, "send_to_topic",
        lambda topic, title, body, data=None: seen.update(topic=topic, data=data) or {},
    )
    return seen


def test_chat_notification_deep_links_to_the_chat(monkeypatch):
    seen = _capture(monkeypatch)

    # Team messaged the organizers → the competition's messages tab.
    n.notify_tla3bny_chat(5, 9, "أكاديمية النصر", "academy", "أهلاً")
    assert seen["topic"] == n.tla3bny_compadmin_topic(5)
    assert seen["data"]["url"] == "/manage?comp=5&tab=messages"

    # Organizer messaged the team → the team's dashboard (its chat).
    n.notify_tla3bny_chat(5, 9, "أكاديمية النصر", "organizer", "تم")
    assert seen["topic"] == n.tla3bny_team_topic(9)
    assert seen["data"]["url"] == "/dashboard"


def test_news_notification_opens_the_article(monkeypatch):
    seen = _capture(monkeypatch)

    class _News:
        pass

    comp_news = _News()
    comp_news.id, comp_news.competition_id, comp_news.title = 7, 3, "خبر"
    n.notify_tla3bny_news(comp_news)
    assert seen["data"]["url"] == "/competition?id=3&tab=news&news=7"

    site_news = _News()
    site_news.id, site_news.competition_id, site_news.title = 8, None, "خبر"
    n.notify_tla3bny_news(site_news)
    assert seen["data"]["url"] == "/news?news=8"


def test_match_notifications_open_the_match_page(monkeypatch):
    """Result / goal / lineup pushes must open the match itself, not the
    sub-competition (about) page."""
    sent = []
    monkeypatch.setattr(
        n, "send_to_topic",
        lambda topic, title, body, data=None: sent.append(data) or {},
    )

    class _Team:
        def display_name(self):
            return "فريق"

    class _Match:
        pass

    m = _Match()
    m.id, m.competition_id, m.competition_age_id = 42, 3, 11
    m.home_team = m.away_team = _Team()
    m.home_team_id, m.away_team_id = 1, 2
    m.home_score, m.away_score = 2, 1
    m.competition = None

    n.notify_tla3bny_match_result(m)
    assert sent and all(d["url"] == "/match?id=42&tab=events" for d in sent)

    sent.clear()
    n.notify_tla3bny_player_goals(m, {7: "لاعب"})
    assert sent[0]["url"] == "/match?id=42&tab=events"

    sent.clear()
    n.notify_tla3bny_lineup(m, _Team())
    assert sent[0]["url"] == "/match?id=42"
