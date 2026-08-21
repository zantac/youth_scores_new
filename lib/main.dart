import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:provider/provider.dart';
import 'core/providers/app_provider.dart';
import 'core/providers/admin_auth.dart';
import 'core/services/notification_service.dart';
import 'core/theme/app_theme.dart';
import 'screens/splash_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Only local, fast work runs before runApp(): loads locale/theme so the very
  // first frame is correct. Anything network-dependent is deferred below.
  final provider = AppProvider();
  await provider.init();

  // Admin session — restore any saved token in the background; the login screen
  // reacts once it resolves.
  final adminAuth = AdminAuth()..restore();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: provider),
        ChangeNotifierProvider.value(value: adminAuth),
      ],
      child: const YouthScoresApp(),
    ),
  );

  // Firebase Cloud Messaging init + FCM topic (re)subscription run AFTER the UI
  // is up. These await an FCM registration token, which needs network + Google
  // Play services; awaiting them before runApp() left the app stuck on a white
  // (native launch) screen whenever the device was offline or FCM was slow to
  // hand out a token — a hang, not an exception, so the try/catch never fired.
  // Best-effort and fire-and-forget so launch never blocks on the network.
  unawaited(_initMessaging(provider));

  // Web URL deep links (Android App Links): a shared youthscores.org link opens
  // the app on the right screen. Kept separate from FCM so it works even when
  // Firebase is unavailable.
  unawaited(NotificationService.instance.initDeepLinks());
}

/// Guarded FCM setup, run off the launch critical path. If Firebase is
/// unavailable (e.g. an emulator without Google Play services) the app still
/// runs; push is simply inactive.
Future<void> _initMessaging(AppProvider provider) async {
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await NotificationService.instance.init();
    await provider.resubscribeFollows();
  } catch (_) {}
}

class YouthScoresApp extends StatelessWidget {
  const YouthScoresApp({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AppProvider>();

    return MaterialApp(
      title: 'Youth Scores',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      theme: provider.isDark ? AppTheme.dark : AppTheme.light,
      locale: Locale(provider.locale),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const SplashScreen(),
    );
  }
}
