"""The /match/<id> path route: Flask serves the sentinel shell (static export
can't prebuild every match id) and 301s the legacy /match?id= form to it. OG
injection with real match data is covered by the frontend pilot + manual checks;
here we pin the routing (no DB match -> the plain shell is served)."""

import os
import tempfile

os.environ.setdefault("FLASK_ENV", "development")

from app import create_app
from app.extensions import db

SHELL_HTML = "<html><head><title>مباراة | Youth Scores</title></head><body>shell</body></html>"


def _app():
    fe = tempfile.mkdtemp()
    os.makedirs(os.path.join(fe, "match", "_"), exist_ok=True)
    with open(os.path.join(fe, "match", "_", "index.html"), "w", encoding="utf-8") as f:
        f.write(SHELL_HTML)
    with open(os.path.join(fe, "index.html"), "w", encoding="utf-8") as f:
        f.write("<html><head><title>home</title></head><body>home</body></html>")
    tmpdb = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmpdb.close()
    app = create_app("development")
    app.config.update(SQLALCHEMY_DATABASE_URI=f"sqlite:///{tmpdb.name}", FRONTEND_DIR=fe)
    with app.app_context():
        db.create_all()
    return app


def test_legacy_query_form_301s_to_path():
    r = _app().test_client().get("/match?id=5")
    assert r.status_code == 301
    assert r.headers["Location"].rstrip("/").endswith("/match/5")


def test_non_numeric_id_does_not_redirect():
    # /match?id=abc must not 301 (only digit ids); falls through to the shim shell.
    r = _app().test_client().get("/match?id=abc")
    assert r.status_code != 301


def test_path_form_serves_sentinel_shell():
    r = _app().test_client().get("/match/5/")
    assert r.status_code == 200
    assert b"Youth Scores" in r.data  # no DB match -> plain sentinel shell


def test_path_form_without_trailing_slash():
    r = _app().test_client().get("/match/5")
    assert r.status_code == 200
    assert b"shell" in r.data
