"""Organizer refreshes a player's identity photo.

POST /players/<id>/photo — an organizer of a competition the player is entered
in may replace the photo (academies sometimes register an old one). Scoped to
the photo; bypasses the post-approval edit freeze; keeps approvals intact.
"""

import os
import tempfile
from datetime import date
from io import BytesIO

import pytest


@pytest.fixture()
def client():
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
            db.session.remove()
            db.engine.dispose()
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = orig
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _png():
    from PIL import Image
    buf = BytesIO()
    Image.new("RGB", (8, 8), "green").save(buf, "PNG")
    buf.seek(0)
    return buf


def _png_portrait():
    from PIL import Image
    buf = BytesIO()
    Image.new("RGB", (12, 20), "green").save(buf, "PNG")
    buf.seek(0)
    return buf


def _seed(db):
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition, Tla3bnyCompetitionAdmin,
        Tla3bnyCompetitionAge, Tla3bnyCompetitionPlayer, Tla3bnyCompetitionTeam,
        Tla3bnyPlayer, Tla3bnyPlayerTeam, Tla3bnySeason, Tla3bnyTeam, Tla3bnyUser,
    )
    from app.services import tla3bny_auth as auth

    age = Tla3bnyAgeCategory(label="2012", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season])
    db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active")
    comp2 = Tla3bnyCompetition(name="Other", season_id=season.id, status="active")
    db.session.add_all([comp, comp2])
    db.session.flush()
    db.session.add(Tla3bnyCompetitionAge(competition_id=comp.id, age_category_id=age.id))
    ac = Tla3bnyAcademy(name="Ac", status="approved")
    db.session.add(ac)
    db.session.flush()
    team = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="H")
    db.session.add(team)
    db.session.flush()
    entry = Tla3bnyCompetitionTeam(competition_id=comp.id, team_id=team.id,
                                   age_category_id=age.id, status="active")
    db.session.add(entry)
    db.session.flush()
    player = Tla3bnyPlayer(name="P", dob=date(2012, 1, 1),
                           national_id="29001011234567", photo_path="old.jpg")
    db.session.add(player)
    db.session.flush()
    db.session.add(Tla3bnyPlayerTeam(player_id=player.id, team_id=team.id))
    cp = Tla3bnyCompetitionPlayer(competition_team_id=entry.id,
                                  player_id=player.id, status="pending")
    db.session.add(cp)

    # Organizers: a full collaborator + a data-entry organizer of `comp`, an
    # academy owner login, and an organizer of an unrelated competition.
    collab = Tla3bnyUser(username="collab", role="competition_admin", status="active", password_hash="x")
    de = Tla3bnyUser(username="de", role="competition_admin", status="active", password_hash="x")
    owner = Tla3bnyUser(username="acad", role="academy", status="active", password_hash="x", academy_id=ac.id)
    other = Tla3bnyUser(username="other", role="competition_admin", status="active", password_hash="x")
    db.session.add_all([collab, de, owner, other])
    db.session.flush()
    db.session.add_all([
        Tla3bnyCompetitionAdmin(competition_id=comp.id, user_id=collab.id, is_owner=True, role="collaborator"),
        Tla3bnyCompetitionAdmin(competition_id=comp.id, user_id=de.id, role="data_entry"),
        Tla3bnyCompetitionAdmin(competition_id=comp2.id, user_id=other.id, is_owner=True, role="collaborator"),
    ])
    db.session.commit()
    return {
        "player_id": player.id, "cp_id": cp.id,
        "collab": auth.generate_token(collab), "de": auth.generate_token(de),
        "owner": auth.generate_token(owner), "other": auth.generate_token(other),
    }


def _post_photo(app, pid, tok):
    return app.test_client().post(
        f"/api/tla3bny/players/{pid}/photo",
        data={"photo": (_png(), "new.png")},
        content_type="multipart/form-data",
        headers={"Authorization": f"Bearer {tok}"},
    )


def test_collaborator_sets_photo(client):
    app, db = client
    s = _seed(db)
    r = _post_photo(app, s["player_id"], s["collab"])
    assert r.status_code == 200
    from app.models import Tla3bnyPlayer
    db.session.expire_all()
    assert db.session.get(Tla3bnyPlayer, s["player_id"]).photo_path != "old.jpg"


def test_data_entry_organizer_sets_photo(client):
    app, db = client
    s = _seed(db)
    assert _post_photo(app, s["player_id"], s["de"]).status_code == 200


def test_photo_change_keeps_approval(client):
    app, db = client
    s = _seed(db)
    from app.models import Tla3bnyCompetitionPlayer, Tla3bnyPlayer
    cp = db.session.get(Tla3bnyCompetitionPlayer, s["cp_id"])
    cp.status = "approved"
    db.session.commit()
    assert _post_photo(app, s["player_id"], s["collab"]).status_code == 200
    db.session.expire_all()
    # The whole point: a trusted organizer's photo must not knock it to pending.
    assert db.session.get(Tla3bnyCompetitionPlayer, s["cp_id"]).status == "approved"
    assert db.session.get(Tla3bnyPlayer, s["player_id"]).photo_path != "old.jpg"


def test_outsider_organizer_denied(client):
    app, db = client
    s = _seed(db)
    # Organizer of an unrelated competition the player isn't in.
    assert _post_photo(app, s["player_id"], s["other"]).status_code == 403
    # Academy owner isn't an organizer — this endpoint is organizer-only.
    assert _post_photo(app, s["player_id"], s["owner"]).status_code == 403
    from app.models import Tla3bnyPlayer
    db.session.expire_all()
    assert db.session.get(Tla3bnyPlayer, s["player_id"]).photo_path == "old.jpg"


def test_photo_required(client):
    app, db = client
    s = _seed(db)
    r = app.test_client().post(
        f"/api/tla3bny/players/{s['player_id']}/photo",
        data={}, content_type="multipart/form-data",
        headers={"Authorization": f"Bearer {s['collab']}"},
    )
    assert r.status_code == 400


def _rotate(app, pid, tok, direction):
    return app.test_client().post(
        f"/api/tla3bny/players/{pid}/photo/rotate",
        json={"direction": direction},
        headers={"Authorization": f"Bearer {tok}"},
    )


def test_organizer_rotates_photo_and_keeps_approval(client):
    app, db = client
    s = _seed(db)
    from app.models import Tla3bnyCompetitionPlayer, Tla3bnyPlayer
    # Give the player a real (portrait) photo so rotation has something to turn.
    buf = _png_portrait()
    from app.api.tla3bny._helpers import save_upload
    from werkzeug.datastructures import FileStorage
    player = db.session.get(Tla3bnyPlayer, s["player_id"])
    player.photo_path = save_upload(
        FileStorage(stream=buf, filename="p.png", content_type="image/png"))
    cp = db.session.get(Tla3bnyCompetitionPlayer, s["cp_id"])
    cp.status = "approved"
    db.session.commit()
    before = player.photo_path

    r = _rotate(app, s["player_id"], s["collab"], "right")
    assert r.status_code == 200
    db.session.expire_all()
    # A new file is stored and approval is preserved.
    assert db.session.get(Tla3bnyPlayer, s["player_id"]).photo_path != before
    assert db.session.get(Tla3bnyCompetitionPlayer, s["cp_id"]).status == "approved"


def test_rotate_rejects_bad_direction(client):
    app, db = client
    s = _seed(db)
    assert _rotate(app, s["player_id"], s["collab"], "sideways").status_code == 400


def test_rotate_denied_for_outsider(client):
    app, db = client
    s = _seed(db)
    assert _rotate(app, s["player_id"], s["other"], "left").status_code == 403
