import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/providers/app_provider.dart';
import '../admin/admin_login_screen.dart';
import '../connect/connect_screen.dart';
import '../favourites/favourites_screen.dart';
import '../info/about_screen.dart';

/// The "More" hub reached from the bottom bar: Favourites, Connect, About,
/// Privacy Policy and Terms, each opening its own page. Order mirrors the
/// website's /more.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<AppProvider>().locale;
    final l10n = L10n(locale);
    final isAr = l10n.isAr;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.moreLabel),
        actions: [
          // Admin login lives here only — removed from the top bar on the other
          // tabs (Home / Competitions / News / Venues).
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            child: TextButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AdminLoginScreen()),
              ),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.aqua,
                side: BorderSide(color: AppColors.aqua.withValues(alpha: 0.4)),
                padding: const EdgeInsets.symmetric(horizontal: 10),
              ),
              icon: const Text('🔑', style: TextStyle(fontSize: 14)),
              label: Text(isAr ? 'دخول' : 'Log in',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _MoreTile(
            icon: Icons.star_outline,
            iconColor: AppColors.orange,
            title: l10n.favorites,
            subtitle: isAr
                ? 'البطولات والفرق التي تتابعها'
                : 'Competitions and teams you follow',
            onTap: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const FavouritesScreen())),
          ),
          const SizedBox(height: 10),
          _MoreTile(
            icon: Icons.chat_bubble_outline,
            iconColor: const Color(0xFF25D366),
            title: l10n.connect,
            subtitle: isAr ? 'أرسل النتائج وتواصل معنا' : 'Submit results and reach us',
            onTap: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const ConnectScreen())),
          ),
          const SizedBox(height: 10),
          _MoreTile(
            icon: Icons.info_outline,
            iconColor: AppColors.aqua,
            title: l10n.about,
            subtitle: isAr ? 'عن يوث سكورز' : 'About Youth Scores',
            onTap: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const AboutScreen())),
          ),
          const SizedBox(height: 10),
          _MoreTile(
            icon: Icons.privacy_tip_outlined,
            iconColor: AppColors.teal,
            title: l10n.privacyPolicy,
            subtitle: isAr ? 'كيف نتعامل مع بياناتك' : 'How we handle your data',
            onTap: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const PrivacyPolicyScreen())),
          ),
          const SizedBox(height: 10),
          _MoreTile(
            icon: Icons.article_outlined,
            iconColor: AppColors.orange,
            title: l10n.terms,
            subtitle: isAr ? 'شروط الاستخدام' : 'Terms of use',
            onTap: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const TermsScreen())),
          ),
        ],
      ),
    );
  }
}

class _MoreTile extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _MoreTile({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: iconColor, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(
                        color: AppColors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: TextStyle(color: AppColors.teal, fontSize: 12, height: 1.3)),
              ],
            ),
          ),
          Icon(Icons.chevron_right, color: AppColors.aqua, size: 20),
        ]),
      ),
    );
  }
}
