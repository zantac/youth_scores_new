from flask import jsonify, request

from app.extensions import db
from app.models import Tla3bnySeason
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import _err, _int, _parse_date


@tla3bny_bp.get("/seasons")
def list_seasons():
    seasons = Tla3bnySeason.query.order_by(
        Tla3bnySeason.sort_order.asc(), Tla3bnySeason.name.desc()
    ).all()
    return jsonify([s.to_dict() for s in seasons])


@tla3bny_bp.post("/seasons")
@auth.super_admin_required
def create_season():
    data = request.get_json(silent=True) or {}
    name_ar = (data.get("name_ar") or "").strip()
    name_en = (data.get("name_en") or "").strip()
    # `name` is the unique key — derive it from the bilingual inputs when not given.
    name = (data.get("name") or "").strip() or name_ar or name_en
    if not name:
        return _err("name_ar or name_en is required")
    if Tla3bnySeason.query.filter_by(name=name).first():
        return _err("Season already exists", 409)
    s = Tla3bnySeason(
        name=name,
        name_ar=name_ar or None,
        name_en=name_en or None,
        start_date=_parse_date(data.get("start_date")),
        end_date=_parse_date(data.get("end_date")),
        is_active=bool(data.get("is_active", True)),
        sort_order=_int(data.get("sort_order"), 0),
    )
    db.session.add(s)
    db.session.commit()
    return jsonify(s.to_dict()), 201


@tla3bny_bp.put("/seasons/<int:season_id>")
@auth.super_admin_required
def update_season(season_id: int):
    s = Tla3bnySeason.query.get_or_404(season_id)
    data = request.get_json(silent=True) or {}
    if "name_ar" in data:
        s.name_ar = (data.get("name_ar") or "").strip() or None
    if "name_en" in data:
        s.name_en = (data.get("name_en") or "").strip() or None
    # Keep `name` (unique key) in sync with the bilingual display names.
    new_name = (data.get("name") or "").strip() or s.name_ar or s.name_en
    if new_name and new_name != s.name:
        s.name = new_name
    if "start_date" in data:
        s.start_date = _parse_date(data.get("start_date"))
    if "end_date" in data:
        s.end_date = _parse_date(data.get("end_date"))
    if "is_active" in data:
        s.is_active = bool(data.get("is_active"))
    if "sort_order" in data:
        s.sort_order = _int(data.get("sort_order"), s.sort_order)
    db.session.commit()
    return jsonify(s.to_dict())


@tla3bny_bp.delete("/seasons/<int:season_id>")
@auth.super_admin_required
def delete_season(season_id: int):
    s = Tla3bnySeason.query.get_or_404(season_id)
    db.session.delete(s)
    db.session.commit()
    return jsonify({"message": "deleted"})
