import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:provider/provider.dart';
import 'api_service.dart';
import '../providers/app_provider.dart';
import '../../screens/competition/competition_data_screen.dart';
import '../../screens/news/news_detail_screen.dart';

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

  Future<void> init() async {
    if (_ready) return;
    _ready = true;

    await FirebaseMessaging.instance.requestPermission();

    // Join the always-on topics so news and venue pushes reach this device even
    // when the user hasn't followed any competition or team.
    for (final topic in _alwaysOnTopics) {
      await FirebaseMessaging.instance.subscribeToTopic(topic);
    }

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
    // Tapped while backgrounded, or launched from a notification.
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _route(m.data['url'] as String?));
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      _route(initial.data['url'] as String?);
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

    // Round digests / match results / new-competition all deep-link to a league.
    if (id == null || id.isEmpty) return;
    nav.push(MaterialPageRoute(
      builder: (_) => CompetitionDataScreen(
        dataUrl: ApiService.competitionDataUrl(id),
        title: '',
        seasonName: '',
      ),
    ));
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
