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
  final int yellowCards;
  final int redCards;
  final int cleanSheets;
  const PlayerCareerComp({
    this.name = const {},
    this.goals = 0,
    this.assists = 0,
    this.appearances = 0,
    this.yellowCards = 0,
    this.redCards = 0,
    this.cleanSheets = 0,
  });

  String getName(String locale) => pickLocale(name, locale);

  factory PlayerCareerComp.fromJson(Map<String, dynamic> j) => PlayerCareerComp(
        name: localizedMap(j['name']),
        goals: _int(j['goals']),
        assists: _int(j['assists']),
        appearances: _int(j['appearances']),
        yellowCards: _int(j['yellow_cards']),
        redCards: _int(j['red_cards']),
        cleanSheets: _int(j['clean_sheets']),
      );
}

/// Aggregate stats for one season (the current-season tab), or any five-stat set.
class PlayerSeasonStats {
  final Map<String, String>? season;
  final int appearances;
  final int goals;
  final int assists;
  final int yellowCards;
  final int redCards;
  final int cleanSheets;
  const PlayerSeasonStats({
    this.season,
    this.appearances = 0,
    this.goals = 0,
    this.assists = 0,
    this.yellowCards = 0,
    this.redCards = 0,
    this.cleanSheets = 0,
  });

  String? seasonName(String locale) {
    final s = pickLocale(season, locale);
    return s.isEmpty ? null : s;
  }

  bool get isEmpty =>
      appearances == 0 && goals == 0 && assists == 0 && yellowCards == 0 &&
      redCards == 0 && cleanSheets == 0;

  factory PlayerSeasonStats.fromJson(Map<String, dynamic> j) => PlayerSeasonStats(
        season: localizedMapOrNull(j['season']),
        appearances: _int(j['appearances']),
        goals: _int(j['goals']),
        assists: _int(j['assists']),
        yellowCards: _int(j['yellow_cards']),
        redCards: _int(j['red_cards']),
        cleanSheets: _int(j['clean_sheets']),
      );
}

/// One side (home/away) of a player's match row.
class PlayerMatchSide {
  final Map<String, String> name;        // club (original) name
  final Map<String, String>? alt;        // academy/sponsor alias, or null
  final String? logo;
  const PlayerMatchSide({this.name = const {}, this.alt, this.logo});
  String getName(String locale) => pickLocale(name, locale);
  String? altName(String locale) {
    final a = pickLocale(alt, locale);
    return a.isEmpty ? null : a;
  }

  factory PlayerMatchSide.fromJson(Map<String, dynamic> j) => PlayerMatchSide(
        name: localizedMap(j['name']),
        alt: localizedMapOrNull(j['alt']),
        logo: j['logo']?.toString(),
      );
}

/// A match the player featured in, with his own contribution and the result.
class PlayerMatch {
  final int id;
  final String date;
  final String status;
  final Map<String, String> competition;
  final String side; // 'home' | 'away'
  final PlayerMatchSide home;
  final PlayerMatchSide away;
  final int? homeScore;
  final int? awayScore;
  final int goals;
  final int assists;
  final int yellowCards;
  final int redCards;
  final bool cleanSheet;
  const PlayerMatch({
    required this.id,
    this.date = '',
    this.status = '',
    this.competition = const {},
    this.side = 'home',
    this.home = const PlayerMatchSide(),
    this.away = const PlayerMatchSide(),
    this.homeScore,
    this.awayScore,
    this.goals = 0,
    this.assists = 0,
    this.yellowCards = 0,
    this.redCards = 0,
    this.cleanSheet = false,
  });

  String competitionName(String locale) => pickLocale(competition, locale);

  factory PlayerMatch.fromJson(Map<String, dynamic> j) => PlayerMatch(
        id: _int(j['id']),
        date: j['date']?.toString() ?? '',
        status: j['status']?.toString() ?? '',
        competition: localizedMap(j['competition']),
        side: j['side']?.toString() ?? 'home',
        home: PlayerMatchSide.fromJson(
            (j['home'] as Map<String, dynamic>?) ?? const {}),
        away: PlayerMatchSide.fromJson(
            (j['away'] as Map<String, dynamic>?) ?? const {}),
        homeScore: _intN(j['home_score']),
        awayScore: _intN(j['away_score']),
        goals: _int(j['goals']),
        assists: _int(j['assists']),
        yellowCards: _int(j['yellow_cards']),
        redCards: _int(j['red_cards']),
        cleanSheet: j['clean_sheet'] == true,
      );
}

class PlayerCareerEntry {
  final String club;
  final Map<String, String>? alt;   // academy/sponsor alias, or null
  final String? logo;
  final Map<String, String>? age;
  final Map<String, String> season;
  final bool isGuest;
  final int goals;
  final int assists;
  final int appearances;
  final int yellowCards;
  final int redCards;
  final int cleanSheets;
  final bool current;
  final String? endDate;
  final String status;
  final List<PlayerCareerComp> competitions;
  const PlayerCareerEntry({
    required this.club,
    this.alt,
    this.logo,
    this.age,
    this.season = const {},
    this.isGuest = false,
    this.goals = 0,
    this.assists = 0,
    this.appearances = 0,
    this.yellowCards = 0,
    this.redCards = 0,
    this.cleanSheets = 0,
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

  String? altName(String locale) {
    final a = pickLocale(alt, locale);
    return a.isEmpty ? null : a;
  }

  factory PlayerCareerEntry.fromJson(Map<String, dynamic> j) => PlayerCareerEntry(
        club: j['club']?.toString() ?? '',
        alt: localizedMapOrNull(j['alt_name']),
        logo: j['logo']?.toString(),
        age: localizedMapOrNull(j['age']),
        season: localizedMap(j['season']),
        isGuest: j['is_guest'] == true,
        goals: _int(j['goals']),
        assists: _int(j['assists']),
        appearances: _int(j['appearances']),
        yellowCards: _int(j['yellow_cards']),
        redCards: _int(j['red_cards']),
        cleanSheets: _int(j['clean_sheets']),
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
  final int yellowCards;
  final int redCards;
  final int cleanSheets;
  final bool isGoalkeeper;
  final PlayerSeasonStats? currentSeason;
  final List<PlayerCareerEntry> career;
  final List<PlayerMatch> matches;
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
    this.yellowCards = 0,
    this.redCards = 0,
    this.cleanSheets = 0,
    this.isGoalkeeper = false,
    this.currentSeason,
    this.career = const [],
    this.matches = const [],
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
        yellowCards: _int(j['yellow_cards']),
        redCards: _int(j['red_cards']),
        cleanSheets: _int(j['clean_sheets']),
        isGoalkeeper: j['is_goalkeeper'] == true,
        currentSeason: j['current_season'] is Map<String, dynamic>
            ? PlayerSeasonStats.fromJson(j['current_season'] as Map<String, dynamic>)
            : null,
        career: (j['career'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(PlayerCareerEntry.fromJson)
            .toList(),
        matches: (j['matches'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(PlayerMatch.fromJson)
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

// ── Public team profile (GET /api/teams/<id>) ────────────────────────────────

class TeamCompetitionRef {
  final int competitionId;
  final Map<String, String> title;
  final Map<String, String> season;
  const TeamCompetitionRef({
    required this.competitionId,
    this.title = const {},
    this.season = const {},
  });

  String getTitle(String locale) => pickLocale(title, locale);
  String getSeason(String locale) => pickLocale(season, locale);

  factory TeamCompetitionRef.fromJson(Map<String, dynamic> j) => TeamCompetitionRef(
        competitionId: _int(j['competition_id']),
        title: localizedMap(j['title']),
        season: localizedMap(j['season']),
      );
}

class TeamRosterPlayer {
  final int id;
  final Map<String, String> name;
  final String? photo;
  final int? shirt;
  final Map<String, String>? position;
  final int? birthYear;
  final bool guest;
  const TeamRosterPlayer({
    required this.id,
    required this.name,
    this.photo,
    this.shirt,
    this.position,
    this.birthYear,
    this.guest = false,
  });

  String getName(String locale) => pickLocale(name, locale);
  String? getPosition(String locale) {
    final p = pickLocale(position, locale);
    return p.isEmpty ? null : p;
  }

  factory TeamRosterPlayer.fromJson(Map<String, dynamic> j) => TeamRosterPlayer(
        id: _int(j['id']),
        name: localizedMap(j['name']),
        photo: j['photo']?.toString(),
        shirt: _intN(j['shirt']),
        position: localizedMapOrNull(j['position']),
        birthYear: _intN(j['birth_year']),
        guest: j['guest'] == true,
      );
}

class TeamPublic {
  final int id;
  final Map<String, String> name;
  final String? logo;
  final int? clubId;
  final Map<String, String>? clubName;
  final Map<String, String>? age;
  final List<TeamCompetitionRef> competitions;
  final List<ClubManager> staff;
  final List<TeamRosterPlayer> roster;
  const TeamPublic({
    required this.id,
    required this.name,
    this.logo,
    this.clubId,
    this.clubName,
    this.age,
    this.competitions = const [],
    this.staff = const [],
    this.roster = const [],
  });

  String getName(String locale) => pickLocale(name, locale);
  String? getClubName(String locale) {
    final c = pickLocale(clubName, locale);
    return c.isEmpty ? null : c;
  }

  String? getAge(String locale) {
    final a = pickLocale(age, locale);
    return a.isEmpty ? null : a;
  }

  /// Club leads as the identity; the team's own name (academy/sponsor) is the
  /// alias shown beneath, mirroring the standings/fixtures two-line form.
  ({String primary, String? alias}) nameLines(String locale) {
    final n = getName(locale);
    final club = getClubName(locale);
    if (club == null || club == n) return (primary: n, alias: null);
    return (primary: club, alias: n);
  }

  factory TeamPublic.fromJson(Map<String, dynamic> j) {
    final club = j['club'] as Map<String, dynamic>?;
    return TeamPublic(
      id: _int(j['id']),
      name: localizedMap(j['name']),
      logo: j['logo']?.toString(),
      clubId: club != null ? _intN(club['id']) : null,
      clubName: club != null ? localizedMapOrNull(club['name']) : null,
      age: localizedMapOrNull(j['age']),
      competitions: (j['competitions'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(TeamCompetitionRef.fromJson)
          .toList(),
      staff: (j['staff'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ClubManager.fromJson)
          .toList(),
      roster: (j['roster'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(TeamRosterPlayer.fromJson)
          .toList(),
    );
  }
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
