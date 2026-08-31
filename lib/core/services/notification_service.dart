import 'dart:async';
import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:provider/provider.dart';
import 'api_service.dart';
import '../providers/app_provider.dart';
import '../../screens/competition/competition_data_screen.dart';
import '../../screens/club/club_detail_screen.dart';
import '../../screens/news/news_detail_screen.dart';
import '../../screens/player/player_detail_screen.dart';
import '../../screens/team/team_profile_screen.dart';

/// Global navigator so a notification tap can push a screen from anywhere.
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

/// Background/terminated messages. Android auto-displays the `android`
/// notification block the server attaches, so this only needs to exist; it must
/// be a top-level function.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {}

/// Firebase Cloud Messaging: topic subscription for followed competitions/teams
/// and display of the server's data-only messages. Matches the backend topics
/// `comp_<id>` and `team_<id>`.
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final _fln = FlutterLocalNotificationsPlugin();

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'youthscores_default',
    'Youth Scores',
    description: 'Match results and news',
    importance: Importance.high,
  );

  // Topics every device joins unconditionally — site-wide news and new venues.
  // The web joins these server-side on /api/push/subscribe; native subscribes
  // itself via the FCM SDK. Must match the backend's TOPIC_NEWS / TOPIC_VENUES.
  static const List<String> _alwaysOnTopics = ['news', 'venues'];

  bool _ready = false;

  // A deep-link from a cold launch (a notification tap that started a killed app)
  // waits here until Home is on screen, so the splash's pushReplacement(Home)
  // can't discard a competition route pushed too early. Flushed by markHomeReady.
  String? _pendingUrl;
  bool _homeReady = false;

  Future<void> init() async {
    if (_ready) return;
    _ready = true;

    // ── Notification display + tap routing FIRST ───────────────────────────
    // Everything a tap needs — the open-app listener, the cold-start launch
    // message, foreground display — is wired up before any network call below.
    // subscribeToTopic() never completes while FCM returns SERVICE_NOT_AVAILABLE,
    // so awaiting it ahead of this (as we used to) meant a tapped notification
    // never deep-linked: the app just opened on Home.
    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _fln.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (resp) => _route(resp.payload),
    );
    await _fln
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    // Foreground: the OS doesn't show it, so draw it ourselves.
    FirebaseMessaging.onMessage.listen(_showForeground);
    // Tapped while backgrounded — Home is already up, so route immediately.
    FirebaseMessaging.onMessageOpenedApp
        .listen((m) => _route(m.data['url'] as String?));
    // Launched from a killed state by a tap: hold the deep-link until Home is on
    // screen (markHomeReady) so the splash's pushReplacement can't clobber it.
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      _deepLink(initial.data['url'] as String?);
    }

    // ── Permission + always-on topics LAST, and non-blocking ───────────────
    // These can hang indefinitely (FCM SERVICE_NOT_AVAILABLE retries forever), so
    // never await them on any path the UI or routing depends on.
    unawaited(_joinAlwaysOnTopics());
  }

  /// Join the always-on topics so news and venue pushes reach this device even
  /// when the user hasn't followed any competition or team. Best-effort.
  Future<void> _joinAlwaysOnTopics() async {
    try {
      await FirebaseMessaging.instance.requestPermission();
      for (final topic in _alwaysOnTopics) {
        await FirebaseMessaging.instance.subscribeToTopic(topic);
      }
    } catch (_) {}
  }

  // ── Web URL deep links (Android App Links) ─────────────────────────────────
  // A shared youthscores.org link (competition/news/club/team) opens the app
  // here instead of the browser. Independent of Firebase so it works even if FCM
  // is unavailable; shares the same routing + pending-link machinery as pushes.
  final _appLinks = AppLinks();
  bool _deepLinksReady = false;

  Future<void> initDeepLinks() async {
    if (_deepLinksReady) return;
    _deepLinksReady = true;
    try {
      // A link that cold-started the app: hold it until Home is up (like a
      // notification launch) so the splash's replacement can't discard it.
      final initial = await _appLinks.getInitialLink();
      if (initial != null) _deepLink(initial.toString());
      // Links that arrive while the app is already running — route immediately.
      _appLinks.uriLinkStream.listen((uri) => _route(uri.toString()));
    } catch (_) {/* deep links are best-effort */}
  }

  /// The splash calls this once Home is on screen; flushes any cold-launch
  /// deep-link so it lands on top of Home rather than being replaced away.
  void markHomeReady() {
    _homeReady = true;
    final url = _pendingUrl;
    _pendingUrl = null;
    if (url != null) _route(url);
  }

  // Route now if Home is up, else stash it for markHomeReady to flush.
  void _deepLink(String? url) {
    if (url == null || url.isEmpty) return;
    if (_homeReady) {
      _route(url);
    } else {
      _pendingUrl = url;
    }
  }

  void _showForeground(RemoteMessage m) {
    final title = (m.data['title'] ?? m.notification?.title ?? 'Youth Scores').toString();
    final body = (m.data['body'] ?? m.notification?.body ?? '').toString();
    _fln.show(
      m.messageId.hashCode,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: m.data['url'] as String?,
    );
  }

  // Deep-link a tapped notification by its target path. The server sends paths
  // like /news?id=<id>, /competition?id=<id>&week=<w>, /venues — each must open
  // its own screen; previously every push opened a competition, so a news push
  // tried to load a competition by the news id and 404'd.
  //
  // Async because a notification can launch the app cold: the navigator (and the
  // config feed a news deep-link needs) don't exist yet, so we wait for them
  // rather than dropping the tap on the home screen.
  Future<void> _route(String? url) async {
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;

    // Defense-in-depth: an App Link / custom-scheme URL can be fired by any app.
    // Our own notification payloads are relative paths (no host); an external
    // link that names some *other* host is not ours, so refuse to route it.
    if (uri.hasAuthority &&
        !const {'youthscores.org', 'www.youthscores.org'}
            .contains(uri.host.toLowerCase())) {
      return;
    }

    final nav = await _waitFor(() => navigatorKey.currentState);
    if (nav == null) return;

    final id = uri.queryParameters['id'];
    final target = (uri.pathSegments.isNotEmpty
            ? uri.pathSegments.first
            : uri.path.replaceAll('/', ''))
        .toLowerCase();

    if (target.startsWith('news')) {
      await _openNews(nav, id);
      return;
    }

    // Everything else deep-links by id: competition / club / team. Shared from
    // the website (App Links) as /competition?id=&tab=&week=, /club?id=, /team?id=.
    if (id == null || id.isEmpty) return;

    if (target.startsWith('club')) {
      final clubId = int.tryParse(id);
      if (clubId != null) {
        nav.push(MaterialPageRoute(builder: (_) => ClubDetailScreen(clubId: clubId)));
      }
      return;
    }

    if (target.startsWith('team')) {
      final teamId = int.tryParse(id);
      if (teamId != null) {
        nav.push(MaterialPageRoute(builder: (_) => TeamProfileScreen(teamId: teamId)));
      }
      return;
    }

    // Player profile. A website link may carry ?tab= to land on
    // season/career/matches; defaults to the season tab.
    if (target.startsWith('player')) {
      final playerId = int.tryParse(id);
      if (playerId != null) {
        nav.push(MaterialPageRoute(
          builder: (_) => PlayerDetailScreen(
            playerId: playerId,
            initialTab: _playerTabIndex(uri.queryParameters['tab']),
          ),
        ));
      }
      return;
    }

    // Competition. A round-results digest carries the round (?week=): open that
    // round's matches, not today's. A website link may carry ?tab= to land on
    // standings/teams/stats; both default sensibly when absent.
    final week = uri.queryParameters['week'];
    nav.push(MaterialPageRoute(
      builder: (_) => CompetitionDataScreen(
        dataUrl: ApiService.competitionDataUrl(id),
        title: '',
        seasonName: '',
        initialWeek: (week != null && week.isNotEmpty) ? week : null,
        initialTab: _tabIndex(uri.queryParameters['tab']),
        // Stats sub-tab (?stat=), applied when ?tab=stats.
        initialStat: _statTabIndex(uri.queryParameters['stat']),
      ),
    ));
  }

  // The competition's main tabs, matching CompetitionDataScreen's order and the
  // website's slugs. Accepts the named slug or a legacy numeric index.
  static int _tabIndex(String? tab) {
    if (tab == null || tab.isEmpty) return 0;
    const slugs = ['matches', 'standings', 'teams', 'stats'];
    final named = slugs.indexOf(tab.toLowerCase());
    if (named >= 0) return named;
    final n = int.tryParse(tab);
    return (n != null && n >= 0 && n < slugs.length) ? n : 0;
  }

  // The player profile's tabs, matching PlayerDetailScreen's order and the
  // website's slugs (?tab=season|career|matches).
  static int _playerTabIndex(String? tab) {
    if (tab == null || tab.isEmpty) return 0;
    const slugs = ['season', 'career', 'matches'];
    final named = slugs.indexOf(tab.toLowerCase());
    if (named >= 0) return named;
    final n = int.tryParse(tab);
    return (n != null && n >= 0 && n < slugs.length) ? n : 0;
  }

  // The competition Stats sub-tabs, matching StatsTab's order and the website's
  // ?stat= slugs.
  static int _statTabIndex(String? stat) {
    if (stat == null || stat.isEmpty) return 0;
    const slugs = ['overview', 'scorers', 'assists', 'cleansheets', 'cards'];
    final named = slugs.indexOf(stat.toLowerCase());
    if (named >= 0) return named;
    final n = int.tryParse(stat);
    return (n != null && n >= 0 && n < slugs.length) ? n : 0;
  }

  // Open a news item by id from the config feed (news carries no standalone
  // fetch endpoint). On a cold launch the feed may still be loading, so wait for
  // it; fall back to the latest item if the id isn't present.
  Future<void> _openNews(NavigatorState nav, String? id) async {
    final ctx = navigatorKey.currentContext;
    if (ctx == null) return;
    final news = await _waitFor(() {
      final list = ctx.read<AppProvider>().config?.news;
      return (list == null || list.isEmpty) ? null : list;
    });
    if (news == null) return;
    final nid = int.tryParse(id ?? '');
    final item = news.firstWhere((n) => n.id == nid, orElse: () => news.first);
    nav.push(MaterialPageRoute(builder: (_) => NewsDetailScreen(item: item)));
  }

  // Poll [get] until it returns non-null (app finished launching / feed loaded),
  // up to ~6s, so a cold-start notification tap isn't lost.
  Future<T?> _waitFor<T>(T? Function() get) async {
    for (var i = 0; i < 60; i++) {
      final v = get();
      if (v != null) return v;
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    return get();
  }

  // ── Topic subscription (client-side, per the backend design) ────────────────
  Future<void> followComp(String id) =>
      FirebaseMessaging.instance.subscribeToTopic('comp_$id');
  Future<void> unfollowComp(String id) =>
      FirebaseMessaging.instance.unsubscribeFromTopic('comp_$id');
  Future<void> followTeam(String id) =>
      FirebaseMessaging.instance.subscribeToTopic('team_$id');
  Future<void> unfollowTeam(String id) =>
      FirebaseMessaging.instance.unsubscribeFromTopic('team_$id');

  // The all-competitions results broadcast (backend TOPIC_RESULTS). A device
  // joins it while it has NO favourites, so every round still reaches new users;
  // once they follow their first competition/team it unsubscribes and only the
  // followed topics deliver. Kept in sync by AppProvider on every follow change.
  Future<void> setResultsBroadcast(bool subscribe) => subscribe
      ? FirebaseMessaging.instance.subscribeToTopic('results')
      : FirebaseMessaging.instance.unsubscribeFromTopic('results');
}
