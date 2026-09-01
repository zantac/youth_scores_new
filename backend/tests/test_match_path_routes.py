"""Path-route entity pages: Flask serves the per-entity sentinel shell (static
export can't prebuild every id) and 301s the legacy /<entity>?id= form to it. OG
injection with real data is covered by the frontend pilot + manual checks; here we
pin the routing (no DB row -> the plain shell is served) for each migrated entity."""

import os
import tempfile

import pytest

os.environ.setdefault("FLASK_ENV", "development")

from app import create_app
from app.extensions import db

# Entities that have a /<entity>/<id> path route + sentinel shell.
ENTITIES = ["match", "club", "competition", "team", "player", "coach"]

SHELL = "<html><head><title>{e} | Youth Scores</title></head><body>{e} shell</body></html>"


def _app():
    fe = tempfile.mkdtemp()
    for e in ENTITIES:
        os.makedirs(os.path.join(fe, e, "_"), exist_ok=True)
        with open(os.path.join(fe, e, "_", "index.html"), "w", encoding="utf-8") as f:
            f.write(SHELL.format(e=e))
    with open(os.path.join(fe, "index.html"), "w", encoding="utf-8") as f:
        f.write("<html><head><title>home</title></head><body>home</body></html>")
    tmpdb = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmpdb.close()
    app = create_app("development")
    app.config.update(SQLALCHEMY_DATABASE_URI=f"sqlite:///{tmpdb.name}", FRONTEND_DIR=fe)
    with app.app_context():
        db.create_all()
    return app


@pytest.mark.parametrize("entity", ENTITIES)
def test_legacy_query_form_301s_to_path(entity):
    r = _app().test_client().get(f"/{entity}?id=5")
    assert r.status_code == 301
    assert r.headers["Location"].rstrip("/").endswith(f"/{entity}/5")


@pytest.mark.parametrize("entity", ENTITIES)
def test_non_numeric_id_does_not_redirect(entity):
    r = _app().test_client().get(f"/{entity}?id=abc")
    assert r.status_code != 301


@pytest.mark.parametrize("entity", ENTITIES)
def test_path_form_serves_sentinel_shell(entity):
    r = _app().test_client().get(f"/{entity}/5/")
    assert r.status_code == 200
    assert b"shell" in r.data  # no DB row -> plain sentinel shell


@pytest.mark.parametrize("entity", ENTITIES)
def test_path_form_without_trailing_slash(entity):
    r = _app().test_client().get(f"/{entity}/5")
    assert r.status_code == 200
    assert b"shell" in r.data
