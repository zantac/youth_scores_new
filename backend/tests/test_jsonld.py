"""JSON-LD structured data + the </script>-breakout guard in the share injector.

These give crawlers machine-readable content the client-rendered shell lacks;
the escaping check matters because item names are free text from the DB."""

import json

from app import _event_fields, _inject_share_meta, _jsonld_script


def _parse(s: str) -> dict:
    return json.loads(s[s.index(">") + 1 : s.rindex("<")].replace("<\\/", "</"))


def _extract_jsonld(html: str) -> dict:
    start = html.index('<script type="application/ld+json">') + len(
        '<script type="application/ld+json">'
    )
    end = html.index("</script>", start)
    # Reverse the </ -> <\/ guard so json can parse it back.
    return json.loads(html[start:end].replace("<\\/", "</"))


def test_jsonld_has_context_type_name_url():
    # A non-Event type only needs name/url/image — no event fields required.
    s = _jsonld_script("SportsTeam", {"title": "A"}, "https://x/team/5/", "https://x/i.png")
    obj = _parse(s)
    assert obj["@context"] == "https://schema.org"
    assert obj["@type"] == "SportsTeam"
    assert obj["name"] == "A"
    assert obj["url"] == "https://x/team/5/"
    assert obj["image"] == "https://x/i.png"


def test_event_type_without_event_data_is_omitted():
    # A SportsEvent needs startDate + location; with none, emit nothing rather than
    # an invalid Event (which Search Console flags as a critical error).
    assert _jsonld_script("SportsEvent", {"title": "A vs B"}, "https://x/match/5/", "") == ""


def test_event_jsonld_carries_required_and_recommended_fields():
    from datetime import datetime

    meta = {
        "title": "A vs B",
        "event": _event_fields(
            datetime(2026, 9, 18, 16, 0),
            location="ملعب القاهرة",
            location_url="https://maps/x",
            end=datetime(2026, 9, 18, 18, 0),
            status="scheduled",
            competitors=["A", "B"],
            organizer="Youth Cup",
        ),
    }
    obj = _parse(_jsonld_script("SportsEvent", meta, "https://x/match/5/", "https://x/i.png"))
    assert obj["startDate"] == "2026-09-18T16:00:00"
    assert obj["endDate"] == "2026-09-18T18:00:00"
    assert obj["location"]["@type"] == "Place"
    assert obj["location"]["name"] == "ملعب القاهرة"
    assert obj["location"]["url"] == "https://maps/x"
    assert obj["eventStatus"] == "https://schema.org/EventScheduled"
    assert [t["name"] for t in obj["performer"]] == ["A", "B"]
    assert [t["name"] for t in obj["competitor"]] == ["A", "B"]
    assert obj["organizer"]["name"] == "Youth Cup"


def test_event_fields_empty_without_start_date():
    # A TBD fixture (no date) produces no event dict at all.
    assert _event_fields(None, location="ملعب") == {}


def test_jsonld_omits_missing_description_and_image():
    s = _jsonld_script("Person", {"title": "لاعب"}, "https://x/player/1/", "")
    obj = json.loads(s[s.index(">") + 1 : s.rindex("<")].replace("<\\/", "</"))
    assert "image" not in obj and "description" not in obj
    assert obj["name"] == "لاعب"  # Arabic kept readable (ensure_ascii=False)


def test_script_breakout_is_neutralised():
    # A hostile item name must not be able to close the script tag early.
    s = _jsonld_script("Person", {"title": "</script><script>alert(1)</script>"},
                       "https://x/player/1/", "")
    # No raw </script> before our own closing tag.
    inner = s[: s.rindex("</script>")]
    assert "</script>" not in inner
    assert "<\\/script>" in inner


def test_inject_adds_jsonld_when_schema_type_given():
    html = "<html><head><title>x</title><meta name=\"description\" content=\"\"/></head><body></body></html>"
    out = _inject_share_meta(
        html, {"title": "Team A", "description": "u17"}, "https://x/team/3/",
        "https://x/logo.png", og_type="website", schema_type="SportsTeam",
    )
    obj = _extract_jsonld(out)
    assert obj["@type"] == "SportsTeam"
    assert obj["name"] == "Team A"
    assert obj["description"] == "u17"
    # OG tags still present.
    assert 'property="og:title"' in out


def test_inject_skips_jsonld_when_no_schema_type():
    html = "<html><head><title>x</title></head><body></body></html>"
    out = _inject_share_meta(
        html, {"title": "Team A"}, "https://x/", "https://x/i.png",
    )
    assert "application/ld+json" not in out


# ── Search-engine hints: canonical, max-image-preview, real-image-only JSON-LD ──

from types import SimpleNamespace

from flask import Flask

from app import _canonical_entity_url, _player_club_name, _render_share_page

_SHELL = "<html><head><title>x</title><meta name=\"description\" content=\"\"/></head><body></body></html>"


def test_canonical_entity_url_normalises_path_routes():
    b = "https://www.youthscores.org"
    assert _canonical_entity_url(b, "/player/12") == f"{b}/player/12/"
    assert _canonical_entity_url(b, "/player/12/") == f"{b}/player/12/"
    assert _canonical_entity_url(b, "/competition/3/") == f"{b}/competition/3/"
    # Legacy query-form and non-entity pages get no canonical.
    assert _canonical_entity_url(b, "/news/") is None
    assert _canonical_entity_url(b, "/player/") is None
    assert _canonical_entity_url(b, "/player/_/") is None


def test_inject_adds_robots_hint_and_canonical():
    out = _inject_share_meta(
        _SHELL, {"title": "P"}, "https://x/player/1/?tab=stats", "https://x/p.jpg",
        schema_type="Person", canonical="https://x/player/1/",
    )
    assert '<meta name="robots" content="max-image-preview:large"/>' in out
    assert '<link rel="canonical" href="https://x/player/1/"/>' in out


def test_inject_without_canonical_emits_none():
    out = _inject_share_meta(_SHELL, {"title": "N"}, "https://x/news/?id=1", "https://x/i.png")
    assert 'rel="canonical"' not in out
    assert "max-image-preview:large" in out


def test_jsonld_extra_is_merged():
    meta = {"title": "P", "jsonld_extra": {"memberOf": {"@type": "SportsTeam", "name": "الأهلي"}}}
    obj = _parse(_jsonld_script("Person", meta, "https://x/player/1/", ""))
    assert obj["memberOf"]["name"] == "الأهلي"


def _render(tmp_path, path, meta):
    shell = tmp_path / "index.html"
    shell.write_text(_SHELL, encoding="utf-8")
    with Flask(__name__).test_request_context(path, base_url="https://www.youthscores.org"):
        return _render_share_page(str(shell), meta, og_type="profile", schema_type="Person")


def test_player_without_photo_has_no_jsonld_image_but_keeps_og_fallback(tmp_path):
    out = _render(tmp_path, "/player/7", {"title": "لاعب", "image": ""})
    assert "image" not in _extract_jsonld(out)
    assert "icons/icon-512.png" in out  # og:image still has the app-icon fallback
    assert '<link rel="canonical" href="https://www.youthscores.org/player/7/"/>' in out


def test_player_with_photo_has_it_in_jsonld(tmp_path):
    photo = "https://res.cloudinary.com/demo/image/upload/p.jpg"
    out = _render(tmp_path, "/player/7/?tab=career", {"title": "لاعب", "image": photo})
    assert _extract_jsonld(out)["image"] == photo
    assert '<link rel="canonical" href="https://www.youthscores.org/player/7/"/>' in out


def _reg(club_ar, start, end=None):
    club = SimpleNamespace(name_ar=club_ar, name_en=None)
    return SimpleNamespace(team=SimpleNamespace(club=club), start_date=start, end_date=end)


def test_player_club_prefers_current_registration():
    from datetime import date

    p = SimpleNamespace(registrations=[
        _reg("قديم", date(2020, 1, 1), date(2021, 1, 1)),
        _reg("الحالي", date(2019, 1, 1)),  # open-ended → current, wins despite older start
        _reg("سابق", date(2023, 1, 1), date(2024, 1, 1)),
    ])
    assert _player_club_name(p) == "الحالي"
    assert _player_club_name(SimpleNamespace(registrations=[])) == ""
