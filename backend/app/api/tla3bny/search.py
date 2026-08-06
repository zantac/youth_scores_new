"""Public global search across academies, players and coaches.

Feeds the site's search box. Teams aren't searched directly — a team's name is
derived from its academy + age group (the ``name`` column is almost always
empty), so the academy is the searchable identity (mirrors youthscores' clubs).
"""
import sqlalchemy as sa
from flask import jsonify, request

from app.models import Tla3bnyAcademy, Tla3bnyCoach, Tla3bnyPlayer

from . import tla3bny_bp

_LIMIT = 12


@tla3bny_bp.get("/search")
def search():
    q = (request.args.get("q") or "").strip()
    # At least two characters, so a single keystroke doesn't scan the name tables.
    if len(q) < 2:
        return jsonify({"academies": [], "players": [], "coaches": []})
    like = f"%{q}%"

    academies = (
        Tla3bnyAcademy.query
        .filter(sa.or_(Tla3bnyAcademy.name.ilike(like), Tla3bnyAcademy.name_en.ilike(like)))
        .filter(Tla3bnyAcademy.status == "approved")  # hide suspended/rejected
        .order_by(Tla3bnyAcademy.name)
        .limit(_LIMIT)
        .all()
    )
    players = (
        Tla3bnyPlayer.query
        .filter(sa.or_(Tla3bnyPlayer.name.ilike(like), Tla3bnyPlayer.name_en.ilike(like)))
        .order_by(Tla3bnyPlayer.name)
        .limit(_LIMIT)
        .all()
    )
    coaches = (
        Tla3bnyCoach.query
        .filter(sa.or_(Tla3bnyCoach.name.ilike(like), Tla3bnyCoach.name_en.ilike(like)))
        .order_by(Tla3bnyCoach.name)
        .limit(_LIMIT)
        .all()
    )

    return jsonify({
        "academies": [{
            "id": a.id,
            "name": a.name,
            "name_en": a.name_en,
            "logo_path": a.logo_path,
        } for a in academies],
        "players": [{
            "id": p.id,
            "name": p.name,
            "name_en": p.name_en,
            "position": p.position,
            "photo_path": p.photo_path,
        } for p in players],
        "coaches": [{
            "id": c.id,
            "name": c.name,
            "name_en": c.name_en,
            "role_ar": c.role_ar,
            "photo_path": c.photo_path,
            "team_name": c.team.display_name() if c.team else None,
        } for c in coaches],
    })
