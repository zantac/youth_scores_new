import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/admin/match_entry.dart';

/// A logged-in admin user, as returned by `/api/auth/login` and `/api/auth/me`.
class AdminUser {
  final int id;
  final String username;
  final String? fullName;
  final String role; // superadmin | editor | clerk
  final bool isActive;

  const AdminUser({
    required this.id,
    required this.username,
    this.fullName,
    required this.role,
    required this.isActive,
  });

  bool get isSuperadmin => role == 'superadmin';
  bool get canEdit => role == 'superadmin' || role == 'editor';

  String roleLabel(bool isAr) {
    switch (role) {
      case 'superadmin':
        return isAr ? 'مدير عام' : 'Super Admin';
      case 'editor':
        return isAr ? 'محرّر' : 'Editor';
      case 'clerk':
        return isAr ? 'مُدخِل بيانات' : 'Data Entry';
      default:
        return role;
    }
  }

  factory AdminUser.fromJson(Map<String, dynamic> j) => AdminUser(
        id: (j['id'] as num?)?.toInt() ?? 0,
        username: j['username']?.toString() ?? '',
        fullName: j['full_name']?.toString(),
        role: j['role']?.toString() ?? 'clerk',
        isActive: j['is_active'] != false,
      );
}

/// Raised when the backend returns 401 — the session expired or is invalid.
class AdminSessionExpired implements Exception {}

/// Admin API client — talks to the Flask auth + admin endpoints with a bearer
/// token. Mirrors web/src/lib/adminApi.ts.
class AdminApi {
  static const _configUrl = 'https://www.youthscores.org/api/config';
  static const _timeout = Duration(seconds: 30);
  static final String _origin =
      _configUrl.replaceFirst(RegExp(r'/api/config/?$'), '');

  Map<String, String> _headers(String? token, {bool json = false}) => {
        if (json) 'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Map<String, dynamic> _parse(http.Response res) {
    if (res.statusCode == 401) throw AdminSessionExpired();
    final body = res.bodyBytes.isEmpty
        ? <String, dynamic>{}
        : json.decode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(body['error']?.toString() ?? 'خطأ (${res.statusCode})');
    }
    return body;
  }

  /// POST /api/auth/login → {token, user}. Throws with the server message on
  /// bad credentials.
  Future<({String token, AdminUser user})> login(
      String username, String password) async {
    final res = await http
        .post(
          Uri.parse('$_origin/api/auth/login'),
          headers: _headers(null, json: true),
          body: json.encode({'username': username, 'password': password}),
        )
        .timeout(_timeout);
    final data = _parse(res);
    return (
      token: data['token'].toString(),
      user: AdminUser.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  /// GET /api/auth/me → the current user, or null if the token is invalid.
  Future<AdminUser?> me(String token) async {
    try {
      final res = await http
          .get(Uri.parse('$_origin/api/auth/me'), headers: _headers(token))
          .timeout(_timeout);
      if (res.statusCode != 200) return null;
      final data = json.decode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      final u = data['user'];
      return u is Map<String, dynamic> ? AdminUser.fromJson(u) : null;
    } catch (_) {
      return null;
    }
  }

  // ── Generic authed helpers ────────────────────────────────────────────────
  Future<Map<String, dynamic>> _get(String token, String path) async {
    final res = await http
        .get(Uri.parse('$_origin$path'), headers: _headers(token))
        .timeout(_timeout);
    return _parse(res);
  }

  Future<Map<String, dynamic>> _send(
      String token, String method, String path,
      [Object? body]) async {
    final req = http.Request(method, Uri.parse('$_origin$path'));
    req.headers.addAll(_headers(token, json: body != null));
    if (body != null) req.body = json.encode(body);
    final res = await http.Response.fromStream(await req.send())
        .timeout(_timeout);
    return _parse(res);
  }

  // ── Match entry ───────────────────────────────────────────────────────────
  Future<List<EntryCompetition>> competitions(String token) async =>
      ((await _get(token, '/api/admin/competitions'))['competitions'] as List? ??
              [])
          .whereType<Map>()
          .map((e) => EntryCompetition.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<List<EntryTeam>> competitionTeams(String token, int cid) async =>
      ((await _get(token, '/api/admin/competitions/$cid/teams'))['teams']
                  as List? ??
              [])
          .whereType<Map>()
          .map((e) => EntryTeam.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<List<EntryMatchRow>> competitionMatches(String token, int cid) async =>
      ((await _get(token, '/api/admin/competitions/$cid/matches'))['matches']
                  as List? ??
              [])
          .whereType<Map>()
          .map((e) => EntryMatchRow.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<List<String>> teamPlayers(String token, int teamId) async =>
      ((await _get(token, '/api/admin/teams/$teamId/players'))['players']
                  as List? ??
              [])
          .map((e) => e.toString())
          .toList();

  Future<List<String>> matchVenues(String token, int cid) async =>
      ((await _get(token, '/api/admin/competitions/$cid/match-venues'))['venues']
                  as List? ??
              [])
          .map((e) => e.toString())
          .toList();

  Future<EntryMatch> getMatch(String token, int mid) async =>
      EntryMatch.fromJson(await _get(token, '/api/admin/matches/$mid'));

  Future<EntryMatch> createMatch(
          String token, int cid, Map<String, dynamic> body) async =>
      EntryMatch.fromJson(
          await _send(token, 'POST', '/api/admin/competitions/$cid/matches', body));

  Future<EntryMatch> updateMatch(
          String token, int mid, Map<String, dynamic> body) async =>
      EntryMatch.fromJson(
          await _send(token, 'PATCH', '/api/admin/matches/$mid', body));

  Future<void> deleteMatch(String token, int mid) =>
      _send(token, 'DELETE', '/api/admin/matches/$mid');

  Future<EntryMatch> restoreMatch(String token, int mid) async =>
      EntryMatch.fromJson(
          await _send(token, 'POST', '/api/admin/matches/$mid/restore'));

  Future<Map<String, dynamic>> notifyRound(String token, int cid, String week) =>
      _send(token, 'POST', '/api/admin/competitions/$cid/notify-round',
          {'week': week});

  // Goals / cards / subs / shootout / lineup — each returns the full match.
  Future<EntryMatch> addGoal(String token, int mid, Map<String, dynamic> b) async =>
      EntryMatch.fromJson(await _send(token, 'POST', '/api/admin/matches/$mid/goals', b));
  Future<EntryMatch> updateGoal(String token, int gid, Map<String, dynamic> b) async =>
      EntryMatch.fromJson(await _send(token, 'PATCH', '/api/admin/goals/$gid', b));
  Future<EntryMatch> deleteGoal(String token, int gid) async =>
      EntryMatch.fromJson(await _send(token, 'DELETE', '/api/admin/goals/$gid'));

  Future<EntryMatch> addCard(String token, int mid, Map<String, dynamic> b) async =>
      EntryMatch.fromJson(await _send(token, 'POST', '/api/admin/matches/$mid/cards', b));
  Future<EntryMatch> updateCard(String token, int cid, Map<String, dynamic> b) async =>
      EntryMatch.fromJson(await _send(token, 'PATCH', '/api/admin/cards/$cid', b));
  Future<EntryMatch> deleteCard(String token, int cid) async =>
      EntryMatch.fromJson(await _send(token, 'DELETE', '/api/admin/cards/$cid'));

  Future<EntryMatch> addSub(String token, int mid, Map<String, dynamic> b) async =>
      EntryMatch.fromJson(await _send(token, 'POST', '/api/admin/matches/$mid/subs', b));
  Future<EntryMatch> updateSub(String token, int sid, Map<String, dynamic> b) async =>
      EntryMatch.fromJson(await _send(token, 'PATCH', '/api/admin/subs/$sid', b));
  Future<EntryMatch> deleteSub(String token, int sid) async =>
      EntryMatch.fromJson(await _send(token, 'DELETE', '/api/admin/subs/$sid'));

  Future<EntryMatch> addShootoutKick(String token, int mid, Map<String, dynamic> b) async =>
      EntryMatch.fromJson(await _send(token, 'POST', '/api/admin/matches/$mid/shootout', b));
  Future<EntryMatch> updateShootoutKick(String token, int kid, Map<String, dynamic> b) async =>
      EntryMatch.fromJson(await _send(token, 'PATCH', '/api/admin/shootout/$kid', b));
  Future<EntryMatch> deleteShootoutKick(String token, int kid) async =>
      EntryMatch.fromJson(await _send(token, 'DELETE', '/api/admin/shootout/$kid'));

  Future<EntryMatch> setLineup(String token, int mid, int teamId,
          List<String> starters, List<String> bench) async =>
      EntryMatch.fromJson(await _send(token, 'PUT', '/api/admin/matches/$mid/lineup',
          {'team_id': teamId, 'starters': starters, 'bench': bench}));
}
