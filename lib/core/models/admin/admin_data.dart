// Admin data models for the dashboard, merge tools, users and content tabs.
// These mirror the shapes in web/src/lib/adminApi.ts so the Flutter admin can
// reuse the exact same backend endpoints.

int _i(dynamic v) => v == null ? 0 : (v as num?)?.toInt() ?? 0;
int? _iN(dynamic v) => v == null ? null : (v as num?)?.toInt();
double _d(dynamic v) => v == null ? 0 : (v as num?)?.toDouble() ?? 0;
String? _s(dynamic v) {
  final s = v?.toString();
  return (s == null || s.isEmpty) ? null : s;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

class StatComp {
  final int id;
  final String name;
  final String sector;
  final int played;
  final int total;
  const StatComp({
    required this.id,
    required this.name,
    required this.sector,
    required this.played,
    required this.total,
  });

  int get remaining => (total - played).clamp(0, total);

  factory StatComp.fromJson(Map<String, dynamic> j) => StatComp(
        id: _i(j['id']),
        name: j['name']?.toString() ?? '',
        sector: j['sector']?.toString() ?? '',
        played: _i(j['played']),
        total: _i(j['total']),
      );
}

class StatSeasonFilter {
  final int id;
  final String name;
  const StatSeasonFilter({required this.id, required this.name});
  factory StatSeasonFilter.fromJson(Map<String, dynamic> j) =>
      StatSeasonFilter(id: _i(j['id']), name: j['name']?.toString() ?? '');
}

class StatCompFilter {
  final int id;
  final int seasonId;
  final String name;
  final String sector;
  final String age;
  const StatCompFilter({
    required this.id,
    required this.seasonId,
    required this.name,
    required this.sector,
    required this.age,
  });
  factory StatCompFilter.fromJson(Map<String, dynamic> j) => StatCompFilter(
        id: _i(j['id']),
        seasonId: _i(j['season_id']),
        name: j['name']?.toString() ?? '',
        sector: j['sector']?.toString() ?? '',
        age: j['age']?.toString() ?? '',
      );
}

class AdminStats {
  final Map<String, int> counts;
  final int matchesTotal;
  final int matchesPlayed;
  final int matchesRemaining;
  final double goalsPerMatch;
  final double playersPerTeam;
  final double teamsPerCompetition;
  final String? activeSeason;
  final List<StatComp> competitions;
  final List<StatSeasonFilter> filterSeasons;
  final List<StatCompFilter> filterComps;

  const AdminStats({
    required this.counts,
    required this.matchesTotal,
    required this.matchesPlayed,
    required this.matchesRemaining,
    required this.goalsPerMatch,
    required this.playersPerTeam,
    required this.teamsPerCompetition,
    this.activeSeason,
    this.competitions = const [],
    this.filterSeasons = const [],
    this.filterComps = const [],
  });

  int count(String key) => counts[key] ?? 0;

  double get playedPct =>
      matchesTotal == 0 ? 0 : (matchesPlayed / matchesTotal).clamp(0, 1);

  factory AdminStats.fromJson(Map<String, dynamic> j) {
    final c = (j['counts'] as Map?)?.cast<String, dynamic>() ?? const {};
    final m = (j['matches'] as Map?)?.cast<String, dynamic>() ?? const {};
    final a = (j['averages'] as Map?)?.cast<String, dynamic>() ?? const {};
    final f = (j['filters'] as Map?)?.cast<String, dynamic>() ?? const {};
    List<T> list<T>(dynamic src, T Function(Map<String, dynamic>) fn) =>
        (src as List? ?? [])
            .whereType<Map>()
            .map((e) => fn(e.cast<String, dynamic>()))
            .toList();
    return AdminStats(
      counts: c.map((k, v) => MapEntry(k, _i(v))),
      matchesTotal: _i(m['total']),
      matchesPlayed: _i(m['played']),
      matchesRemaining: _i(m['remaining']),
      goalsPerMatch: _d(a['goals_per_match']),
      playersPerTeam: _d(a['players_per_team']),
      teamsPerCompetition: _d(a['teams_per_competition']),
      activeSeason: _s(j['active_season']),
      competitions: list(j['competitions'], StatComp.fromJson),
      filterSeasons: list(f['seasons'], StatSeasonFilter.fromJson),
      filterComps: list(f['competitions'], StatCompFilter.fromJson),
    );
  }
}

// ── Player merge ─────────────────────────────────────────────────────────────

class PlayerSearchResult {
  final int id;
  final String name;
  final int birthYear;
  final String? club;
  const PlayerSearchResult({
    required this.id,
    required this.name,
    required this.birthYear,
    this.club,
  });
  factory PlayerSearchResult.fromJson(Map<String, dynamic> j) =>
      PlayerSearchResult(
        id: _i(j['id']),
        name: j['name']?.toString() ?? '',
        birthYear: _i(j['birth_year']),
        club: _s(j['club']),
      );
}

class PlayerMergeTeam {
  final String club;
  final String? age;
  final bool current;
  final bool guest;
  final int goals;
  const PlayerMergeTeam({
    required this.club,
    this.age,
    required this.current,
    required this.guest,
    required this.goals,
  });
  factory PlayerMergeTeam.fromJson(Map<String, dynamic> j) => PlayerMergeTeam(
        club: j['club']?.toString() ?? '',
        age: _s(j['age']),
        current: j['current'] == true,
        guest: j['guest'] == true,
        goals: _i(j['goals']),
      );
}

class PlayerMergeSummary {
  final int id;
  final String name;
  final int birthYear;
  final int goals;
  final int assists;
  final int appearances;
  final List<PlayerMergeTeam> teams;
  const PlayerMergeSummary({
    required this.id,
    required this.name,
    required this.birthYear,
    required this.goals,
    required this.assists,
    required this.appearances,
    this.teams = const [],
  });
  factory PlayerMergeSummary.fromJson(Map<String, dynamic> j) =>
      PlayerMergeSummary(
        id: _i(j['id']),
        name: j['name']?.toString() ?? '',
        birthYear: _i(j['birth_year']),
        goals: _i(j['goals']),
        assists: _i(j['assists']),
        appearances: _i(j['appearances']),
        teams: (j['teams'] as List? ?? [])
            .whereType<Map>()
            .map((e) => PlayerMergeTeam.fromJson(e.cast<String, dynamic>()))
            .toList(),
      );
}

// ── Coach merge ──────────────────────────────────────────────────────────────

class CoachSearchResult {
  final int id;
  final String name;
  final int? birthYear;
  final String? club;
  final String? role;
  const CoachSearchResult({
    required this.id,
    required this.name,
    this.birthYear,
    this.club,
    this.role,
  });
  factory CoachSearchResult.fromJson(Map<String, dynamic> j) =>
      CoachSearchResult(
        id: _i(j['id']),
        name: j['name']?.toString() ?? '',
        birthYear: _iN(j['birth_year']),
        club: _s(j['club']),
        role: _s(j['role']),
      );
}

class CoachMergeRole {
  final String type; // 'coach' | 'manager'
  final String? club;
  final String? role;
  final String? age;
  final bool current;
  const CoachMergeRole({
    required this.type,
    this.club,
    this.role,
    this.age,
    required this.current,
  });
  factory CoachMergeRole.fromJson(Map<String, dynamic> j) => CoachMergeRole(
        type: j['type']?.toString() ?? 'coach',
        club: _s(j['club']),
        role: _s(j['role']),
        age: _s(j['age']),
        current: j['current'] == true,
      );
}

class CoachMergeSummary {
  final int id;
  final String name;
  final int? birthYear;
  final List<CoachMergeRole> roles;
  const CoachMergeSummary({
    required this.id,
    required this.name,
    this.birthYear,
    this.roles = const [],
  });
  factory CoachMergeSummary.fromJson(Map<String, dynamic> j) => CoachMergeSummary(
        id: _i(j['id']),
        name: j['name']?.toString() ?? '',
        birthYear: _iN(j['birth_year']),
        roles: (j['roles'] as List? ?? [])
            .whereType<Map>()
            .map((e) => CoachMergeRole.fromJson(e.cast<String, dynamic>()))
            .toList(),
      );
}

// ── Content: news + venues ───────────────────────────────────────────────────

class AdminNews {
  final int id;
  final String date;
  final String? titleAr;
  final String? titleEn;
  final String? detailsAr;
  final String? detailsEn;
  final String? imageUrl;
  final List<String> images;
  final bool isPublished;
  const AdminNews({
    required this.id,
    required this.date,
    this.titleAr,
    this.titleEn,
    this.detailsAr,
    this.detailsEn,
    this.imageUrl,
    this.images = const [],
    required this.isPublished,
  });

  String title(bool isAr) =>
      (isAr ? titleAr : titleEn) ?? titleAr ?? titleEn ?? '';

  factory AdminNews.fromJson(Map<String, dynamic> j) => AdminNews(
        id: _i(j['id']),
        date: j['date']?.toString() ?? '',
        titleAr: _s(j['title_ar']),
        titleEn: _s(j['title_en']),
        detailsAr: _s(j['details_ar']),
        detailsEn: _s(j['details_en']),
        imageUrl: _s(j['image_url']),
        images: (j['images'] as List? ?? []).map((e) => e.toString()).toList(),
        isPublished: j['is_published'] != false,
      );
}

class AdminVenue {
  final int id;
  final String? nameAr;
  final String? nameEn;
  final String? url;
  const AdminVenue({
    required this.id,
    this.nameAr,
    this.nameEn,
    this.url,
  });

  String name(bool isAr) => (isAr ? nameAr : nameEn) ?? nameAr ?? nameEn ?? '';

  factory AdminVenue.fromJson(Map<String, dynamic> j) => AdminVenue(
        id: _i(j['id']),
        nameAr: _s(j['name_ar']),
        nameEn: _s(j['name_en']),
        url: _s(j['url']),
      );
}

class AdminAd {
  final int id;
  final String name;
  final String? image;
  final String? youtubeVideo;
  final String? facebookLink;
  final String? mobileNumber;
  final String? whatsappNumber;
  final String? location;
  final String? locationUrl;
  final String? link;
  final String? startDate;
  final bool active;
  final int weight;
  final String? expireDate;
  const AdminAd({
    required this.id,
    required this.name,
    this.image,
    this.youtubeVideo,
    this.facebookLink,
    this.mobileNumber,
    this.whatsappNumber,
    this.location,
    this.locationUrl,
    this.link,
    this.startDate,
    this.active = true,
    this.weight = 1,
    this.expireDate,
  });

  factory AdminAd.fromJson(Map<String, dynamic> j) => AdminAd(
        id: _i(j['id']),
        name: j['name']?.toString() ?? '',
        image: _s(j['image']),
        youtubeVideo: _s(j['youtube_video']),
        facebookLink: _s(j['facebook_link']),
        mobileNumber: _s(j['mobile_number']),
        whatsappNumber: _s(j['whatsapp_number']),
        location: _s(j['location']),
        locationUrl: _s(j['location_url']),
        link: _s(j['link']),
        startDate: _s(j['start_date']),
        active: j['active'] != false,
        weight: _i(j['weight']) < 1 ? 1 : _i(j['weight']),
        expireDate: _s(j['expire_date']),
      );
}
