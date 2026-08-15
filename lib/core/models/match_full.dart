import 'competition_data_model.dart' show localizedMap, localizedMapOrNull, pickLocale;

int? _pi(dynamic v) {
  if (v is int) return v;
  if (v == null) return null;
  return int.tryParse(v.toString());
}

String _ps(dynamic v) => v?.toString() ?? '';

List<String> _pl(dynamic v) => v is List
    ? v.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty).toList()
    : const [];

String? _pStrOrNull(dynamic v) {
  final s = v?.toString() ?? '';
  return s.isEmpty ? null : s;
}

/// One team on the match-detail page. Mirrors the web `MatchFull` `home`/`away`.
class MatchSide {
  final int? id;
  final Map<String, String> name;
  final String? logo;
  const MatchSide({this.id, required this.name, this.logo});

  factory MatchSide.fromJson(Map<String, dynamic> j) => MatchSide(
        id: _pi(j['id']),
        name: localizedMap(j['name']),
        logo: _pStrOrNull(j['logo']),
      );

  String getName(String locale) => pickLocale(name, locale);
}

class MatchGoal {
  final String side; // home | away
  final String scorer;
  final int? scorerId;
  final String? assist;
  final int? minute;
  final bool isPenalty;
  final bool isOwnGoal;
  const MatchGoal({
    required this.side,
    required this.scorer,
    this.scorerId,
    this.assist,
    this.minute,
    this.isPenalty = false,
    this.isOwnGoal = false,
  });

  factory MatchGoal.fromJson(Map<String, dynamic> j) => MatchGoal(
        side: _ps(j['side']),
        scorer: _ps(j['scorer']),
        scorerId: _pi(j['scorer_id']),
        assist: _pStrOrNull(j['assist']),
        minute: _pi(j['minute']),
        isPenalty: j['is_penalty'] == true,
        isOwnGoal: j['is_own_goal'] == true,
      );
}

class MatchCardEvent {
  final String side;
  final String player;
  final String type; // yellow | second_yellow | red
  final int? minute;
  const MatchCardEvent({
    required this.side,
    required this.player,
    required this.type,
    this.minute,
  });

  factory MatchCardEvent.fromJson(Map<String, dynamic> j) => MatchCardEvent(
        side: _ps(j['side']),
        player: _ps(j['player']),
        type: _ps(j['type']),
        minute: _pi(j['minute']),
      );
}

class MatchSubEvent {
  final String side;
  final String playerIn;
  final String playerOut;
  final int? minute;
  const MatchSubEvent({
    required this.side,
    required this.playerIn,
    required this.playerOut,
    this.minute,
  });

  factory MatchSubEvent.fromJson(Map<String, dynamic> j) => MatchSubEvent(
        side: _ps(j['side']),
        playerIn: _ps(j['in']),
        playerOut: _ps(j['out']),
        minute: _pi(j['minute']),
      );
}

class LineupSide {
  final List<String> starters;
  final List<String> bench;
  const LineupSide({this.starters = const [], this.bench = const []});

  factory LineupSide.fromJson(Map<String, dynamic> j) => LineupSide(
        starters: _pl(j['starters']),
        bench: _pl(j['bench']),
      );

  bool get isEmpty => starters.isEmpty && bench.isEmpty;
}

/// The full single-match payload from `/api/matches/<id>` — the shape the match
/// detail page renders. Mirrors the web `MatchFull`.
class MatchFull {
  final int id;
  final int? compId;
  final Map<String, String>? compName;
  final Map<String, String>? compAge;
  final String date;
  final String time;
  final String week;
  final String venue;
  final String note;
  final String status;
  final MatchSide home;
  final MatchSide away;
  final int? homeScore;
  final int? awayScore;
  final int? homePenalty;
  final int? awayPenalty;
  final List<MatchGoal> goals;
  final List<MatchCardEvent> cards;
  final List<MatchSubEvent> subs;
  final LineupSide lineupHome;
  final LineupSide lineupAway;

  const MatchFull({
    required this.id,
    this.compId,
    this.compName,
    this.compAge,
    required this.date,
    required this.time,
    required this.week,
    required this.venue,
    required this.note,
    required this.status,
    required this.home,
    required this.away,
    this.homeScore,
    this.awayScore,
    this.homePenalty,
    this.awayPenalty,
    this.goals = const [],
    this.cards = const [],
    this.subs = const [],
    this.lineupHome = const LineupSide(),
    this.lineupAway = const LineupSide(),
  });

  bool get isLive => status.toLowerCase() == 'live';
  bool get isCompleted => status.toLowerCase() == 'completed';
  bool get isPostponed => status.toLowerCase() == 'postponed';
  bool get isCancelled => status.toLowerCase() == 'cancelled';
  bool get hasScore => homeScore != null && awayScore != null;
  bool get hasLineup => !lineupHome.isEmpty || !lineupAway.isEmpty;
  bool get hasEvents => goals.isNotEmpty || cards.isNotEmpty || subs.isNotEmpty;

  factory MatchFull.fromJson(Map<String, dynamic> j) {
    final comp = (j['competition'] as Map?)?.cast<String, dynamic>();
    final lineup = (j['lineup'] as Map?)?.cast<String, dynamic>() ?? const {};
    Map<String, dynamic> side(String k) =>
        (j[k] as Map?)?.cast<String, dynamic>() ?? const {};
    List<T> list<T>(String k, T Function(Map<String, dynamic>) f) =>
        (j[k] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(f)
            .toList();
    LineupSide lu(String k) =>
        LineupSide.fromJson((lineup[k] as Map?)?.cast<String, dynamic>() ?? const {});

    return MatchFull(
      id: _pi(j['id']) ?? 0,
      compId: comp != null ? _pi(comp['id']) : null,
      compName: comp != null ? localizedMapOrNull(comp['name']) : null,
      compAge: comp != null ? localizedMapOrNull(comp['age']) : null,
      date: _ps(j['date']),
      time: _ps(j['time']),
      week: _ps(j['week']),
      venue: _ps(j['venue']),
      note: _ps(j['note']),
      status: _ps(j['status']),
      home: MatchSide.fromJson(side('home')),
      away: MatchSide.fromJson(side('away')),
      homeScore: _pi(j['home_score']),
      awayScore: _pi(j['away_score']),
      homePenalty: _pi(j['home_penalty']),
      awayPenalty: _pi(j['away_penalty']),
      goals: list('goals', MatchGoal.fromJson),
      cards: list('cards', MatchCardEvent.fromJson),
      subs: list('subs', MatchSubEvent.fromJson),
      lineupHome: lu('home'),
      lineupAway: lu('away'),
    );
  }
}
