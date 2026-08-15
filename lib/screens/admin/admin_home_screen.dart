import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import 'admin_content_tab.dart';
import 'admin_dashboard_tab.dart';
import 'admin_merge_tab.dart';
import 'admin_search_screen.dart';
import 'admin_structure_tab.dart';
import 'admin_users_tab.dart';

/// Admin shell after sign-in — a tabbed panel that mirrors the website's admin
/// navigation: Dashboard, Competitions, News+Venues, Players merge, Coaches
/// merge and Users. Tabs are gated by the signed-in user's role.
class AdminHomeScreen extends StatefulWidget {
  const AdminHomeScreen({super.key});

  @override
  State<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

/// The minimum role a tab needs. Clerks enter results only; editors manage
/// content and merges; superadmins also manage users.
enum _Access { all, editor, superadmin }

class _NavItem {
  final String emoji;
  final String labelAr;
  final String labelEn;
  final _Access access;
  final Widget Function() body;
  const _NavItem({
    required this.emoji,
    required this.labelAr,
    required this.labelEn,
    required this.access,
    required this.body,
  });
}

class _AdminHomeScreenState extends State<AdminHomeScreen> {
  int _index = 0;

  // Emoji icons mirror the website's admin nav.
  static final _all = <_NavItem>[
    _NavItem(
      emoji: '🏠',
      labelAr: 'لوحة التحكم',
      labelEn: 'Dashboard',
      access: _Access.all,
      body: () => const AdminDashboardTab(),
    ),
    _NavItem(
      emoji: '🏆',
      labelAr: 'المسابقات',
      labelEn: 'Competitions',
      access: _Access.all,
      body: () => const AdminStructureTab(),
    ),
    _NavItem(
      emoji: '📰',
      labelAr: 'أخبار وملاعب',
      labelEn: 'News & venues',
      access: _Access.editor,
      body: () => const AdminContentTab(),
    ),
    _NavItem(
      emoji: '👤',
      labelAr: 'اللاعبون',
      labelEn: 'Players',
      access: _Access.editor,
      body: () => const AdminMergeTab(kind: MergeKind.players),
    ),
    _NavItem(
      emoji: '👔',
      labelAr: 'المدربون',
      labelEn: 'Coaches',
      access: _Access.editor,
      body: () => const AdminMergeTab(kind: MergeKind.coaches),
    ),
    _NavItem(
      emoji: '👥',
      labelAr: 'المستخدمون',
      labelEn: 'Users',
      access: _Access.superadmin,
      body: () => const AdminUsersTab(),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AdminAuth>();
    final app = context.watch<AppProvider>();
    final isAr = app.locale == 'ar';
    final user = auth.user;

    // Logging out (or an expired session) drops back to the public app.
    if (user == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) Navigator.of(context).maybePop();
      });
      return const Scaffold();
    }

    bool allowed(_Access a) {
      switch (a) {
        case _Access.all:
          return true;
        case _Access.editor:
          return user.canEdit;
        case _Access.superadmin:
          return user.isSuperadmin;
      }
    }

    final items = _all.where((i) => allowed(i.access)).toList();
    if (_index >= items.length) _index = 0;
    final current = items[_index];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 4,
        // The signed-in admin's name + role take the title's full width.
        title: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              user.fullName?.isNotEmpty == true ? user.fullName! : user.username,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: AppColors.white, fontSize: 14, fontWeight: FontWeight.bold),
            ),
            Text(user.roleLabel(isAr),
                style: TextStyle(color: AppColors.teal, fontSize: 10.5)),
          ],
        ),
        actions: [
          if (user.canEdit)
            IconButton(
              tooltip: isAr ? 'بحث' : 'Search',
              icon: const Text('🔍', style: TextStyle(fontSize: 18)),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AdminSearchScreen()),
              ),
            ),
          IconButton(
            tooltip: isAr ? (app.isDark ? 'الوضع الفاتح' : 'الوضع الداكن') : (app.isDark ? 'Light mode' : 'Dark mode'),
            icon: Text(app.isDark ? '☀️' : '🌙', style: const TextStyle(fontSize: 18)),
            onPressed: () => context.read<AppProvider>().toggleTheme(),
          ),
          IconButton(
            tooltip: isAr ? 'تسجيل الخروج' : 'Log out',
            icon: const Icon(Icons.logout, size: 20),
            onPressed: () async {
              await context.read<AdminAuth>().logout();
              if (context.mounted) Navigator.of(context).maybePop();
            },
          ),
        ],
      ),
      // Tab name as a heading above the content (like the website's page title),
      // then the tab body. IndexedStack keeps each tab's state alive.
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
            alignment: AlignmentDirectional.centerStart,
            child: Text(isAr ? current.labelAr : current.labelEn,
                style: TextStyle(
                    color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 19)),
          ),
          Expanded(
            child: IndexedStack(
              index: _index,
              children: [for (final i in items) i.body()],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
        destinations: [
          for (final i in items)
            NavigationDestination(
              icon: Text(i.emoji, style: const TextStyle(fontSize: 20)),
              label: isAr ? i.labelAr : i.labelEn,
            ),
        ],
      ),
    );
  }
}
