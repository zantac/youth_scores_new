import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/l10n/app_l10n.dart';
import '../../../core/models/competition_data_model.dart';
import '../../../core/providers/app_provider.dart';
import '../../../core/utils/stats_calculator.dart';
import '../../../widgets/common/cached_logo.dart';
import '../../../widgets/common/empty_widget.dart';
import '../../../widgets/stats/player_matches_sheet.dart';
import '../../../widgets/stats/player_stat_item.dart';

// ── Main tab ──────────────────────────────────────────────────────────────────

class StatsTab extends StatefulWidget {
  const StatsTab({super.key});

  @override
  State<StatsTab> createState() => _StatsTabState();
}

class _StatsTabState extends State<StatsTab> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final _pageCtrl = PageController();
  int _page = 0;
  String? _selectedGroup;

  bool _sharingStats = false;

  // ── Stats memo cache ─────────────────────────────────────────────────────────
  CompetitionData? _lastComp;
  String?          _lastGroupKey;
  List<PlayerStat> _cachedScorers   = [];
  List<PlayerStat> _cachedAssisters = [];
  List<PlayerStat> _cachedSheets    = [];
  List<PlayerStat> _cachedYellow    = [];
  List<PlayerStat> _cachedRed       = [];

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  bool get _isOverviewPage => _page == 0;

  Future<void> _sharePlayerStats(L10n l10n) async {
    if (_sharingStats || _page < 1 || _page > 3) return;
    setState(() => _sharingStats = true);

    final String title, emoji, unit;
    final List<PlayerStat> stats;
    switch (_page) {
      case 1:
        title = l10n.scorers;    emoji = '⚽'; unit = l10n.goalsUnit;
        stats = _cachedScorers.take(10).toList();
      case 2:
        title = l10n.assists;    emoji = '🎯'; unit = l10n.assistUnit;
        stats = _cachedAssisters.take(10).toList();
      default:
        title = l10n.cleanSheets; emoji = '🛡️'; unit = l10n.cleanSheetUnit;
        stats = _cachedSheets.take(10).toList();
    }

    if (stats.isEmpty) {
      setState(() => _sharingStats = false);
      return;
    }

    OverlayEntry? entry;
    final repaintKey = GlobalKey();

    try {
      final compTitle = context.mounted
          ? context.read<AppProvider>().competitionTitle
          : '';
      entry = OverlayEntry(
        builder: (_) => Positioned(
          left: -10000, top: -10000,
          child: RepaintBoundary(
            key: repaintKey,
            child: Material(
              color: Colors.transparent,
              child: _PlayerShareCard(
                title:            title,
                emoji:            emoji,
                unit:             unit,
                stats:            stats,
                competitionTitle: compTitle,
                groupName:        _isOverviewPage ? null : _selectedGroup,
                l10n:             l10n,
              ),
            ),
          ),
        ),
      );

      if (!context.mounted) return;
      Overlay.of(context).insert(entry);
      await WidgetsBinding.instance.endOfFrame;
      await WidgetsBinding.instance.endOfFrame;

      final boundary = repaintKey.currentContext?.findRenderObject()
          as RenderRepaintBoundary?;
      if (boundary == null || !boundary.hasSize) return;

      final image = await boundary.toImage(pixelRatio: 3.0);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null) return;

      final dir  = await getTemporaryDirectory();
      final file = File('${dir.path}/stats_${_page}_${DateTime.now().millisecondsSinceEpoch}.png');
      await file.writeAsBytes(bytes.buffer.asUint8List());

      if (!context.mounted) return;
      await SharePlus.instance.share(ShareParams(
        files: [XFile(file.path, mimeType: 'image/png')],
      ));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(l10n.isAr ? 'تعذّر مشاركة الإحصائيات' : 'Could not share stats'),
          backgroundColor: AppColors.cardBg,
        ));
      }
    } finally {
      entry?.remove();
      if (mounted) setState(() => _sharingStats = false);
    }
  }

  void _goTo(int i) {
    final crossingBoundary = (_page == 0) != (i == 0);
    if (crossingBoundary) _selectedGroup = null;
    _pageCtrl.animateToPage(
      i,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final provider = context.watch<AppProvider>();
    final comp     = provider.competition!;
    final l10n     = L10n(provider.locale);

    // Overview page: groups derived from match.group field
    final matchGroups = comp.matches
        .map((m) => m.group)
        .where((g) => g.isNotEmpty)
        .toSet()
        .toList()
      ..sort();

    // Player-stat pages: groups derived from team.group field
    final teamGroups = comp.teams
        .map((t) => t.groupKey ?? '')
        .where((g) => g.isNotEmpty)
        .toSet()
        .toList()
      ..sort();

    final activeGroups = _isOverviewPage ? matchGroups : teamGroups;
    final hasGroups    = activeGroups.length > 1;

    if (_selectedGroup != null && !activeGroups.contains(_selectedGroup)) {
      _selectedGroup = null;
    }

    // Overview page filters matches by match.group
    final filteredMatches = _selectedGroup == null
        ? comp.matches
        : comp.matches.where((m) => m.group == _selectedGroup).toList();

    // Player-stat pages filter by team group
    final groupTeamIds = _isOverviewPage || _selectedGroup == null
        ? null
        : comp.teams
            .where((t) => t.groupKey == _selectedGroup)
            .map((t) => t.id)
            .toSet();

    // Recompute only when comp object or effective group key changes.
    final groupKey = _isOverviewPage ? '' : (_selectedGroup ?? '');
    if (!identical(_lastComp, comp) || _lastGroupKey != groupKey) {
      _lastComp     = comp;
      _lastGroupKey = groupKey;

      List<PlayerStat> byGroup(List<PlayerStat> list) => groupTeamIds == null
          ? list
          : list.where((s) => groupTeamIds.contains(s.teamId)).toList();

      _cachedScorers   = byGroup(StatsCalculator.topScorers(comp.matches, comp.teams)).take(30).toList();
      _cachedAssisters = byGroup(StatsCalculator.topAssisters(comp.matches, comp.teams)).take(30).toList();
      _cachedSheets    = byGroup(StatsCalculator.cleanSheets(comp.matches, comp.teams));
      _cachedYellow    = byGroup(StatsCalculator.yellowCards(comp.matches, comp.teams)).take(30).toList();
      _cachedRed       = byGroup(StatsCalculator.redCards(comp.matches, comp.teams)).take(20).toList();
    }

    final scorers   = _cachedScorers;
    final assisters = _cachedAssisters;
    final sheets    = _cachedSheets;
    final yellow    = _cachedYellow;
    final red       = _cachedRed;

    final hasAnyData = comp.matches.isNotEmpty ||
        scorers.isNotEmpty || assisters.isNotEmpty || sheets.isNotEmpty;

    if (!hasAnyData) {
      return EmptyWidget(message: l10n.noStats, icon: Icons.bar_chart);
    }

    // Colored emoji mirror the website's stats sub-tabs; scorers uses a goal
    // net (⚽ is reserved for the matches tab).
    final tabs = [
      ('📊', l10n.statsOverview),
      ('🥅', l10n.scorers),
      ('🎯', l10n.assists),
      ('🛡️', l10n.cleanSheets),
      ('🟨', l10n.cards),
    ];

    return Column(
      children: [
        // ── Tab strip ──────────────────────────────────────────────────────
        _TabStrip(tabs: tabs, current: _page, onTap: _goTo),

        // ── Group filter ───────────────────────────────────────────────────
        if (hasGroups)
          _GroupFilter(
            groups: activeGroups,
            selected: _selectedGroup,
            l10n: l10n,
            onSelect: (g) => setState(() => _selectedGroup = g),
          ),

        // ── Share button (Scorers / Assists / Clean Sheets only) ───────────
        if (_page >= 1 && _page <= 3)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 2),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (_sharingStats)
                  SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppColors.aqua),
                  )
                else
                  GestureDetector(
                    onTap: () => _sharePlayerStats(l10n),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppColors.aqua.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                            color: AppColors.aqua.withValues(alpha: 0.35)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.share, size: 13, color: AppColors.aqua),
                          const SizedBox(width: 5),
                          Text(l10n.share,
                              style: TextStyle(
                                  color: AppColors.aqua, fontSize: 12)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),

        // ── Pages ──────────────────────────────────────────────────────────
        Expanded(
          child: PageView(
            controller: _pageCtrl,
            onPageChanged: (i) => setState(() {
              final crossingBoundary = (_page == 0) != (i == 0);
              if (crossingBoundary) _selectedGroup = null;
              _page = i;
            }),
            children: [
              _CompStatsPage(
                matches: filteredMatches,
                allTeams: comp.teams,
                l10n: l10n,
              ),
              _PlayerPage(
                stats: scorers,
                unit: l10n.goalsUnit,
                emptyMsg: l10n.noStats,
                matches: comp.matches,
                teams: comp.teams,
                statType: PlayerStatType.scorers,
              ),
              _PlayerPage(
                stats: assisters,
                unit: l10n.assistUnit,
                emptyMsg: l10n.noStats,
                matches: comp.matches,
                teams: comp.teams,
                statType: PlayerStatType.assists,
              ),
              _PlayerPage(
                stats: sheets,
                unit: l10n.cleanSheetUnit,
                emptyMsg: l10n.noStats,
                matches: comp.matches,
                teams: comp.teams,
                statType: PlayerStatType.cleanSheets,
              ),
              _CardsPage(
                yellow: yellow,
                red: red,
                l10n: l10n,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Tab strip ─────────────────────────────────────────────────────────────────

class _TabStrip extends StatelessWidget {
  final List<(String, String)> tabs;
  final int current;
  final ValueChanged<int> onTap;

  const _TabStrip({
    required this.tabs,
    required this.current,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.cardBg,
      child: Row(
        children: List.generate(tabs.length, (i) {
          final active       = i == current;
          final (icon, label) = tabs[i];
          return Expanded(
            child: InkWell(
              onTap: () => onTap(i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: active ? AppColors.aqua : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Opacity(
                      opacity: active ? 1.0 : 0.6,
                      child: Text(icon, style: const TextStyle(fontSize: 18)),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      label,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 10,
                        color: active ? AppColors.aqua : AppColors.hint,
                        fontWeight:
                            active ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

// ── Page 5 — Cards leaderboard ────────────────────────────────────────────────

class _CardsPage extends StatelessWidget {
  final List<PlayerStat> yellow;
  final List<PlayerStat> red;
  final L10n l10n;

  const _CardsPage({
    required this.yellow,
    required this.red,
    required this.l10n,
  });

  @override
  Widget build(BuildContext context) {
    if (yellow.isEmpty && red.isEmpty) {
      return Center(
          child: Text(l10n.noStats,
              style: TextStyle(color: AppColors.teal)));
    }
    return ListView(
      padding: const EdgeInsets.only(bottom: 16),
      children: [
        if (yellow.isNotEmpty) ...[
          _CardSectionHeader(label: '🟨  ${l10n.yellowCardsLabel}', color: AppColors.yellow),
          ...yellow.asMap().entries.map((e) =>
              PlayerStatItem(rank: e.key + 1, stat: e.value, unit: l10n.yellowCardUnit)),
          const SizedBox(height: 8),
        ],
        if (red.isNotEmpty) ...[
          _CardSectionHeader(label: '🟥  ${l10n.redCardsLabel}', color: AppColors.red),
          ...red.asMap().entries.map((e) =>
              PlayerStatItem(rank: e.key + 1, stat: e.value, unit: l10n.redCardUnit)),
        ],
      ],
    );
  }
}

class _CardSectionHeader extends StatelessWidget {
  final String label;
  final Color color;
  const _CardSectionHeader({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(8, 8, 8, 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(label,
          style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 13)),
    );
  }
}

// ── Group filter bar ──────────────────────────────────────────────────────────

class _GroupFilter extends StatelessWidget {
  final List<String> groups;
  final String? selected;
  final L10n l10n;
  final ValueChanged<String?> onSelect;

  const _GroupFilter({
    required this.groups,
    required this.selected,
    required this.l10n,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final all = l10n.isAr ? 'الكل' : 'All';
    return Container(
      color: AppColors.darkBg,
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _Chip(
              label: all,
              active: selected == null,
              onTap: () => onSelect(null),
            ),
            ...groups.map((g) => _Chip(
                  label: g,
                  active: selected == g,
                  onTap: () => onSelect(selected == g ? null : g),
                )),
          ],
        ),
      ),
    );
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

// ── Page 1 — Competition overview ─────────────────────────────────────────────

class _CompStatsPage extends StatelessWidget {
  final List<Match> matches;
  final List<Team> allTeams;
  final L10n l10n;

  const _CompStatsPage({
    required this.matches,
    required this.allTeams,
    required this.l10n,
  });

  @override
  Widget build(BuildContext context) {
    if (matches.isEmpty) {
      return Center(
          child: Text(l10n.noStats,
              style: TextStyle(color: AppColors.teal)));
    }

    // Base metrics
    final completed = matches.where((m) => m.isCompleted).toList();
    final totalGoals = completed.fold<int>(
        0, (s, m) => s + (m.homeScore ?? 0) + (m.awayScore ?? 0));
    final draws = completed
        .where((m) => m.homeScore == m.awayScore)
        .length;
    final wins       = completed.length - draws;
    final goalRate   =
        completed.isEmpty ? 0.0 : totalGoals / completed.length;

    // Per-team attack/defense
    final teamStats  = StatsCalculator.teamGoalStats(completed, allTeams);
    final byAttack   = [...teamStats]
      ..sort((a, b) => b.goalsFor.compareTo(a.goalsFor));
    final byDefense  = [...teamStats]
      ..sort((a, b) => a.goalsAgainst.compareTo(b.goalsAgainst));

    final bestAttackTeams   = byAttack.isNotEmpty  ? byAttack.where((t) => t.goalsFor      == byAttack.first.goalsFor).toList()         : <TeamGoalStat>[];
    final worstAttackTeams  = byAttack.isNotEmpty  ? byAttack.where((t) => t.goalsFor      == byAttack.last.goalsFor).toList()          : <TeamGoalStat>[];
    final bestDefenseTeams  = byDefense.isNotEmpty ? byDefense.where((t) => t.goalsAgainst == byDefense.first.goalsAgainst).toList()    : <TeamGoalStat>[];
    final worstDefenseTeams = byDefense.isNotEmpty ? byDefense.where((t) => t.goalsAgainst == byDefense.last.goalsAgainst).toList()     : <TeamGoalStat>[];

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        // ── Overview chips ───────────────────────────────────────────────
        _Card(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _StatPill(
                icon: Icons.sports_soccer,
                value: '${matches.length}',
                label: l10n.matches,
              ),
              Container(width: 1, height: 44, color: AppColors.border),
              _StatPill(
                icon: Icons.check_circle_outline,
                value: '${completed.length}',
                label: l10n.completedLabel,
              ),
              Container(width: 1, height: 44, color: AppColors.border),
              _StatPill(
                emoji: '🥅',
                value: '$totalGoals',
                label: l10n.goals,
                highlight: true,
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // ── Match results ────────────────────────────────────────────────
        if (completed.isNotEmpty) ...[
          _Card(
            title: l10n.matchResults,
            child: _DonutMatchResults(
              decisive: wins,
              draws: draws,
              l10n: l10n,
            ),
          ),
          const SizedBox(height: 10),

          // ── Goal rate ────────────────────────────────────────────────
          _Card(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(l10n.goalRateLabel,
                    style: TextStyle(
                        color: AppColors.teal, fontSize: 14)),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      goalRate.toStringAsFixed(1),
                      style: TextStyle(
                        color: AppColors.aqua,
                        fontSize: 26,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Text('⚽', style: TextStyle(fontSize: 16)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],

        // ── Attack rankings ──────────────────────────────────────────────
        if (teamStats.isNotEmpty) ...[
          _Card(
            title: '⚔️  ${l10n.attackRankings}',
            child: Column(
              children: [
                if (bestAttackTeams.isNotEmpty)
                  _RankRows(
                    label:    l10n.bestAttackLabel,
                    stats:    bestAttackTeams,
                    count:    bestAttackTeams.first.goalsFor,
                    unit:     l10n.goals,
                    allTeams: allTeams,
                    positive: true,
                  ),
                if (bestAttackTeams.isNotEmpty &&
                    worstAttackTeams.isNotEmpty &&
                    worstAttackTeams.first.goalsFor != bestAttackTeams.first.goalsFor) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Divider(height: 1, color: AppColors.border),
                  ),
                  _RankRows(
                    label:    l10n.worstAttackLabel,
                    stats:    worstAttackTeams,
                    count:    worstAttackTeams.first.goalsFor,
                    unit:     l10n.goals,
                    allTeams: allTeams,
                    positive: false,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 10),

          // ── Defense rankings ─────────────────────────────────────────
          _Card(
            title: '🛡️  ${l10n.defenseRankings}',
            child: Column(
              children: [
                if (bestDefenseTeams.isNotEmpty)
                  _RankRows(
                    label:    l10n.bestDefenseLabel,
                    stats:    bestDefenseTeams,
                    count:    bestDefenseTeams.first.goalsAgainst,
                    unit:     l10n.concededUnit,
                    allTeams: allTeams,
                    positive: true,
                  ),
                if (bestDefenseTeams.isNotEmpty &&
                    worstDefenseTeams.isNotEmpty &&
                    worstDefenseTeams.first.goalsAgainst != bestDefenseTeams.first.goalsAgainst) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Divider(height: 1, color: AppColors.border),
                  ),
                  _RankRows(
                    label:    l10n.worstDefenseLabel,
                    stats:    worstDefenseTeams,
                    count:    worstDefenseTeams.first.goalsAgainst,
                    unit:     l10n.concededUnit,
                    allTeams: allTeams,
                    positive: false,
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

// ── Pages 2–4 — Player stat list ─────────────────────────────────────────────

class _PlayerPage extends StatelessWidget {
  final List<PlayerStat> stats;
  final String unit;
  final String emptyMsg;
  final List<Match>? matches;
  final List<Team>? teams;
  final PlayerStatType? statType;

  const _PlayerPage({
    required this.stats,
    required this.unit,
    required this.emptyMsg,
    this.matches,
    this.teams,
    this.statType,
  });

  @override
  Widget build(BuildContext context) {
    if (stats.isEmpty) {
      return Center(
          child: Text(emptyMsg,
              style: TextStyle(color: AppColors.teal)));
    }
    final canTap = matches != null && teams != null && statType != null;
    return ListView.builder(
      padding: const EdgeInsets.only(bottom: 16),
      itemCount: stats.length,
      itemBuilder: (ctx, i) => PlayerStatItem(
        rank: i + 1,
        stat: stats[i],
        unit: unit,
        onTap: canTap
            ? () => showPlayerMatchesSheet(
                  ctx,
                  playerName: stats[i].name,
                  teamId: stats[i].teamId,
                  matches: matches!,
                  teams: teams!,
                  statType: statType!,
                )
            : null,
      ),
    );
  }
}

// ── Shared card container ─────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  final String? title;
  final Widget child;

  const _Card({required this.child, this.title});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(
              title!,
              style: TextStyle(
                color: AppColors.aqua,
                fontWeight: FontWeight.bold,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 14),
          ],
          child,
        ],
      ),
    );
  }
}

// ── Overview stat pill ────────────────────────────────────────────────────────

class _StatPill extends StatelessWidget {
  final IconData? icon;
  final String? emoji;
  final String value;
  final String label;
  final bool highlight;

  const _StatPill({
    this.icon,
    this.emoji,
    required this.value,
    required this.label,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        emoji != null
            ? Text(emoji!, style: const TextStyle(fontSize: 18))
            : Icon(icon,
                size: 20,
                color: highlight ? AppColors.aqua : AppColors.teal),
        const SizedBox(height: 6),
        Text(
          value,
          style: TextStyle(
            color: highlight ? AppColors.aqua : AppColors.white,
            fontSize: 22,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(label,
            style:
                TextStyle(color: AppColors.hint, fontSize: 11)),
      ],
    );
  }
}

// ── Donut chart for match results ─────────────────────────────────────────────

class _DonutMatchResults extends StatelessWidget {
  final int decisive;
  final int draws;
  final L10n l10n;

  const _DonutMatchResults({
    required this.decisive,
    required this.draws,
    required this.l10n,
  });

  @override
  Widget build(BuildContext context) {
    final total       = decisive + draws;
    final decisivePct = total > 0 ? decisive / total : 0.0;

    return Row(
      children: [
        SizedBox(
          width: 120,
          height: 120,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CustomPaint(
                size: const Size(120, 120),
                painter: _DonutPainter(
                  decisivePct:   decisivePct,
                  decisiveColor: AppColors.green,
                  drawsColor:    AppColors.yellow,
                  trackColor:    AppColors.border,
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '$total',
                    style: TextStyle(
                      color:      AppColors.white,
                      fontSize:   24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    l10n.completedLabel,
                    style: TextStyle(color: AppColors.hint, fontSize: 9),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(width: 20),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _DonutLegendRow(
                color: AppColors.green,
                label: l10n.decisiveMatches,
                count: decisive,
                pct:   total > 0 ? decisive / total : 0.0,
              ),
              const SizedBox(height: 18),
              _DonutLegendRow(
                color: AppColors.yellow,
                label: l10n.drawMatchesLabel,
                count: draws,
                pct:   total > 0 ? draws / total : 0.0,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DonutLegendRow extends StatelessWidget {
  final Color  color;
  final String label;
  final int    count;
  final double pct;

  const _DonutLegendRow({
    required this.color,
    required this.label,
    required this.count,
    required this.pct,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color:        color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: TextStyle(color: AppColors.teal, fontSize: 12),
          ),
        ),
        Text(
          '$count',
          style: TextStyle(
            color:      color,
            fontWeight: FontWeight.bold,
            fontSize:   18,
          ),
        ),
        const SizedBox(width: 6),
        SizedBox(
          width: 36,
          child: Text(
            '${(pct * 100).round()}%',
            textAlign: TextAlign.end,
            style: TextStyle(color: AppColors.hint, fontSize: 11),
          ),
        ),
      ],
    );
  }
}

class _DonutPainter extends CustomPainter {
  final double decisivePct;
  final Color  decisiveColor;
  final Color  drawsColor;
  final Color  trackColor;

  const _DonutPainter({
    required this.decisivePct,
    required this.decisiveColor,
    required this.drawsColor,
    required this.trackColor,
  });

  static const double _strokeWidth = 16;
  static const double _gapAngle    = 0.10; // radians gap between segments

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.shortestSide / 2) - _strokeWidth / 2;
    final rect   = Rect.fromCircle(center: center, radius: radius);

    // Background track
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style       = PaintingStyle.stroke
        ..strokeWidth = _strokeWidth
        ..color       = trackColor,
    );

    final paint = Paint()
      ..style       = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth
      ..strokeCap   = StrokeCap.round;

    const startAngle = -math.pi / 2;
    const fullCircle = 2 * math.pi;
    final drawsPct   = 1.0 - decisivePct;

    if (decisivePct <= 0.001) {
      paint.color = drawsColor;
      canvas.drawArc(rect, startAngle, fullCircle * 0.9999, false, paint);
    } else if (drawsPct <= 0.001) {
      paint.color = decisiveColor;
      canvas.drawArc(rect, startAngle, fullCircle * 0.9999, false, paint);
    } else {
      paint.color = decisiveColor;
      canvas.drawArc(
          rect, startAngle, decisivePct * fullCircle - _gapAngle, false, paint);

      paint.color = drawsColor;
      final drawsStart = startAngle + decisivePct * fullCircle;
      canvas.drawArc(
          rect, drawsStart, drawsPct * fullCircle - _gapAngle, false, paint);
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) =>
      old.decisivePct   != decisivePct   ||
      old.decisiveColor != decisiveColor ||
      old.drawsColor    != drawsColor    ||
      old.trackColor    != trackColor;
}

// ── Attack/defense rank rows (supports tied teams) ────────────────────────────

class _RankRows extends StatelessWidget {
  final String             label;
  final List<TeamGoalStat> stats;
  final int                count;
  final String             unit;
  final List<Team>         allTeams;
  final bool               positive;

  const _RankRows({
    required this.label,
    required this.stats,
    required this.count,
    required this.unit,
    required this.allTeams,
    required this.positive,
  });

  @override
  Widget build(BuildContext context) {
    final locale = Provider.of<AppProvider>(context, listen: false).locale;
    final color = positive ? AppColors.green : AppColors.red;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 82,
          child: Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              label,
              style: TextStyle(color: AppColors.hint, fontSize: 11),
            ),
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: stats.map((stat) {
              final team = allTeams.where((t) => t.id == stat.teamId).firstOrNull;
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    CachedLogo(url: team?.logo, size: 22, borderRadius: 4),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        stat.getTeamName(locale),
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: AppColors.white, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color:        color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            '$count $unit',
            style: TextStyle(
              color:      color,
              fontWeight: FontWeight.bold,
              fontSize:   12,
            ),
          ),
        ),
      ],
    );
  }
}

// ── Player stats share card (rendered off-screen via OverlayEntry) ────────────

class _PlayerShareCard extends StatelessWidget {
  final String           title;
  final String           emoji;
  final String           unit;
  final List<PlayerStat> stats;
  final String           competitionTitle;
  final String?          groupName;
  final L10n             l10n;

  static const _bg      = Color(0xFF0D1117);
  static const _surface = Color(0xFF161B22);
  static const _aqua    = Color(0xFF00C9A7);
  static const _white   = Color(0xFFE6EDF3);
  static const _hint    = Color(0xFF8B949E);
  static const _gold    = Color(0xFFFFD700);
  static const _silver  = Color(0xFFC0C0C0);
  static const _bronze  = Color(0xFFCD7F32);

  const _PlayerShareCard({
    required this.title,
    required this.emoji,
    required this.unit,
    required this.stats,
    required this.competitionTitle,
    required this.l10n,
    this.groupName,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 400,
      decoration: const BoxDecoration(color: _bg),
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Header ────────────────────────────────────────────────────────
          Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (competitionTitle.isNotEmpty)
                      Text(
                        competitionTitle,
                        style: const TextStyle(
                          color: _white,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                    Text(
                      title,
                      style: const TextStyle(
                        color: _aqua,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    if (groupName != null && groupName!.isNotEmpty)
                      Text(
                        groupName!,
                        style: const TextStyle(color: _hint, fontSize: 11),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // ── Player rows ───────────────────────────────────────────────────
          ...stats.asMap().entries.map((e) {
            final rank      = e.key + 1;
            final stat      = e.value;
            final isTop     = rank <= 3;
            final rankColor = rank == 1
                ? _gold
                : rank == 2
                    ? _silver
                    : _bronze;
            final rankLabel = rank == 1
                ? '🥇'
                : rank == 2
                    ? '🥈'
                    : rank == 3
                        ? '🥉'
                        : '$rank';

            return Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: isTop
                    ? _aqua.withValues(alpha: 0.07)
                    : e.key.isEven
                        ? _surface.withValues(alpha: 0.7)
                        : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                border: rank == 1
                    ? Border.all(color: _gold.withValues(alpha: 0.3))
                    : null,
              ),
              child: Row(
                children: [
                  SizedBox(
                    width: 30,
                    child: Text(
                      rankLabel,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: isTop ? rankColor : _hint,
                        fontWeight: FontWeight.bold,
                        fontSize: isTop ? 16 : 13,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          stat.name,
                          style: TextStyle(
                            color: rank == 1 ? _aqua : _white,
                            fontWeight:
                                isTop ? FontWeight.bold : FontWeight.normal,
                            fontSize: 13,
                          ),
                        ),
                        Text(stat.getTeamName(l10n.locale),
                            style: const TextStyle(
                                color: _hint, fontSize: 11)),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: _aqua.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${stat.count} $unit',
                      style: const TextStyle(
                        color: _aqua,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),

          const SizedBox(height: 14),

          // ── Branding footer ───────────────────────────────────────────────
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: _surface,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'بطولات الناشئين  |  Youth Scores  |  youthscores.org',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: _hint,
                fontSize: 11,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
