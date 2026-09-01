"""Dynamic XML sitemaps for the youthscores site.

The static Next export can't enumerate entity ids at build time (no API access,
and players/matches number in the tens of thousands), so the sitemap is generated
here from the DB at request time. A sitemap index points at per-entity sitemaps,
each paginated to stay well under the 50,000-URL / 50 MB limits.

Only the entities that now have /<entity>/<id> path routes are listed; news stays
on its query-param form and is covered by the static pages list.
"""

from __future__ import annotations

from xml.sax.saxutils import escape

import sqlalchemy as sa

from app.extensions import db

PER_PAGE = 20_000

# Indexable top-level pages (mirrors the former static sitemap.ts list). These are
# real crawlable sections; the per-entity query-param shells are intentionally
# omitted in favour of the path routes below.
STATIC_PATHS = [
    "", "competitions", "clubs", "news", "venues",
    "about", "contact", "privacy-policy", "terms",
]


def _entity_models() -> dict:
    """slug -> (Model, extra filter or None). Imported lazily to dodge cycles."""
    from app.models import Club, Coach, Competition, Match, Player, Team

    return {
        "competition": (Competition, None),
        "club": (Club, None),
        "team": (Team, None),
        "player": (Player, None),
        "coach": (Coach, None),
        "match": (Match, Match.deleted_at.is_(None)),
    }


def _count(model, flt) -> int:
    q = db.session.query(sa.func.count(model.id))
    if flt is not None:
        q = q.filter(flt)
    return q.scalar() or 0


def _url(base: str, loc: str, lastmod=None) -> str:
    out = [f"<loc>{escape(base + loc)}</loc>"]
    if lastmod is not None:
        out.append(f"<lastmod>{lastmod.date().isoformat()}</lastmod>")
    return "<url>" + "".join(out) + "</url>"


def _wrap_urlset(body: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"{body}</urlset>"
    )


def index_xml(base: str) -> str:
    """The sitemap index: one entry per static-pages sitemap and per entity page."""
    parts = [f"<sitemap><loc>{escape(base + '/sitemap-pages.xml')}</loc></sitemap>"]
    for slug, (model, flt) in _entity_models().items():
        total = _count(model, flt)
        pages = max(1, -(-total // PER_PAGE))  # ceil; always emit page 1
        for page in range(1, pages + 1):
            loc = f"{base}/sitemap-{slug}-{page}.xml"
            parts.append(f"<sitemap><loc>{escape(loc)}</loc></sitemap>")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"{''.join(parts)}</sitemapindex>"
    )


def pages_xml(base: str) -> str:
    """The static top-level pages."""
    body = "".join(_url(base, f"/{p}" if p else "/") for p in STATIC_PATHS)
    return _wrap_urlset(body)


def entity_xml(slug: str, page: int, base: str) -> str | None:
    """One page of an entity's /<slug>/<id>/ URLs, ordered by id. None if unknown
    slug or an out-of-range page (so the route can 404)."""
    models = _entity_models()
    if slug not in models or page < 1:
        return None
    model, flt = models[slug]
    q = db.session.query(model.id, model.updated_at)
    if flt is not None:
        q = q.filter(flt)
    rows = (
        q.order_by(model.id).offset((page - 1) * PER_PAGE).limit(PER_PAGE).all()
    )
    if not rows and page > 1:
        return None
    body = "".join(_url(base, f"/{slug}/{rid}/", updated) for rid, updated in rows)
    return _wrap_urlset(body)
