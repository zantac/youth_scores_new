"""Dynamic sitemaps: index + per-entity pages generated from the DB, only on the
youthscores host, shadowing any static out/sitemap.xml."""

import os
import tempfile
from datetime import date

os.environ.setdefault("FLASK_ENV", "development")

from app import create_app
from app.extensions import db


def _app():
    tmpdb = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmpdb.close()
    app = create_app("development")
    app.config.update(SQLALCHEMY_DATABASE_URI=f"sqlite:///{tmpdb.name}")
    with app.app_context():
        db.create_all()
        from app.models import Club, Season, Competition

        db.session.add_all([Club(name_ar=f"نادي {i}") for i in range(3)])
        s = Season(name_ar="م", start_date=date(2025, 1, 1), end_date=date(2025, 12, 31))
        db.session.add(s)
        db.session.flush()
        db.session.add(Competition(season_id=s.id, name_ar="ب"))
        db.session.commit()
    return app


def test_index_lists_static_and_entities():
    r = _app().test_client().get("/sitemap.xml")
    assert r.status_code == 200
    assert "application/xml" in r.content_type
    body = r.get_data(as_text=True)
    assert "<sitemapindex" in body
    assert "/sitemap-pages.xml" in body
    # Every path-route entity is present, page 1 at least.
    for slug in ("competition", "club", "team", "player", "coach", "match"):
        assert f"/sitemap-{slug}-1.xml" in body


def test_pages_sitemap_has_static_paths():
    body = _app().test_client().get("/sitemap-pages.xml").get_data(as_text=True)
    assert "<urlset" in body
    assert "<loc>http://localhost/</loc>" in body
    assert "/clubs</loc>" in body


def test_entity_sitemap_lists_club_urls():
    body = _app().test_client().get("/sitemap-club-1.xml").get_data(as_text=True)
    # 3 clubs -> ids 1..3 as /club/<id>/
    for i in (1, 2, 3):
        assert f"/club/{i}/</loc>" in body


def test_out_of_range_page_404s():
    assert _app().test_client().get("/sitemap-club-2.xml").status_code == 404


def test_unknown_entity_404s():
    assert _app().test_client().get("/sitemap-banana-1.xml").status_code == 404


def test_empty_entity_still_serves_page_1():
    # No coaches seeded -> page 1 is an empty but valid urlset (never 404 on page 1).
    r = _app().test_client().get("/sitemap-coach-1.xml")
    assert r.status_code == 200
    assert "<urlset" in r.get_data(as_text=True)
