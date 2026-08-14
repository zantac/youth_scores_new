import 'competition_data_model.dart';

/// A single match from the aggregate `/api/matches` feed — the shape the home
/// screen groups by date then competition. Mirrors the web `HomeMatch`.
int? _pInt(dynamic v) {
  if (v is int) return v;
  if (v == null) return null;
  return int.tryParse(v.toString());
}

class HomeMatchTeam {
  final String id;
  final Map<String, String> name;
  final String? logo;
  const HomeMatchTeam({required this.id, required this.name, this.logo});

  factory HomeMatchTeam.fromJson(Map<String, dynamic> j) => HomeMatchTeam(
        id: j['id']?.toString() ?? '',
        name: localizedMap(j['name']),
        logo: (j['logo']?.toString().isNotEmpty ?? false)
            ? j['logo'].toString()
            : null,
      );

  /// Adapt into the richer `Team` the shared MatchCard already renders.
  Team toTeam() => Team(id: id, name: name, logo: logo);
}

class HomeMatchCompetition {
  final String id;
  final Map<String, String> title;
  final String dataUrl;
  const HomeMatchCompetition({
    required this.id,
    required this.title,
    required this.dataUrl,
  });

  factory HomeMatchCompetition.fromJson(Map<String, dynamic> j) =>
      HomeMatchCompetition(
        id: j['id']?.toString() ?? '',
        title: localizedMap(j['title']),
        dataUrl: j['data_url']?.toString() ?? '',
      );

  String getTitle(String locale) => pickLocale(title, locale);
}

class HomeMatch {
  final String id;
  final String date;
  final String time;
  final String status;
  final String group;
  final String venue;
  final String? note;
  final int? homeScore;
  final int? awayScore;
  final int? homePenalty;
  final int? awayPenalty;
  final HomeMatchCompetition competition;
  final HomeMatchTeam? homeTeam;
  final HomeMatchTeam? awayTeam;

  const HomeMatch({
    required this.id,
    required this.date,
    required this.time,
    required this.status,
    required this.group,
    required this.venue,
    this.note,
    this.homeScore,
    this.awayScore,
    this.homePenalty,
    this.awayPenalty,
    required this.competition,
    this.homeTeam,
    this.awayTeam,
  });

  factory HomeMatch.fromJson(Map<String, dynamic> j) => HomeMatch(
        id: j['id']?.toString() ?? '',
        date: j['date']?.toString() ?? '',
        time: j['time']?.toString() ?? '',
        status: j['status']?.toString() ?? '',
        group: j['group']?.toString() ?? '',
        venue: j['venue']?.toString() ?? '',
        note: j['note']?.toString(),
        homeScore: _pInt(j['home_score']),
        awayScore: _pInt(j['away_score']),
        homePenalty: _pInt(j['home_penalty']),
        awayPenalty: _pInt(j['away_penalty']),
        competition: HomeMatchCompetition.fromJson(
            (j['competition'] as Map?)?.cast<String, dynamic>() ?? const {}),
        homeTeam: j['home_team'] is Map
            ? HomeMatchTeam.fromJson(
                (j['home_team'] as Map).cast<String, dynamic>())
            : null,
        awayTeam: j['away_team'] is Map
            ? HomeMatchTeam.fromJson(
                (j['away_team'] as Map).cast<String, dynamic>())
            : null,
      );

  /// Adapt into the `Match` the shared MatchCard already renders. The list-only
  /// fields the card never reads (scorers, cards, squads) are left empty.
  Match toMatch() => Match(
        id: id,
        group: group,
        week: '',
        date: date,
        time: time,
        homeTeamId: homeTeam?.id ?? '',
        awayTeamId: awayTeam?.id ?? '',
        venue: venue,
        status: status,
        note: note,
        homeScore: homeScore,
        awayScore: awayScore,
        homePenalty: homePenalty,
        awayPenalty: awayPenalty,
        homeScorers: const [],
        awayScorers: const [],
        homeYc: const [],
        awayYc: const [],
        homeRc: const [],
        awayRc: const [],
        homeSub: const [],
        awaySub: const [],
        homeSquad: const [],
        awaySquad: const [],
        stage: '',
      );
}
