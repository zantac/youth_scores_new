from flask import jsonify, request
from sqlalchemy.exc import IntegrityError

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
        training_place=_clip(data.get("training_place"), 255),
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
    try:
        db.session.commit()
    except IntegrityError:
        # Lost the check-then-insert race to a concurrent identical signup — the
        # unique username/email constraint is the real guard; report it as the same
        # 409 the pre-check gives instead of a 500.
        db.session.rollback()
        return _err("This username or email is already taken", 409)

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


# Roles a super admin may "log in as" to troubleshoot an account's problem. A
# super admin is never impersonable (no privilege laundering), and a team's
# login is managed by its academy — so the help desk impersonates the academy,
# which can already act on its teams, rather than the team account directly.
_IMPERSONATABLE = ("academy", "competition_admin")


@tla3bny_bp.post("/auth/impersonate/<int:user_id>")
@auth.super_admin_required
def impersonate(user_id: int):
    """Mint a token that signs the super admin in AS another account, so they can
    see what that account sees and fix its problem. The token carries a signed
    stamp of who minted it and dies the moment the super admin changes their
    password (see services.tla3bny_auth.generate_token)."""
    me = auth.current_user()
    target = db.session.get(Tla3bnyUser, user_id)
    if not target:
        return _err("Account not found", 404)
    if target.id == me.id or target.role not in _IMPERSONATABLE:
        return _err("This account cannot be impersonated", 403)
    if target.status == "suspended":
        return _err("This account is suspended", 403)
    return jsonify(
        {
            "token": auth.generate_token(target, impersonator=me),
            "user": target.to_dict(),
        }
    )


@tla3bny_bp.post("/auth/impersonate/academy/<int:academy_id>")
@auth.super_admin_required
def impersonate_academy(academy_id: int):
    """Log in as an academy's own account. The admin screen lists academies, not
    their login ids, so the target is resolved from the academy here. (A suspended
    academy is allowed — the super admin may need to see what it sees; the
    academy-level suspension still blocks writes inside the session.)"""
    me = auth.current_user()
    user = (
        Tla3bnyUser.query.filter_by(academy_id=academy_id, role="academy")
        .order_by(Tla3bnyUser.id)
        .first()
    )
    if not user:
        return _err("This academy has no login account", 404)
    return jsonify(
        {
            "token": auth.generate_token(user, impersonator=me),
            "user": user.to_dict(),
        }
    )


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
    changed_password = False
    if password:
        pw_err = _validate_password(password)
        if pw_err:
            return _err(pw_err)
        user.set_password(password)
        changed_password = True
    db.session.commit()
    result: dict = {"user": user.to_dict()}
    if changed_password:
        # set_password bumped token_version, invalidating every existing session
        # (including this request's). Hand back a fresh token so the caller stays
        # signed in while any other/stolen sessions are logged out.
        result["token"] = auth.generate_token(user)
    return jsonify(result)


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
    # During a "login as" session, tell the client who is really driving so it
    # can show the "you are inside account X" banner and a way back out.
    imp = auth.current_impersonator()
    if imp:
        data["impersonation"] = {
            "super_admin_id": imp.id,
            "username": imp.username or imp.email,
            "name": imp.display_name(),
        }
    return jsonify(data)
