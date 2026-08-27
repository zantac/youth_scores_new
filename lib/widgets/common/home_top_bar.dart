import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/app_provider.dart';
import '../../core/utils/cloudinary.dart';
import '../../screens/search/search_overlay.dart';

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
          imageUrl: cloudinaryUrl(_bannerUrl, width: 1200),
          width: double.infinity,
          fit: BoxFit.fitWidth,
          errorWidget: (_, _, _) => const SizedBox.shrink(),
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
                  child: Text(provider.isDark ? '☀️' : '🌙',
                      style: const TextStyle(fontSize: 15)),
                ),
                const SizedBox(width: 8),
                _Pill(
                  onTap: () => showSearchOverlay(context),
                  child: const Text('🔍', style: TextStyle(fontSize: 15)),
                ),
                // The admin login moved to the "More" tab's app bar, so it no
                // longer appears above Home / Competitions / News / Venues.
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
