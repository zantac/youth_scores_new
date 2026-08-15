import 'dart:convert';
import 'package:http/http.dart' as http;

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
}
