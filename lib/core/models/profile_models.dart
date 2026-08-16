import 'competition_data_model.dart' show localizedMap, localizedMapOrNull, pickLocale;

int _int(dynamic v, [int fallback = 0]) {
  if (v is int) return v;
  return int.tryParse(v?.toString() ?? '') ?? fallback;
}

int? _intN(dynamic v) => v is int ? v : int.tryParse(v?.toString() ?? '');

// ── Player profile (GET /api/players/<id>) ───────────────────────────────────

/// One competition's tally within a career season.
class PlayerCareerComp {
  final Map<String, String> name;
  final int goals;
  final int assists;
  final int appearances;
  const PlayerCareerComp({
    this.name = const {},
    this.goals = 0,
    this.assists = 0,
    this.appearances = 0,
  });

  String getName(String locale) => pickLocale(name, locale);

  factory PlayerCareerComp.fromJson(Map<String, dynamic> j) => PlayerCareerComp(
        name: localizedMap(j['name']),
        goals: _int(j['goals']),
        assists: _int(j['assists']),
        appearances: _int(j['appearances']),
      );
}

class PlayerCareerEntry {
  final String club;
  final String? logo;
  final Map<String, String>? age;
  final Map<String, String> season;
  final bool isGuest;
  final int goals;
  final int assists;
  final int appearances;
  final bool current;
  final String? endDate;
  final String status;
  final List<PlayerCareerComp> competitions;
  const PlayerCareerEntry({
    required this.club,
    this.logo,
    this.age,
    this.season = const {},
    this.isGuest = false,
    this.goals = 0,
    this.assists = 0,
    this.appearances = 0,
    this.current = false,
    this.endDate,
    this.status = '',
    this.competitions = const [],
  });

  String seasonName(String locale) => pickLocale(season, locale);
  String? ageName(String locale) {
    final a = pickLocale(age, locale);
    return a.isEmpty ? null : a;
  }

  factory PlayerCareerEntry.fromJson(Map<String, dynamic> j) => PlayerCareerEntry(
        club: j['club']?.toString() ?? '',
        logo: j['logo']?.toString(),
        age: localizedMapOrNull(j['age']),
        season: localizedMap(j['season']),
        isGuest: j['is_guest'] == true,
        goals: _int(j['goals']),
        assists: _int(j['assists']),
        appearances: _int(j['appearances']),
        current: j['current'] == true,
        endDate: j['end_date']?.toString(),
        status: j['status']?.toString() ?? '',
        competitions: (j['competitions'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(PlayerCareerComp.fromJson)
            .toList(),
      );
}

class PlayerFull {
  final int id;
  final Map<String, String> name;
  final Map<String, String>? position;
  final int? birthYear;
  final Map<String, String>? nationality;
  final String? photo;
  final String? currentClub;
  final int goals;
  final int assists;
  final int appearances;
  final List<PlayerCareerEntry> career;
  const PlayerFull({
    required this.id,
    required this.name,
    this.position,
    this.birthYear,
    this.nationality,
    this.photo,
    this.currentClub,
    this.goals = 0,
    this.assists = 0,
    this.appearances = 0,
    this.career = const [],
  });

  String getName(String locale) => pickLocale(name, locale);
  String? getPosition(String locale) {
    final p = pickLocale(position, locale);
    return p.isEmpty ? null : p;
  }

  String? getNationality(String locale) {
    final n = pickLocale(nationality, locale);
    return n.isEmpty ? null : n;
  }

  factory PlayerFull.fromJson(Map<String, dynamic> j) => PlayerFull(
        id: _int(j['id']),
        name: localizedMap(j['name']),
        position: localizedMapOrNull(j['position']),
        birthYear: _intN(j['birth_year']),
        nationality: localizedMapOrNull(j['nationality']),
        photo: j['photo']?.toString(),
        currentClub: j['current_club']?.toString(),
        goals: _int(j['goals']),
        assists: _int(j['assists']),
        appearances: _int(j['appearances']),
        career: (j['career'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(PlayerCareerEntry.fromJson)
            .toList(),
      );
}

// ── Coach / manager profile (GET /api/coaches/<id>) ──────────────────────────
class CoachCareerEntry {
  final String type; // 'coach' | 'manager'
  final String club;
  final String? logo;
  final Map<String, String>? season;
  final Map<String, String>? age;
  final Map<String, String> role;
  final bool current;
  final String? startDate;
  const CoachCareerEntry({
    required this.type,
    required this.club,
    this.logo,
    this.season,
    this.age,
    this.role = const {},
    this.current = false,
    this.startDate,
  });

  String? seasonName(String locale) {
    final s = pickLocale(season, locale);
    return s.isEmpty ? null : s;
  }

  String? ageName(String locale) {
    final a = pickLocale(age, locale);
    return a.isEmpty ? null : a;
  }

  String roleName(String locale) => pickLocale(role, locale);

  factory CoachCareerEntry.fromJson(Map<String, dynamic> j) => CoachCareerEntry(
        type: j['type']?.toString() ?? 'coach',
        club: j['club']?.toString() ?? '',
        logo: j['logo']?.toString(),
        season: localizedMapOrNull(j['season']),
        age: localizedMapOrNull(j['age']),
        role: localizedMap(j['role']),
        current: j['current'] == true,
        startDate: j['start_date']?.toString(),
      );
}

class CoachFull {
  final int id;
  final Map<String, String> name;
  final int? birthYear;
  final Map<String, String>? nationality;
  final String? photo;
  final List<CoachCareerEntry> career;
  const CoachFull({
    required this.id,
    required this.name,
    this.birthYear,
    this.nationality,
    this.photo,
    this.career = const [],
  });

  String getName(String locale) => pickLocale(name, locale);
  String? getNationality(String locale) {
    final n = pickLocale(nationality, locale);
    return n.isEmpty ? null : n;
  }

  factory CoachFull.fromJson(Map<String, dynamic> j) => CoachFull(
        id: _int(j['id']),
        name: localizedMap(j['name']),
        birthYear: _intN(j['birth_year']),
        nationality: localizedMapOrNull(j['nationality']),
        photo: j['photo']?.toString(),
        career: (j['career'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(CoachCareerEntry.fromJson)
            .toList(),
      );
}

// ── Public club profile (GET /api/clubs/<id>) ────────────────────────────────
class ClubManager {
  final int id;
  final Map<String, String> name;
  final String? photo;
  final Map<String, String>? role;
  final bool current;
  const ClubManager({
    required this.id,
    required this.name,
    this.photo,
    this.role,
    this.current = false,
  });

  String getName(String locale) => pickLocale(name, locale);
  String? getRole(String locale) {
    final r = pickLocale(role, locale);
    return r.isEmpty ? null : r;
  }

  factory ClubManager.fromJson(Map<String, dynamic> j) => ClubManager(
        id: _int(j['id']),
        name: localizedMap(j['name']),
        photo: j['photo']?.toString(),
        role: localizedMapOrNull(j['role']),
        current: j['current'] == true,
      );
}

class ClubTeamEntry {
  final int id;
  final Map<String, String> name;
  final Map<String, String>? age;
  final String? logo;
  const ClubTeamEntry({required this.id, required this.name, this.age, this.logo});

  String getName(String locale) => pickLocale(name, locale);
  String? ageName(String locale) {
    final a = pickLocale(age, locale);
    return a.isEmpty ? null : a;
  }

  factory ClubTeamEntry.fromJson(Map<String, dynamic> j) => ClubTeamEntry(
        id: _int(j['id']),
        name: localizedMap(j['name']),
        age: localizedMapOrNull(j['age']),
        logo: j['logo']?.toString(),
      );
}

/// A row in the clubs list (`GET /api/clubs`). Lightweight: identity + logo.
class ClubListItem {
  final int id;
  final Map<String, String> name;
  final Map<String, String>? city;
  final String? logo;
  const ClubListItem({required this.id, required this.name, this.city, this.logo});

  String getName(String locale) => pickLocale(name, locale);
  String? getCity(String locale) {
    final c = pickLocale(city, locale);
    return c.isEmpty ? null : c;
  }

  factory ClubListItem.fromJson(Map<String, dynamic> j) => ClubListItem(
        id: _int(j['id']),
        name: localizedMap(j['name']),
        city: localizedMapOrNull(j['city']),
        logo: j['logo']?.toString(),
      );
}

class ClubPublic {
  final int id;
  final Map<String, String> name;
  final Map<String, String>? city;
  final String? logo;
  final String? website;
  final String? facebook;
  final String? instagram;
  final String? youtube;
  final String? twitter;
  final String? established;
  final List<ClubManager> managers;
  final List<ClubTeamEntry> teams;
  const ClubPublic({
    required this.id,
    required this.name,
    this.city,
    this.logo,
    this.website,
    this.facebook,
    this.instagram,
    this.youtube,
    this.twitter,
    this.established,
    this.managers = const [],
    this.teams = const [],
  });

  String getName(String locale) => pickLocale(name, locale);
  String? getCity(String locale) {
    final c = pickLocale(city, locale);
    return c.isEmpty ? null : c;
  }

  factory ClubPublic.fromJson(Map<String, dynamic> j) => ClubPublic(
        id: _int(j['id']),
        name: localizedMap(j['name']),
        city: localizedMapOrNull(j['city']),
        logo: j['logo']?.toString(),
        website: j['website']?.toString(),
        facebook: j['facebook']?.toString(),
        instagram: j['instagram']?.toString(),
        youtube: j['youtube']?.toString(),
        twitter: j['twitter']?.toString(),
        established: j['established']?.toString(),
        managers: (j['managers'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(ClubManager.fromJson)
            .toList(),
        teams: (j['teams'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(ClubTeamEntry.fromJson)
            .toList(),
      );
}
