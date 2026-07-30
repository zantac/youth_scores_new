"""Login and current-user endpoints for the admin panel."""

from __future__ import annotations

from datetime import datetime

from flask import Blueprint, jsonify, request

from app.extensions import db, limiter
from app.models import AdminUser
from app.services import auth

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/api/auth/login")
@limiter.limit("10 per minute")
def login():
    j = request.get_json(silent=True) or {}
    username = (j.get("username") or "").strip()
    password = j.get("password") or ""

    user = AdminUser.query.filter_by(username=username).first()
    # Same response whether the user is missing or the password is wrong.
    if not user or not user.is_active or not user.check_password(password):
        return jsonify({"error": "اسم المستخدم أو كلمة المرور غير صحيحة"}), 401

    user.last_login_at = datetime.utcnow()
    db.session.commit()

    return jsonify({"token": auth.generate_token(user), "user": auth.public_user(user)})


@auth_bp.get("/api/auth/me")
@auth.login_required
def me():
    user = auth.current_admin()
    if user is None:  # reached only via the master key, which has no user
        return jsonify({"user": None})
    return jsonify({"user": auth.public_user(user)})
