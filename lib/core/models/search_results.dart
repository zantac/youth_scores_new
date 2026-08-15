import 'competition_data_model.dart' show localizedMap, localizedMapOrNull, pickLocale;

String? _str(dynamic v) {
  final s = v?.toString();
  return (s == null || s.isEmpty) ? null : s;
}

/// One team hit from `/api/search` (the site calls these "clubs").
class SearchClub {
  final int id;
  final Map<String, String> name;
  final Map<String, String>? city;
  final String? logo;
  const SearchClub({required this.id, required this.name, this.city, this.logo});

  String getName(String locale) => pickLocale(name, locale);
  String getCity(String locale) => pickLocale(city, locale);

  factory SearchClub.fromJson(Map<String, dynamic> j) => SearchClub(
        id: (j['id'] as num?)?.toInt() ?? 0,
        name: localizedMap(j['name']),
        city: localizedMapOrNull(j['city']),
        logo: _str(j['logo']),
      );
}

class SearchPlayer {
  final int id;
  final Map<String, String> name;
  final int? birthYear;
  final Map<String, String>? position;
  final Map<String, String>? club;
  final String? photo;
  const SearchPlayer({
    required this.id,
    required this.name,
    this.birthYear,
    this.position,
    this.club,
    this.photo,
  });

  String getName(String locale) => pickLocale(name, locale);
  String getPosition(String locale) => pickLocale(position, locale);
  String getClub(String locale) => pickLocale(club, locale);

  factory SearchPlayer.fromJson(Map<String, dynamic> j) => SearchPlayer(
        id: (j['id'] as num?)?.toInt() ?? 0,
        name: localizedMap(j['name']),
        birthYear: (j['birth_year'] as num?)?.toInt(),
        position: localizedMapOrNull(j['position']),
        club: localizedMapOrNull(j['club']),
        photo: _str(j['photo']),
      );
}

class SearchCoach {
  final int id;
  final Map<String, String> name;
  final Map<String, String>? role;
  final Map<String, String>? club;
  final String? photo;
  const SearchCoach({
    required this.id,
    required this.name,
    this.role,
    this.club,
    this.photo,
  });

  String getName(String locale) => pickLocale(name, locale);
  String getRole(String locale) => pickLocale(role, locale);
  String getClub(String locale) => pickLocale(club, locale);

  factory SearchCoach.fromJson(Map<String, dynamic> j) => SearchCoach(
        id: (j['id'] as num?)?.toInt() ?? 0,
        name: localizedMap(j['name']),
        role: localizedMapOrNull(j['role']),
        club: localizedMapOrNull(j['club']),
        photo: _str(j['photo']),
      );
}

/// Global search results — teams, players and coaches — from `/api/search`.
class SearchResults {
  final List<SearchClub> clubs;
  final List<SearchPlayer> players;
  final List<SearchCoach> coaches;
  const SearchResults({
    this.clubs = const [],
    this.players = const [],
    this.coaches = const [],
  });

  static const empty = SearchResults();

  int get total => clubs.length + players.length + coaches.length;
  bool get isEmpty => total == 0;

  factory SearchResults.fromJson(Map<String, dynamic> j) => SearchResults(
        clubs: (j['clubs'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(SearchClub.fromJson)
            .toList(),
        players: (j['players'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(SearchPlayer.fromJson)
            .toList(),
        coaches: (j['coaches'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(SearchCoach.fromJson)
            .toList(),
      );
}
