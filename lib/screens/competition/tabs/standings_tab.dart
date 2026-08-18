import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/l10n/app_l10n.dart';
import '../../../core/models/competition_data_model.dart';
import '../../../core/models/standing.dart';
import '../../../core/providers/app_provider.dart';
import '../../../core/utils/share_image.dart';
import '../../../core/utils/standings_calculator.dart';
import '../../../widgets/common/empty_widget.dart';
import '../../../widgets/standings/standings_table.dart';
import '../../team/team_detail_screen.dart';

class StandingsTab extends StatefulWidget {
  const StandingsTab({super.key});

  @override
  State<StandingsTab> createState() => _StandingsTabState();
}

class _StandingsTabState extends State<StandingsTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final Map<String, bool> _expanded = {};
  final Map<String, bool> _sharing  = {};

  // ── Share a group's standings as a PNG image ────────────────────────────────
  Future<void> _shareGroup(
    String gName,
    String displayName,
    List<Standing> rows,
    List<Team> teams,
    L10n l10n,
  ) async {
    if (_sharing[gName] == true) return;
    setState(() => _sharing[gName] = true);

    OverlayEntry? entry;
    final repaintKey = GlobalKey();

    try {
      // Insert the share card off-screen via Overlay so it gets painted.
      final compTitle = context.mounted
          ? context.read<AppProvider>().competitionTitle
          : '';
      entry = OverlayEntry(
        builder: (_) => Positioned(
          left: -10000,
          top:  -10000,
          child: RepaintBoundary(
            key: repaintKey,
            child: Material(
              color: Colors.transparent,
              child: _ShareCard(
                groupName: displayName,
                standings: rows,
                teams: teams,
                competitionTitle: compTitle,
                l10n: l10n,
              ),
            ),
          ),
        ),
      );

      if (!context.mounted) return;
      Overlay.of(context).insert(entry);

      // Wait two frames: one to insert, one to paint.
      await WidgetsBinding.instance.endOfFrame;
      await WidgetsBinding.instance.endOfFrame;

      final boundary = repaintKey.currentContext?.findRenderObject()
          as RenderRepaintBoundary?;
      if (boundary == null || !boundary.hasSize) return;

      final image = await boundary.toImage(pixelRatio: 3.0);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null) return;

      final dir  = await getTemporaryDirectory();
      final file = File('${dir.path}/standings_${gName.hashCode}.png');
      await file.writeAsBytes(bytes.buffer.asUint8List());

      if (!context.mounted) return;
      await SharePlus.instance.share(ShareParams(
        files: [XFile(file.path, mimeType: 'image/png')],
      ));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(l10n.shareStandingsErr),
          backgroundColor: AppColors.cardBg,
        ));
      }
    } finally {
      entry?.remove();
      if (mounted) setState(() => _sharing[gName] = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final provider = context.watch<AppProvider>();
    final comp     = provider.competition!;
    final l10n     = L10n(provider.locale);

    final grouped = StandingsCalculator.byGroup(comp.matches, comp.teams);

    if (grouped.isEmpty || grouped.values.every((l) => l.isEmpty)) {
      return EmptyWidget(message: l10n.noData, icon: Icons.leaderboard);
    }

    for (final g in grouped.keys) {
      _expanded.putIfAbsent(g, () => true);
    }

    return RefreshIndicator(
      onRefresh: () => context.read<AppProvider>().refreshCompetition(),
      color: AppColors.aqua,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: grouped.entries.map((entry) {
          final gName    = entry.key;
          final rows     = entry.value;
          final expanded = _expanded[gName] ?? true;
          final sharing  = _sharing[gName] == true;
          final displayName =
              gName.length <= 2 ? '${l10n.group} $gName' : gName;

          if (gName.isEmpty) {
            // No groups: a single table with a standalone share button above it.
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: sharing
                        ? const Padding(
                            padding: EdgeInsets.all(8),
                            child: SizedBox(
                              width: 18,
                              height: 18,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            ),
                          )
                        : TextButton.icon(
                            icon: Icon(Icons.share,
                                size: 16, color: AppColors.aqua),
                            label: Text(l10n.shareStandings,
                                style: TextStyle(
                                    color: AppColors.aqua, fontSize: 13)),
                            onPressed: () => _shareGroup(
                              gName,
                              l10n.standings,
                              rows,
                              comp.teams,
                              l10n,
                            ),
                          ),
                  ),
                  StandingsTable(
                    standings: rows,
                    teams: comp.teams,
                    matches: comp.matches,
                    l10n: l10n,
                    onTeamTap: (id) => Navigator.push(context,
                        MaterialPageRoute(
                            builder: (_) => TeamDetailScreen(teamId: id))),
                  ),
                ],
              ),
            );
          }

          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Column(
              children: [
                // ── Group header with share button ───────────────────────
                InkWell(
                  onTap: () =>
                      setState(() => _expanded[gName] = !expanded),
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(12),
                  ),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: AppColors.darkBg,
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(12),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          expanded
                              ? Icons.keyboard_arrow_up
                              : Icons.keyboard_arrow_down,
                          color: AppColors.aqua,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            displayName,
                            style: TextStyle(
                              color: AppColors.aqua,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        if (sharing)
                          SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.aqua,
                            ),
                          )
                        else
                          IconButton(
                            icon: Icon(Icons.share,
                                color: AppColors.aqua, size: 20),
                            tooltip: l10n.shareStandings,
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                            onPressed: () => _shareGroup(
                              gName,
                              displayName,
                              rows,
                              comp.teams,
                              l10n,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                if (expanded)
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: StandingsTable(
                      standings: rows,
                      teams: comp.teams,
                      matches: comp.matches,
                      l10n: l10n,
                      onTeamTap: (id) => Navigator.push(context,
                          MaterialPageRoute(
                              builder: (_) =>
                                  TeamDetailScreen(teamId: id))),
                    ),
                  ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Share card — rendered off-screen via OverlayEntry and captured as PNG ─────

class _ShareCard extends StatelessWidget {
  final String         groupName;
  final List<Standing> standings;
  final List<Team>     teams;
  final String         competitionTitle;
  final L10n           l10n;

  static const _bg      = ShareColors.bg;
  static const _surface = ShareColors.surface;
  static const _border  = ShareColors.border;
  static const _aqua    = ShareColors.aqua;
  static const _white   = ShareColors.white;
  static const _hint    = ShareColors.hint;
  static const _gold    = ShareColors.gold;
  static const _green   = ShareColors.green;
  static const _red     = ShareColors.red;

  const _ShareCard({
    required this.groupName,
    required this.standings,
    required this.teams,
    required this.competitionTitle,
    required this.l10n,
  });

  @override
  Widget build(BuildContext context) {
    final isAr = l10n.isAr;

    return Container(
      width: 420,
      decoration: const BoxDecoration(color: _bg),
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Header ────────────────────────────────────────────────────────
          Row(
            children: [
              const Text('🏆', style: TextStyle(fontSize: 22)),
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
                      groupName,
                      style: TextStyle(
                        color: _aqua,
                        fontWeight: FontWeight.bold,
                        fontSize: competitionTitle.isNotEmpty ? 12 : 16,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // ── Column headers ────────────────────────────────────────────────
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: _surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _border),
            ),
            child: Row(
              children: [
                _hdr('#',           28,  isAr),
                _hdr(l10n.teamCol, null, isAr, left: true),
                _hdr(l10n.played,  32,  isAr),
                _hdr(l10n.won,     32,  isAr),
                _hdr(l10n.drawn,   32,  isAr),
                _hdr(l10n.lost,    32,  isAr),
                _hdr(l10n.gd,      38,  isAr),
                _hdr(l10n.points,  38,  isAr),
              ],
            ),
          ),
          const SizedBox(height: 6),

          // ── Team rows ─────────────────────────────────────────────────────
          ...standings.asMap().entries.map((e) {
            final idx  = e.key;
            final s    = e.value;
            final team =
                teams.where((t) => t.id == s.teamId).firstOrNull;
            final name    = team?.getName(l10n.locale) ?? s.teamId;
            final isTop   = idx == 0;
            final gdText  = s.goalDiff > 0
                ? '+${s.goalDiff}'
                : '${s.goalDiff}';
            final gdColor = s.goalDiff > 0
                ? _green
                : s.goalDiff < 0
                    ? _red
                    : _hint;

            return Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
              decoration: BoxDecoration(
                color: isTop
                    ? _aqua.withValues(alpha: 0.08)
                    : idx.isEven
                        ? _surface.withValues(alpha: 0.6)
                        : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                border: isTop
                    ? Border.all(color: _aqua.withValues(alpha: 0.3))
                    : null,
              ),
              child: Row(
                children: [
                  _cell('${s.position}', 28,
                      color: isTop ? _gold : _hint, bold: isTop),
                  Expanded(
                    child: Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign:
                          isAr ? TextAlign.right : TextAlign.left,
                      style: TextStyle(
                        color: isTop ? _aqua : _white,
                        fontSize: 13,
                        fontWeight: isTop
                            ? FontWeight.bold
                            : FontWeight.normal,
                      ),
                    ),
                  ),
                  _cell('${s.played}',   32),
                  _cell('${s.won}',      32),
                  _cell('${s.drawn}',    32),
                  _cell('${s.lost}',     32),
                  _cell(gdText,          38, color: gdColor),
                  _cell('${s.points}',   38,
                      color: _aqua, bold: true),
                ],
              ),
            );
          }),

          const SizedBox(height: 14),

          // ── Branding footer ───────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 10, vertical: 6),
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

  Widget _hdr(String label, double? width, bool isAr,
      {bool left = false}) {
    final child = Text(
      label,
      textAlign: left
          ? (isAr ? TextAlign.right : TextAlign.left)
          : TextAlign.center,
      style: const TextStyle(
          color: _hint, fontSize: 11, fontWeight: FontWeight.bold),
    );
    return width != null
        ? SizedBox(width: width, child: child)
        : Expanded(child: child);
  }

  Widget _cell(
    String text,
    double width, {
    Color color = _hint,
    bool bold   = false,
  }) {
    return SizedBox(
      width: width,
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(
          color: color,
          fontSize: 13,
          fontWeight: bold ? FontWeight.bold : FontWeight.normal,
        ),
      ),
    );
  }
}
