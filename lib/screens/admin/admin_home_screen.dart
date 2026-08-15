import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';

/// Admin landing after sign-in. Shows who is logged in and the data-entry
/// sections. Match-result entry is wired here next.
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
          // Placeholder — match-result entry lands here in the next step.
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.cardBg,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(children: [
              Icon(Icons.sports_soccer, color: AppColors.aqua),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  isAr
                      ? 'إدخال نتائج المباريات — قيد الإنشاء'
                      : 'Match-result entry — coming next',
                  style: TextStyle(color: AppColors.white, fontSize: 13.5),
                ),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}
