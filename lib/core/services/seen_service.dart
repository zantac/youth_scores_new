import 'package:shared_preferences/shared_preferences.dart';

/// Mirrors the website's `web/src/lib/seen.ts`.
///
/// Two concerns, both persisted per-device in [SharedPreferences]:
///  * **Seen counts** — how many news / venue items arrived since the user last
///    opened each tab, so the bottom bar can badge them. The first run ever seeds
///    the baseline with everything currently present, so a badge only counts
///    items added *after* the user first opened the app — not the whole feed.
///  * **Read articles** — which individual news articles the user has opened, so
///    a card's "NEW" tag clears once read. Also baseline-seeded on first run so
///    it doesn't light up the entire back-catalogue.
class SeenService {
  SeenService._();
  static final SeenService instance = SeenService._();

  static const _kSeenNews   = 'seenNewsIds';
  static const _kSeenVenues = 'seenVenueIds';
  static const _kReadNews   = 'readNewsIds';

  String _seenKey(String section) =>
      section == 'news' ? _kSeenNews : _kSeenVenues;

  // ── Tab badges: unseen counts ───────────────────────────────────────────────

  /// How many of [ids] the user hasn't seen yet. On the very first run (no stored
  /// baseline) it records everything as seen and reports 0.
  Future<int> countUnseen(String section, List<String> ids) async {
    final prefs  = await SharedPreferences.getInstance();
    final stored = prefs.getStringList(_seenKey(section));
    if (stored == null) {
      await prefs.setStringList(_seenKey(section), ids);
      return 0;
    }
    final seen = stored.toSet();
    return ids.where((id) => !seen.contains(id)).length;
  }

  /// Mark every current item as seen — called when the user opens the page.
  /// Stores exactly the current snapshot, so the baseline stays bounded.
  Future<void> markSeen(String section, List<String> ids) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_seenKey(section), ids);
  }

  // ── Per-article read tracking: drives the "NEW" tag ─────────────────────────

  Future<Set<String>> getReadNews() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_kReadNews) ?? const <String>[]).toSet();
  }

  Future<void> markNewsRead(String id) async {
    final prefs = await SharedPreferences.getInstance();
    final ids   = prefs.getStringList(_kReadNews) ?? <String>[];
    if (ids.contains(id)) return;
    ids.add(id);
    await prefs.setStringList(_kReadNews, ids);
  }

  /// On the very first run (no stored read-set) treat the whole current feed as
  /// already read, so "NEW" only tags articles that arrive *after* this point
  /// rather than lighting up the entire back-catalogue. No-op once a set exists.
  Future<void> seedReadNewsIfFirstRun(List<String> ids) async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getStringList(_kReadNews) != null) return;
    await prefs.setStringList(_kReadNews, ids);
  }
}
