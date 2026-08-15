import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/admin_api.dart';

/// Holds the admin session (bearer token + user). The token is persisted in
/// SharedPreferences so an admin stays logged in between launches — validated
/// against /me on startup and cleared on expiry. Mirrors the website's
/// AdminAuthContext (which uses sessionStorage; on mobile we favour staying
/// logged in for on-the-go data entry).
class AdminAuth extends ChangeNotifier {
  static const _tokenKey = 'ys_admin_token';

  final AdminApi _api = AdminApi();

  String? _token;
  AdminUser? _user;
  bool _loading = true; // true until the saved token is restored/validated

  String? get token => _token;
  AdminUser? get user => _user;
  bool get loading => _loading;
  bool get isLoggedIn => _token != null && _user != null;

  AdminApi get api => _api;

  /// Restore a saved token and validate it. Safe to call once at startup.
  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_tokenKey);
    if (saved == null || saved.isEmpty) {
      _loading = false;
      notifyListeners();
      return;
    }
    _token = saved;
    final u = await _api.me(saved);
    if (u != null) {
      _user = u;
    } else {
      _token = null;
      await prefs.remove(_tokenKey);
    }
    _loading = false;
    notifyListeners();
  }

  /// Log in with credentials; throws on failure (caller shows the message).
  Future<void> login(String username, String password) async {
    final res = await _api.login(username, password);
    _token = res.token;
    _user = res.user;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, res.token);
    notifyListeners();
  }

  Future<void> logout() async {
    _token = null;
    _user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    notifyListeners();
  }

  /// Called when an admin API call returns 401 mid-session.
  Future<void> sessionExpired() => logout();
}
