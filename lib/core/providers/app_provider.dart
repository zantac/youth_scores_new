import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/app_colors.dart';
import '../models/config_model.dart';
import '../models/competition_data_model.dart';
import '../models/follows.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';
import '../services/review_service.dart';
import '../services/seen_service.dart';

class AppProvider extends ChangeNotifier with WidgetsBindingObserver {
  final _api = ApiService();

  // ── Locale ──────────────────────────────────────────────────────────────────
  String _locale = 'ar';
  String get locale => _locale;
  bool   get isAr  => _locale == 'ar';

  // ── Theme ────────────────────────────────────────────────────────────────────
  bool _isDark = true;
  bool get isDark => _isDark;

  // ── Update ───────────────────────────────────────────────────────────────────
  int    _appBuildNumber = 0;
  bool   _needsUpdate    = false;
  bool   get needsUpdate => _needsUpdate;
  bool   get forceUpdate => _needsUpdate && (_config?.appVersion?.forceUpdate ?? false);

  // Anonymous, per-install id so the admin can count how many devices follow
  // each competition/team. Not an FCM token; carries no personal data. Reported
  // to /api/follows on every follow change and re-asserted on startup.
  static const _kDeviceId = 'deviceId';
  String _deviceId = '';

  Future<void> init() async {
    // Observe app lifecycle so news/venues (the config feed) refresh on resume.
    WidgetsBinding.instance.addObserver(this);
    // Count this cold start so the Play in-app review prompt only appears once
    // the user is genuinely engaged (see ReviewService).
    ReviewService.instance.registerAppOpen();
    final prefs = await SharedPreferences.getInstance();
    _locale = prefs.getString('locale') ?? 'ar';
    _isDark = prefs.getBool('isDark') ?? true;
    AppColors.setTheme(_isDark);
    _deviceId = await _ensureDeviceId(prefs);
    _loadFollows(prefs);
    final info = await PackageInfo.fromPlatform();
    _appBuildNumber = int.tryParse(info.buildNumber) ?? 0;
    notifyListeners();
  }

  // ── Follows (favorite competitions + teams) ───────────────────────────────────
  // Local-only for now (device favorites); push notifications can layer on later.
  static const _kFollowComps = 'followedComps';
  static const _kFollowTeams = 'followedTeams';

  List<FollowedComp> _followedComps = [];
  List<FollowedTeam> _followedTeams = [];

  List<FollowedComp> get followedComps => List.unmodifiable(_followedComps);
  List<FollowedTeam> get followedTeams => List.unmodifiable(_followedTeams);

  bool isFollowingComp(String id) => _followedComps.any((c) => c.id == id);
  bool isFollowingTeam(String id) => _followedTeams.any((t) => t.id == id);

  void _loadFollows(SharedPreferences prefs) {
    _followedComps = _decode(prefs.getString(_kFollowComps), FollowedComp.fromJson);
    _followedTeams = _decode(prefs.getString(_kFollowTeams), FollowedTeam.fromJson);
  }

  /// The device's anonymous install id, generated once and persisted. Prefix
  /// 'a-' marks an app-origin id; kept well under the server's 64-char cap.
  Future<String> _ensureDeviceId(SharedPreferences prefs) async {
    var id = prefs.getString(_kDeviceId);
    if (id == null || id.isEmpty) {
      final r = Random();
      final rand =
          List.generate(20, (_) => r.nextInt(16).toRadixString(16)).join();
      id = 'a-$rand${DateTime.now().microsecondsSinceEpoch.toRadixString(16)}';
      await prefs.setString(_kDeviceId, id);
    }
    return id;
  }

  List<T> _decode<T>(String? raw, T Function(Map<String, dynamic>) f) {
    if (raw == null || raw.isEmpty) return [];
    try {
      return (json.decode(raw) as List)
          .whereType<Map<String, dynamic>>()
          .map(f)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> toggleFollowComp(FollowedComp c) async {
    final wasFollowing = isFollowingComp(c.id);
    if (wasFollowing) {
      _followedComps.removeWhere((x) => x.id == c.id);
    } else {
      _followedComps = [..._followedComps, c];
    }
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        _kFollowComps, json.encode(_followedComps.map((x) => x.toJson()).toList()));
    try {
      wasFollowing
          ? await NotificationService.instance.unfollowComp(c.id)
          : await NotificationService.instance.followComp(c.id);
      await _api.reportFollow(
          deviceId: _deviceId, kind: 'comp', id: c.id, subscribe: !wasFollowing);
      await _syncResultsBroadcast();
    } catch (_) {/* push is best-effort */}
  }

  Future<void> toggleFollowTeam(FollowedTeam t) async {
    final wasFollowing = isFollowingTeam(t.id);
    if (wasFollowing) {
      _followedTeams.removeWhere((x) => x.id == t.id);
    } else {
      _followedTeams = [..._followedTeams, t];
    }
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        _kFollowTeams, json.encode(_followedTeams.map((x) => x.toJson()).toList()));
    try {
      wasFollowing
          ? await NotificationService.instance.unfollowTeam(t.id)
          : await NotificationService.instance.followTeam(t.id);
      await _api.reportFollow(
          deviceId: _deviceId, kind: 'team', id: t.id, subscribe: !wasFollowing);
      await _syncResultsBroadcast();
    } catch (_) {/* push is best-effort */}
  }

  bool get _hasFavourites =>
      _followedComps.isNotEmpty || _followedTeams.isNotEmpty;

  /// Join the all-results broadcast only while the user has no favourites; drop
  /// it once they follow something, so from then on they get only their leagues/
  /// teams. Mirrors the backend's TOPIC_RESULTS fan-out. Best-effort.
  Future<void> _syncResultsBroadcast() async {
    try {
      await NotificationService.instance.setResultsBroadcast(!_hasFavourites);
    } catch (_) {}
  }

  /// Re-join FCM topics for everything already followed — topic subscriptions are
  /// lost on reinstall, so re-assert them on startup. Best-effort.
  Future<void> resubscribeFollows() async {
    try {
      for (final c in _followedComps) {
        await NotificationService.instance.followComp(c.id);
        // Re-assert the anonymous tally too, so a device that followed before
        // this existed (or after a reinstall) is counted. Idempotent server-side.
        await _api.reportFollow(
            deviceId: _deviceId, kind: 'comp', id: c.id, subscribe: true);
      }
      for (final t in _followedTeams) {
        await NotificationService.instance.followTeam(t.id);
        await _api.reportFollow(
            deviceId: _deviceId, kind: 'team', id: t.id, subscribe: true);
      }
      await _syncResultsBroadcast();
    } catch (_) {}
  }

  Future<void> toggleLocale() async {
    _locale = isAr ? 'en' : 'ar';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('locale', _locale);
    notifyListeners();
  }

  Future<void> toggleTheme() async {
    _isDark = !_isDark;
    AppColors.setTheme(_isDark);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isDark', _isDark);
    notifyListeners();
  }

  // ── Config ───────────────────────────────────────────────────────────────────
  ConfigData? _config;
  bool        _loadingConfig = false;
  String?     _configError;

  ConfigData? get config        => _config;
  bool        get loadingConfig => _loadingConfig;
  String?     get configError   => _configError;

  // ── Bottom-bar "new items" badges (mirrors the website) ──────────────────────
  int _newNewsCount   = 0;
  int _newVenuesCount = 0;
  int get newNewsCount   => _newNewsCount;
  int get newVenuesCount => _newVenuesCount;

  /// Recompute the News / Venues badge counts against the seen baseline. Runs
  /// whenever the config feed loads or is silently refreshed; the first run
  /// seeds the baseline (badges stay 0). Notifies only when a count changes.
  Future<void> _recomputeBadges() async {
    final cfg = _config;
    if (cfg == null) return;
    final news   = await SeenService.instance
        .countUnseen('news', cfg.news.map((n) => n.seenKey).toList());
    final venues = await SeenService.instance
        .countUnseen('venues', cfg.venues.map((v) => v.id).toList());
    if (news != _newNewsCount || venues != _newVenuesCount) {
      _newNewsCount   = news;
      _newVenuesCount = venues;
      notifyListeners();
    }
  }

  /// Opening the News page marks the whole current feed seen and clears its
  /// badge. Called from [NewsScreen]; safe to call repeatedly.
  Future<void> markNewsSeen() async {
    final cfg = _config;
    if (cfg != null) {
      await SeenService.instance
          .markSeen('news', cfg.news.map((n) => n.seenKey).toList());
    }
    if (_newNewsCount != 0) {
      _newNewsCount = 0;
      notifyListeners();
    }
  }

  /// Opening the Venues page marks the whole current feed seen and clears its
  /// badge. Called from [VenuesScreen]; safe to call repeatedly.
  Future<void> markVenuesSeen() async {
    final cfg = _config;
    if (cfg != null) {
      await SeenService.instance
          .markSeen('venues', cfg.venues.map((v) => v.id).toList());
    }
    if (_newVenuesCount != 0) {
      _newVenuesCount = 0;
      notifyListeners();
    }
  }

  /// Loads the config feed (news, venues, app version, latest data URL). A
  /// `silent` load (e.g. on app resume) keeps the current data on screen — no
  /// spinner — and a failed fetch leaves it untouched; it just swaps in fresh
  /// data on success so a newly added/edited news or venue appears.
  Future<void> loadConfig({bool silent = false}) async {
    if (!silent) {
      _loadingConfig = true;
      _configError   = null;
      notifyListeners();
    }
    try {
      _config      = await _api.fetchConfig();
      _configError = null;
      final serverCode = int.tryParse(_config?.appVersion?.versionCode ?? '0') ?? 0;
      _needsUpdate = serverCode > _appBuildNumber;
      await _recomputeBadges();
      if (silent) notifyListeners();
    } catch (e) {
      if (!silent) _configError = e.toString();
    } finally {
      if (!silent) {
        _loadingConfig = false;
        notifyListeners();
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Returning to the app: silently refresh news/venues (only once we already
    // have data, so we never blank the first launch or fight the splash load).
    if (state == AppLifecycleState.resumed && _config != null) {
      loadConfig(silent: true);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // ── Competition data ─────────────────────────────────────────────────────────
  CompetitionData? _competition;
  bool             _loadingComp = false;
  String?          _compError;
  String?          _compUrl;

  CompetitionData? get competition    => _competition;
  bool             get loadingComp    => _loadingComp;
  String?          get compError      => _compError;
  String?          get compUrl        => _compUrl;

  final _memCache = <String, CompetitionData>{};

  // ── Competition meta (title + season) ────────────────────────────────────────
  String _competitionTitle = '';
  String _seasonName       = '';
  String get competitionTitle => _competitionTitle;
  String get seasonName       => _seasonName;

  void setCompetitionMeta(String title, String season) {
    _competitionTitle = title;
    _seasonName       = season;
  }

  // ── O(1) ID indexes ──────────────────────────────────────────────────────────
  var _teamIndex  = <String, Team>{};
  var _matchIndex = <String, Match>{};

  /// Sets the active competition and rebuilds the O(1) lookup indexes.
  void _setCompetition(CompetitionData data, String url) {
    _competition = data;
    _compUrl     = url;
    _teamIndex   = {for (final t in data.teams)   t.id: t};
    _matchIndex  = {for (final m in data.matches) m.id: m};
  }

  // ── Load with disk cache ─────────────────────────────────────────────────────
  Future<void> loadCompetition(String url) async {
    if (_compUrl == url && _competition != null) return;

    // 1. Memory cache — instant, no rebuild needed
    if (_memCache.containsKey(url)) {
      _setCompetition(_memCache[url]!, url);
      notifyListeners();
      _silentRefresh(url);
      return;
    }

    // 2. Disk cache — show immediately, refresh in background
    final prefs  = await SharedPreferences.getInstance();
    final stored = prefs.getString(_diskKey(url));
    if (stored != null) {
      try {
        final data = CompetitionData.fromJson(
            json.decode(stored) as Map<String, dynamic>);
        _memCache[url] = data;
        _setCompetition(data, url);
        notifyListeners();
        _silentRefresh(url);
        return;
      } catch (_) {
        // Corrupted cache — remove and fall through
        await prefs.remove(_diskKey(url));
      }
    }

    // 3. No cache — show loading, fetch from network
    _loadingComp = true;
    _compError   = null;
    notifyListeners();
    await _fetchAndSave(url);
  }

  /// Fetches fresh data, saves to both caches, notifies listeners.
  Future<void> _fetchAndSave(String url) async {
    try {
      final raw  = await _api.fetchCompetitionRaw(url);
      final data = CompetitionData.fromJson(
          json.decode(raw) as Map<String, dynamic>);
      _memCache[url] = data;
      _setCompetition(data, url);
      _compError = null;
      _writeDisk(url, raw);
    } catch (e) {
      _compError = e.toString();
    } finally {
      _loadingComp = false;
      notifyListeners();
    }
  }

  /// Refreshes in the background without showing a loading indicator.
  Future<void> _silentRefresh(String url) async {
    try {
      final raw  = await _api.fetchCompetitionRaw(url);
      final data = CompetitionData.fromJson(
          json.decode(raw) as Map<String, dynamic>);
      _memCache[url] = data;
      if (_compUrl == url) {
        _setCompetition(data, url);
        notifyListeners();
      }
      _writeDisk(url, raw);
    } catch (_) {}
  }

  Future<void> _writeDisk(String url, String raw) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_diskKey(url), raw);
    } catch (_) {}
  }

  // Simple numeric hash keeps the key short and avoids forbidden characters.
  String _diskKey(String url) => 'comp_${url.hashCode}';

  // `notify` is false when called from a widget's dispose(): the subtree is being
  // torn down, so notifying listeners mid-teardown can throw "notify during
  // dispose" in navigation races. Clear the state silently in that case.
  void clearCompetition({bool notify = true}) {
    if (_compUrl != null) _memCache.remove(_compUrl);
    _competition      = null;
    _compUrl          = null;
    _competitionTitle = '';
    _seasonName       = '';
    _teamIndex        = {};
    _matchIndex       = {};
    if (notify) notifyListeners();
  }

  Future<void> refreshCompetition() async {
    if (_compUrl == null) return;
    final url = _compUrl!;
    _memCache.remove(url);
    _loadingComp = true;
    _compError   = null;
    notifyListeners();
    await _fetchAndSave(url);
  }

  /// Background refresh for the competition live-poll: refetch the current
  /// competition with no loading indicator, keeping the current data on failure.
  Future<void> refreshCompetitionSilent() async {
    final url = _compUrl;
    if (url != null) await _silentRefresh(url);
  }

  Future<void> refreshConfig() async {
    _config = null;
    await loadConfig();
  }

  // ── Helpers — O(1) via index maps ────────────────────────────────────────────
  Team?  teamById(String id) => _teamIndex[id];
  Match? matchById(String id) => _matchIndex[id];
}
