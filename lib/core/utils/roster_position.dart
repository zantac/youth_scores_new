// Position grouping for a team roster, mirroring the website's
// `groupRosterByPosition`: sections ordered keeper → attack, each sorted by
// name, empty groups dropped, unknowns collected under "Other".

class PositionGroup {
  final String key;
  final String emoji;
  final String ar;
  final String en;
  final String matchAr; // the position label a player carries in the feed
  final String matchEn;
  const PositionGroup({
    required this.key,
    required this.emoji,
    required this.ar,
    required this.en,
    required this.matchAr,
    required this.matchEn,
  });
}

const positionGroups = <PositionGroup>[
  PositionGroup(key: 'gk',  emoji: '🧤', ar: 'حراس المرمي', en: 'Goalkeepers', matchAr: 'حارس مرمي', matchEn: 'goalkeeper'),
  PositionGroup(key: 'def', emoji: '🛡️', ar: 'المدافعون',   en: 'Defenders',   matchAr: 'مدافع',      matchEn: 'defender'),
  PositionGroup(key: 'mid', emoji: '⚡', ar: 'لاعبو الوسط', en: 'Midfielders', matchAr: 'لاعب وسط',   matchEn: 'midfielder'),
  PositionGroup(key: 'fwd', emoji: '⚽', ar: 'المهاجمون',   en: 'Forwards',    matchAr: 'مهاجم',       matchEn: 'forward'),
];

String _normArabic(String? s) => (s ?? '').trim().replaceAll('ى', 'ي');

/// The position group a player belongs to, or 'other' when unrecognised/empty.
String positionGroupKey(Map<String, String>? position) {
  final ar = _normArabic(position?['ar']);
  final en = (position?['en'] ?? '').trim().toLowerCase();
  for (final g in positionGroups) {
    if ((ar.isNotEmpty && ar == g.matchAr) || (en.isNotEmpty && en == g.matchEn)) {
      return g.key;
    }
  }
  return 'other';
}

class RosterSection<T> {
  final String emoji;
  final String label;
  final List<T> players;
  const RosterSection(this.emoji, this.label, this.players);
}

/// Split a roster into position sections (keeper → attack), each sorted by name,
/// dropping empty groups. `position`/`name` extract the fields from any T.
List<RosterSection<T>> groupRosterByPosition<T>(
  List<T> roster,
  String locale, {
  required Map<String, String>? Function(T) position,
  required String Function(T) name,
}) {
  final isAr = locale == 'ar';
  final buckets = <String, List<T>>{};
  for (final p in roster) {
    (buckets[positionGroupKey(position(p))] ??= []).add(p);
  }
  int byName(T a, T b) => name(a).compareTo(name(b));
  final ordered = <RosterSection<T>>[
    for (final g in positionGroups)
      RosterSection<T>(g.emoji, isAr ? g.ar : g.en, buckets[g.key] ?? const []),
    RosterSection<T>('👤', isAr ? 'أخرى' : 'Other', buckets['other'] ?? const []),
  ];
  return ordered
      .where((s) => s.players.isNotEmpty)
      .map((s) => RosterSection<T>(s.emoji, s.label, [...s.players]..sort(byName)))
      .toList();
}
