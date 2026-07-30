from flask import jsonify, request

from app.extensions import db
from app.models import Tla3bnyAgeCategory, Tla3bnyCompetitionAge, Tla3bnyTeam
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import _clean_docs, _err, _int


@tla3bny_bp.get("/categories")
def list_categories():
    cats = Tla3bnyAgeCategory.query.order_by(
        Tla3bnyAgeCategory.sort_order.asc(), Tla3bnyAgeCategory.label.asc()
    ).all()
    return jsonify([c.to_dict() for c in cats])


@tla3bny_bp.post("/categories")
@auth.super_admin_required
def create_category():
    data = request.get_json(silent=True) or {}
    label = (data.get("label") or "").strip()
    if not label:
        return _err("label is required")
    if Tla3bnyAgeCategory.query.filter_by(label=label).first():
        return _err("Category already exists", 409)
    cat = Tla3bnyAgeCategory(
        label=label,
        label_ar=(data.get("label_ar") or "").strip() or None,
        label_en=(data.get("label_en") or "").strip() or None,
        oldest_birth_year=_int(data.get("oldest_birth_year")),
        required_documents=_clean_docs(data.get("required_documents")),
        sort_order=_int(data.get("sort_order"), 0),
    )
    db.session.add(cat)
    db.session.commit()
    return jsonify(cat.to_dict()), 201


@tla3bny_bp.put("/categories/<int:cat_id>")
@auth.super_admin_required
def update_category(cat_id: int):
    cat = Tla3bnyAgeCategory.query.get_or_404(cat_id)
    data = request.get_json(silent=True) or {}
    label = (data.get("label") or "").strip()
    if label:
        existing = Tla3bnyAgeCategory.query.filter_by(label=label).first()
        if existing and existing.id != cat_id:
            return _err("Category already exists", 409)
        cat.label = label
    if "label_ar" in data:
        cat.label_ar = (data.get("label_ar") or "").strip() or None
    if "label_en" in data:
        cat.label_en = (data.get("label_en") or "").strip() or None
    if "oldest_birth_year" in data:
        cat.oldest_birth_year = _int(data.get("oldest_birth_year"))
    if "required_documents" in data:
        cat.required_documents = _clean_docs(data.get("required_documents"))
    if "sort_order" in data:
        cat.sort_order = _int(data.get("sort_order"), cat.sort_order)
    db.session.commit()
    return jsonify(cat.to_dict())


@tla3bny_bp.delete("/categories/<int:cat_id>")
@auth.super_admin_required
def delete_category(cat_id: int):
    cat = Tla3bnyAgeCategory.query.get_or_404(cat_id)
    in_use = (
        Tla3bnyTeam.query.filter_by(age_category_id=cat_id).first()
        or Tla3bnyCompetitionAge.query.filter_by(age_category_id=cat_id).first()
    )
    if in_use:
        return _err("Age is in use by a team or competition and cannot be deleted", 409)
    db.session.delete(cat)
    db.session.commit()
    return jsonify({"message": "deleted"})
