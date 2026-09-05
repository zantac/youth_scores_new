"""The chat unread logic: a side's unread count is the messages the *other* side
sent after that side last read the thread (two timestamps, not per-message rows).
"""

import os
import tempfile
from datetime import datetime, timedelta

import pytest


@pytest.fixture()
def ctx():
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
            yield db
            db.session.remove()
            db.engine.dispose()
    finally:
        DevelopmentConfig.SQLALCHEMY_DATABASE_URI = orig
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def test_unread_counts_only_the_other_sides_new_messages(ctx):
    db = ctx
    from app.models import (
        Tla3bnyAcademy, Tla3bnyAgeCategory, Tla3bnyCompetition, Tla3bnyConversation,
        Tla3bnyMessage, Tla3bnySeason, Tla3bnyTeam,
    )
    age = Tla3bnyAgeCategory(label="2012", sort_order=0)
    season = Tla3bnySeason(name="2026-2027")
    db.session.add_all([age, season]); db.session.flush()
    ac = Tla3bnyAcademy(name="A", status="approved"); db.session.add(ac); db.session.flush()
    team = Tla3bnyTeam(academy_id=ac.id, age_category_id=age.id, name="T"); db.session.add(team); db.session.flush()
    comp = Tla3bnyCompetition(name="Cup", season_id=season.id, status="active"); db.session.add(comp); db.session.flush()
    conv = Tla3bnyConversation(competition_id=comp.id, team_id=team.id, academy_id=ac.id)
    db.session.add(conv); db.session.flush()

    t0 = datetime(2026, 1, 1, 10, 0, 0)
    db.session.add(Tla3bnyMessage(conversation_id=conv.id, sender_side="academy", body="hi", created_at=t0))
    db.session.add(Tla3bnyMessage(conversation_id=conv.id, sender_side="organizer", body="ok", created_at=t0 + timedelta(minutes=1)))
    db.session.commit()

    # Neither side has read: each sees the OTHER side's messages as unread.
    assert conv.unread_for("academy") == 1     # the organizer's reply
    assert conv.unread_for("organizer") == 1    # the academy's opener

    # Organizer read at t0+30s: the academy's opener (t0) is now read.
    conv.organizer_last_read_at = t0 + timedelta(seconds=30)
    assert conv.unread_for("organizer") == 0
    # ...but the academy still hasn't read the organizer's t0+1min reply.
    assert conv.unread_for("academy") == 1

    conv.academy_last_read_at = t0 + timedelta(minutes=2)
    assert conv.unread_for("academy") == 0
