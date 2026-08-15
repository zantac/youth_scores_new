// Structure-management models (seasons, age groups, clubs, competitions,
// teams) mirroring the M* types in web/src/lib/adminApi.ts.

int _i(dynamic v) => v == null ? 0 : (v as num?)?.toInt() ?? 0;
int? _iN(dynamic v) => v == null ? null : (v as num?)?.toInt();
String? _s(dynamic v) {
  final s = v?.toString();
  return (s == null || s.isEmpty) ? null : s;
}

class MSeason {
  final int id;
  final String? nameAr;
  final String? nameEn;
  final String startDate;
  final String endDate;
  final bool isActive;
  const MSeason({
    required this.id,
    this.nameAr,
    this.nameEn,
    required this.startDate,
    required this.endDate,
    required this.isActive,
  });

  String name(bool isAr) => (isAr ? nameAr : nameEn) ?? nameAr ?? nameEn ?? '';

  factory MSeason.fromJson(Map<String, dynamic> j) => MSeason(
        id: _i(j['id']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        startDate: j['start_date']?.toString() ?? '',
        endDate: j['end_date']?.toString() ?? '',
        isActive: j['is_active'] == true,
      );
}

class MAge {
  final int id;
  final String? nameAr;
  final String? nameEn;
  final int oldestBirthYear;
  const MAge({
    required this.id,
    this.nameAr,
    this.nameEn,
    required this.oldestBirthYear,
  });

  String name(bool isAr) => (isAr ? nameAr : nameEn) ?? nameAr ?? nameEn ?? '';

  factory MAge.fromJson(Map<String, dynamic> j) => MAge(
        id: _i(j['id']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        oldestBirthYear: _i(j['oldest_birth_year']),
      );
}

class MClub {
  final int id;
  final String? nameAr;
  final String? nameEn;
  final String? cityAr;
  final String? cityEn;
  final String? logoUrl;
  final String? websiteUrl;
  final String? facebookUrl;
  final String? instagramUrl;
  const MClub({
    required this.id,
    this.nameAr,
    this.nameEn,
    this.cityAr,
    this.cityEn,
    this.logoUrl,
    this.websiteUrl,
    this.facebookUrl,
    this.instagramUrl,
  });

  String name(bool isAr) => (isAr ? nameAr : nameEn) ?? nameAr ?? nameEn ?? '';
  String city(bool isAr) => (isAr ? cityAr : cityEn) ?? cityAr ?? cityEn ?? '';

  factory MClub.fromJson(Map<String, dynamic> j) => MClub(
        id: _i(j['id']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        cityAr: _s(j['city_ar']),
        cityEn: _s(j['city_en']),
        logoUrl: _s(j['logo_url']),
        websiteUrl: _s(j['website_url']),
        facebookUrl: _s(j['facebook_url']),
        instagramUrl: _s(j['instagram_url']),
      );
}

class MComp {
  final int id;
  final String? code;
  final int seasonId;
  final String season;
  final int? ageGroupId;
  final String? age;
  final String? nameAr;
  final String? nameEn;
  final String? sectorAr;
  final String? sectorEn;
  const MComp({
    required this.id,
    this.code,
    required this.seasonId,
    required this.season,
    this.ageGroupId,
    this.age,
    this.nameAr,
    this.nameEn,
    this.sectorAr,
    this.sectorEn,
  });

  String name(bool isAr) => (isAr ? nameAr : nameEn) ?? nameAr ?? nameEn ?? '';
  String sector(bool isAr) => (isAr ? sectorAr : sectorEn) ?? sectorAr ?? sectorEn ?? '';

  factory MComp.fromJson(Map<String, dynamic> j) => MComp(
        id: _i(j['id']),
        code: _s(j['code']),
        seasonId: _i(j['season_id']),
        season: j['season']?.toString() ?? '',
        ageGroupId: _iN(j['age_group_id']),
        age: _s(j['age']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        sectorAr: _s(j['sector_ar']),
        sectorEn: _s(j['sector_en']),
      );
}

class MTeam {
  final int id;
  final int clubId;
  final String clubName;
  final String? nameAr;
  final String? nameEn;
  final int pointDeduction;
  final String? logo;
  const MTeam({
    required this.id,
    required this.clubId,
    required this.clubName,
    this.nameAr,
    this.nameEn,
    required this.pointDeduction,
    this.logo,
  });

  factory MTeam.fromJson(Map<String, dynamic> j) => MTeam(
        id: _i(j['id']),
        clubId: _i(j['club_id']),
        clubName: j['club_name']?.toString() ?? '',
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        pointDeduction: _i(j['point_deduction']),
        logo: _s(j['logo']),
      );
}

// ── Stages & groups ───────────────────────────────────────────────────────────

/// Stage type with bilingual label. Mirrors STAGE_TYPE_LABEL in adminApi.ts.
String stageTypeLabel(String type, bool isAr) {
  switch (type) {
    case 'league':
      return isAr ? 'دوري' : 'League';
    case 'group':
      return isAr ? 'مجموعات' : 'Groups';
    case 'knockout':
      return isAr ? 'خروج المغلوب' : 'Knockout';
    default:
      return type;
  }
}

const stageTypes = ['league', 'group', 'knockout'];

class MGroup {
  final int id;
  final int stageId;
  final String? nameAr;
  final String? nameEn;
  final int teamCount;
  const MGroup({
    required this.id,
    required this.stageId,
    this.nameAr,
    this.nameEn,
    required this.teamCount,
  });

  String name(bool isAr) => (isAr ? nameAr : nameEn) ?? nameAr ?? nameEn ?? '';

  factory MGroup.fromJson(Map<String, dynamic> j) => MGroup(
        id: _i(j['id']),
        stageId: _i(j['stage_id']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        teamCount: _i(j['team_count']),
      );
}

class MStage {
  final int id;
  final int competitionId;
  final String? nameAr;
  final String? nameEn;
  final int stageOrder;
  final String type; // league | group | knockout
  final bool carriesPoints;
  final int matchCount;
  final List<MGroup> groups;
  const MStage({
    required this.id,
    required this.competitionId,
    this.nameAr,
    this.nameEn,
    required this.stageOrder,
    required this.type,
    required this.carriesPoints,
    required this.matchCount,
    this.groups = const [],
  });

  String name(bool isAr) => (isAr ? nameAr : nameEn) ?? nameAr ?? nameEn ?? '';

  factory MStage.fromJson(Map<String, dynamic> j) => MStage(
        id: _i(j['id']),
        competitionId: _i(j['competition_id']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        stageOrder: _i(j['stage_order']),
        type: j['type']?.toString() ?? 'league',
        carriesPoints: j['carries_points'] == true,
        matchCount: _i(j['match_count']),
        groups: (j['groups'] as List? ?? [])
            .whereType<Map>()
            .map((e) => MGroup.fromJson(e.cast<String, dynamic>()))
            .toList(),
      );
}

class MGroupTeam {
  final int groupTeamId;
  final int id;
  final String clubName;
  final String? nameAr;
  final String? logo;
  const MGroupTeam({
    required this.groupTeamId,
    required this.id,
    required this.clubName,
    this.nameAr,
    this.logo,
  });

  String label() => (nameAr?.isNotEmpty == true) ? nameAr! : clubName;

  factory MGroupTeam.fromJson(Map<String, dynamic> j) => MGroupTeam(
        groupTeamId: _i(j['group_team_id']),
        id: _i(j['id']),
        clubName: j['club_name']?.toString() ?? '',
        nameAr: _s(j['name_ar']),
        logo: _s(j['logo']),
      );
}

// ── Club staff & squads ───────────────────────────────────────────────────────

class MClubStaff {
  final int id;
  final int coachId;
  final String? nameAr;
  final String? nameEn;
  final String? photo;
  final String? roleAr;
  final String? roleEn;
  final String? startDate;
  final String? endDate;
  const MClubStaff({
    required this.id,
    required this.coachId,
    this.nameAr,
    this.nameEn,
    this.photo,
    this.roleAr,
    this.roleEn,
    this.startDate,
    this.endDate,
  });

  String name(bool isAr) => (isAr ? nameAr : nameEn) ?? nameAr ?? nameEn ?? '';
  String role(bool isAr) => (isAr ? roleAr : roleEn) ?? roleAr ?? roleEn ?? '';
  bool get isCurrent => endDate == null || endDate!.isEmpty;

  factory MClubStaff.fromJson(Map<String, dynamic> j) => MClubStaff(
        id: _i(j['id']),
        coachId: _i(j['coach_id']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        photo: _s(j['photo']),
        roleAr: _s(j['role_ar']),
        roleEn: _s(j['role_en']),
        startDate: _s(j['start_date']),
        endDate: _s(j['end_date']),
      );
}

class MTeamFull {
  final int id;
  final int clubId;
  final String? clubName;
  final String? nameAr;
  final String? nameEn;
  final String? logo;
  final int? ageGroupId;
  final String? age;
  final List<String> seasons;
  const MTeamFull({
    required this.id,
    required this.clubId,
    this.clubName,
    this.nameAr,
    this.nameEn,
    this.logo,
    this.ageGroupId,
    this.age,
    this.seasons = const [],
  });

  String title() =>
      (clubName?.isNotEmpty == true) ? clubName! : (nameAr ?? nameEn ?? '');
  String? subtitle() {
    final s = nameAr ?? nameEn;
    return (s != null && s.isNotEmpty) ? s : null;
  }

  factory MTeamFull.fromJson(Map<String, dynamic> j) => MTeamFull(
        id: _i(j['id']),
        clubId: _i(j['club_id']),
        clubName: _s(j['club_name']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        logo: _s(j['logo']),
        ageGroupId: _iN(j['age_group_id']),
        age: _s(j['age']),
        seasons: (j['seasons'] as List? ?? []).map((e) => e.toString()).toList(),
      );
}

// ── Team coaches & roster ─────────────────────────────────────────────────────

class MTeamCoach {
  final int id;
  final int coachId;
  final String? nameAr;
  final String? nameEn;
  final String? photo;
  final String? roleAr;
  final String? roleEn;
  final String? startDate;
  final String? endDate;
  const MTeamCoach({
    required this.id,
    required this.coachId,
    this.nameAr,
    this.nameEn,
    this.photo,
    this.roleAr,
    this.roleEn,
    this.startDate,
    this.endDate,
  });

  String name(bool isAr) => (isAr ? nameAr : nameEn) ?? nameAr ?? nameEn ?? '';
  String role(bool isAr) => (isAr ? roleAr : roleEn) ?? roleAr ?? roleEn ?? '';
  bool get isCurrent => endDate == null || endDate!.isEmpty;

  factory MTeamCoach.fromJson(Map<String, dynamic> j) => MTeamCoach(
        id: _i(j['id']),
        coachId: _i(j['coach_id']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        photo: _s(j['photo']),
        roleAr: _s(j['role_ar']),
        roleEn: _s(j['role_en']),
        startDate: _s(j['start_date']),
        endDate: _s(j['end_date']),
      );
}

class MRegistration {
  final int id;
  final int playerId;
  final String? nameAr;
  final String? nameEn;
  final String? photo;
  final int? birthYear;
  final bool birthYearVerified;
  final String? positionAr;
  final String? positionEn;
  final String? subPositionAr;
  final String? subPositionEn;
  final int? shirtNumber;
  final String status;
  final String? startDate;
  final String? endDate;
  final bool isGuest;
  const MRegistration({
    required this.id,
    required this.playerId,
    this.nameAr,
    this.nameEn,
    this.photo,
    this.birthYear,
    this.birthYearVerified = false,
    this.positionAr,
    this.positionEn,
    this.subPositionAr,
    this.subPositionEn,
    this.shirtNumber,
    this.status = 'active',
    this.startDate,
    this.endDate,
    this.isGuest = false,
  });

  String name(bool isAr) => (isAr ? nameAr : nameEn) ?? nameAr ?? nameEn ?? '';
  String position(bool isAr) =>
      (isAr ? positionAr : positionEn) ?? positionAr ?? positionEn ?? '';
  bool get isCurrent => endDate == null || endDate!.isEmpty;

  factory MRegistration.fromJson(Map<String, dynamic> j) => MRegistration(
        id: _i(j['id']),
        playerId: _i(j['player_id']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        photo: _s(j['photo']),
        birthYear: _iN(j['birth_year']),
        birthYearVerified: j['birth_year_verified'] == true,
        positionAr: _s(j['position_ar']),
        positionEn: _s(j['position_en']),
        subPositionAr: _s(j['sub_position_ar']),
        subPositionEn: _s(j['sub_position_en']),
        shirtNumber: _iN(j['shirt_number']),
        status: j['status']?.toString() ?? 'active',
        startDate: _s(j['start_date']),
        endDate: _s(j['end_date']),
        isGuest: j['is_guest'] == true,
      );
}

/// A team result from the global admin search — used as a transfer destination.
class AdminSearchTeam {
  final int id;
  final String name;
  final String? logo;
  const AdminSearchTeam({required this.id, required this.name, this.logo});
  factory AdminSearchTeam.fromJson(Map<String, dynamic> j) => AdminSearchTeam(
        id: _i(j['id']),
        name: j['name']?.toString() ?? '',
        logo: _s(j['logo']),
      );
}

class AdminSearchClub {
  final int id;
  final String name;
  final String? city;
  final String? logo;
  const AdminSearchClub({required this.id, required this.name, this.city, this.logo});
  factory AdminSearchClub.fromJson(Map<String, dynamic> j) => AdminSearchClub(
        id: _i(j['id']),
        name: j['name']?.toString() ?? '',
        city: _s(j['city']),
        logo: _s(j['logo']),
      );
}

class AdminSearchPlayer {
  final int id;
  final String name;
  final int? birthYear;
  final String? club;
  final int? teamId;
  const AdminSearchPlayer(
      {required this.id, required this.name, this.birthYear, this.club, this.teamId});
  factory AdminSearchPlayer.fromJson(Map<String, dynamic> j) => AdminSearchPlayer(
        id: _i(j['id']),
        name: j['name']?.toString() ?? '',
        birthYear: _iN(j['birth_year']),
        club: _s(j['club']),
        teamId: _iN(j['team_id']),
      );
}

class AdminSearchCoach {
  final int id;
  final String name;
  final String? role;
  final String? club;
  final int? teamId;
  const AdminSearchCoach(
      {required this.id, required this.name, this.role, this.club, this.teamId});
  factory AdminSearchCoach.fromJson(Map<String, dynamic> j) => AdminSearchCoach(
        id: _i(j['id']),
        name: j['name']?.toString() ?? '',
        role: _s(j['role']),
        club: _s(j['club']),
        teamId: _iN(j['team_id']),
      );
}

class AdminSearchResults {
  final List<AdminSearchClub> clubs;
  final List<AdminSearchTeam> teams;
  final List<AdminSearchPlayer> players;
  final List<AdminSearchCoach> coaches;
  const AdminSearchResults({
    this.clubs = const [],
    this.teams = const [],
    this.players = const [],
    this.coaches = const [],
  });

  bool get isEmpty => clubs.isEmpty && teams.isEmpty && players.isEmpty && coaches.isEmpty;

  factory AdminSearchResults.fromJson(Map<String, dynamic> j) {
    List<T> list<T>(dynamic v, T Function(Map<String, dynamic>) f) => (v as List? ?? [])
        .whereType<Map>()
        .map((e) => f(e.cast<String, dynamic>()))
        .toList();
    return AdminSearchResults(
      clubs: list(j['clubs'], AdminSearchClub.fromJson),
      teams: list(j['teams'], AdminSearchTeam.fromJson),
      players: list(j['players'], AdminSearchPlayer.fromJson),
      coaches: list(j['coaches'], AdminSearchCoach.fromJson),
    );
  }
}

/// One dependency line in a delete preview (e.g. "3 matches").
class DeleteCount {
  final int count;
  final String noun;
  const DeleteCount({required this.count, required this.noun});
  factory DeleteCount.fromJson(Map<String, dynamic> j) =>
      DeleteCount(count: _i(j['count']), noun: j['noun']?.toString() ?? '');
}

/// What a delete would take with it. Non-empty [blockers] means the delete is
/// refused; [cascades] are removed along with the row.
class DeletePreview {
  final String label;
  final String? name;
  final List<DeleteCount> blockers;
  final List<DeleteCount> cascades;
  const DeletePreview({
    required this.label,
    this.name,
    this.blockers = const [],
    this.cascades = const [],
  });

  bool get blocked => blockers.isNotEmpty;

  factory DeletePreview.fromJson(Map<String, dynamic> j) {
    List<DeleteCount> list(dynamic v) => (v as List? ?? [])
        .whereType<Map>()
        .map((e) => DeleteCount.fromJson(e.cast<String, dynamic>()))
        .toList();
    return DeletePreview(
      label: j['label']?.toString() ?? '',
      name: _s(j['name']),
      blockers: list(j['blockers']),
      cascades: list(j['cascades']),
    );
  }
}
