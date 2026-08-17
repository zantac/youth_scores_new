import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/admin/match_entry.dart';
import '../models/admin/admin_data.dart';
import '../models/admin/structure_models.dart';

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

  /// Upload an image file; the server resizes it and returns a hosted URL.
  /// Mirrors apiUploadImage in the web client.
  Future<String> uploadImage(String token, String filePath, {String? filename}) async {
    final req = http.MultipartRequest('POST', Uri.parse('$_origin/api/admin/upload'));
    req.headers['Authorization'] = 'Bearer $token';
    req.files.add(await http.MultipartFile.fromPath('file', filePath, filename: filename));
    final res = await http.Response.fromStream(await req.send()).timeout(_timeout);
    final data = _parse(res);
    return data['url']?.toString() ?? '';
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

  // ── Dashboard ─────────────────────────────────────────────────────────────
  Future<AdminStats> stats(String token, {int? seasonId, int? competitionId}) async {
    final q = <String, String>{};
    if (seasonId != null) q['season_id'] = '$seasonId';
    if (competitionId != null) q['competition_id'] = '$competitionId';
    final qs = q.isEmpty
        ? ''
        : '?${q.entries.map((e) => '${e.key}=${e.value}').join('&')}';
    return AdminStats.fromJson(await _get(token, '/api/admin/stats$qs'));
  }

  // ── Players (merge) ─────────────────────────────────────────────────────────
  Future<List<PlayerSearchResult>> searchPlayers(String token, String q) async =>
      ((await _get(token,
                  '/api/admin/players/search?q=${Uri.encodeQueryComponent(q)}'))['players']
              as List? ??
          [])
          .whereType<Map>()
          .map((e) => PlayerSearchResult.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<PlayerMergeSummary> playerSummary(String token, int id) async =>
      PlayerMergeSummary.fromJson(await _get(token, '/api/admin/players/$id/summary'));

  Future<Map<String, dynamic>> mergePlayer(String token, int sourceId, int targetId) =>
      _send(token, 'POST', '/api/admin/players/$sourceId/merge-into/$targetId');

  // ── Coaches (merge) ─────────────────────────────────────────────────────────
  Future<List<CoachSearchResult>> searchCoaches(String token, String q) async =>
      ((await _get(token,
                  '/api/admin/coaches/search?q=${Uri.encodeQueryComponent(q)}'))['coaches']
              as List? ??
          [])
          .whereType<Map>()
          .map((e) => CoachSearchResult.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<CoachMergeSummary> coachSummary(String token, int id) async =>
      CoachMergeSummary.fromJson(await _get(token, '/api/admin/coaches/$id/summary'));

  Future<Map<String, dynamic>> mergeCoach(String token, int sourceId, int targetId) =>
      _send(token, 'POST', '/api/admin/coaches/$sourceId/merge-into/$targetId');

  // ── Users (superadmin) ──────────────────────────────────────────────────────
  Future<List<AdminUser>> users(String token) async =>
      ((await _get(token, '/api/admin/users'))['users'] as List? ?? [])
          .whereType<Map>()
          .map((e) => AdminUser.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<AdminUser> createUser(String token, Map<String, dynamic> body) async =>
      AdminUser.fromJson(
          (await _send(token, 'POST', '/api/admin/users', body))['user']
              as Map<String, dynamic>);

  Future<AdminUser> updateUser(String token, int id, Map<String, dynamic> body) async =>
      AdminUser.fromJson(
          (await _send(token, 'PATCH', '/api/admin/users/$id', body))['user']
              as Map<String, dynamic>);

  Future<void> deleteUser(String token, int id) =>
      _send(token, 'DELETE', '/api/admin/users/$id');

  // ── Content: news ───────────────────────────────────────────────────────────
  Future<List<AdminNews>> listNews(String token) async =>
      ((await _get(token, '/api/admin/news'))['news'] as List? ?? [])
          .whereType<Map>()
          .map((e) => AdminNews.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<Map<String, dynamic>> createNews(String token, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/news', body);

  Future<AdminNews> updateNews(String token, int id, Map<String, dynamic> body) async =>
      AdminNews.fromJson(
          (await _send(token, 'PATCH', '/api/admin/news/$id', body))['news']
              as Map<String, dynamic>);

  Future<void> deleteNews(String token, int id) =>
      _send(token, 'DELETE', '/api/admin/news/$id');

  // ── Content: venues ─────────────────────────────────────────────────────────
  Future<List<AdminVenue>> listVenues(String token) async =>
      ((await _get(token, '/api/admin/venues'))['venues'] as List? ?? [])
          .whereType<Map>()
          .map((e) => AdminVenue.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<Map<String, dynamic>> createVenue(String token, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/venues', body);

  Future<AdminVenue> updateVenue(String token, int id, Map<String, dynamic> body) async =>
      AdminVenue.fromJson(
          (await _send(token, 'PATCH', '/api/admin/venues/$id', body))['venue']
              as Map<String, dynamic>);

  Future<void> deleteVenue(String token, int id) =>
      _send(token, 'DELETE', '/api/admin/venues/$id');

  // ── Content: ads ────────────────────────────────────────────────────────────
  Future<List<AdminAd>> listAds(String token) async =>
      ((await _get(token, '/api/admin/ads'))['ads'] as List? ?? [])
          .whereType<Map>()
          .map((e) => AdminAd.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> createAd(String token, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/ads', body);

  Future<void> updateAd(String token, int id, Map<String, dynamic> body) =>
      _send(token, 'PATCH', '/api/admin/ads/$id', body);

  Future<void> deleteAd(String token, int id) =>
      _send(token, 'DELETE', '/api/admin/ads/$id');

  /// Ad analytics: per-ad impression/click totals + a 30-day daily series.
  Future<Map<String, dynamic>> adStats(String token) =>
      _get(token, '/api/admin/ads/stats');

  // ── Structure: seasons ──────────────────────────────────────────────────────
  Future<List<MSeason>> seasons(String token) async =>
      ((await _get(token, '/api/admin/seasons'))['seasons'] as List? ?? [])
          .whereType<Map>()
          .map((e) => MSeason.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> createSeason(String token, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/seasons', body);

  Future<void> updateSeason(String token, int id, Map<String, dynamic> body) =>
      _send(token, 'PATCH', '/api/admin/seasons/$id', body);

  Future<void> deleteSeason(String token, int id, String password) =>
      _send(token, 'DELETE', '/api/admin/seasons/$id', {'password': password});

  // ── Structure: age groups ───────────────────────────────────────────────────
  Future<List<MAge>> ageGroups(String token) async =>
      ((await _get(token, '/api/admin/age-groups'))['age_groups'] as List? ?? [])
          .whereType<Map>()
          .map((e) => MAge.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> createAge(String token, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/age-groups', body);

  Future<void> updateAge(String token, int id, Map<String, dynamic> body) =>
      _send(token, 'PATCH', '/api/admin/age-groups/$id', body);

  Future<void> deleteAge(String token, int id, String password) =>
      _send(token, 'DELETE', '/api/admin/age-groups/$id', {'password': password});

  // ── Structure: clubs ────────────────────────────────────────────────────────
  Future<List<MClub>> clubs(String token, [String q = '']) async =>
      ((await _get(token,
                  '/api/admin/clubs${q.isEmpty ? '' : '?q=${Uri.encodeQueryComponent(q)}'}'))['clubs']
              as List? ??
          [])
          .whereType<Map>()
          .map((e) => MClub.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> createClub(String token, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/clubs', body);

  Future<void> updateClub(String token, int id, Map<String, dynamic> body) =>
      _send(token, 'PATCH', '/api/admin/clubs/$id', body);

  Future<void> deleteClub(String token, int id, String password) =>
      _send(token, 'DELETE', '/api/admin/clubs/$id', {'password': password});

  // ── Structure: competitions ─────────────────────────────────────────────────
  Future<List<MComp>> compsManage(String token) async =>
      ((await _get(token, '/api/admin/competitions-manage'))['competitions']
              as List? ??
          [])
          .whereType<Map>()
          .map((e) => MComp.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> createComp(String token, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/competitions-manage', body);

  Future<void> updateComp(String token, int id, Map<String, dynamic> body) =>
      _send(token, 'PATCH', '/api/admin/competitions-manage/$id', body);

  Future<void> deleteComp(String token, int id, String password) =>
      _send(token, 'DELETE', '/api/admin/competitions-manage/$id', {'password': password});

  // ── Structure: teams (per competition enrolment) ────────────────────────────
  Future<List<MTeam>> compTeamsManage(String token, int cid) async =>
      ((await _get(token, '/api/admin/competitions/$cid/teams-manage'))['teams']
              as List? ??
          [])
          .whereType<Map>()
          .map((e) => MTeam.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> enrollTeam(String token, int cid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/competitions/$cid/teams-manage', body);

  Future<void> unenrollTeam(String token, int cid, int tid) =>
      _send(token, 'DELETE', '/api/admin/competitions/$cid/teams-manage/$tid');

  Future<void> updateTeam(String token, int id, Map<String, dynamic> body) =>
      _send(token, 'PATCH', '/api/admin/teams/$id', body);

  // ── Structure: delete preview ───────────────────────────────────────────────
  // kind: season | age-group | club | competition | team
  Future<DeletePreview> deletePreview(String token, String kind, int id) async =>
      DeletePreview.fromJson(await _get(token, '/api/admin/delete-preview/$kind/$id'));

  Future<void> deleteTeam(String token, int id, String password) =>
      _send(token, 'DELETE', '/api/admin/teams/$id', {'password': password});

  // ── Stages & groups ─────────────────────────────────────────────────────────
  Future<List<MStage>> stages(String token, int cid) async =>
      ((await _get(token, '/api/admin/competitions-manage/$cid/stages'))['stages']
              as List? ??
          [])
          .whereType<Map>()
          .map((e) => MStage.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> createStage(String token, int cid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/competitions-manage/$cid/stages', body);

  Future<void> updateStage(String token, int sid, Map<String, dynamic> body) =>
      _send(token, 'PATCH', '/api/admin/stages/$sid', body);

  Future<void> deleteStage(String token, int sid) =>
      _send(token, 'DELETE', '/api/admin/stages/$sid');

  Future<void> createGroup(String token, int sid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/stages/$sid/groups', body);

  Future<void> deleteGroup(String token, int gid) =>
      _send(token, 'DELETE', '/api/admin/groups/$gid');

  Future<List<MGroupTeam>> groupTeams(String token, int gid) async =>
      ((await _get(token, '/api/admin/groups/$gid/teams'))['teams'] as List? ?? [])
          .whereType<Map>()
          .map((e) => MGroupTeam.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> addGroupTeam(String token, int gid, int teamId) =>
      _send(token, 'POST', '/api/admin/groups/$gid/teams', {'team_id': teamId});

  Future<void> removeGroupTeam(String token, int groupTeamId) =>
      _send(token, 'DELETE', '/api/admin/group-teams/$groupTeamId');

  // ── Club staff (youth-sector managers) ──────────────────────────────────────
  Future<List<MClubStaff>> clubStaff(String token, int cid) async =>
      ((await _get(token, '/api/admin/clubs/$cid/staff'))['staff'] as List? ?? [])
          .whereType<Map>()
          .map((e) => MClubStaff.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> addClubStaff(String token, int cid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/clubs/$cid/staff', body);

  Future<void> attachClubStaff(String token, int cid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/clubs/$cid/staff/attach', body);

  Future<void> updateClubStaff(String token, int sid, Map<String, dynamic> body) =>
      _send(token, 'PATCH', '/api/admin/club-staff/$sid', body);

  Future<void> deleteClubStaff(String token, int sid) =>
      _send(token, 'DELETE', '/api/admin/club-staff/$sid');

  Future<void> reorderClubStaff(String token, int cid, List<int> ids) =>
      _send(token, 'POST', '/api/admin/clubs/$cid/staff/reorder', {'ids': ids});

  // ── Club squads (teams) ─────────────────────────────────────────────────────
  Future<List<MTeamFull>> clubTeams(String token, int cid) async =>
      ((await _get(token, '/api/admin/clubs/$cid/teams'))['teams'] as List? ?? [])
          .whereType<Map>()
          .map((e) => MTeamFull.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> createClubTeam(String token, int cid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/clubs/$cid/teams', body);

  // ── Team coaches ────────────────────────────────────────────────────────────
  Future<List<MTeamCoach>> teamCoaches(String token, int tid) async =>
      ((await _get(token, '/api/admin/teams/$tid/coaches'))['coaches'] as List? ?? [])
          .whereType<Map>()
          .map((e) => MTeamCoach.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> addTeamCoach(String token, int tid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/teams/$tid/coaches', body);

  Future<void> attachTeamCoach(String token, int tid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/teams/$tid/coaches/attach', body);

  Future<void> updateTeamCoach(String token, int id, Map<String, dynamic> body) =>
      _send(token, 'PATCH', '/api/admin/team-coaches/$id', body);

  Future<void> deleteTeamCoach(String token, int id) =>
      _send(token, 'DELETE', '/api/admin/team-coaches/$id');

  Future<void> reorderTeamCoaches(String token, int tid, List<int> ids) =>
      _send(token, 'POST', '/api/admin/teams/$tid/coaches/reorder', {'ids': ids});

  // ── Team roster (players) ───────────────────────────────────────────────────
  Future<List<MRegistration>> teamRoster(String token, int tid) async =>
      ((await _get(token, '/api/admin/teams/$tid/roster'))['roster'] as List? ?? [])
          .whereType<Map>()
          .map((e) => MRegistration.fromJson(e.cast<String, dynamic>()))
          .toList();

  Future<void> addTeamPlayer(String token, int tid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/teams/$tid/roster', body);

  Future<void> attachTeamPlayer(String token, int tid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/teams/$tid/roster/attach', body);

  Future<void> updateTeamPlayer(String token, int id, Map<String, dynamic> body) =>
      _send(token, 'PATCH', '/api/admin/player-teams/$id', body);

  Future<void> deleteTeamPlayer(String token, int id) =>
      _send(token, 'DELETE', '/api/admin/player-teams/$id');

  Future<void> transferPlayer(String token, int ptid, Map<String, dynamic> body) =>
      _send(token, 'POST', '/api/admin/player-teams/$ptid/transfer', body);

  // Global admin search — used to find a transfer destination team.
  Future<List<AdminSearchTeam>> searchTeams(String token, String q) async =>
      ((await _get(token, '/api/admin/search?q=${Uri.encodeQueryComponent(q)}'))['teams']
              as List? ??
          [])
          .whereType<Map>()
          .map((e) => AdminSearchTeam.fromJson(e.cast<String, dynamic>()))
          .toList();

  // Global admin search across clubs, teams, players and coaches.
  Future<AdminSearchResults> adminSearch(String token, String q) async =>
      AdminSearchResults.fromJson(
          await _get(token, '/api/admin/search?q=${Uri.encodeQueryComponent(q)}'));

  // Single-entity fetches, for opening a search result on its management screen.
  Future<MClub> club(String token, int id) async =>
      MClub.fromJson((await _get(token, '/api/admin/clubs/$id'))['club'] as Map<String, dynamic>);

  Future<MTeamFull> team(String token, int tid) async =>
      MTeamFull.fromJson((await _get(token, '/api/admin/teams/$tid'))['team'] as Map<String, dynamic>);
}
