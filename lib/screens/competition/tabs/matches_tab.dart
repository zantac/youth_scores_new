import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/l10n/app_l10n.dart';
import '../../../core/models/competition_data_model.dart';
import '../../../core/providers/app_provider.dart';
import '../../../core/utils/date_utils.dart';
import '../../../core/utils/share_image.dart';
import '../../../widgets/common/empty_widget.dart';
import '../../../widgets/match/match_card.dart';
import '../../match/match_detail_screen.dart';

class MatchesTab extends StatefulWidget {
  const MatchesTab({super.key});

  @override
  State<MatchesTab> createState() => _MatchesTabState();
}

class _MatchesTabState extends State<MatchesTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final Map<String, bool> _expanded = {};
  final Map<String, bool> _sharing  = {};
  String? _selectedGroup; // null = show all groups
  final ScrollController _scrollController = ScrollController();
  bool _initialScrollDone = false;

  // ── Share a round's matches as a PNG image ──────────────────────────────────
  Future<void> _shareRound(
    String key,
    String week,
    String date,
    List<Match> matches,
    L10n l10n,
  ) async {
    if (_sharing[key] == true) return;
    setState(() => _sharing[key] = true);

    final provider = context.read<AppProvider>();
    final locale   = l10n.locale;
    final rows = matches
        .map((m) => (
              home: provider.teamById(m.homeTeamId)?.getName(locale) ?? m.homeTeamId,
              away: provider.teamById(m.awayTeamId)?.getName(locale) ?? m.awayTeamId,
              homeScore: m.homeScore,
              awayScore: m.awayScore,
              completed: m.isCompleted,
              time: m.time,
            ))
        .toList();
    final roundLabel = week.isNotEmpty
        ? '${l10n.week} $week'
        : (l10n.isAr ? 'مباريات' : 'Matches');
    final dateLabel =
        date.isNotEmpty ? AppDateUtils.formatMatchDate(date, locale) : '';

    await shareWidgetImage(
      context,
      filePrefix: 'round_${key.hashCode}',
      errorText: l10n.isAr ? 'تعذّر مشاركة المباريات' : 'Could not share matches',
      card: _RoundShareCard(
        competitionTitle: provider.competitionTitle,
        roundLabel: roundLabel,
        dateLabel: dateLabel,
        rows: rows,
        isAr: l10n.isAr,
      ),
    );

    if (mounted) setState(() => _sharing[key] = false);
  }

  // Approximate height of a collapsed section header (px), used for auto-scroll.
  static const double _kHeaderHeight = 45.0;

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final provider = context.watch<AppProvider>();
    final comp     = provider.competition!;
    final l10n     = L10n(provider.locale);

    // All distinct non-empty groups
    final allGroups = comp.matches
        .map((m) => m.group)
        .where((g) => g.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    final hasGroupFilter = allGroups.length > 1;

    // Guard selected group against stale state
    if (_selectedGroup != null && !allGroups.contains(_selectedGroup)) {
      _selectedGroup = null;
    }

    // Sort matches chronologically by date, then time
    final sorted = List<Match>.from(comp.matches)
      ..sort((a, b) {
        final d = AppDateUtils.compareDates(a.date, b.date);
        return d != 0 ? d : a.time.compareTo(b.time);
      });

    // Apply group filter
    final filtered = _selectedGroup == null
        ? sorted
        : sorted.where((m) => m.group == _selectedGroup).toList();

    if (comp.matches.isEmpty) {
      return EmptyWidget(message: l10n.noMatches, icon: Icons.sports_soccer);
    }

    // Group by (week, date) — preserving sorted order
    final byRoundDate = <String, List<Match>>{};
    for (final m in filtered) {
      final key = '${m.week}||${m.date}';
      byRoundDate.putIfAbsent(key, () => []).add(m);
    }

    // Auto-expand the nearest current/upcoming round
    if (_expanded.isEmpty && byRoundDate.isNotEmpty) {
      final today = _todayStr();
      String? target;
      for (final entry in byRoundDate.entries) {
        final date = entry.value.first.date;
        if (date == today) { target = entry.key; break; }
      }
      if (target == null) {
        for (final entry in byRoundDate.entries) {
          final date = entry.value.first.date;
          if (date.compareTo(today) > 0) { target = entry.key; break; }
        }
      }
      target ??= byRoundDate.keys.last;
      for (final k in byRoundDate.keys) {
        _expanded[k] = k == target;
      }
      // Scroll to the target section after the list is rendered
      if (!_initialScrollDone) {
        _initialScrollDone = true;
        final targetIndex = byRoundDate.keys.toList().indexOf(target);
        if (targetIndex > 0) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_scrollController.hasClients) {
              _scrollController.animateTo(
                targetIndex * _kHeaderHeight,
                duration: const Duration(milliseconds: 400),
                curve: Curves.easeOut,
              );
            }
          });
        }
      }
    } else {
      for (final k in byRoundDate.keys) {
        _expanded.putIfAbsent(k, () => false);
      }
    }

    return Column(
      children: [
        // ── Group filter ───────────────────────────────────────────────────
        if (hasGroupFilter)
          Container(
            color: AppColors.darkBg,
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _Chip(
                    label: l10n.isAr ? 'الكل' : 'All',
                    active: _selectedGroup == null,
                    onTap: () => setState(() => _selectedGroup = null),
                  ),
                  ...allGroups.map((g) => _Chip(
                        label: g,
                        active: _selectedGroup == g,
                        onTap: () => setState(() =>
                            _selectedGroup = _selectedGroup == g ? null : g),
                      )),
                ],
              ),
            ),
          ),

        // ── Match list ─────────────────────────────────────────────────────
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => context.read<AppProvider>().refreshCompetition(),
            color: AppColors.aqua,
            child: filtered.isEmpty
              ? ListView(children: [EmptyWidget(message: l10n.noMatches, icon: Icons.sports_soccer)])
              : ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.only(bottom: 16),
                  itemCount: byRoundDate.length,
                  itemBuilder: (_, i) {
                    final key      = byRoundDate.keys.elementAt(i);
                    final matches  = byRoundDate[key]!;
                    final isOpen   = _expanded[key] ?? false;
                    final week     = matches.first.week;
                    final date     = matches.first.date;

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _RoundHeader(
                          week: week,
                          date: date,
                          count: matches.length,
                          expanded: isOpen,
                          sharing: _sharing[key] == true,
                          l10n: l10n,
                          onTap: () => setState(
                            () => _expanded[key] = !isOpen,
                          ),
                          onShare: () =>
                              _shareRound(key, week, date, matches, l10n),
                        ),
                        if (isOpen)
                          _MatchGrouped(
                            matches: matches,
                            provider: provider,
                            l10n: l10n,
                            context: context,
                          ),
                      ],
                    );
                  },
                ),
            ),
          ),
      ],
    );
  }

  String _todayStr() {
    final t = DateTime.now();
    return '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _Chip({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: active ? AppColors.aqua : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: active ? AppColors.aqua : AppColors.border,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? AppColors.darkBg : AppColors.teal,
              fontWeight: active ? FontWeight.bold : FontWeight.normal,
              fontSize: 12,
            ),
          ),
        ),
      ),
    );
  }
}

// ── Round + date header ───────────────────────────────────────────────────────

class _RoundHeader extends StatelessWidget {
  final String week;
  final String date;
  final int count;
  final bool expanded;
  final bool sharing;
  final L10n l10n;
  final VoidCallback onTap;
  final VoidCallback onShare;

  const _RoundHeader({
    required this.week,
    required this.date,
    required this.count,
    required this.expanded,
    required this.sharing,
    required this.l10n,
    required this.onTap,
    required this.onShare,
  });

  @override
  Widget build(BuildContext context) {
    final roundLabel = week.isNotEmpty
        ? '${l10n.week} $week'
        : (l10n.isAr ? 'مباريات' : 'Matches');

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          border: Border(
            bottom: BorderSide(color: AppColors.border),
            top: BorderSide(color: AppColors.border),
          ),
        ),
        child: Row(
          children: [
            // Expand/collapse icon
            Icon(
              expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
              color: AppColors.aqua,
              size: 20,
            ),
            const SizedBox(width: 8),
            // Round label
            Text(
              roundLabel,
              style: TextStyle(
                color: AppColors.aqua,
                fontWeight: FontWeight.bold,
                fontSize: 13,
              ),
            ),
            // Separator dot
            if (date.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text('·', style: TextStyle(color: AppColors.hint)),
              ),
              // Date
              Text(
                AppDateUtils.formatMatchDate(date, l10n.locale),
                style: TextStyle(color: AppColors.teal, fontSize: 12),
              ),
            ],
            const Spacer(),
            // Match count badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.aqua.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: TextStyle(color: AppColors.aqua, fontSize: 12),
              ),
            ),
            const SizedBox(width: 4),
            // Share the round as an image
            if (sharing)
              const Padding(
                padding: EdgeInsets.all(8),
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              )
            else
              IconButton(
                icon: Icon(Icons.share, color: AppColors.aqua, size: 18),
                tooltip: l10n.share,
                visualDensity: VisualDensity.compact,
                onPressed: onShare,
              ),
          ],
        ),
      ),
    );
  }
}

// ── Expanded matches, sub-grouped by group ────────────────────────────────────

class _MatchGrouped extends StatelessWidget {
  final List<Match> matches;
  final AppProvider provider;
  final L10n l10n;
  final BuildContext context;

  const _MatchGrouped({
    required this.matches,
    required this.provider,
    required this.l10n,
    required this.context,
  });

  @override
  Widget build(BuildContext _) {
    // Sub-group by match.group (preserve insertion order)
    final byGroup = <String, List<Match>>{};
    for (final m in matches) {
      byGroup.putIfAbsent(m.group, () => []).add(m);
    }

    final hasGroups = byGroup.keys.any((k) => k.isNotEmpty);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: byGroup.entries.map((entry) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Group sub-header (only if there are named groups)
            if (hasGroups && entry.key.isNotEmpty)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                color: AppColors.darkBg,
                child: Text(
                  entry.key,
                  style: TextStyle(
                    color: AppColors.teal,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            // Match cards
            ...entry.value.map((m) => MatchCard(
                  match: m,
                  homeTeam: provider.teamById(m.homeTeamId),
                  awayTeam: provider.teamById(m.awayTeamId),
                  locale: l10n.locale,
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => MatchDetailScreen(matchId: m.id),
                    ),
                  ),
                )),
          ],
        );
      }).toList(),
    );
  }
}

// ── Round share card — rendered off-screen and captured as PNG ────────────────

typedef _RoundRow = ({
  String home,
  String away,
  int? homeScore,
  int? awayScore,
  bool completed,
  String time,
});

class _RoundShareCard extends StatelessWidget {
  final String competitionTitle;
  final String roundLabel;
  final String dateLabel;
  final List<_RoundRow> rows;
  final bool isAr;

  const _RoundShareCard({
    required this.competitionTitle,
    required this.roundLabel,
    required this.dateLabel,
    required this.rows,
    required this.isAr,
  });

  @override
  Widget build(BuildContext context) {
    final subtitle =
        [roundLabel, if (dateLabel.isNotEmpty) dateLabel].join('  ·  ');

    return Container(
      width: 420,
      decoration: const BoxDecoration(color: ShareColors.bg),
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          Row(
            children: [
              const Text('⚽', style: TextStyle(fontSize: 22)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (competitionTitle.isNotEmpty)
                      Text(competitionTitle,
                          style: const TextStyle(
                              color: ShareColors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 14)),
                    Text(subtitle,
                        style: const TextStyle(
                            color: ShareColors.aqua,
                            fontWeight: FontWeight.bold,
                            fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Match rows
          ...rows.asMap().entries.map((e) {
            final i = e.key;
            final r = e.value;
            return Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: i.isEven
                    ? ShareColors.surface.withValues(alpha: 0.7)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: ShareColors.border.withValues(alpha: 0.6)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(r.home,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.end,
                        style: const TextStyle(
                            color: ShareColors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(width: 8),
                  ..._middle(r),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(r.away,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.start,
                        style: const TextStyle(
                            color: ShareColors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
            );
          }),

          const SizedBox(height: 14),
          const ShareBrandFooter(),
        ],
      ),
    );
  }

  List<Widget> _middle(_RoundRow r) {
    if (r.completed && r.homeScore != null && r.awayScore != null) {
      return [
        _score('${r.homeScore}'),
        const Text(' - ',
            style: TextStyle(color: ShareColors.hint, fontSize: 14)),
        _score('${r.awayScore}'),
      ];
    }
    final label = r.time.isNotEmpty ? r.time : (isAr ? 'ضد' : 'vs');
    return [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: ShareColors.surface,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(label,
            style: const TextStyle(color: ShareColors.hint, fontSize: 12)),
      ),
    ];
  }

  Widget _score(String s) => SizedBox(
        width: 24,
        child: Text(s,
            textAlign: TextAlign.center,
            style: const TextStyle(
                color: ShareColors.aqua,
                fontSize: 16,
                fontWeight: FontWeight.bold)),
      );
}

