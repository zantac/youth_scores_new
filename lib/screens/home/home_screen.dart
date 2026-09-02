import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/providers/app_provider.dart';
import 'home_tab.dart';
import 'competitions_tab.dart';
import '../club/clubs_screen.dart';
import '../news/news_screen.dart';
import '../venues/venues_screen.dart';
import '../more/more_screen.dart';
import '../../widgets/common/home_top_bar.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  bool _updateDialogShown = false;

  // ── Connectivity ────────────────────────────────────────────────────────────
  late final StreamSubscription<List<ConnectivityResult>> _connSub;
  bool _isOffline  = false;
  bool _showOnline = false;
  Timer? _onlineTimer;

  @override
  void initState() {
    super.initState();
    _checkNow();
    _connSub = Connectivity().onConnectivityChanged.listen(_onChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowUpdateDialog());
  }

  Future<void> _checkNow() async {
    final results = await Connectivity().checkConnectivity();
    if (!mounted) return;
    setState(() => _isOffline = _offline(results));
  }

  void _onChanged(List<ConnectivityResult> results) {
    if (!mounted) return;
    final offline = _offline(results);
    setState(() {
      if (!_isOffline && offline) {
        // Went offline
        _isOffline  = true;
        _showOnline = false;
        _onlineTimer?.cancel();
      } else if (_isOffline && !offline) {
        // Came back online
        _isOffline  = false;
        _showOnline = true;
        _onlineTimer?.cancel();
        _onlineTimer = Timer(const Duration(seconds: 3), () {
          if (mounted) setState(() => _showOnline = false);
        });
      }
    });
  }

  bool _offline(List<ConnectivityResult> r) =>
      r.every((e) => e == ConnectivityResult.none);

  void _maybeShowUpdateDialog() {
    if (_updateDialogShown) return;
    final provider = context.read<AppProvider>();
    if (!provider.needsUpdate) return;
    _updateDialogShown = true;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => _UpdateDialog(
        locale: provider.locale,
        force: provider.forceUpdate,
      ),
    );
  }

  @override
  void dispose() {
    _connSub.cancel();
    _onlineTimer?.cancel();
    super.dispose();
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  /// Overlay a small count badge on a bottom-nav icon (mirrors the website's
  /// News / Venues tab badges). No badge when the count is zero; "99+" past 99.
  Widget _badged(Widget child, int count) {
    if (count <= 0) return child;
    return Badge(
      label: Text(count > 99 ? '99+' : '$count'),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AppProvider>();
    final l10n     = L10n(provider.locale);

    final screens = [
      HomeTab(
        onGoToCompetitions: () => setState(() => _tab = 1),
        onGoToNews: () => setState(() => _tab = 3),
      ),
      const CompetitionsTab(),
      const ClubsScreen(),
      const NewsScreen(),
      const VenuesScreen(),
    ];

    return Scaffold(
      // No AppBar / title — the banner + controls row (HomeTopBar) sits above
      // every tab, mirroring the website's layout header.
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // ── Banner + controls (language / theme / search / admin) ───────
            const HomeTopBar(),
            // ── Connectivity banners ────────────────────────────────────────
            _ConnBanner(
              isOffline:  _isOffline,
              showOnline: _showOnline,
              isAr:       l10n.isAr,
            ),
            // ── Tab content ─────────────────────────────────────────────────
            // _tab only ever indexes a real screen (the trailing "More" nav item
            // pushes a route instead of switching tabs); clamp defensively so a
            // stray index can never throw.
            Expanded(child: screens[_tab.clamp(0, screens.length - 1)]),
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _tab,
        type: BottomNavigationBarType.fixed,
        onTap: (i) {
          // "More" is the trailing nav item with no tab of its own — it pushes a
          // route. Keyed off screens.length (not a hard-coded index) so adding or
          // reordering a tab can't desync it from the screens list.
          if (i >= screens.length) {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const MoreScreen()),
            );
            return;
          }
          setState(() => _tab = i);
        },
        items: [
          BottomNavigationBarItem(
            icon: const Text('🏠', style: TextStyle(fontSize: 20)),
            label: l10n.home,
          ),
          BottomNavigationBarItem(
            icon: const Text('🏆', style: TextStyle(fontSize: 20)),
            label: l10n.competitions,
          ),
          BottomNavigationBarItem(
            icon: const Text('🛡️', style: TextStyle(fontSize: 20)),
            label: l10n.clubs,
          ),
          BottomNavigationBarItem(
            icon: _badged(const Text('📰', style: TextStyle(fontSize: 20)),
                provider.newNewsCount),
            label: l10n.news,
          ),
          BottomNavigationBarItem(
            icon: _badged(const Text('🏟️', style: TextStyle(fontSize: 20)),
                provider.newVenuesCount),
            label: l10n.venues,
          ),
          BottomNavigationBarItem(
            icon: const Text('⋯', style: TextStyle(fontSize: 22, height: 1.0)),
            label: l10n.moreLabel,
          ),
        ],
      ),
    );
  }
}

// ── Update dialog ─────────────────────────────────────────────────────────────

class _UpdateDialog extends StatelessWidget {
  final String locale;
  final bool force;
  const _UpdateDialog({required this.locale, this.force = false});

  static const _storeUrl =
      'https://play.google.com/store/apps/details?id=com.waellotfy.youthscores&pcampaignid=web_share';

  @override
  Widget build(BuildContext context) {
    final isAr = locale == 'ar';
    return PopScope(
      canPop: !force,
      child: AlertDialog(
      backgroundColor: AppColors.cardBg,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Row(
        children: [
          Icon(Icons.system_update_alt, color: AppColors.aqua, size: 26),
          const SizedBox(width: 10),
          Text(
            isAr ? 'تحديث متاح' : 'Update Available',
            style: TextStyle(
              color: AppColors.aqua,
              fontWeight: FontWeight.bold,
              fontSize: 17,
            ),
          ),
        ],
      ),
      content: Text(
        isAr
            ? 'يوجد إصدار جديد من التطبيق متاح على متجر Google Play.\nيُرجى التحديث للاستمتاع بأحدث الميزات.'
            : 'A new version is available on Google Play.\nPlease update to enjoy the latest features.',
        style: TextStyle(color: AppColors.white, fontSize: 14, height: 1.6),
      ),
      actions: [
        if (!force)
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              isAr ? 'لاحقاً' : 'Later',
              style: TextStyle(color: AppColors.hint),
            ),
          ),
        ElevatedButton.icon(
          icon: const Icon(Icons.download_rounded, size: 18),
          label: Text(isAr ? 'تحديث الآن' : 'Update Now'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.aqua,
            foregroundColor: AppColors.darkBg,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
          ),
          onPressed: () async {
            Navigator.pop(context);
            await launchUrl(
              Uri.parse(_storeUrl),
              mode: LaunchMode.externalApplication,
            );
          },
        ),
      ],
      ),
    );
  }
}

// ── Connectivity banner widget ────────────────────────────────────────────────

class _ConnBanner extends StatelessWidget {
  final bool isOffline;
  final bool showOnline;
  final bool isAr;

  const _ConnBanner({
    required this.isOffline,
    required this.showOnline,
    required this.isAr,
  });

  @override
  Widget build(BuildContext context) {
    // Nothing to show
    if (!isOffline && !showOnline) return const SizedBox.shrink();

    final offline = isOffline;
    final color   = offline ? const Color(0xFFC0392B) : const Color(0xFF27AE60);
    final icon    = offline ? Icons.wifi_off_rounded  : Icons.wifi_rounded;
    final message = offline
        ? (isAr ? 'لا يوجد اتصال بالإنترنت' : 'No internet connection')
        : (isAr ? 'تم استعادة الاتصال بالإنترنت' : 'Connection restored');

    return AnimatedSize(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
      child: Container(
        width: double.infinity,
        color: color,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Icon(icon, color: Colors.white, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
