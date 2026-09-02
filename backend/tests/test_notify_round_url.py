"""The round-results digest deep-link.

Two groups finishing the same round must produce distinct notifications: the
android tag is derived from the ``url`` (see notifications._android_tag), so a
shared url would let the second group's push replace the first on-device and the
follower would miss one group's results. A group-scoped digest therefore carries
``&group=<id>`` in its url; an ungrouped round stays clean.
"""

from app.services import notifications


class _Comp:
    def __init__(self, cid):
        self.id = cid
        self.name_ar = "بطولة"
        self.name_en = None
        self.age_group_id = None          # skip the AgeGroup DB lookup
        self.sector_ar = None
        self.sector_en = None


class _Group:
    def __init__(self, gid, name_ar):
        self.id = gid
        self.name_ar = name_ar
        self.name_en = None


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(
        notifications, "send_to_topic",
        lambda topic, title, body, data=None: (sent.append(data), {})[1],
    )
    return sent


def test_group_round_digest_scopes_url_and_carries_group_id(monkeypatch):
    sent = _capture(monkeypatch)
    notifications.notify_round_results(_Comp(5), "3", [], group=_Group(7, "المجموعة أ"))
    # Both the competition topic and the broadcast get the same per-group url.
    assert sent and all(d["url"] == "/competition?id=5&week=3&group=7" for d in sent)
    assert all(d.get("group_id") == 7 for d in sent)


def test_two_groups_same_round_get_distinct_urls(monkeypatch):
    sent = _capture(monkeypatch)
    notifications.notify_round_results(_Comp(5), "3", [], group=_Group(7, "أ"))
    notifications.notify_round_results(_Comp(5), "3", [], group=_Group(8, "ب"))
    urls = {d["url"] for d in sent}
    assert urls == {"/competition?id=5&week=3&group=7", "/competition?id=5&week=3&group=8"}


def test_ungrouped_round_digest_url_stays_clean(monkeypatch):
    sent = _capture(monkeypatch)
    notifications.notify_round_results(_Comp(5), "3", [])
    assert sent and all(d["url"] == "/competition?id=5&week=3" for d in sent)
    assert all("group_id" not in d for d in sent)
