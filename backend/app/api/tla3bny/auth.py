from flask import jsonify, request

from app.extensions import db, limiter
from app.models import Tla3bnyAcademy, Tla3bnyCompetitionAdmin, Tla3bnyUser
from app.services import tla3bny_auth as auth

from . import tla3bny_bp
from ._helpers import (
    _credentials,
    _claim_login,
    _clean_url,
    _clip,
    _err,
    _validate_password,
    save_upload,
    _read_payload,
)


@tla3bny_bp.post("/auth/register")
@limiter.limit("5 per hour")
def register():
    """Register a new academy (multipart for a logo, or JSON).

    Registration is open: the academy and its login are live immediately, with
    no approval queue. A phone number is required — it is how an organiser
    reaches the academy about its entries.
    """
    data, files = _read_payload()
    logo = files.get("logo") if files is not None else None

    name = (data.get("name") or "").strip()
    username, password = _credentials(data)
    email = Tla3bnyUser.normalize_login(data.get("email"))
    # A registrant may type an email into the single login box; keep it as both.
    if username and "@" in username and not email:
        email = username
    phone = (data.get("phone") or "").strip()

    if not name or not username or not password:
        return _err("name, username and password are required")
    if not phone:
        return _err("phone is required")
    pw_err = _validate_password(password)
    if pw_err:
        return _err(pw_err)
    taken = _claim_login(username, email)
    if taken:
        return taken

    logo_path = None
    if logo is not None:
        try:
            logo_path = save_upload(logo, kind="image")
        except ValueError as e:
            return _err(str(e))

    academy = Tla3bnyAcademy(
        name=_clip(name, 255),
        name_en=_clip(data.get("name_en"), 255),
        logo_path=logo_path,
        phone=_clip(phone, 50),
        facebook_url=_clean_url(data.get("facebook_url")),
        whatsapp_number=_clip(data.get("whatsapp_number"), 50),
        address=_clip(data.get("address"), 255),
        description=_clip(data.get("description"), 20000),
        status="approved",
    )
    db.session.add(academy)
    db.session.flush()

    user = Tla3bnyUser(
        username=username,
        email=email,
        role="academy",
        status="active",
        academy_id=academy.id,
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return (
        jsonify(
            {
                "message": "Registration complete.",
                "token": auth.generate_token(user),
                "user": user.to_dict(),
                "academy": academy.to_dict(),
            }
        ),
        201,
    )


@tla3bny_bp.post("/auth/login")
@limiter.limit("10 per minute; 50 per hour")
def login():
    data = request.get_json(silent=True) or {}
    login_id, password = _credentials(data)

    user = Tla3bnyUser.by_login(login_id)
    if not user or not user.check_password(password):
        return _err("Invalid username or password", 401)
    if user.status == "suspended":
        return _err("This account is suspended", 403)
    return jsonify({"token": auth.generate_token(user), "user": user.to_dict()})


@tla3bny_bp.put("/auth/credentials")
@limiter.limit("10 per hour")
@auth.login_required
def update_own_credentials():
    """Change your own username / email / password."""
    user = auth.current_user()
    data = request.get_json(silent=True) or {}

    new_username = Tla3bnyUser.normalize_login(data.get("username"))
    new_email = Tla3bnyUser.normalize_login(data.get("email"))
    taken = _claim_login(
        new_username if "username" in data else None,
        new_email if "email" in data else None,
        exclude_id=user.id,
    )
    if taken:
        return taken

    if "username" in data:
        if not new_username and not (new_email or user.email):
            return _err("An account needs a username or an email")
        user.username = new_username
    if "email" in data:
        user.email = new_email
    password = data.get("password") or ""
    if password:
        pw_err = _validate_password(password)
        if pw_err:
            return _err(pw_err)
        user.set_password(password)
    db.session.commit()
    return jsonify(user.to_dict())


@tla3bny_bp.get("/auth/me")
@auth.login_required
def me():
    user = auth.current_user()
    data = {"user": user.to_dict()}
    if user.role == "academy" and user.academy:
        data["academy"] = user.academy.to_dict(with_teams=True)
    if user.role == "team" and user.team:
        data["team"] = user.team.to_dict(with_roster=True)
    if user.role == "competition_admin":
        data["competitions"] = [
            ca.competition.to_dict()
            for ca in Tla3bnyCompetitionAdmin.query.filter_by(user_id=user.id).all()
            if ca.competition
        ]
    return jsonify(data)
