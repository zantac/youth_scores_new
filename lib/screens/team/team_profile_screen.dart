import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/profile_models.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/utils/roster_position.dart';
import '../../widgets/common/cached_logo.dart';
import '../club/club_detail_screen.dart';
import '../coach/coach_detail_screen.dart';
import '../competition/competition_data_screen.dart';
import '../player/player_detail_screen.dart';

/// Standalone team profile (opened by id, e.g. from a club page) — mirrors the
/// website's /team page: hero, collapsible Seasons / Staff / Players sections.
class TeamProfileScreen extends StatefulWidget {
  final int teamId;
  const TeamProfileScreen({super.key, required this.teamId});

  @override
  State<TeamProfileScreen> createState() => _TeamProfileScreenState();
}

class _TeamProfileScreenState extends State<TeamProfileScreen> {
  late Future<TeamPublic> _future;
  final _open = {'seasons': false, 'staff': false, 'players': false};

  @override
  void initState() {
    super.initState();
    _future = ApiService().fetchTeam(widget.teamId);
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<AppProvider>().locale;
    final isAr = locale == 'ar';

    return Scaffold(
      appBar: AppBar(title: Text(isAr ? 'الفريق' : 'Team')),
      body: FutureBuilder<TeamPublic>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError || snap.data == null) {
            return Center(
              child: Text(isAr ? 'تعذّر تحميل البيانات' : 'Could not load data',
                  style: TextStyle(color: AppColors.teal)),
            );
          }
          final t = snap.data!;
          final lines = t.nameLines(locale);
          final age = t.getAge(locale);

          return ListView(
            padding: const EdgeInsets.all(14),
            children: [
              // ── Hero ─────────────────────────────────────────────────────
              InkWell(
                onTap: t.clubId != null
                    ? () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => ClubDetailScreen(clubId: t.clubId!)),
                        )
                    : null,
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.cardBg,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      CachedLogo(url: t.logo, size: 60),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(lines.primary,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                          color: AppColors.aqua,
                                          fontSize: 18,
                                          fontWeight: FontWeight.bold)),
                                ),
                                if (t.clubId != null) ...[
                                  const SizedBox(width: 4),
                                  Icon(Icons.chevron_right,
                                      color: AppColors.aqua, size: 18),
                                ],
                              ],
                            ),
                            if (lines.alias != null)
                              Text(lines.alias!,
                                  style: TextStyle(
                                      color: AppColors.white, fontSize: 13)),
                            if (age != null) ...[
                              const SizedBox(height: 2),
                              Text(age,
                                  style: TextStyle(
                                      color: AppColors.hint, fontSize: 12)),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // ── Seasons / competitions ──────────────────────────────────
              if (t.competitions.isNotEmpty)
                _Section(
                  title: isAr ? 'المواسم' : 'Seasons',
                  count: t.competitions.length,
                  open: _open['seasons']!,
                  onToggle: () =>
                      setState(() => _open['seasons'] = !_open['seasons']!),
                  children: t.competitions
                      .map((c) => _seasonRow(context, c, locale))
                      .toList(),
                ),

              // ── Technical staff ─────────────────────────────────────────
              _Section(
                title: isAr ? 'الجهاز الفني' : 'Technical Staff',
                count: t.staff.length,
                open: _open['staff']!,
                onToggle: () => setState(() => _open['staff'] = !_open['staff']!),
                emptyText: t.staff.isEmpty
                    ? (isAr ? 'لا توجد بيانات' : 'No data')
                    : null,
                children: t.staff
                    .map((s) => _personRow(
                          photo: s.photo,
                          name: s.getName(locale),
                          subtitle: s.getRole(locale) ?? '—',
                          rounded: true,
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => CoachDetailScreen(coachId: s.id)),
                          ),
                        ))
                    .toList(),
              ),

              // ── Players (grouped by position) ───────────────────────────
              _Section(
                title: isAr ? 'اللاعبون' : 'Players',
                count: t.roster.length,
                open: _open['players']!,
                onToggle: () =>
                    setState(() => _open['players'] = !_open['players']!),
                emptyText: t.roster.isEmpty
                    ? (isAr ? 'لا توجد قائمة' : 'No squad')
                    : null,
                children: _rosterSections(context, t, locale, isAr),
              ),
            ],
          );
        },
      ),
    );
  }

  // ── Section builders ─────────────────────────────────────────────────────

  Widget _seasonRow(BuildContext context, TeamCompetitionRef c, String locale) {
    final season = c.getSeason(locale);
    final title = c.getTitle(locale);
    return _rowCard(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => CompetitionDataScreen(
            dataUrl: ApiService.competitionDataUrl('${c.competitionId}'),
            title: title,
            seasonName: season,
          ),
        ),
      ),
      child: Row(
        children: [
          const Text('🏆', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(season.isNotEmpty ? season : title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: AppColors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.bold)),
                if (title.isNotEmpty)
                  Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: AppColors.hint, fontSize: 11)),
              ],
            ),
          ),
          Icon(Icons.chevron_right, color: AppColors.aqua, size: 18),
        ],
      ),
    );
  }

  List<Widget> _rosterSections(
      BuildContext context, TeamPublic t, String locale, bool isAr) {
    final sections = groupRosterByPosition<TeamRosterPlayer>(
      t.roster,
      locale,
      position: (p) => p.position,
      name: (p) => p.getName(locale),
    );
    final widgets = <Widget>[];
    for (final s in sections) {
      widgets.add(Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 6, left: 2, right: 2),
        child: Text('${s.emoji} ${s.label} (${s.players.length})',
            style: TextStyle(
                color: AppColors.teal,
                fontSize: 12,
                fontWeight: FontWeight.bold)),
      ));
      for (final p in s.players) {
        final subtitle = [
          p.getPosition(locale),
          p.birthYear?.toString(),
        ].whereType<String>().where((x) => x.isNotEmpty).join(' · ');
        widgets.add(_rowCard(
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
                builder: (_) => PlayerDetailScreen(playerId: p.id)),
          ),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.darkBg,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text(p.shirt?.toString() ?? '—',
                    style: TextStyle(
                        color: AppColors.aqua,
                        fontSize: 13,
                        fontWeight: FontWeight.bold)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.getName(locale),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: AppColors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.bold)),
                    if (subtitle.isNotEmpty)
                      Text(subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: AppColors.hint, fontSize: 11)),
                  ],
                ),
              ),
              if (p.guest)
                Container(
                  margin: const EdgeInsetsDirectional.only(end: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: AppColors.teal.withValues(alpha: 0.4)),
                  ),
                  child: Text(isAr ? 'صاعد' : 'up',
                      style: TextStyle(color: AppColors.teal, fontSize: 10)),
                ),
              Icon(Icons.chevron_right, color: AppColors.aqua, size: 18),
            ],
          ),
        ));
      }
    }
    return widgets;
  }

  Widget _personRow({
    required String? photo,
    required String name,
    required String subtitle,
    required VoidCallback onTap,
    bool rounded = false,
  }) {
    return _rowCard(
      onTap: onTap,
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(rounded ? 20 : 8),
            child: CachedLogo(url: photo, size: 40, borderRadius: rounded ? 20 : 8),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: AppColors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.bold)),
                Text(subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: AppColors.teal, fontSize: 11)),
              ],
            ),
          ),
          Icon(Icons.chevron_right, color: AppColors.aqua, size: 18),
        ],
      ),
    );
  }

  Widget _rowCard({required Widget child, required VoidCallback onTap}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}

// A collapsible section with a header (title + count) and a chevron.
class _Section extends StatelessWidget {
  final String title;
  final int count;
  final bool open;
  final VoidCallback onToggle;
  final List<Widget> children;
  final String? emptyText;

  const _Section({
    required this.title,
    required this.count,
    required this.open,
    required this.onToggle,
    required this.children,
    this.emptyText,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 18),
        InkWell(
          onTap: onToggle,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      text: title,
                      style: TextStyle(
                          color: AppColors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold),
                      children: [
                        if (count > 0)
                          TextSpan(
                            text: '  ($count)',
                            style: TextStyle(
                                color: AppColors.hint,
                                fontSize: 12,
                                fontWeight: FontWeight.normal),
                          ),
                      ],
                    ),
                  ),
                ),
                Icon(open ? Icons.expand_less : Icons.expand_more,
                    color: AppColors.hint, size: 22),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        if (open)
          if (emptyText != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Center(
                child: Text(emptyText!,
                    style: TextStyle(color: AppColors.hint, fontSize: 13)),
              ),
            )
          else
            ...children,
      ],
    );
  }
}
