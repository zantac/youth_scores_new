"""JSON-LD structured data + the </script>-breakout guard in the share injector.

These give crawlers machine-readable content the client-rendered shell lacks;
the escaping check matters because item names are free text from the DB."""

import json

from app import _inject_share_meta, _jsonld_script


def _extract_jsonld(html: str) -> dict:
    start = html.index('<script type="application/ld+json">') + len(
        '<script type="application/ld+json">'
    )
    end = html.index("</script>", start)
    # Reverse the </ -> <\/ guard so json can parse it back.
    return json.loads(html[start:end].replace("<\\/", "</"))


def test_jsonld_has_context_type_name_url():
    s = _jsonld_script("SportsEvent", {"title": "A vs B"}, "https://x/match/5/", "https://x/i.png")
    obj = json.loads(s[s.index(">") + 1 : s.rindex("<")].replace("<\\/", "</"))
    assert obj["@context"] == "https://schema.org"
    assert obj["@type"] == "SportsEvent"
    assert obj["name"] == "A vs B"
    assert obj["url"] == "https://x/match/5/"
    assert obj["image"] == "https://x/i.png"


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
