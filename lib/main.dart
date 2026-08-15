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

  // Firebase Cloud Messaging. Guarded so the app still runs if Firebase is
  // unavailable (e.g. an emulator without Google Play services).
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await NotificationService.instance.init();
  } catch (_) {}

  final provider = AppProvider();
  await provider.init();
  await provider.resubscribeFollows();

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
