"""Super-admin "login as" (impersonation).

A super admin mints a token that resolves to another account (an academy or a
competition organizer) so they can see what that account sees and fix its
problem. The stamp of who minted it is signed into the token, and the token dies
the moment the super admin's own session is invalidated (e.g. a password change).

NOTE on the fixture: unlike the single-request authz tests, these drive two
requests per test (impersonate, then /auth/me). ``current_user`` caches on Flask
``g``, which is bound to the application context — so a *held* app context would
leak the first request's user into the second. The fixture therefore does NOT
hold a context across the test_client calls; seeding and later mutations open
their own short-lived contexts, and the seed returns only primitives.
"""

import os
import tempfile

import pytest


@pytest.fixture()
def app_db():
    os.environ.setdefault("FLASK_ENV", "development")
    from app import create_app
    from app.config import DevelopmentConfig
    from app.extensions import db

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    orig = DevelopmentConfig.SQLALCHEMY_DATABASE_URI
    DevelopmentConfig.SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp.name}"
    try:
        app = create_app("development")
        with app.app_context():
            db.create_all()
        yield app, db
        with app.app_context():
            db.session.remove()
            db.engine.dispose()
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = orig
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _seed(app, db):
    from app.models import Tla3bnyAcademy, Tla3bnyUser
    from app.services import tla3bny_auth as auth

    with app.app_context():
        ac = Tla3bnyAcademy(name="Ac", status="approved")
        db.session.add(ac)
        db.session.flush()
        su = Tla3bnyUser(username="su", role="super_admin", status="active", password_hash="x")
        su2 = Tla3bnyUser(username="su2", role="super_admin", status="active", password_hash="x")
        admin = Tla3bnyUser(username="org", role="competition_admin", status="active", password_hash="x")
        acad = Tla3bnyUser(username="ac", role="academy", status="active", password_hash="x", academy_id=ac.id)
        db.session.add_all([su, su2, admin, acad])
        db.session.commit()
        return {
            "academy_id": ac.id,
            "su_id": su.id,
            "su_token": auth.generate_token(su),
            "su2_id": su2.id,
            "admin_id": admin.id,
            "admin_token": auth.generate_token(admin),
            "acad_id": acad.id,
            "acad_token": auth.generate_token(acad),
        }


def _post(c, path, token):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return c.post(f"/api/tla3bny{path}", headers=headers)


def _me(c, token):
    return c.get("/api/tla3bny/auth/me", headers={"Authorization": f"Bearer {token}"})


def test_super_admin_can_impersonate_a_competition_organizer(app_db):
    app, db = app_db
    s = _seed(app, db)
    c = app.test_client()
    r = _post(c, f"/auth/impersonate/{s['admin_id']}", s["su_token"])
    assert r.status_code == 200, r.get_json()
    imp_token = r.get_json()["token"]

    # The token now resolves AS the organizer, and /auth/me reports who is driving.
    body = _me(c, imp_token).get_json()
    assert body["user"]["id"] == s["admin_id"]
    assert body["user"]["role"] == "competition_admin"
    assert body["impersonation"]["super_admin_id"] == s["su_id"]


def test_super_admin_can_impersonate_an_academy(app_db):
    app, db = app_db
    s = _seed(app, db)
    c = app.test_client()
    r = _post(c, f"/auth/impersonate/academy/{s['academy_id']}", s["su_token"])
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["user"]["id"] == s["acad_id"]


@pytest.mark.parametrize("who", ["anon", "academy", "organizer"])
def test_only_super_admin_may_impersonate(app_db, who):
    app, db = app_db
    s = _seed(app, db)
    token = {"anon": None, "academy": s["acad_token"], "organizer": s["admin_token"]}[who]
    r = _post(app.test_client(), f"/auth/impersonate/{s['acad_id']}", token)
    assert r.status_code in (401, 403)


def test_a_super_admin_is_never_impersonable(app_db):
    app, db = app_db
    s = _seed(app, db)
    r = _post(app.test_client(), f"/auth/impersonate/{s['su2_id']}", s["su_token"])
    assert r.status_code == 403


def test_impersonation_token_dies_when_super_admin_session_is_invalidated(app_db):
    app, db = app_db
    s = _seed(app, db)
    c = app.test_client()
    imp_token = _post(c, f"/auth/impersonate/{s['admin_id']}", s["su_token"]).get_json()["token"]
    assert _me(c, imp_token).status_code == 200  # works before the password change

    # The super admin changes their password (bumps token_version). Every "login
    # as" token they minted must stop verifying immediately.
    from app.models import Tla3bnyUser
    with app.app_context():
        su = db.session.get(Tla3bnyUser, s["su_id"])
        su.set_password("brand-new-pass")
        db.session.commit()

    assert _me(c, imp_token).status_code == 401
