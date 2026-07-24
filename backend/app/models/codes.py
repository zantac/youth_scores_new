"""Controlled vocabularies for the coded string columns."""

# Match.status
# Deviates from the design doc, which said scheduled/played/postponed:
# "completed" is what the existing JSON feed and both clients already use,
# and "live" is needed for in-progress score updates.
MATCH_STATUS = ("scheduled", "live", "completed", "postponed", "cancelled")
MATCH_STATUS_COMPLETED = "completed"

# Stage.type
STAGE_TYPE = ("group", "league", "knockout")
STAGE_TYPE_KNOCKOUT = "knockout"

# PlayerTeam.status
PLAYER_TEAM_STATUS = ("active", "transferred", "loaned")

# MatchCard.card_type
CARD_TYPE = ("yellow", "second_yellow", "red")

# MatchPenaltyShootout.result
PENALTY_RESULT = ("scored", "missed", "saved", "off_target")

# Player.preferred_foot
PREFERRED_FOOT = ("left", "right", "both")

# MatchPlayer.position
POSITION = ("GK", "RB", "LB", "CB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST", "CF")

# AdminUser.role
ADMIN_ROLE = ("superadmin", "editor", "clerk")

# ── tla3bny (LeagueHub subdomain) vocabularies ──────────────────────────────
# The tla3bny league-management subsystem is a self-contained set of tla3bny_*
# tables; its coded columns keep the original LeagueHub vocabulary rather than
# the youthscores one (e.g. match status "finished", not "completed").

# Tla3bnyUser.role — one account table serves every actor:
#   super_admin        — runs the whole subdomain
#   competition_admin  — assigned to one or more competitions
#   academy            — an academy's own login (academy_id set)
#   team               — a per-team coach login (team_id + academy_id set)
TLA3BNY_USER_ROLE = ("super_admin", "competition_admin", "academy", "team")
# Tla3bnyUser.status — "active" for staff logins; academies self-register and
# move pending -> approved / rejected.
TLA3BNY_USER_STATUS = ("active", "pending", "approved", "rejected")
# Tla3bnyAcademy.status — approval workflow driven by the super admin.
TLA3BNY_ACADEMY_STATUS = ("pending", "approved", "rejected")
# Tla3bnyPlayerTeam.status — a player's dated membership on a team.
TLA3BNY_MEMBERSHIP_STATUS = ("active", "transferred", "loaned")
# Tla3bnyCompetition.status
TLA3BNY_COMPETITION_STATUS = ("draft", "active", "finished")
# Tla3bnyStage.type — same shape as the youthscores STAGE_TYPE, kept separate so
# the subsystem stays self-contained.
TLA3BNY_STAGE_TYPE = ("group", "league", "knockout")
TLA3BNY_STAGE_TYPE_KNOCKOUT = "knockout"
# Tla3bnyCompetitionTeam.status — a team's registration in a competition.
TLA3BNY_ENTRY_STATUS = ("active", "withdrawn")
# Tla3bnyCompetitionPlayer.status — per-competition roster approval by that
# competition's admin.
TLA3BNY_PLAYER_STATUS = ("pending", "approved", "rejected")
# Tla3bnyMatch.status
TLA3BNY_MATCH_STATUS = ("scheduled", "live", "finished")
TLA3BNY_MATCH_STATUS_FINISHED = "finished"
# Tla3bnyMatchEvent.event_type
TLA3BNY_EVENT_TYPE = (
    "goal",
    "assist",
    "yellow",
    "red",
    "substitution_in",
    "substitution_out",
)

# TeamCoach.role_ar — the default seniority order for a team's technical staff.
# Free text is still allowed; anything not listed sorts after these. A manual
# reorder (TeamCoach.sort_order) takes precedence over this.
COACH_ROLE_ORDER = (
    "المدير الفني",
    "مدرب",
    "مساعد مدرب",
    "مدرب حراس مرمي",
    "محلل اداء",
    "المعد النفسي",
    "اداري",
    "طبيب",
    "اخصائي اصابات",
    "علاج طبيعي",
    "مدلك",
    "مدرب الاحمال",
    "اخصائي",
    "عامل مهمات",
)
# Existing rows use variant wordings for roles already in the list above; rank
# them with their canonical equivalent instead of dumping them at the end.
COACH_ROLE_ALIASES = {
    "مدرب الحراس": "مدرب حراس مرمي",
    "مسئول المهمات": "عامل مهمات",
    "طبيب عظام": "طبيب",
    "محلل الاداء": "محلل اداء",
    "اخصائي الاصابات": "اخصائي اصابات",
}

COACH_ROLE_RANK = {role: i for i, role in enumerate(COACH_ROLE_ORDER)}
COACH_ROLE_RANK.update(
    {alias: COACH_ROLE_RANK[canonical] for alias, canonical in COACH_ROLE_ALIASES.items()}
)
UNRANKED_COACH_ROLE = len(COACH_ROLE_ORDER)


# ClubStaff.role_ar — the club's youth-sector posts, most senior first. Same
# rules as the coach order: free text is allowed and sorts last, and a manual
# reorder (ClubStaff.sort_order) wins over this.
CLUB_STAFF_ROLE_ORDER = (
    "عضو مجلس الإدارة",
    "رئيس قطاع الناشئين",
    "نائب رئيس القطاع",
    "مشرف القطاع",
    "المدير الفني للقطاع",
    "المشرف الفني للقطاع",
    "المدير الاداري للقطاع",
    "مدير الكرة",
    "نائب رئيس جهاز الكرة",
    "مشرف الكرة",
    "مدير حراس المرمى بالقطاع",
    "مشرف حراس المرمى",
    "رئيس الجهاز الطبي",
    "طبيب القطاع",
    "مشرف العلاج الطبيعي",
    "اخصائي الفريق",
    "مخطط أحمال",
    "محلل أداء",
    "مسؤول شئون اللاعبين",
    "المدير المالي",
    "مدير عام النادي",
    "مدير رياضي",
    "مشرف النشاط الرياضي",
    "مدير التسويق بالقطاع",
    "المشرف العام علي الالعاب الجماعية",
)
CLUB_STAFF_ROLE_RANK = {role: i for i, role in enumerate(CLUB_STAFF_ROLE_ORDER)}
UNRANKED_CLUB_STAFF_ROLE = len(CLUB_STAFF_ROLE_ORDER)
