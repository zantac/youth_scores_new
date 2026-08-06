"""Structure management for the admin panel — seasons, age groups, clubs,
competitions, and teams (create + edit). Editor role and above.

Deleting a structural row is allowed only while nothing depends on it, which
makes it a way to undo a mistaken entry rather than a way to discard history.
Anything still carrying matches refuses with a 409 naming what is in the way;
rows the schema cascades (a club's staff, a team's roster) are not treated as
dependants, since they mean nothing without their parent.
"""

from __future__ import annotations

import re
from datetime import date

import sqlalchemy as sa
from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import (
    AgeGroup,
    Club,
    ClubStaff,
    Coach,
    Competition,
    CompetitionTeam,
    Group,
    GroupTeam,
    Match,
    Player,
    PlayerTeam,
    Season,
    Stage,
    Team,
    TeamCoach,
)
from app.models import codes
from app.services import auth

manage_bp = Blueprint("manage", __name__)


def _pd(v):
    try:
        return date.fromisoformat(str(v)) if v else None
    except ValueError:
        return None


def _norm(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"[ً-ْـ]", "", s)
    s = s.translate(str.maketrans("أإآٱ", "اااا"))
    return re.sub(r"\s+", " ", s).strip()


def _str(v):
    v = (v or "").strip() if isinstance(v, str) else v
    return v or None


def default_spell_start():
    """When a coaching spell or a registration starts, unless one is given.

    A team is not tied to a season any more, so this comes from the active
    season instead of from the team. Falls back to today if none is marked.
    """
    s = (Season.query.order_by(Season.is_active.desc(), Season.start_date.desc())
         .first())
    return s.start_date if s else date.today()


def _next_order(model, field, pid) -> int:
    """The next display position for a new row appended to a parent's list."""
    top = (db.session.query(db.func.max(model.sort_order))
           .filter(getattr(model, field) == pid).scalar())
    return (top or 0) + 1


def _coach_role_rank():
    """Seniority rank for a coach's Arabic role; unlisted roles sort last."""
    return sa.case(codes.COACH_ROLE_RANK, value=TeamCoach.role_ar,
                   else_=codes.UNRANKED_COACH_ROLE)


def _staff_role_rank():
    """Seniority rank for a club post; unlisted posts sort last."""
    return sa.case(codes.CLUB_STAFF_ROLE_RANK, value=ClubStaff.role_ar,
                   else_=codes.UNRANKED_CLUB_STAFF_ROLE)


def _delete_plan(kind: str, oid: int):
    """What deleting this row would cost: (obj, label, name, blockers, cascades).

    `blockers` stop the delete outright; `cascades` are rows that go with it.
    Returns None when the row does not exist. Counts are shown to the admin
    before they confirm, so a delete is never a guess about what it takes away.
    """
    if kind == "season":
        o = db.session.get(Season, oid)
        if o is None:
            return None
        # Teams are not scoped to a season, so only its competitions hold it.
        return (o, "الموسم", o.name_ar or o.name_en, [
            (Competition.query.filter_by(season_id=oid).count(), "بطولة"),
        ], [])

    if kind == "age-group":
        o = db.session.get(AgeGroup, oid)
        if o is None:
            return None
        return (o, "المرحلة السنية", o.name_ar or o.name_en, [
            (Competition.query.filter_by(age_group_id=oid).count(), "بطولة"),
            (Team.query.filter_by(age_group_id=oid).count(), "فريق"),
        ], [])

    if kind == "club":
        o = db.session.get(Club, oid)
        if o is None:
            return None
        return (o, "النادي", o.name_ar or o.name_en, [
            (Team.query.filter_by(club_id=oid).count(), "فريق"),
        ], [
            (ClubStaff.query.filter_by(club_id=oid).count(), "عضو جهاز إداري"),
        ])

    if kind == "competition":
        o = db.session.get(Competition, oid)
        if o is None:
            return None
        stages = Stage.query.filter_by(competition_id=oid)
        stage_ids = [s.id for s in stages]
        groups = Group.query.filter(Group.stage_id.in_(stage_ids)) if stage_ids else None
        group_ids = [g.id for g in groups] if stage_ids else []
        return (o, "البطولة", o.name_ar or o.name_en, [
            (Match.query.filter(Match.stage_id.in_(stage_ids)).count() if stage_ids else 0,
             "مباراة"),
        ], [
            (len(stage_ids), "مرحلة"),
            (len(group_ids), "مجموعة"),
            (GroupTeam.query.filter(GroupTeam.group_id.in_(group_ids)).count()
             if group_ids else 0, "فريق داخل مجموعة"),
            (CompetitionTeam.query.filter_by(competition_id=oid).count(), "فريق مسجّل"),
        ])

    if kind == "team":
        o = db.session.get(Team, oid)
        if o is None:
            return None
        return (o, "الفريق", o.club.name_ar or o.club.name_en, [
            (Match.query.filter(sa.or_(Match.home_team_id == oid,
                                       Match.away_team_id == oid)).count(), "مباراة"),
        ], [
            (TeamCoach.query.filter_by(team_id=oid).count(), "مدرب"),
            (PlayerTeam.query.filter_by(team_id=oid).count(), "لاعب في القائمة"),
            (CompetitionTeam.query.filter_by(team_id=oid).count(), "تسجيل في بطولة"),
            (GroupTeam.query.filter_by(team_id=oid).count(), "عضوية مجموعة"),
        ])

    return None


DELETE_KINDS = ("season", "age-group", "club", "competition", "team")


@manage_bp.get("/api/admin/delete-preview/<kind>/<int:oid>")
@auth.role_required("editor")
def delete_preview(kind: str, oid: int):
    """What the panel shows before asking the admin to confirm a delete."""
    if kind not in DELETE_KINDS:
        return jsonify({"error": "نوع غير معروف"}), 404
    plan = _delete_plan(kind, oid)
    if plan is None:
        return jsonify({"error": "غير موجود"}), 404
    _, label, name, blockers, cascades = plan
    return jsonify({
        "label": label,
        "name": name,
        "blockers": [{"count": n, "noun": w} for n, w in blockers if n],
        "cascades": [{"count": n, "noun": w} for n, w in cascades if n],
    })


def _password_ok():
    """Make the signed-in admin re-type their password before a delete.

    Returns None when cleared, or the error response to send back. Callers
    using the master key are exempt: that path is for scripts, which have no
    password to re-enter.
    """
    if auth.has_master_key():
        return None
    user = auth.current_admin()
    j = request.get_json(silent=True) or {}
    if not user or not user.check_password(j.get("password") or ""):
        return jsonify({"error": "كلمة المرور غير صحيحة"}), 403
    return None


def _delete_guarded(obj, label: str, blockers: list[tuple[int, str]]):
    """Delete `obj` unless something still points at it.

    `blockers` is (count, Arabic noun) pairs; any non-zero one refuses the
    delete and says so. The database enforces the same rule with RESTRICT, so
    the IntegrityError catch is the net for a dependant not listed here — it
    keeps a missed reference a 409 instead of a 500.
    """
    stuck = [(n, noun) for n, noun in blockers if n]
    if stuck:
        parts = "، ".join(f"{n} {noun}" for n, noun in stuck)
        return jsonify({"error": f"لا يمكن حذف {label}: مرتبط بـ {parts}"}), 409
    try:
        db.session.delete(obj)
        db.session.commit()
    except sa.exc.IntegrityError:
        db.session.rollback()
        return jsonify({"error": f"لا يمكن حذف {label}: مرتبط ببيانات أخرى"}), 409
    return None


def _apply_order(model, field, pid, ids) -> None:
    """Persist a new manual order: sort_order = the id's index in `ids`."""
    pos = {}
    for idx, raw in enumerate(ids or []):
        try:
            pos[int(raw)] = idx
        except (TypeError, ValueError):
            continue
    for r in model.query.filter(getattr(model, field) == pid).all():
        if r.id in pos:
            r.sort_order = pos[r.id]
    db.session.commit()


# ── seasons ──────────────────────────────────────────────────────────────────

def _season_dto(s: Season):
    return {"id": s.id, "name_ar": s.name_ar, "name_en": s.name_en,
            "start_date": s.start_date.isoformat(), "end_date": s.end_date.isoformat(),
            "is_active": s.is_active}


@manage_bp.get("/api/admin/seasons")
@auth.role_required("editor")
def list_seasons():
    return jsonify({"seasons": [_season_dto(s) for s in Season.query.order_by(Season.start_date.desc())]})


@manage_bp.post("/api/admin/seasons")
@auth.role_required("editor")
def create_season():
    j = request.get_json(silent=True) or {}
    sd, ed = _pd(j.get("start_date")), _pd(j.get("end_date"))
    if not sd or not ed:
        return jsonify({"error": "تاريخ البداية والنهاية مطلوبان"}), 400
    if ed < sd:
        return jsonify({"error": "تاريخ النهاية قبل البداية"}), 400
    s = Season(name_ar=_str(j.get("name_ar")), name_en=_str(j.get("name_en")),
               start_date=sd, end_date=ed, is_active=bool(j.get("is_active")))
    if s.is_active:
        Season.query.update({Season.is_active: False})
    db.session.add(s)
    db.session.commit()
    return jsonify({"season": _season_dto(s)}), 201


@manage_bp.patch("/api/admin/seasons/<int:sid>")
@auth.role_required("editor")
def update_season(sid: int):
    s = db.session.get(Season, sid)
    if s is None:
        return jsonify({"error": "الموسم غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    if "name_ar" in j: s.name_ar = _str(j["name_ar"])
    if "name_en" in j: s.name_en = _str(j["name_en"])
    if j.get("start_date"): s.start_date = _pd(j["start_date"]) or s.start_date
    if j.get("end_date"): s.end_date = _pd(j["end_date"]) or s.end_date
    if "is_active" in j:
        if bool(j["is_active"]):
            Season.query.update({Season.is_active: False})
            s.is_active = True
        else:
            s.is_active = False
    db.session.commit()
    return jsonify({"season": _season_dto(s)})


@manage_bp.delete("/api/admin/seasons/<int:sid>")
@auth.role_required("editor")
def delete_season(sid: int):
    s = db.session.get(Season, sid)
    if s is None:
        return jsonify({"error": "الموسم غير موجود"}), 404
    if (bad := _password_ok()) is not None:
        return bad
    refusal = _delete_guarded(s, "الموسم", [
        (Competition.query.filter_by(season_id=sid).count(), "بطولة"),
    ])
    return refusal or jsonify({"deleted": sid})


# ── age groups ───────────────────────────────────────────────────────────────

def _age_dto(a: AgeGroup):
    return {"id": a.id, "name_ar": a.name_ar, "name_en": a.name_en, "oldest_birth_year": a.oldest_birth_year}


@manage_bp.get("/api/admin/age-groups")
@auth.role_required("editor")
def list_age_groups():
    return jsonify({"age_groups": [_age_dto(a) for a in AgeGroup.query.order_by(AgeGroup.oldest_birth_year.desc())]})


@manage_bp.post("/api/admin/age-groups")
@auth.role_required("editor")
def create_age_group():
    j = request.get_json(silent=True) or {}
    try:
        year = int(j.get("oldest_birth_year"))
    except (TypeError, ValueError):
        return jsonify({"error": "سنة الميلاد مطلوبة"}), 400
    a = AgeGroup(name_ar=_str(j.get("name_ar")), name_en=_str(j.get("name_en")), oldest_birth_year=year)
    db.session.add(a)
    db.session.commit()
    return jsonify({"age_group": _age_dto(a)}), 201


@manage_bp.patch("/api/admin/age-groups/<int:aid>")
@auth.role_required("editor")
def update_age_group(aid: int):
    a = db.session.get(AgeGroup, aid)
    if a is None:
        return jsonify({"error": "غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    if "name_ar" in j: a.name_ar = _str(j["name_ar"])
    if "name_en" in j: a.name_en = _str(j["name_en"])
    if j.get("oldest_birth_year"):
        try: a.oldest_birth_year = int(j["oldest_birth_year"])
        except (TypeError, ValueError): pass
    db.session.commit()
    return jsonify({"age_group": _age_dto(a)})


@manage_bp.delete("/api/admin/age-groups/<int:aid>")
@auth.role_required("editor")
def delete_age_group(aid: int):
    a = db.session.get(AgeGroup, aid)
    if a is None:
        return jsonify({"error": "المرحلة السنية غير موجودة"}), 404
    if (bad := _password_ok()) is not None:
        return bad
    refusal = _delete_guarded(a, "المرحلة السنية", [
        (Competition.query.filter_by(age_group_id=aid).count(), "بطولة"),
        (Team.query.filter_by(age_group_id=aid).count(), "فريق"),
    ])
    return refusal or jsonify({"deleted": aid})


# ── clubs ────────────────────────────────────────────────────────────────────

CLUB_FIELDS = ("name_ar", "name_en", "city_ar", "city_en", "logo_url",
               "website_url", "facebook_url", "instagram_url", "twitter_url", "youtube_url")


def _club_dto(c: Club):
    d = {"id": c.id, "established": c.established.isoformat() if c.established else None}
    for f in CLUB_FIELDS:
        d[f] = getattr(c, f)
    return d


@manage_bp.get("/api/admin/clubs")
@auth.role_required("editor")
def list_clubs():
    q = (request.args.get("q") or "").strip()
    query = Club.query
    if q:
        like = f"%{q}%"
        query = query.filter(db.or_(Club.name_ar.ilike(like), Club.name_en.ilike(like)))
    clubs = query.order_by(Club.id).limit(300).all()
    return jsonify({"clubs": [_club_dto(c) for c in clubs]})


@manage_bp.get("/api/admin/clubs/<int:cid>")
@auth.role_required("editor")
def get_club(cid: int):
    c = db.session.get(Club, cid)
    if c is None:
        return jsonify({"error": "النادي غير موجود"}), 404
    return jsonify({"club": _club_dto(c)})


@manage_bp.post("/api/admin/clubs")
@auth.role_required("editor")
def create_club():
    j = request.get_json(silent=True) or {}
    if not (_str(j.get("name_ar")) or _str(j.get("name_en"))):
        return jsonify({"error": "اسم النادي مطلوب"}), 400
    c = Club(established=_pd(j.get("established")))
    for f in CLUB_FIELDS:
        setattr(c, f, _str(j.get(f)))
    db.session.add(c)
    db.session.commit()
    return jsonify({"club": _club_dto(c)}), 201


@manage_bp.patch("/api/admin/clubs/<int:cid>")
@auth.role_required("editor")
def update_club(cid: int):
    c = db.session.get(Club, cid)
    if c is None:
        return jsonify({"error": "النادي غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    for f in CLUB_FIELDS:
        if f in j: setattr(c, f, _str(j.get(f)))
    if "established" in j: c.established = _pd(j.get("established"))
    db.session.commit()
    return jsonify({"club": _club_dto(c)})


@manage_bp.delete("/api/admin/clubs/<int:cid>")
@auth.role_required("editor")
def delete_club(cid: int):
    c = db.session.get(Club, cid)
    if c is None:
        return jsonify({"error": "النادي غير موجود"}), 404
    if (bad := _password_ok()) is not None:
        return bad
    # ClubStaff cascades: a post at a club that no longer exists is not a record
    # worth keeping, and the caller is told the count before confirming.
    refusal = _delete_guarded(c, "النادي", [
        (Team.query.filter_by(club_id=cid).count(), "فريق"),
    ])
    return refusal or jsonify({"deleted": cid})


# ── competitions ─────────────────────────────────────────────────────────────

def _comp_dto(c: Competition):
    ag = db.session.get(AgeGroup, c.age_group_id) if c.age_group_id else None
    return {
        "id": c.id, "code": c.code, "season_id": c.season_id,
        "season": c.season.name_en or c.season.name_ar or "",
        "age_group_id": c.age_group_id, "age": (ag.name_en or ag.name_ar) if ag else None,
        "name_ar": c.name_ar, "name_en": c.name_en,
        "sector_ar": c.sector_ar, "sector_en": c.sector_en,
    }


@manage_bp.get("/api/admin/competitions-manage")
@auth.role_required("editor")
def list_competitions_manage():
    comps = Competition.query.order_by(Competition.code, Competition.id).all()
    return jsonify({"competitions": [_comp_dto(c) for c in comps]})


def _default_comp_code(season_id: int, name_ar: str, name_en: str) -> str:
    """A code for a competition created without one.

    `code` is what folds a competition's age/sector instances into one heading
    in the UI (see serializers._season). Left blank, each row would stand alone
    and the ages would not group. Reuse the code of a same-named competition
    already in this season so the new age slots under the same heading; failing
    that, mint the next free cNNN.
    """
    twin = next(
        (c for c in Competition.query.filter_by(season_id=season_id).all()
         if c.code and ((name_ar and c.name_ar == name_ar)
                        or (name_en and c.name_en == name_en))),
        None,
    )
    if twin:
        return twin.code
    mx = 0
    for (existing,) in db.session.query(Competition.code).distinct():
        m = re.fullmatch(r"c(\d+)", existing or "")
        if m:
            mx = max(mx, int(m.group(1)))
    return f"c{mx + 1:03d}"


@manage_bp.post("/api/admin/competitions-manage")
@auth.role_required("editor")
def create_competition():
    j = request.get_json(silent=True) or {}
    season = db.session.get(Season, j.get("season_id"))
    if season is None:
        return jsonify({"error": "اختر الموسم"}), 400
    name_ar, name_en = _str(j.get("name_ar")), _str(j.get("name_en"))
    if not (name_ar or name_en):
        return jsonify({"error": "اسم البطولة مطلوب"}), 400
    code = _str(j.get("code")) or _default_comp_code(season.id, name_ar, name_en)
    age_id = j.get("age_group_id") or None
    c = Competition(
        season_id=season.id, code=code,
        age_group_id=age_id if age_id else None,
        name_ar=name_ar, name_en=name_en,
        sector_ar=_str(j.get("sector_ar")), sector_en=_str(j.get("sector_en")),
        sector_key=_norm(j.get("sector_ar") or j.get("sector_en") or ""),
    )
    db.session.add(c)
    db.session.commit()
    return jsonify({"competition": _comp_dto(c)}), 201


@manage_bp.patch("/api/admin/competitions-manage/<int:cid>")
@auth.role_required("editor")
def update_competition(cid: int):
    c = db.session.get(Competition, cid)
    if c is None:
        return jsonify({"error": "البطولة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    for f in ("code", "name_ar", "name_en", "sector_ar", "sector_en"):
        if f in j: setattr(c, f, _str(j.get(f)))
    if "sector_ar" in j or "sector_en" in j:
        c.sector_key = _norm(c.sector_ar or c.sector_en or "")
    if j.get("season_id"): c.season_id = j["season_id"]
    if "age_group_id" in j:
        new_age = j.get("age_group_id") or None
        # The age gates which teams may enrol; changing it after teams are in
        # would leave enrolled teams inconsistent with the competition's age.
        if new_age != c.age_group_id and CompetitionTeam.query.filter_by(
            competition_id=cid
        ).first():
            return jsonify(
                {"error": "لا يمكن تغيير المرحلة السنية بعد تسجيل فرق في البطولة"}
            ), 409
        c.age_group_id = new_age
    db.session.commit()
    return jsonify({"competition": _comp_dto(c)})


@manage_bp.delete("/api/admin/competitions-manage/<int:cid>")
@auth.role_required("editor")
def delete_competition(cid: int):
    c = db.session.get(Competition, cid)
    if c is None:
        return jsonify({"error": "البطولة غير موجودة"}), 404
    if (bad := _password_ok()) is not None:
        return bad
    # Stages and entries cascade; live matches are what must not be lost, and
    # they hold the stage back with RESTRICT anyway.
    base = Match.query.join(Stage).filter(Stage.competition_id == cid)
    live = base.filter(Match.deleted_at.is_(None)).count()
    if live:
        return jsonify({"error": f"لا يمكن حذف البطولة: مرتبط بـ {live} مباراة"}), 409
    # Purge already soft-deleted matches (never auto-purged) so their RESTRICT FK
    # to the stage doesn't wedge the delete; their child events cascade.
    for dm in base.filter(Match.deleted_at.isnot(None)).all():
        db.session.delete(dm)
    refusal = _delete_guarded(c, "البطولة", [])
    return refusal or jsonify({"deleted": cid})


# ── stages and groups ────────────────────────────────────────────────────────
# A competition is a sequence of stages; a stage may split its teams into
# groups, each with its own table. `carries_points` decides whether a stage's
# table continues from the earlier ones or restarts from zero — the server is
# the only place that knows this, which is why it also serves the standings.

def _group_dto(g: Group):
    return {
        "id": g.id, "stage_id": g.stage_id,
        "name_ar": g.name_ar, "name_en": g.name_en,
        "team_count": GroupTeam.query.filter_by(group_id=g.id).count(),
    }


def _stage_dto(s: Stage):
    return {
        "id": s.id, "competition_id": s.competition_id,
        "name_ar": s.name_ar, "name_en": s.name_en,
        "stage_order": s.stage_order, "type": s.type,
        "carries_points": s.carries_points,
        "match_count": Match.query.filter_by(stage_id=s.id).count(),
        "groups": [_group_dto(g) for g in
                   Group.query.filter_by(stage_id=s.id).order_by(Group.id).all()],
    }


@manage_bp.get("/api/admin/competitions-manage/<int:cid>")
@auth.role_required("editor")
def get_competition(cid: int):
    c = db.session.get(Competition, cid)
    if c is None:
        return jsonify({"error": "البطولة غير موجودة"}), 404
    return jsonify({"competition": _comp_dto(c)})


@manage_bp.get("/api/admin/competitions-manage/<int:cid>/stages")
@auth.role_required("editor")
def list_stages(cid: int):
    if db.session.get(Competition, cid) is None:
        return jsonify({"error": "البطولة غير موجودة"}), 404
    stages = Stage.query.filter_by(competition_id=cid).order_by(Stage.stage_order).all()
    return jsonify({"stages": [_stage_dto(s) for s in stages]})


@manage_bp.post("/api/admin/competitions-manage/<int:cid>/stages")
@auth.role_required("editor")
def create_stage(cid: int):
    if db.session.get(Competition, cid) is None:
        return jsonify({"error": "البطولة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    stype = j.get("type")
    if stype not in codes.STAGE_TYPE:
        return jsonify({"error": "نوع المرحلة غير صحيح"}), 400
    order = _int_or_none(j.get("stage_order"))
    if order is None:
        top = db.session.query(db.func.max(Stage.stage_order)).filter_by(competition_id=cid).scalar()
        order = (top or 0) + 1
    if Stage.query.filter_by(competition_id=cid, stage_order=order).first():
        return jsonify({"error": f"يوجد مرحلة بالترتيب {order} بالفعل"}), 409
    s = Stage(competition_id=cid, name_ar=_str(j.get("name_ar")),
              name_en=_str(j.get("name_en")), stage_order=order, type=stype,
              carries_points=bool(j.get("carries_points", True)))
    db.session.add(s)
    db.session.commit()
    return jsonify({"stage": _stage_dto(s)}), 201


@manage_bp.patch("/api/admin/stages/<int:sid>")
@auth.role_required("editor")
def update_stage(sid: int):
    s = db.session.get(Stage, sid)
    if s is None:
        return jsonify({"error": "المرحلة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    if "name_ar" in j: s.name_ar = _str(j["name_ar"])
    if "name_en" in j: s.name_en = _str(j["name_en"])
    if j.get("type") in codes.STAGE_TYPE: s.type = j["type"]
    if "carries_points" in j: s.carries_points = bool(j["carries_points"])
    if j.get("stage_order") is not None:
        order = _int_or_none(j["stage_order"])
        if order is not None and order != s.stage_order:
            clash = Stage.query.filter_by(competition_id=s.competition_id, stage_order=order).first()
            if clash:
                return jsonify({"error": f"يوجد مرحلة بالترتيب {order} بالفعل"}), 409
            s.stage_order = order
    db.session.commit()
    return jsonify({"stage": _stage_dto(s)})


@manage_bp.delete("/api/admin/stages/<int:sid>")
@auth.role_required("editor")
def delete_stage(sid: int):
    s = db.session.get(Stage, sid)
    if s is None:
        return jsonify({"error": "المرحلة غير موجودة"}), 404
    n = Match.query.filter_by(stage_id=sid).count()
    if n:
        return jsonify({"error": f"لا يمكن الحذف: بالمرحلة {n} مباراة"}), 409
    if Group.query.filter_by(stage_id=sid).count():
        return jsonify({"error": "لا يمكن الحذف: احذف المجموعات أولًا"}), 409
    db.session.delete(s)
    db.session.commit()
    return jsonify({"deleted": sid})


@manage_bp.post("/api/admin/stages/<int:sid>/groups")
@auth.role_required("editor")
def create_group(sid: int):
    s = db.session.get(Stage, sid)
    if s is None:
        return jsonify({"error": "المرحلة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    if not (_str(j.get("name_ar")) or _str(j.get("name_en"))):
        return jsonify({"error": "اسم المجموعة مطلوب"}), 400
    g = Group(stage_id=sid, name_ar=_str(j.get("name_ar")), name_en=_str(j.get("name_en")))
    db.session.add(g)
    db.session.commit()
    return jsonify({"group": _group_dto(g)}), 201


@manage_bp.patch("/api/admin/groups/<int:gid>")
@auth.role_required("editor")
def update_group(gid: int):
    g = db.session.get(Group, gid)
    if g is None:
        return jsonify({"error": "المجموعة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    if "name_ar" in j: g.name_ar = _str(j["name_ar"])
    if "name_en" in j: g.name_en = _str(j["name_en"])
    db.session.commit()
    return jsonify({"group": _group_dto(g)})


@manage_bp.delete("/api/admin/groups/<int:gid>")
@auth.role_required("editor")
def delete_group(gid: int):
    g = db.session.get(Group, gid)
    if g is None:
        return jsonify({"error": "المجموعة غير موجودة"}), 404
    for gt in GroupTeam.query.filter_by(group_id=gid).all():
        db.session.delete(gt)
    # The schema says SET NULL, but SQLite runs with foreign_keys off, so the
    # matches would keep pointing at a group that no longer exists.
    Match.query.filter_by(group_id=gid).update({Match.group_id: None})
    db.session.delete(g)
    db.session.commit()
    return jsonify({"deleted": gid})


@manage_bp.get("/api/admin/groups/<int:gid>/teams")
@auth.role_required("editor")
def list_group_teams(gid: int):
    g = db.session.get(Group, gid)
    if g is None:
        return jsonify({"error": "المجموعة غير موجودة"}), 404
    rows = GroupTeam.query.filter_by(group_id=gid).order_by(GroupTeam.id).all()
    cid = g.stage.competition_id
    return jsonify({"teams": [
        {"group_team_id": gt.id, **_team_dto(db.session.get(Team, gt.team_id), cid)}
        for gt in rows if db.session.get(Team, gt.team_id)
    ]})


@manage_bp.post("/api/admin/groups/<int:gid>/teams")
@auth.role_required("editor")
def add_group_team(gid: int):
    g = db.session.get(Group, gid)
    if g is None:
        return jsonify({"error": "المجموعة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    team = db.session.get(Team, j.get("team_id"))
    if team is None:
        return jsonify({"error": "اختر فريقًا"}), 400
    cid = g.stage.competition_id
    if not CompetitionTeam.query.filter_by(competition_id=cid, team_id=team.id).first():
        return jsonify({"error": "الفريق غير مسجّل في هذه البطولة"}), 400
    if GroupTeam.query.filter_by(group_id=gid, team_id=team.id).first():
        return jsonify({"error": "الفريق في المجموعة بالفعل"}), 409
    gt = GroupTeam(group_id=gid, team_id=team.id)
    db.session.add(gt)
    db.session.commit()
    return jsonify({"team": {"group_team_id": gt.id, **_team_dto(team, cid)}}), 201


@manage_bp.delete("/api/admin/group-teams/<int:gtid>")
@auth.role_required("editor")
def delete_group_team(gtid: int):
    gt = db.session.get(GroupTeam, gtid)
    if gt is None:
        return jsonify({"error": "غير موجود"}), 404
    db.session.delete(gt)
    db.session.commit()
    return jsonify({"deleted": gtid})


# ── teams (enroll a club into a competition, edit its entry) ──────────────────

def _squad_second_name(t: Team):
    """A squad's second name where no competition is in view — its most recent
    entry's. The name lives on the competition entry, not the team."""
    entry = (CompetitionTeam.query
             .join(Competition, Competition.id == CompetitionTeam.competition_id)
             .join(Season, Season.id == Competition.season_id)
             .filter(CompetitionTeam.team_id == t.id,
                     CompetitionTeam.name_ar.isnot(None)
                     | CompetitionTeam.name_en.isnot(None))
             .order_by(Season.start_date.desc(), CompetitionTeam.id.desc())
             .first())
    return (entry.name_ar, entry.name_en) if entry else (None, None)


def _team_dto(t: Team, cid: int | None = None):
    """The team as it appears inside a competition.

    Both the second name and point_deduction live on the entry, not the team, so
    they are only meaningful with a competition to read them from; without one
    the name falls back to the squad's most recent entry and the deduction to 0.
    """
    entry = (CompetitionTeam.query.filter_by(competition_id=cid, team_id=t.id).first()
             if cid else None)
    if entry is not None:
        name_ar, name_en = entry.name_ar, entry.name_en
    else:
        name_ar, name_en = _squad_second_name(t)
    return {
        "id": t.id, "club_id": t.club_id,
        "club_name": t.club.name_ar or t.club.name_en,
        "name_ar": name_ar, "name_en": name_en,
        "short_name_ar": t.short_name_ar, "short_name_en": t.short_name_en,
        "point_deduction": entry.point_deduction if entry else 0,
        "logo": t.club.logo_url,
    }


@manage_bp.get("/api/admin/competitions/<int:cid>/teams-manage")
@auth.role_required("editor")
def list_competition_teams(cid: int):
    teams = (Team.query.join(CompetitionTeam)
             .filter(CompetitionTeam.competition_id == cid)
             .order_by(CompetitionTeam.id).all())
    return jsonify({"teams": [_team_dto(t, cid) for t in teams]})


@manage_bp.post("/api/admin/competitions/<int:cid>/teams-manage")
@auth.role_required("editor")
def enroll_team(cid: int):
    comp = db.session.get(Competition, cid)
    if comp is None:
        return jsonify({"error": "البطولة غير موجودة"}), 404
    j = request.get_json(silent=True) or {}
    club = db.session.get(Club, j.get("club_id"))
    if club is None:
        return jsonify({"error": "اختر ناديًا"}), 400

    age_id = comp.age_group_id or j.get("age_group_id")
    if not age_id:
        return jsonify({"error": "هذه البطولة مفتوحة لعدة مراحل — حدّد المرحلة السنية"}), 400

    # Already enrolled? Scope by age too: a multi-age competition may legitimately
    # take the same club's teams in different age groups, so a club-only check
    # would wrongly reject the second age.
    existing = (Team.query.join(CompetitionTeam)
                .filter(CompetitionTeam.competition_id == comp.id,
                        Team.club_id == club.id,
                        Team.age_group_id == age_id).first())
    if existing:
        return jsonify({"error": "النادي مسجّل بالفعل في هذه البطولة"}), 409

    # A team is a club's squad for one age group in one season — not a row per
    # competition. The same U17 side plays the league and the cup, so enrolling
    # reuses the club's existing team; creating a second one would split its
    # roster and staff in two. This matches create_club_team, which refuses to
    # make a duplicate for the same club/age/season.
    # Ordered by id so the pick is deterministic: where a club somehow has two
    # rows for the same age and season, the established one wins over a later
    # empty duplicate.
    t = (Team.query.filter_by(club_id=club.id, age_group_id=age_id)
         .order_by(Team.id).first())
    if t is None:
        t = Team(club_id=club.id, age_group_id=age_id,
                 source_ref=f"club-team|{club.id}|{age_id}")
        db.session.add(t)
        db.session.flush()
    # The second name and the deduction both belong to this competition entry.
    db.session.add(CompetitionTeam(
        competition_id=comp.id, team_id=t.id,
        point_deduction=max(0, min(100, int(j.get("point_deduction") or 0))),
        name_ar=_str(j.get("name_ar")), name_en=_str(j.get("name_en")),
    ))
    db.session.commit()
    return jsonify({"team": _team_dto(t, comp.id)}), 201


@manage_bp.delete("/api/admin/competitions/<int:cid>/teams-manage/<int:tid>")
@auth.role_required("editor")
def unenroll_team(cid: int, tid: int):
    """Undo one enrolment — the fix for a club added to the wrong competition.

    Removes only this competition's entry (and the team's group memberships
    within it), leaving the squad's other competitions, roster and staff alone.
    A team the enrolment created — no other entry, no matches, no roster or
    staff — is deleted with it, so a mistaken add leaves nothing behind. Refuses
    if the team has already played here, where quietly dropping it would strand
    its matches.
    """
    entry = CompetitionTeam.query.filter_by(competition_id=cid, team_id=tid).first()
    if entry is None:
        return jsonify({"error": "الفريق غير مسجّل في هذه البطولة"}), 404

    stage_ids = [s.id for s in Stage.query.filter_by(competition_id=cid).all()]
    if stage_ids:
        played = Match.query.filter(
            Match.stage_id.in_(stage_ids),
            sa.or_(Match.home_team_id == tid, Match.away_team_id == tid),
            Match.deleted_at.is_(None),
        ).count()
        if played:
            return jsonify({"error": f"لا يمكن الإزالة: للفريق {played} مباراة في هذه البطولة"}), 409
        group_ids = [g.id for g in Group.query.filter(Group.stage_id.in_(stage_ids)).all()]
        if group_ids:
            GroupTeam.query.filter(
                GroupTeam.team_id == tid, GroupTeam.group_id.in_(group_ids)
            ).delete(synchronize_session=False)

    db.session.delete(entry)
    db.session.flush()

    if CompetitionTeam.query.filter_by(team_id=tid).count() == 0:
        stranded = (
            Match.query.filter(sa.or_(Match.home_team_id == tid,
                                      Match.away_team_id == tid)).count()
            or PlayerTeam.query.filter_by(team_id=tid).count()
            or TeamCoach.query.filter_by(team_id=tid).count()
        )
        if not stranded:
            t = db.session.get(Team, tid)
            if t is not None:
                db.session.delete(t)

    db.session.commit()
    return jsonify({"ok": True})


@manage_bp.patch("/api/admin/teams/<int:tid>")
@auth.role_required("editor")
def update_team(tid: int):
    t = db.session.get(Team, tid)
    if t is None:
        return jsonify({"error": "الفريق غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    # short_name is a property of the squad; keep it on the team.
    for f in ("short_name_ar", "short_name_en"):
        if f in j: setattr(t, f, _str(j.get(f)))

    # The second name and the deduction both belong to one competition entry, not
    # to the squad, so editing either needs the competition it applies to.
    cid = _int_or_none(j.get("competition_id"))
    entry_fields = [f for f in ("name_ar", "name_en", "point_deduction") if f in j]
    if entry_fields:
        if cid is None:
            return jsonify({"error": "حدّد البطولة لتعديل اسم الفريق أو خصم النقاط"}), 400
        entry = CompetitionTeam.query.filter_by(competition_id=cid, team_id=tid).first()
        if entry is None:
            return jsonify({"error": "الفريق غير مسجّل في هذه البطولة"}), 404
        if "name_ar" in j: entry.name_ar = _str(j.get("name_ar"))
        if "name_en" in j: entry.name_en = _str(j.get("name_en"))
        if "point_deduction" in j:
            try:
                entry.point_deduction = max(0, min(100, int(j["point_deduction"])))
            except (TypeError, ValueError):
                pass
    db.session.commit()
    return jsonify({"team": _team_dto(t, cid)})


@manage_bp.delete("/api/admin/teams/<int:tid>")
@auth.role_required("editor")
def delete_team(tid: int):
    t = db.session.get(Team, tid)
    if t is None:
        return jsonify({"error": "الفريق غير موجود"}), 404
    if (bad := _password_ok()) is not None:
        return bad
    # Coaches and roster cascade through the ORM. A live match is the one thing
    # that outlives the team, so it blocks.
    team_matches = Match.query.filter(
        sa.or_(Match.home_team_id == tid, Match.away_team_id == tid)
    )
    live = team_matches.filter(Match.deleted_at.is_(None)).count()
    if live:
        return jsonify({"error": f"لا يمكن حذف الفريق: مرتبط بـ {live} مباراة"}), 409
    # Purge already soft-deleted matches (never auto-purged) so their RESTRICT FK
    # to the team doesn't wedge the delete; their child events cascade.
    for dm in team_matches.filter(Match.deleted_at.isnot(None)).all():
        db.session.delete(dm)
    # Team has no relationship to these two join tables, so nothing would clear
    # them — and with SQLite's foreign_keys off the schema's CASCADE will not
    # either. Removing them here keeps the delete from leaving orphans.
    CompetitionTeam.query.filter_by(team_id=tid).delete()
    GroupTeam.query.filter_by(team_id=tid).delete()
    refusal = _delete_guarded(t, "الفريق", [])
    return refusal or jsonify({"deleted": tid})


# ── club youth-sector staff (managers) ───────────────────────────────────────
# ClubStaff attaches a Coach to a club with an administrative/technical role in
# its youth sector. Unlike clubs/competitions, a staff row is not structural —
# removing a manager is a routine correction — so DELETE is exposed here.

def _staff_dto(s: ClubStaff):
    return {
        "id": s.id, "coach_id": s.coach_id,
        "name_ar": s.coach.full_name_ar, "name_en": s.coach.full_name_en,
        "photo": s.coach.profile_pic_url,
        "role_ar": s.role_ar, "role_en": s.role_en,
        "start_date": s.start_date.isoformat() if s.start_date else None,
        "end_date": s.end_date.isoformat() if s.end_date else None,
    }


@manage_bp.get("/api/admin/clubs/<int:cid>/staff")
@auth.role_required("editor")
def list_club_staff(cid: int):
    if db.session.get(Club, cid) is None:
        return jsonify({"error": "النادي غير موجود"}), 404
    # Current roles (no end_date) first, then most recently started.
    rows = (ClubStaff.query.filter_by(club_id=cid)
            .order_by(ClubStaff.sort_order, _staff_role_rank(),
                      ClubStaff.end_date.isnot(None), ClubStaff.id)
            .all())
    return jsonify({"staff": [_staff_dto(s) for s in rows]})


@manage_bp.post("/api/admin/clubs/<int:cid>/staff")
@auth.role_required("editor")
def add_club_staff(cid: int):
    if db.session.get(Club, cid) is None:
        return jsonify({"error": "النادي غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    name_ar, name_en = _str(j.get("name_ar")), _str(j.get("name_en"))
    if not (name_ar or name_en):
        return jsonify({"error": "اسم المسؤول مطلوب"}), 400
    coach = Coach(full_name_ar=name_ar, full_name_en=name_en,
                  profile_pic_url=_str(j.get("photo")))
    db.session.add(coach)
    db.session.flush()
    s = ClubStaff(club_id=cid, coach_id=coach.id,
                  role_ar=_str(j.get("role_ar")), role_en=_str(j.get("role_en")),
                  start_date=_pd(j.get("start_date")), end_date=_pd(j.get("end_date")),
                  sort_order=_next_order(ClubStaff, "club_id", cid))
    db.session.add(s)
    db.session.commit()
    return jsonify({"staff": _staff_dto(s)}), 201


@manage_bp.post("/api/admin/clubs/<int:cid>/staff/reorder")
@auth.role_required("editor")
def reorder_club_staff(cid: int):
    j = request.get_json(silent=True) or {}
    _apply_order(ClubStaff, "club_id", cid, j.get("ids"))
    return jsonify({"ok": True})


@manage_bp.patch("/api/admin/club-staff/<int:sid>")
@auth.role_required("editor")
def update_club_staff(sid: int):
    s = db.session.get(ClubStaff, sid)
    if s is None:
        return jsonify({"error": "غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    if "name_ar" in j: s.coach.full_name_ar = _str(j["name_ar"])
    if "name_en" in j: s.coach.full_name_en = _str(j["name_en"])
    if "photo" in j: s.coach.profile_pic_url = _str(j["photo"])
    if "role_ar" in j: s.role_ar = _str(j["role_ar"])
    if "role_en" in j: s.role_en = _str(j["role_en"])
    if "start_date" in j: s.start_date = _pd(j["start_date"])
    if "end_date" in j: s.end_date = _pd(j["end_date"])
    db.session.commit()
    return jsonify({"staff": _staff_dto(s)})


@manage_bp.delete("/api/admin/club-staff/<int:sid>")
@auth.role_required("editor")
def delete_club_staff(sid: int):
    s = db.session.get(ClubStaff, sid)
    if s is None:
        return jsonify({"error": "غير موجود"}), 404
    db.session.delete(s)
    db.session.commit()
    return jsonify({"deleted": sid})


# ── a club's teams (one per age group) ───────────────────────────────────────

def _team_full_dto(t: Team):
    ag = t.age_group
    # A team is not tied to a season; the seasons it played are the ones its
    # competitions belong to, newest first.
    seasons = (Season.query.join(Competition, Competition.season_id == Season.id)
               .join(CompetitionTeam, CompetitionTeam.competition_id == Competition.id)
               .filter(CompetitionTeam.team_id == t.id)
               .order_by(Season.start_date.desc()).distinct().all())
    name_ar, name_en = _squad_second_name(t)
    return {
        "id": t.id, "club_id": t.club_id,
        "club_name": t.club.name_ar or t.club.name_en,
        "name_ar": name_ar, "name_en": name_en, "logo": t.club.logo_url,
        "age_group_id": t.age_group_id, "age": (ag.name_ar or ag.name_en) if ag else None,
        "seasons": [s.name_ar or s.name_en for s in seasons],
    }


@manage_bp.get("/api/admin/clubs/<int:cid>/teams")
@auth.role_required("editor")
def list_club_teams(cid: int):
    if db.session.get(Club, cid) is None:
        return jsonify({"error": "النادي غير موجود"}), 404
    # Oldest age group first. Not age_group_id: the later-added groups (2008,
    # 2010...) carry higher ids than the original ones, so ordering by id
    # interleaves them wrongly. oldest_birth_year is the real age order —
    # a smaller year means older players.
    teams = (Team.query.filter_by(club_id=cid).join(AgeGroup)
             .order_by(AgeGroup.oldest_birth_year).all())
    return jsonify({"teams": [_team_full_dto(t) for t in teams]})


@manage_bp.post("/api/admin/clubs/<int:cid>/teams")
@auth.role_required("editor")
def create_club_team(cid: int):
    if db.session.get(Club, cid) is None:
        return jsonify({"error": "النادي غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    age = db.session.get(AgeGroup, j.get("age_group_id"))
    if age is None:
        return jsonify({"error": "اختر المرحلة السنية"}), 400
    # One squad per age group, for good: the team carries across seasons.
    existing = Team.query.filter_by(club_id=cid, age_group_id=age.id).first()
    if existing:
        return jsonify({"error": "يوجد فريق بالفعل لهذه المرحلة السنية"}), 409
    # The second name is no longer a property of the squad — it belongs to each
    # competition entry — so team creation here does not take one.
    t = Team(club_id=cid, age_group_id=age.id,
             source_ref=f"club-team|{cid}|{age.id}")
    db.session.add(t)
    db.session.commit()
    return jsonify({"team": _team_full_dto(t)}), 201


@manage_bp.get("/api/admin/teams/<int:tid>")
@auth.role_required("editor")
def get_team(tid: int):
    t = db.session.get(Team, tid)
    if t is None:
        return jsonify({"error": "الفريق غير موجود"}), 404
    return jsonify({"team": _team_full_dto(t)})


# ── team coaches (technical staff for one squad) ─────────────────────────────

def _coach_dto(tc: TeamCoach):
    return {
        "id": tc.id, "coach_id": tc.coach_id,
        "name_ar": tc.coach.full_name_ar, "name_en": tc.coach.full_name_en,
        "photo": tc.coach.profile_pic_url,
        "role_ar": tc.role_ar, "role_en": tc.role_en,
        "start_date": tc.start_date.isoformat() if tc.start_date else None,
        "end_date": tc.end_date.isoformat() if tc.end_date else None,
    }


@manage_bp.get("/api/admin/teams/<int:tid>/coaches")
@auth.role_required("editor")
def list_team_coaches(tid: int):
    if db.session.get(Team, tid) is None:
        return jsonify({"error": "الفريق غير موجود"}), 404
    rows = (TeamCoach.query.filter_by(team_id=tid)
            .order_by(TeamCoach.sort_order, _coach_role_rank(),
                      TeamCoach.end_date.isnot(None), TeamCoach.id)
            .all())
    return jsonify({"coaches": [_coach_dto(tc) for tc in rows]})


@manage_bp.post("/api/admin/teams/<int:tid>/coaches")
@auth.role_required("editor")
def add_team_coach(tid: int):
    t = db.session.get(Team, tid)
    if t is None:
        return jsonify({"error": "الفريق غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    name_ar, name_en = _str(j.get("name_ar")), _str(j.get("name_en"))
    if not (name_ar or name_en):
        return jsonify({"error": "اسم المدرّب مطلوب"}), 400
    coach = Coach(full_name_ar=name_ar, full_name_en=name_en, profile_pic_url=_str(j.get("photo")))
    db.session.add(coach)
    db.session.flush()
    tc = TeamCoach(team_id=tid, coach_id=coach.id,
                   role_ar=_str(j.get("role_ar")), role_en=_str(j.get("role_en")),
                   start_date=_pd(j.get("start_date")) or default_spell_start(),
                   end_date=_pd(j.get("end_date")),
                   sort_order=_next_order(TeamCoach, "team_id", tid))
    db.session.add(tc)
    db.session.commit()
    return jsonify({"coach": _coach_dto(tc)}), 201


@manage_bp.post("/api/admin/teams/<int:tid>/coaches/attach")
@auth.role_required("editor")
def attach_team_coach(tid: int):
    """Attach an EXISTING coach to this team (a new dated stint) instead of
    creating a new person — a coach who moves between clubs stays one entity."""
    t = db.session.get(Team, tid)
    if t is None:
        return jsonify({"error": "الفريق غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    coach = db.session.get(Coach, _int_or_none(j.get("coach_id")))
    if coach is None:
        return jsonify({"error": "اختر المدرّب"}), 400
    if TeamCoach.query.filter_by(team_id=tid, coach_id=coach.id, end_date=None).first():
        return jsonify({"error": "المدرّب مسجّل في هذا الفريق بالفعل"}), 409
    tc = TeamCoach(team_id=tid, coach_id=coach.id,
                   role_ar=_str(j.get("role_ar")), role_en=_str(j.get("role_en")),
                   start_date=_pd(j.get("start_date")) or default_spell_start(),
                   sort_order=_next_order(TeamCoach, "team_id", tid))
    db.session.add(tc)
    db.session.commit()
    return jsonify({"coach": _coach_dto(tc)}), 201


@manage_bp.get("/api/admin/coaches/search")
@auth.role_required("editor")
def search_coaches():
    """Directory search over the coach entities — for attaching an existing coach
    to a team."""
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify({"coaches": []})
    pattern = f"%{q}%"
    rows = (Coach.query
            .filter(db.or_(Coach.full_name_ar.ilike(pattern), Coach.full_name_en.ilike(pattern)))
            .order_by(Coach.full_name_ar).limit(20).all())
    return jsonify({"coaches": [
        {"id": c.id, "name": c.full_name_ar or c.full_name_en} for c in rows
    ]})


@manage_bp.post("/api/admin/teams/<int:tid>/coaches/reorder")
@auth.role_required("editor")
def reorder_team_coaches(tid: int):
    j = request.get_json(silent=True) or {}
    _apply_order(TeamCoach, "team_id", tid, j.get("ids"))
    return jsonify({"ok": True})


@manage_bp.patch("/api/admin/team-coaches/<int:tcid>")
@auth.role_required("editor")
def update_team_coach(tcid: int):
    tc = db.session.get(TeamCoach, tcid)
    if tc is None:
        return jsonify({"error": "غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    if "name_ar" in j: tc.coach.full_name_ar = _str(j["name_ar"])
    if "name_en" in j: tc.coach.full_name_en = _str(j["name_en"])
    if "photo" in j: tc.coach.profile_pic_url = _str(j["photo"])
    if "role_ar" in j: tc.role_ar = _str(j["role_ar"])
    if "role_en" in j: tc.role_en = _str(j["role_en"])
    if j.get("start_date"): tc.start_date = _pd(j["start_date"]) or tc.start_date
    if "end_date" in j: tc.end_date = _pd(j["end_date"])
    db.session.commit()
    return jsonify({"coach": _coach_dto(tc)})


@manage_bp.delete("/api/admin/team-coaches/<int:tcid>")
@auth.role_required("editor")
def delete_team_coach(tcid: int):
    tc = db.session.get(TeamCoach, tcid)
    if tc is None:
        return jsonify({"error": "غير موجود"}), 404
    db.session.delete(tc)
    db.session.commit()
    return jsonify({"deleted": tcid})


# ── team roster (player registrations) ───────────────────────────────────────

def _plays_up(birth_year, age_group) -> bool:
    """True when the player is younger than the team's age group — a guest
    'playing up' for an older team (same club), not a squad member or a transfer.
    Younger = born later, so birth_year greater than the group's baseline year."""
    return bool(
        age_group and birth_year
        and age_group.oldest_birth_year is not None
        and age_group.oldest_birth_year < birth_year
    )


def _reg_dto(pt: PlayerTeam):
    p = pt.player
    return {
        "id": pt.id, "player_id": pt.player_id,
        "name_ar": p.full_name_ar, "name_en": p.full_name_en, "photo": p.profile_pic_url,
        "birth_year": p.birth_year, "birth_year_verified": p.birth_year_verified,
        "position_ar": p.position_ar, "position_en": p.position_en,
        "shirt_number": pt.shirt_number, "status": pt.status,
        "start_date": pt.start_date.isoformat() if pt.start_date else None,
        "end_date": pt.end_date.isoformat() if pt.end_date else None,
        "is_guest": _plays_up(p.birth_year, pt.team.age_group if pt.team else None),
    }


def _int_or_none(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


@manage_bp.get("/api/admin/teams/<int:tid>/roster")
@auth.role_required("editor")
def list_team_roster(tid: int):
    if db.session.get(Team, tid) is None:
        return jsonify({"error": "الفريق غير موجود"}), 404
    rows = (PlayerTeam.query.filter_by(team_id=tid)
            .order_by(PlayerTeam.sort_order, PlayerTeam.end_date.isnot(None),
                      PlayerTeam.shirt_number.asc(), PlayerTeam.id.asc())
            .all())
    return jsonify({"roster": [_reg_dto(pt) for pt in rows]})


@manage_bp.post("/api/admin/teams/<int:tid>/roster")
@auth.role_required("editor")
def add_team_player(tid: int):
    t = db.session.get(Team, tid)
    if t is None:
        return jsonify({"error": "الفريق غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    name_ar, name_en = _str(j.get("name_ar")), _str(j.get("name_en"))
    if not (name_ar or name_en):
        return jsonify({"error": "اسم اللاعب مطلوب"}), 400
    # Birth year: use the given value, else fall back to the age group's floor and
    # flag it unverified so a clerk can confirm it later.
    ag = t.age_group
    by = _int_or_none(j.get("birth_year"))
    verified = by is not None
    if by is None:
        by = ag.oldest_birth_year if ag else 2010
    p = Player(full_name_ar=name_ar, full_name_en=name_en, birth_year=by,
               birth_year_verified=verified, profile_pic_url=_str(j.get("photo")),
               position_ar=_str(j.get("position_ar")), position_en=_str(j.get("position_en")))
    db.session.add(p)
    db.session.flush()
    status = j.get("status") if j.get("status") in codes.PLAYER_TEAM_STATUS else "active"
    pt = PlayerTeam(player_id=p.id, team_id=tid, shirt_number=_int_or_none(j.get("shirt_number")),
                    status=status, start_date=_pd(j.get("start_date")) or default_spell_start(),
                    end_date=_pd(j.get("end_date")),
                    sort_order=_next_order(PlayerTeam, "team_id", tid))
    db.session.add(pt)
    db.session.commit()
    return jsonify({"registration": _reg_dto(pt)}), 201


@manage_bp.post("/api/admin/teams/<int:tid>/roster/attach")
@auth.role_required("editor")
def attach_team_player(tid: int):
    """Attach an EXISTING player to this team (a new dated stint) rather than
    creating a new person — the way to register a transfer-in, or a player playing
    up in another age, without duplicating him."""
    t = db.session.get(Team, tid)
    if t is None:
        return jsonify({"error": "الفريق غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    p = db.session.get(Player, _int_or_none(j.get("player_id")))
    if p is None:
        return jsonify({"error": "اختر اللاعب"}), 400
    if PlayerTeam.query.filter_by(team_id=tid, player_id=p.id, end_date=None).first():
        return jsonify({"error": "اللاعب مسجّل في هذا الفريق بالفعل"}), 409
    status = j.get("status") if j.get("status") in codes.PLAYER_TEAM_STATUS else "active"
    pt = PlayerTeam(
        player_id=p.id, team_id=tid,
        shirt_number=_int_or_none(j.get("shirt_number")), status=status,
        start_date=_pd(j.get("start_date")) or default_spell_start(),
        sort_order=_next_order(PlayerTeam, "team_id", tid),
    )
    db.session.add(pt)
    db.session.commit()
    return jsonify({"registration": _reg_dto(pt)}), 201


@manage_bp.post("/api/admin/teams/<int:tid>/roster/reorder")
@auth.role_required("editor")
def reorder_team_roster(tid: int):
    j = request.get_json(silent=True) or {}
    _apply_order(PlayerTeam, "team_id", tid, j.get("ids"))
    return jsonify({"ok": True})


@manage_bp.patch("/api/admin/player-teams/<int:ptid>")
@auth.role_required("editor")
def update_team_player(ptid: int):
    pt = db.session.get(PlayerTeam, ptid)
    if pt is None:
        return jsonify({"error": "غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    p = pt.player
    if "name_ar" in j: p.full_name_ar = _str(j["name_ar"])
    if "name_en" in j: p.full_name_en = _str(j["name_en"])
    if "photo" in j: p.profile_pic_url = _str(j["photo"])
    if "position_ar" in j: p.position_ar = _str(j["position_ar"])
    if "position_en" in j: p.position_en = _str(j["position_en"])
    if j.get("birth_year"):
        by = _int_or_none(j["birth_year"])
        if by:
            p.birth_year = by
            p.birth_year_verified = True
    if "shirt_number" in j: pt.shirt_number = _int_or_none(j["shirt_number"])
    if j.get("status") in codes.PLAYER_TEAM_STATUS: pt.status = j["status"]
    if j.get("start_date"): pt.start_date = _pd(j["start_date"]) or pt.start_date
    if "end_date" in j: pt.end_date = _pd(j["end_date"])
    db.session.commit()
    return jsonify({"registration": _reg_dto(pt)})


@manage_bp.delete("/api/admin/player-teams/<int:ptid>")
@auth.role_required("editor")
def delete_team_player(ptid: int):
    pt = db.session.get(PlayerTeam, ptid)
    if pt is None:
        return jsonify({"error": "غير موجود"}), 404
    db.session.delete(pt)
    db.session.commit()
    return jsonify({"deleted": ptid})


@manage_bp.post("/api/admin/player-teams/<int:ptid>/transfer")
@auth.role_required("editor")
def transfer_team_player(ptid: int):
    """Move the *same* player from this registration's team to another team:
    close this stint (end_date + status="transferred") and open a new active
    stint on the destination team — preserving the player's identity, goals and
    history (unlike add-player, which would create a duplicate person)."""
    pt = db.session.get(PlayerTeam, ptid)
    if pt is None:
        return jsonify({"error": "التسجيل غير موجود"}), 404
    j = request.get_json(silent=True) or {}
    dest_id = _int_or_none(j.get("team_id"))
    dest = db.session.get(Team, dest_id) if dest_id else None
    if dest is None:
        return jsonify({"error": "اختر الفريق الجديد"}), 400
    if dest.id == pt.team_id:
        return jsonify({"error": "اللاعب مسجّل في هذا الفريق بالفعل"}), 409

    start = _pd(j.get("start_date")) or default_spell_start()
    # Close the current stint on the old team (leave an already-ended one as is).
    if pt.end_date is None:
        pt.end_date = start
        pt.status = "transferred"
    # Reuse an existing active stint on the destination instead of duplicating it
    # (the player may already be registered there); otherwise open a new one.
    new_pt = PlayerTeam.query.filter_by(
        team_id=dest.id, player_id=pt.player_id, end_date=None,
    ).first()
    if new_pt is None:
        new_pt = PlayerTeam(
            player_id=pt.player_id,
            team_id=dest.id,
            shirt_number=_int_or_none(j.get("shirt_number")),
            status="active",
            start_date=start,
            sort_order=_next_order(PlayerTeam, "team_id", dest.id),
        )
        db.session.add(new_pt)
    db.session.commit()
    return jsonify({"registration": _reg_dto(new_pt), "team_id": dest.id}), 201
