import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import 'admin_competitions_screen.dart';

/// Admin landing after sign-in. Shows who is logged in and the data-entry
/// sections.
class AdminHomeScreen extends StatelessWidget {
  const AdminHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AdminAuth>();
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final user = auth.user;

    // Logging out (or an expired session) drops back to the public app.
    if (user == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) Navigator.of(context).maybePop();
      });
      return const Scaffold();
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(isAr ? 'لوحة الإدارة' : 'Admin Panel'),
        actions: [
          IconButton(
            tooltip: isAr ? 'تسجيل الخروج' : 'Log out',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await context.read<AdminAuth>().logout();
              if (context.mounted) Navigator.of(context).maybePop();
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Signed-in card ─────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
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
                  color: AppColors.aqua.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.person, color: AppColors.aqua),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user.fullName?.isNotEmpty == true
                        ? user.fullName!
                        : user.username,
                        style: TextStyle(
                            color: AppColors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(user.roleLabel(isAr),
                        style: TextStyle(color: AppColors.teal, fontSize: 12.5)),
                  ],
                ),
              ),
            ]),
          ),
          const SizedBox(height: 20),
          Text(isAr ? 'إدخال البيانات' : 'Data entry',
              style: TextStyle(
                  color: AppColors.hint,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5)),
          const SizedBox(height: 10),
          _EntryTile(
            icon: Icons.sports_soccer,
            title: isAr ? 'إدخال نتائج المباريات' : 'Match results',
            subtitle: isAr
                ? 'اختر بطولة لإدخال النتائج والأهداف والبطاقات'
                : 'Pick a competition to enter scores, goals and cards',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const AdminCompetitionsScreen()),
            ),
          ),
        ],
      ),
    );
  }
}

class _EntryTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _EntryTile({
    required this.icon,
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
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: AppColors.aqua.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: AppColors.aqua, size: 22),
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
                        fontSize: 14.5)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: TextStyle(
                        color: AppColors.teal, fontSize: 12, height: 1.3)),
              ],
            ),
          ),
          Icon(Icons.chevron_right, color: AppColors.aqua, size: 20),
        ]),
      ),
    );
  }
}
