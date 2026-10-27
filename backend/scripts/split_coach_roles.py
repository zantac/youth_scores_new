"""Split the role out of imported coach names.

The JSON feed wrote a coach as "<role> ك/ <name>" (also "ك /", "كابتن /", or a
bare "/"), and the original import stored that whole string as the coach's name
while hard-coding every role to "المدير الفني". This splits them back apart:
the text before the separator becomes the role on the person's TeamCoach /
ClubStaff rows, and the text after it becomes the coach's name.

Dry run (default) prints what would change; nothing is written:

    python -m scripts.split_coach_roles

Apply the changes:

    python -m scripts.split_coach_roles --apply
"""

from __future__ import annotations

import re
import sys
from collections import Counter

from app import create_app
from app.extensions import db
from app.models import ClubStaff, Coach, TeamCoach

# "<role> <honorific>/ <name>". The honorific (كابتن / ك / دكتور / د / عم) is
# optional and must stand as its own word, so a role that merely ends in "ك"
# (مدلك) is not truncated. Everything before it is the role, after it the name.
HONORIFIC = r"(?:كابتن|ك\.?|دكتور|د\.?|عم)"
PATTERN = re.compile(rf"^(?P<role>.*?)(?:\s+{HONORIFIC})?\s*/\s*(?P<name>.+)$")

# A string that is only an honorific + name carries no role at all.
BARE_HONORIFIC = re.compile(rf"^{HONORIFIC}$")

# Honorifics that leaked onto the end of a role ("رئيس القطاع العميد").
TRAILING_TITLES = ("الحاج", "العميد", "كابتن", "دكتور", "ك", "د", "ا", "أ")


def normalize_ar(s: str) -> str:
    """Mechanical cleanup so spelling variants collapse onto one form."""
    s = (s or "").strip()
    s = re.sub(r"[:،،.]+$", "", s).strip()          # trailing punctuation
    s = re.sub(r"[ً-ْـ]", "", s)          # diacritics + tatweel
    s = s.translate(str.maketrans("أإآٱ", "اااا"))       # alef variants
    s = s.replace("ى", "ي")                              # alef maqsura
    s = re.sub(r"\s+", " ", s).strip()
    # Drop trailing standalone titles, repeatedly ("اخصائي ا" -> "اخصائي").
    changed = True
    while changed:
        changed = False
        for t in TRAILING_TITLES:
            if s.endswith(" " + t):
                s = s[: -(len(t) + 1)].strip()
                changed = True
    return s


# Variants that mean the same role, mapped onto one canonical spelling. Keys are
# already normalize_ar()'d. Roles that are genuinely different (مدرب عام,
# محلل اداء, المعد النفسي, ...) are deliberately left alone.
ROLE_CANON = {
    # المدير الفني
    "مدير فني": "المدير الفني",
    "مدير فني القطاع": "المدير الفني",
    "المدير الفني للفريق": "المدير الفني",
    # مدرب — "مدرب عام" is the same role, just worded differently
    "مدرب الفريق": "مدرب",
    "مدرب عام": "مدرب",
    # مدرب مساعد
    "مساعد مدرب": "مدرب مساعد",
    # مدرب حراس مرمي
    "مدرب حراس": "مدرب حراس مرمي",
    "مدرب الحراس": "مدرب حراس مرمي",
    "مدرب حراس المرمي": "مدرب حراس مرمي",
    # اداري
    "ادراي": "اداري",
    "الاداري": "اداري",
    "داري": "اداري",
    "تداري": "اداري",
    "اداري الفريق": "اداري",
    "اداري القطاع": "اداري",
    # "مدير اداري" is the same role as "اداري", just a wordier title
    "مدير اداري": "اداري",
    "المدير الاداري": "اداري",
    "المدير الاداري للفريق": "اداري",
    "مدير اداري القطاع": "اداري",
    "مدير اداري الفريق": "اداري",
    "مدير الاداريين": "اداري",
    # طبيب
    "طبيب الفريق": "طبيب",
    "طبيب عظام": "طبيب",
    "الطبيب": "طبيب",
    "طبيبة": "طبيب",
    "طبيب القطاع": "طبيب",
    "دكتور الفريق": "طبيب",
    "دكتور الفريف": "طبيب",
    # علاج طبيعي
    "اخصائي علاج طبيعي": "علاج طبيعي",
    "اخصائي العلاج الطبيعي": "علاج طبيعي",
    "خصائي العلاج الطبيعي": "علاج طبيعي",   # missing hamza in the source
    # مدلك
    "اخصائي تدليك": "مدلك",
    # مدرب الاحمال
    "مخطط احمال": "مدرب الاحمال",
    "مخطط الاحمال": "مدرب الاحمال",
    "مدرب احمال": "مدرب الاحمال",
    "معد بدني": "مدرب الاحمال",
    "اعداد بدني و تاهيل": "مدرب الاحمال",
    # اخصائي
    "اخصائي الفريق": "اخصائي",
    "الاخصائي الطبي": "اخصائي",
    # مسئول مهمات
    "مهمات": "مسئول مهمات",
    "عامل مهمات": "مسئول مهمات",
    "مسئول المهمات": "مسئول مهمات",
    "مسؤول المهمات": "مسئول مهمات",
    "مسؤول مهمات": "مسئول مهمات",
    "مسئول تجهيزات": "مسئول مهمات",
    # distinct roles kept, but their variants merged
    "المدرب العام": "مدرب",
    "اخصائي اصابات ملاعب": "اخصائي اصابات",
    "اصابات ملاعب": "اخصائي اصابات",
    "اخصائي اصابات و تاهيل": "اخصائي اصابات",
    "تاهيل اصابات": "اخصائي اصابات",
    "تاهيل و اصابات ملاعب": "اخصائي اصابات",
    "اخصائي الاصابات": "اخصائي اصابات",
    "اخصائي الاصابات و التاهيل": "اخصائي اصابات",
    "اخصائي اصابات الملاعب و التاهيل": "اخصائي اصابات",
    "اخصائي تاهيل": "اخصائي اصابات",
    "دكتور تاهيل": "اخصائي اصابات",
    "محلل الاداء": "محلل اداء",
    "مدير قطاع الناشئين": "رئيس قطاع الناشئين",
    "رئيس القطاع": "رئيس قطاع الناشئين",
    "مشرف عام القطاع": "رئيس قطاع الناشئين",
    "مشرف عام علي القطاع": "رئيس قطاع الناشئين",
}


def canonical_role(role: str) -> str:
    n = normalize_ar(role)
    return ROLE_CANON.get(n, n)


def split_name(raw: str) -> tuple[str | None, str] | None:
    """Return (role_or_None, cleaned_name), or None if there is no separator.

    The name is always cleaned of its prefix; the role is None when the prefix
    was just an honorific (e.g. "ك / محمد" -> no role, name "محمد").
    """
    m = PATTERN.match((raw or "").strip())
    if not m:
        return None
    role = re.sub(r"\s+", " ", m.group("role")).strip()
    name = re.sub(r"\s+", " ", m.group("name")).strip()
    if not name:
        return None
    if not role or BARE_HONORIFIC.match(role):
        return None, name
    role = canonical_role(role)
    return (role or None), name


def main(apply: bool) -> None:
    app = create_app()
    with app.app_context():
        coaches = Coach.query.all()
        roles = Counter()
        samples = []
        renamed = with_role = name_only = tc_updates = cs_updates = 0

        for c in coaches:
            parsed = split_name(c.full_name_ar or "")
            if not parsed:
                continue
            role, name = parsed
            renamed += 1
            if role:
                with_role += 1
                roles[role] += 1
            else:
                name_only += 1
            if len(samples) < 20:
                samples.append((c.full_name_ar, role, name))

            tc_rows = TeamCoach.query.filter_by(coach_id=c.id).all()
            cs_rows = ClubStaff.query.filter_by(coach_id=c.id).all()

            if apply:
                c.full_name_ar = name
                if role:
                    tc_updates += len(tc_rows)
                    cs_updates += len(cs_rows)
                    for r in tc_rows:
                        r.role_ar = role
                    for r in cs_rows:
                        r.role_ar = role
            elif role:
                tc_updates += len(tc_rows)
                cs_updates += len(cs_rows)

        print(f"coaches scanned        : {len(coaches)}")
        print(f"names to be cleaned    : {renamed}")
        print(f"  ... with a role      : {with_role}")
        print(f"  ... honorific only   : {name_only}  (name cleaned, role left as-is)")
        print(f"team_coach rows to set : {tc_updates}")
        print(f"club_staff rows to set : {cs_updates}")
        print(f"distinct roles found   : {len(roles)}")
        print("\n--- extracted roles (count) ---")
        for role, n in roles.most_common():
            print(f"  {n:>5}  {role}")
        print("\n--- samples (before -> role | name) ---")
        for before, role, name in samples:
            print(f"  {before}\n     -> {role}  |  {name}")

        if apply:
            db.session.commit()
            print("\nAPPLIED and committed.")
        else:
            db.session.rollback()
            print("\nDRY RUN - nothing written. Re-run with --apply to commit.")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
