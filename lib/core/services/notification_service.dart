import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_service.dart';
import '../../screens/competition/competition_data_screen.dart';

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

  bool _ready = false;

  Future<void> init() async {
    if (_ready) return;
    _ready = true;

    await FirebaseMessaging.instance.requestPermission();

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

  // Deep-link a tapped notification. The server sends url=/competition?id=<id>...
  void _route(String? url) {
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    final id = uri?.queryParameters['id'];
    if (id == null || id.isEmpty) return;
    final nav = navigatorKey.currentState;
    if (nav == null) return;
    nav.push(MaterialPageRoute(
      builder: (_) => CompetitionDataScreen(
        dataUrl: ApiService.competitionDataUrl(id),
        title: '',
        seasonName: '',
      ),
    ));
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
}
