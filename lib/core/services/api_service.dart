import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/config_model.dart';
import '../models/competition_data_model.dart';
import '../models/home_match.dart';
import '../models/match_full.dart';
import '../models/profile_models.dart';

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
}
