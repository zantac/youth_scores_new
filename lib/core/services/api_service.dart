import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb, defaultTargetPlatform;
import 'package:http/http.dart' as http;
import '../models/config_model.dart';
import '../models/competition_data_model.dart';
import '../models/home_match.dart';
import '../models/match_full.dart';
import '../models/profile_models.dart';
import '../models/search_results.dart';

class ApiService {
  static const _configUrl = 'https://www.youthscores.org/api/config';
  static const _timeout   = Duration(seconds: 30);

  // The API origin, derived from the config URL (strip the trailing /api/config).
  static final String _origin =
      _configUrl.replaceFirst(RegExp(r'/api/config/?$'), '');

  /// Absolute URL of a competition's data blob — used to open a competition by
  /// id (e.g. from a notification tap).
  static String competitionDataUrl(String id) =>
      '$_origin/api/competitions/$id/data';

  Future<ConfigData> fetchConfig() async {
    final cfg = await http.get(Uri.parse(_configUrl)).timeout(_timeout);
    if (cfg.statusCode != 200) {
      throw Exception('Config fetch failed: ${cfg.statusCode}');
    }
    final cfgJson   = json.decode(cfg.body) as Map<String, dynamic>;
    final dataUrl   = cfgJson['latestDataUrl'] as String?;
    if (dataUrl == null || dataUrl.isEmpty) {
      throw Exception('latestDataUrl missing in config');
    }
    final data = await http.get(Uri.parse(dataUrl)).timeout(_timeout);
    if (data.statusCode != 200) {
      throw Exception('Data fetch failed: ${data.statusCode}');
    }
    return ConfigData.fromJson(json.decode(data.body) as Map<String, dynamic>);
  }

  Future<CompetitionData> fetchCompetition(String url) async {
    final res = await http.get(Uri.parse(url)).timeout(_timeout);
    if (res.statusCode != 200) {
      throw Exception('Competition fetch failed: ${res.statusCode}');
    }
    return CompetitionData.fromJson(
      json.decode(res.body) as Map<String, dynamic>,
    );
  }

  /// Returns the raw JSON body string so callers can cache it without
  /// re-serialising the parsed model.
  Future<String> fetchCompetitionRaw(String url) async {
    final res = await http.get(Uri.parse(url)).timeout(_timeout);
    if (res.statusCode != 200) {
      throw Exception('Competition fetch failed: ${res.statusCode}');
    }
    return res.body;
  }

  /// The aggregate match feed the home screen groups by date then competition.
  /// `from`/`to` are inclusive YYYY-MM-DD bounds; `order` is asc|desc.
  Future<List<HomeMatch>> fetchAllMatches({
    String? from,
    String? to,
    String order = 'desc',
    int limit = 300,
  }) async {
    final qp = <String, String>{'order': order, 'limit': '$limit'};
    if (from != null) qp['from'] = from;
    if (to != null) qp['to'] = to;
    final uri = Uri.parse('$_origin/api/matches').replace(queryParameters: qp);
    final res = await http.get(uri).timeout(_timeout);
    if (res.statusCode != 200) {
      throw Exception('Matches fetch failed: ${res.statusCode}');
    }
    final j = json.decode(res.body) as Map<String, dynamic>;
    return (j['matches'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(HomeMatch.fromJson)
        .toList();
  }

  /// Best-effort, anonymous: tell the server this device followed/unfollowed a
  /// competition (`kind: 'comp'`) or team (`kind: 'team'`), for the admin's
  /// follower tally only. The FCM topic subscription is handled separately by the
  /// SDK; this call just counts. `deviceId` is an anonymous per-install id — never
  /// a push token, never personal data. Fire-and-forget: never throws.
  Future<void> reportFollow({
    required String deviceId,
    required String kind,
    required String id,
    required bool subscribe,
  }) async {
    try {
      await http.post(
        Uri.parse('$_origin/api/follows'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'device_id': deviceId,
          'kind': kind,
          'id': int.tryParse(id) ?? 0,
          'subscribe': subscribe,
        }),
      ).timeout(_timeout);
    } catch (_) {/* the tally is best-effort */}
  }

  // ── Public profiles (fetched by id, independent of the loaded competition) ──
  Future<Map<String, dynamic>> _getJson(String path) async {
    final res = await http.get(Uri.parse('$_origin$path')).timeout(_timeout);
    if (res.statusCode != 200) {
      throw Exception('Fetch failed ($path): ${res.statusCode}');
    }
    return json.decode(res.body) as Map<String, dynamic>;
  }

  /// A single match by id from `/api/matches/<id>` — carries goals, cards, subs
  /// and the line-up, and reflects live status independently of any competition.
  Future<MatchFull> fetchMatchFull(int id) async =>
      MatchFull.fromJson(await _getJson('/api/matches/$id'));

  Future<PlayerFull> fetchPlayer(int id) async =>
      PlayerFull.fromJson(await _getJson('/api/players/$id'));

  Future<CoachFull> fetchCoach(int id) async =>
      CoachFull.fromJson(await _getJson('/api/coaches/$id'));

  Future<ClubPublic> fetchClub(int id) async =>
      ClubPublic.fromJson(await _getJson('/api/clubs/$id'));

  /// A standalone team profile (`/api/teams/<id>`) — identity, club, age,
  /// seasons/competitions, staff and roster, independent of any competition.
  Future<TeamPublic> fetchTeam(int id) async =>
      TeamPublic.fromJson(await _getJson('/api/teams/$id'));

  // ── First-party ad analytics (fire-and-forget) ─────────────────────────────
  static String get _platform =>
      kIsWeb ? 'web' : defaultTargetPlatform.name.toLowerCase();

  Future<void> adImpression(int adId, {String? placement}) =>
      _adEvent(adId, 'impression', placement);
  Future<void> adClick(int adId, {String? placement}) =>
      _adEvent(adId, 'click', placement);

  Future<void> _adEvent(int adId, String kind, String? placement) async {
    if (adId <= 0) return;
    try {
      await http
          .post(
            Uri.parse('$_origin/api/ads/$adId/$kind'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({
              'platform': _platform,
              'placement': ?placement,
            }),
          )
          .timeout(const Duration(seconds: 8));
    } catch (_) {
      // Analytics must never disrupt the user — swallow all failures.
    }
  }

  /// The clubs directory (`/api/clubs`) — id, name, city and logo per club.
  Future<List<ClubListItem>> fetchClubs() async {
    final j = await _getJson('/api/clubs');
    return (j['clubs'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(ClubListItem.fromJson)
        .toList();
  }

  /// Global search over teams, players and coaches (`/api/search?q=`). Mirrors
  /// the website's search; returns empty for terms shorter than two chars.
  Future<SearchResults> fetchSearch(String q) async {
    final term = q.trim();
    if (term.length < 2) return SearchResults.empty;
    final uri = Uri.parse('$_origin/api/search')
        .replace(queryParameters: {'q': term});
    final res = await http.get(uri).timeout(_timeout);
    if (res.statusCode != 200) return SearchResults.empty;
    return SearchResults.fromJson(
      json.decode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>,
    );
  }
}
