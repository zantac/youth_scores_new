import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/app_provider.dart';
import '../../screens/search/search_overlay.dart';
import '../../screens/admin/admin_login_screen.dart';

const _bannerUrl =
    'https://res.cloudinary.com/debq5s4sn/image/upload/v1783684931/youthscores-banner-v2_yqr3hs.png';

/// Banner + controls row shown above every tab — the in-app twin of the
/// website's layout header (see web/src/app/layout.tsx + ControlsBar.tsx):
/// full-width banner, then language / theme / search on the left and the admin
/// login on the far end. There is deliberately no "Youth Scores" title; the
/// logo lives inside the banner image.
class HomeTopBar extends StatelessWidget {
  const HomeTopBar({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AppProvider>();
    final isAr = provider.locale == 'ar';

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // ── Banner ─────────────────────────────────────────────────────────
        CachedNetworkImage(
          imageUrl: _bannerUrl,
          width: double.infinity,
          fit: BoxFit.fitWidth,
          errorWidget: (_, __, ___) => const SizedBox.shrink(),
        ),
        // ── Controls row ───────────────────────────────────────────────────
        Container(
          color: AppColors.darkBg,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          // Forced LTR so the language toggle and admin key keep their sides
          // regardless of locale, matching the website's dir="ltr" controls.
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: Row(
              children: [
                _Pill(
                  onTap: provider.toggleLocale,
                  child: Text(
                    isAr ? 'EN' : 'ع',
                    style: TextStyle(
                      color: AppColors.aqua,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                _Pill(
                  onTap: provider.toggleTheme,
                  child: Icon(
                    provider.isDark ? Icons.light_mode : Icons.dark_mode,
                    color: AppColors.aqua,
                    size: 16,
                  ),
                ),
                const SizedBox(width: 8),
                _Pill(
                  onTap: () => showSearchOverlay(context),
                  child: Icon(Icons.search, color: AppColors.aqua, size: 16),
                ),
                const Spacer(),
                _Pill(
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const AdminLoginScreen()),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.vpn_key, color: AppColors.aqua, size: 14),
                      const SizedBox(width: 5),
                      Text(
                        isAr ? 'دخول' : 'Log in',
                        style: TextStyle(
                          color: AppColors.aqua,
                          fontWeight: FontWeight.bold,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Small bordered chip used for each control, mirroring the website's
/// `border border-aqua/40 rounded-lg bg-cardBg` buttons.
class _Pill extends StatelessWidget {
  final Widget child;
  final VoidCallback onTap;
  const _Pill({required this.child, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: AppColors.aqua.withValues(alpha: 0.4)),
        ),
        child: child,
      ),
    );
  }
}
