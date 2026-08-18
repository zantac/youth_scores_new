import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/admin_api.dart';

/// Holds the admin session (bearer token + user). The token is persisted in the
/// platform keystore via flutter_secure_storage (Android Keystore / iOS
/// Keychain) so it is never in plaintext prefs or device backups — validated
/// against /me on startup and cleared on expiry. Mirrors the website's
/// AdminAuthContext (which uses sessionStorage; on mobile we favour staying
/// logged in for on-the-go data entry).
class AdminAuth extends ChangeNotifier {
  static const _tokenKey = 'ys_admin_token';

  // Keystore-backed on Android / Keychain on iOS (secure defaults in v11).
  final FlutterSecureStorage _secure = const FlutterSecureStorage();

  final AdminApi _api = AdminApi();

  String? _token;
  AdminUser? _user;
  bool _loading = true; // true until the saved token is restored/validated

  String? get token => _token;
  AdminUser? get user => _user;
  bool get loading => _loading;
  bool get isLoggedIn => _token != null && _user != null;

  AdminApi get api => _api;

  /// Read the token from secure storage, migrating a legacy plaintext-prefs
  /// token (written before this was hardened) on the first launch after upgrade.
  Future<String?> _readToken() async {
    final secure = await _secure.read(key: _tokenKey);
    if (secure != null && secure.isNotEmpty) return secure;
    final prefs = await SharedPreferences.getInstance();
    final legacy = prefs.getString(_tokenKey);
    if (legacy != null && legacy.isNotEmpty) {
      await _secure.write(key: _tokenKey, value: legacy);
      await prefs.remove(_tokenKey); // don't leave it in plaintext
      return legacy;
    }
    return null;
  }

  /// Restore a saved token and validate it. Safe to call once at startup.
  Future<void> restore() async {
    final saved = await _readToken();
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
      await _secure.delete(key: _tokenKey);
    }
    _loading = false;
    notifyListeners();
  }

  /// Log in with credentials; throws on failure (caller shows the message).
  Future<void> login(String username, String password) async {
    final res = await _api.login(username, password);
    _token = res.token;
    _user = res.user;
    await _secure.write(key: _tokenKey, value: res.token);
    notifyListeners();
  }

  Future<void> logout() async {
    _token = null;
    _user = null;
    await _secure.delete(key: _tokenKey);
    notifyListeners();
  }

  /// Called when an admin API call returns 401 mid-session.
  Future<void> sessionExpired() => logout();
}
