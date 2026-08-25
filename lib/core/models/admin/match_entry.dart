import '../competition_data_model.dart' show localizedMap, localizedMapOrNull, pickLocale;

// Match-entry models mirroring web/src/lib/adminApi.ts (Entry* types). Localized
// names are kept as maps and localized with pickLocale.

String? _s(dynamic v) {
  final s = v?.toString();
  return (s == null || s.isEmpty) ? null : s;
}

int? _i(dynamic v) => v == null ? null : (v as num?)?.toInt();

class EntryCompetition {
  final int id;
  final Map<String, String> name;
  final String age;
  final Map<String, String>? sector;
  final String season;
  const EntryCompetition(
      {required this.id,
      required this.name,
      required this.age,
      this.sector,
      required this.season});

  String getName(String l) => pickLocale(name, l);
  String getSector(String l) => pickLocale(sector, l);

  factory EntryCompetition.fromJson(Map<String, dynamic> j) => EntryCompetition(
        id: _i(j['id']) ?? 0,
        name: localizedMap(j['name']),
        age: j['age']?.toString() ?? '',
        sector: localizedMapOrNull(j['sector']),
        season: j['season']?.toString() ?? '',
      );
}

// The club's own name with its competition alternative name appended, the way
// the public view shows it (club = identity, alias alongside). `name` already
// falls back to the club name, so with no alternative only the club name shows.
String _teamLabel(String name, Map<String, String>? club, String l) {
  final c = club == null ? '' : pickLocale(club, l);
  return (c.isNotEmpty && c != name) ? '$c — $name' : name;
}

class EntryTeam {
  final int id;
  final Map<String, String> name;
  final Map<String, String>? clubName;
  final String? logo;
  const EntryTeam({required this.id, required this.name, this.clubName, this.logo});

  String getName(String l) => pickLocale(name, l);
  String label(String l) => _teamLabel(pickLocale(name, l), clubName, l);

  factory EntryTeam.fromJson(Map<String, dynamic> j) => EntryTeam(
        id: _i(j['id']) ?? 0,
        name: localizedMap(j['name']),
        clubName: localizedMapOrNull(j['club_name']),
        logo: _s(j['logo']),
      );
}

class EntryTeamRef {
  final int id;
  final Map<String, String> name;
  final Map<String, String>? clubName;
  const EntryTeamRef({required this.id, required this.name, this.clubName});
  String getName(String l) => pickLocale(name, l);
  String label(String l) => _teamLabel(pickLocale(name, l), clubName, l);
  factory EntryTeamRef.fromJson(Map<String, dynamic> j) =>
      EntryTeamRef(id: _i(j['id']) ?? 0, name: localizedMap(j['name']),
          clubName: localizedMapOrNull(j['club_name']));
}

class EntryMatchRow {
  final int id;
  final String date;
  final String time;
  final String week;
  final String status;
  final EntryTeamRef home;
  final EntryTeamRef away;
  final int? homeScore;
  final int? awayScore;
  final int? stageId;
  final int? groupId;
  final String? stageName;
  final String? groupName;
  final String? deletedAt;

  const EntryMatchRow({
    required this.id,
    required this.date,
    required this.time,
    required this.week,
    required this.status,
    required this.home,
    required this.away,
    this.homeScore,
    this.awayScore,
    this.stageId,
    this.groupId,
    this.stageName,
    this.groupName,
    this.deletedAt,
  });

  bool get isDeleted => deletedAt != null && deletedAt!.isNotEmpty;
  bool get hasScore => homeScore != null && awayScore != null;

  factory EntryMatchRow.fromJson(Map<String, dynamic> j) => EntryMatchRow(
        id: _i(j['id']) ?? 0,
        date: j['date']?.toString() ?? '',
        time: j['time']?.toString() ?? '',
        week: j['week']?.toString() ?? '',
        status: j['status']?.toString() ?? 'scheduled',
        home: EntryTeamRef.fromJson(
            (j['home'] as Map?)?.cast<String, dynamic>() ?? const {}),
        away: EntryTeamRef.fromJson(
            (j['away'] as Map?)?.cast<String, dynamic>() ?? const {}),
        homeScore: _i(j['home_score']),
        awayScore: _i(j['away_score']),
        stageId: _i(j['stage_id']),
        groupId: _i(j['group_id']),
        stageName: _s(j['stage_name']),
        groupName: _s(j['group_name']),
        deletedAt: _s(j['deleted_at']),
      );
}

class EntryGoal {
  final int id;
  final int teamId;
  final String side; // 'home' | 'away'
  final String scorer;
  final String? assist;
  final int? minute;
  final bool isOwnGoal;
  final bool isPenalty;
  const EntryGoal({
    required this.id,
    required this.teamId,
    required this.side,
    required this.scorer,
    this.assist,
    this.minute,
    this.isOwnGoal = false,
    this.isPenalty = false,
  });

  factory EntryGoal.fromJson(Map<String, dynamic> j) => EntryGoal(
        id: _i(j['id']) ?? 0,
        teamId: _i(j['team_id']) ?? 0,
        side: j['side']?.toString() ?? 'home',
        scorer: j['scorer']?.toString() ?? '',
        assist: _s(j['assist']),
        minute: _i(j['minute']),
        isOwnGoal: j['is_own_goal'] == true,
        isPenalty: j['is_penalty'] == true,
      );
}

class EntryCard {
  final int id;
  final int teamId;
  final String side;
  final String player;
  final String cardType; // 'yellow' | 'second_yellow' | 'red'
  final int? minute;
  const EntryCard({
    required this.id,
    required this.teamId,
    required this.side,
    required this.player,
    required this.cardType,
    this.minute,
  });

  factory EntryCard.fromJson(Map<String, dynamic> j) => EntryCard(
        id: _i(j['id']) ?? 0,
        teamId: _i(j['team_id']) ?? 0,
        side: j['side']?.toString() ?? 'home',
        player: j['player']?.toString() ?? '',
        cardType: j['card_type']?.toString() ?? 'yellow',
        minute: _i(j['minute']),
      );
}

class EntrySub {
  final int id;
  final int teamId;
  final String side;
  final String playerOut;
  final String playerIn;
  final int? minute;
  const EntrySub({
    required this.id,
    required this.teamId,
    required this.side,
    required this.playerOut,
    required this.playerIn,
    this.minute,
  });

  factory EntrySub.fromJson(Map<String, dynamic> j) => EntrySub(
        id: _i(j['id']) ?? 0,
        teamId: _i(j['team_id']) ?? 0,
        side: j['side']?.toString() ?? 'home',
        playerOut: j['player_out']?.toString() ?? '',
        playerIn: j['player_in']?.toString() ?? '',
        minute: _i(j['minute']),
      );
}

class EntryShootoutKick {
  final int id;
  final int teamId;
  final String side;
  final String player;
  final int kickOrder;
  final String result; // 'scored' | 'missed'
  final bool isWinningKick;
  const EntryShootoutKick({
    required this.id,
    required this.teamId,
    required this.side,
    required this.player,
    required this.kickOrder,
    required this.result,
    this.isWinningKick = false,
  });

  factory EntryShootoutKick.fromJson(Map<String, dynamic> j) =>
      EntryShootoutKick(
        id: _i(j['id']) ?? 0,
        teamId: _i(j['team_id']) ?? 0,
        side: j['side']?.toString() ?? 'home',
        player: j['player']?.toString() ?? '',
        kickOrder: _i(j['kick_order']) ?? 0,
        result: j['result']?.toString() ?? 'scored',
        isWinningKick: j['is_winning_kick'] == true,
      );
}

class EntrySide {
  final int teamId;
  final List<String> starters;
  final List<String> subs;
  // Called up but not yet assigned a starter/sub role.
  final List<String> called;
  const EntrySide(
      {required this.teamId,
      this.starters = const [],
      this.subs = const [],
      this.called = const []});

  /// Everyone in the called squad, across all three roles.
  List<String> get all => [...starters, ...subs, ...called];

  factory EntrySide.fromJson(Map<String, dynamic> j) {
    List<String> list(dynamic v) =>
        (v as List? ?? []).map((e) => e.toString()).toList();
    return EntrySide(
      teamId: _i(j['team_id']) ?? 0,
      starters: list(j['starters']),
      // 'bench' kept as a fallback for any old payload.
      subs: list(j['subs'] ?? j['bench']),
      called: list(j['called']),
    );
  }
}

/// A full match with all its detail, from `/api/admin/matches/<id>`.
class EntryMatch {
  final EntryMatchRow row;
  final int? homePenaltyScore;
  final int? awayPenaltyScore;
  final String venue;
  final String round;
  final String note;
  final List<EntryGoal> goals;
  final List<EntryCard> cards;
  final List<EntrySub> subs;
  final List<EntryShootoutKick> shootout;
  final EntrySide lineupHome;
  final EntrySide lineupAway;

  const EntryMatch({
    required this.row,
    this.homePenaltyScore,
    this.awayPenaltyScore,
    this.venue = '',
    this.round = '',
    this.note = '',
    this.goals = const [],
    this.cards = const [],
    this.subs = const [],
    this.shootout = const [],
    required this.lineupHome,
    required this.lineupAway,
  });

  int get id => row.id;

  factory EntryMatch.fromJson(Map<String, dynamic> j) {
    final lineup = (j['lineup'] as Map?)?.cast<String, dynamic>() ?? const {};
    List<T> list<T>(String key, T Function(Map<String, dynamic>) f) =>
        (j[key] as List? ?? [])
            .whereType<Map>()
            .map((e) => f(e.cast<String, dynamic>()))
            .toList();
    return EntryMatch(
      row: EntryMatchRow.fromJson(j),
      homePenaltyScore: _i(j['home_penalty_score']),
      awayPenaltyScore: _i(j['away_penalty_score']),
      venue: j['venue']?.toString() ?? '',
      round: j['round']?.toString() ?? '',
      note: j['note']?.toString() ?? '',
      goals: list('goals', EntryGoal.fromJson),
      cards: list('cards', EntryCard.fromJson),
      subs: list('subs', EntrySub.fromJson),
      shootout: list('shootout', EntryShootoutKick.fromJson),
      lineupHome: EntrySide.fromJson(
          (lineup['home'] as Map?)?.cast<String, dynamic>() ?? const {}),
      lineupAway: EntrySide.fromJson(
          (lineup['away'] as Map?)?.cast<String, dynamic>() ?? const {}),
    );
  }
}

/// The match statuses the backend accepts, with Arabic/English labels.
class MatchStatus {
  final String value;
  final String ar;
  final String en;
  const MatchStatus(this.value, this.ar, this.en);

  static const all = [
    MatchStatus('scheduled', 'مجدولة', 'Scheduled'),
    MatchStatus('live', 'مباشرة', 'Live'),
    MatchStatus('completed', 'انتهت', 'Completed'),
    MatchStatus('postponed', 'مؤجلة', 'Postponed'),
    MatchStatus('cancelled', 'ملغاة', 'Cancelled'),
  ];

  static String label(String value, bool isAr) {
    final s = all.where((e) => e.value == value);
    if (s.isEmpty) return value;
    return isAr ? s.first.ar : s.first.en;
  }
}
