import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/follows.dart';
import '../../core/providers/app_provider.dart';
import '../../widgets/common/cached_logo.dart';
import '../competition/competition_data_screen.dart';
import '../team/team_detail_screen.dart';

/// The user's followed competitions and teams, in two sections, each item
/// tappable to open and with a remove (unfollow) button. This is where the home
/// "Following" strip moved to. Local-only, driven by AppProvider.
class FavouritesScreen extends StatelessWidget {
  const FavouritesScreen({super.key});

  // Open a followed team: load the competition it was followed from (the team
  // page reads team/matches from the loaded competition), then push it.
  Future<void> _openTeam(
      BuildContext ctx, AppProvider provider, FollowedTeam t) async {
    if (t.compDataUrl != null && t.compDataUrl!.isNotEmpty) {
      await provider.loadCompetition(t.compDataUrl!);
    }
    if (!ctx.mounted) return;
    Navigator.push(
      ctx,
      MaterialPageRoute(builder: (_) => TeamDetailScreen(teamId: t.id)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AppProvider>();
    final locale = provider.locale;
    final l10n = L10n(locale);
    final isAr = l10n.isAr;
    final comps = provider.followedComps;
    final teams = provider.followedTeams;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.favorites)),
      body: comps.isEmpty && teams.isEmpty
          ? _Empty(isAr: isAr)
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                _SectionTitle(
                    icon: Icons.emoji_events,
                    label: l10n.competitions,
                    count: comps.length),
                if (comps.isEmpty)
                  _EmptyRow(text: isAr ? 'لا توجد بطولات متابَعة' : 'No followed competitions')
                else
                  for (final c in comps)
                    _FavRow(
                      leading: const Text('🏆', style: TextStyle(fontSize: 18)),
                      label: c.getTitle(locale),
                      onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => CompetitionDataScreen(
                                    dataUrl: c.dataUrl,
                                    title: c.getTitle(locale),
                                    seasonName: '',
                                  ))),
                      onRemove: () => provider.toggleFollowComp(c),
                    ),
                const SizedBox(height: 18),
                _SectionTitle(
                    icon: Icons.groups, label: l10n.teams, count: teams.length),
                if (teams.isEmpty)
                  _EmptyRow(text: isAr ? 'لا توجد فرق متابَعة' : 'No followed teams')
                else
                  for (final t in teams)
                    _FavRow(
                      leading: CachedLogo(url: t.logo, size: 26),
                      label: t.getName(locale),
                      onTap: () => _openTeam(context, provider, t),
                      onRemove: () => provider.toggleFollowTeam(t),
                    ),
              ],
            ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final IconData icon;
  final String label;
  final int count;
  const _SectionTitle(
      {required this.icon, required this.label, required this.count});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 6, 4, 8),
      child: Row(children: [
        Icon(icon, color: AppColors.aqua, size: 18),
        const SizedBox(width: 8),
        Text(label,
            style: TextStyle(
                color: AppColors.white,
                fontWeight: FontWeight.bold,
                fontSize: 15)),
        const SizedBox(width: 6),
        Text('($count)',
            style: TextStyle(color: AppColors.hint, fontSize: 12)),
      ]),
    );
  }
}

class _FavRow extends StatelessWidget {
  final Widget leading;
  final String label;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  const _FavRow({
    required this.leading,
    required this.label,
    required this.onTap,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final isAr = context.read<AppProvider>().locale == 'ar';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.aqua.withValues(alpha: 0.3)),
          ),
          child: Row(children: [
            leading,
            const SizedBox(width: 10),
            Expanded(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.white,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600)),
            ),
            IconButton(
              visualDensity: VisualDensity.compact,
              icon: Icon(Icons.star, color: AppColors.orange, size: 20),
              tooltip: isAr ? 'إلغاء المتابعة' : 'Unfollow',
              onPressed: onRemove,
            ),
            Icon(Icons.chevron_right, color: AppColors.aqua, size: 18),
          ]),
        ),
      ),
    );
  }
}

class _EmptyRow extends StatelessWidget {
  final String text;
  const _EmptyRow({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      child: Text(text, style: TextStyle(color: AppColors.hint, fontSize: 12.5)),
    );
  }
}

class _Empty extends StatelessWidget {
  final bool isAr;
  const _Empty({required this.isAr});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.star_border, color: AppColors.hint, size: 56),
            const SizedBox(height: 12),
            Text(
              isAr ? 'لا توجد عناصر متابَعة بعد' : 'Nothing followed yet',
              style: TextStyle(
                  color: AppColors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 16),
            ),
            const SizedBox(height: 8),
            Text(
              isAr
                  ? 'تابِع بطولة أو فريقاً بالضغط على النجمة ⭐ لتظهر هنا وتصلك إشعارات النتائج.'
                  : 'Follow a competition or team with the ⭐ to see it here and get results notifications.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.teal, fontSize: 13, height: 1.6),
            ),
          ],
        ),
      ),
    );
  }
}
