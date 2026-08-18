import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/competition_data_model.dart';
import '../../core/models/follows.dart';
import '../../core/providers/app_provider.dart';
import '../../core/utils/roster_position.dart';
import '../../widgets/common/cached_logo.dart';
import '../../widgets/match/match_card.dart';
import '../../widgets/stats/player_matches_sheet.dart' show showPlayerMatchesSheet, PlayerStatType;
import '../match/match_detail_screen.dart';
import '../club/club_detail_screen.dart';
import '../coach/coach_detail_screen.dart';
import '../player/player_detail_screen.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const _assistDelimiters = ['صناعة الاهداف', 'assists'];

/// Aggregates scorer or assister names → {name: count} sorted descending.
List<MapEntry<String, int>> _aggregatePlayers(
  List<Match> matches,
  String teamId, {
  required bool forScorers,
}) {
  final map = <String, int>{};
  for (final m in matches) {
    if (!m.isCompleted) continue;
    final events = m.homeTeamId == teamId ? m.homeScorers : m.awayScorers;
    bool inAssists = false;
    for (final entry in events) {
      final lower = entry.toLowerCase().trim();
      if (_assistDelimiters.any((d) => lower == d.toLowerCase())) {
        inAssists = true;
        continue;
      }
      if (forScorers && inAssists) continue;
      if (!forScorers && !inAssists) continue;
      final parts = entry.trim().split(RegExp(r'\s+'));
      int count = 1;
      String name = entry.trim();
      if (parts.length > 1) {
        final last = int.tryParse(parts.last.replaceAll(RegExp(r'[()x×]'), ''));
        if (last != null) {
          count = last;
          name = parts.sublist(0, parts.length - 1).join(' ');
        }
      }
      if (name.isEmpty) continue;
      map[name] = (map[name] ?? 0) + count;
    }
  }
  return (map.entries.toList()..sort((a, b) => b.value.compareTo(a.value)));
}

class _MatchStats {
  int played = 0, won = 0, drawn = 0, lost = 0;
  int goalsFor = 0, goalsAgainst = 0;
  int get goalDiff => goalsFor - goalsAgainst;
  int get points => won * 3 + drawn;
}

_MatchStats _calcStats(
  List<Match> matches,
  String teamId, {
  bool? homeOnly, // null = all, true = home only, false = away only
}) {
  final s = _MatchStats();
  for (final m in matches) {
    if (!m.isCompleted || m.homeScore == null || m.awayScore == null) continue;
    final isHome = m.homeTeamId == teamId;
    if (homeOnly == true && !isHome) continue;
    if (homeOnly == false && isHome) continue;
    final gf = isHome ? m.homeScore! : m.awayScore!;
    final ga = isHome ? m.awayScore! : m.homeScore!;
    s.played++;
    s.goalsFor += gf;
    s.goalsAgainst += ga;
    if (gf > ga) {
      s.won++;
    } else if (gf == ga) {
      s.drawn++;
    } else {
      s.lost++;
    }
  }
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

class TeamDetailScreen extends StatefulWidget {
  final String teamId;
  const TeamDetailScreen({super.key, required this.teamId});

  @override
  State<TeamDetailScreen> createState() => _TeamDetailScreenState();
}

class _TeamDetailScreenState extends State<TeamDetailScreen> {
  final _pageCtrl = PageController();
  int _page = 0;

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  void _goTo(int i) {
    _pageCtrl.animateToPage(
      i,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider     = context.watch<AppProvider>();
    final l10n         = L10n(provider.locale);
    final team         = provider.teamById(widget.teamId);

    if (team == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.teams)),
        body: Center(child: Text(l10n.noData, style: TextStyle(color: AppColors.teal))),
      );
    }

    final teamMatches = provider.competition?.matches
            .where((m) => m.homeTeamId == widget.teamId || m.awayTeamId == widget.teamId)
            .toList() ??
        [];

    final scorers  = _aggregatePlayers(teamMatches, widget.teamId, forScorers: true);
    final assists  = _aggregatePlayers(teamMatches, widget.teamId, forScorers: false);
    final allStats  = _calcStats(teamMatches, widget.teamId);
    final homeStats = _calcStats(teamMatches, widget.teamId, homeOnly: true);
    final awayStats = _calcStats(teamMatches, widget.teamId, homeOnly: false);

    // Colored emoji icons mirror the website's team tabs. The old "Info" tab is
    // replaced by "Coaching Staff" (its group/city moved to the header card);
    // Squad now lists players only.
    final tabs = [
      _Tab(label: l10n.coachingStaff, emoji: '👔'),
      _Tab(label: l10n.tabSquad,      emoji: '👥'),
      _Tab(label: l10n.matches,       emoji: '⚽'),
      _Tab(label: l10n.tabScorers,    emoji: '🥅'),
      _Tab(label: l10n.tabAssists,    emoji: '🎯'),
      _Tab(label: l10n.tabStats,      emoji: '📊'),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(team.nameLines(l10n.locale).primary,
            maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          Builder(builder: (_) {
            final following = provider.isFollowingTeam(widget.teamId);
            return IconButton(
              icon: Icon(following ? Icons.star : Icons.star_border,
                  color: following ? AppColors.orange : null),
              tooltip: following
                  ? (provider.isAr ? 'إلغاء المتابعة' : 'Unfollow')
                  : (provider.isAr ? 'متابعة الفريق' : 'Follow team'),
              onPressed: () => provider.toggleFollowTeam(FollowedTeam(
                id: widget.teamId,
                name: team.name,
                logo: team.logo,
                compDataUrl: provider.compUrl,
              )),
            );
          }),
        ],
      ),
      body: Column(
        children: [
          // ── Fixed team header card ─────────────────────────────────────────
          _TeamHeaderCard(team: team, l10n: l10n),

          // ── Scrollable tab strip ───────────────────────────────────────────
          _TabStrip(tabs: tabs, current: _page, onTap: _goTo),

          // ── 6-page horizontal PageView ─────────────────────────────────────
          Expanded(
            child: PageView(
              controller: _pageCtrl,
              onPageChanged: (i) => setState(() => _page = i),
              children: [
                _CoachingStaffPage(team: team, l10n: l10n),
                _SquadPage(team: team, l10n: l10n),
                _MatchesPage(
                  matches: teamMatches,
                  teamId: widget.teamId,
                  provider: provider,
                  l10n: l10n,
                ),
                _PlayerListPage(
                  entries: scorers,
                  emptyMessage: l10n.noStats,
                  unit: l10n.goals,
                  matches: teamMatches,
                  teamId: widget.teamId,
                  allTeams: provider.competition?.teams ?? [],
                  statType: PlayerStatType.scorers,
                ),
                _PlayerListPage(
                  entries: assists,
                  emptyMessage: l10n.noStats,
                  unit: l10n.assists,
                  matches: teamMatches,
                  teamId: widget.teamId,
                  allTeams: provider.competition?.teams ?? [],
                  statType: PlayerStatType.assists,
                ),
                _StatsPage(
                  allStats: allStats,
                  homeStats: homeStats,
                  awayStats: awayStats,
                  l10n: l10n,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab strip
// ─────────────────────────────────────────────────────────────────────────────

class _Tab {
  final String label;
  final String emoji;
  const _Tab({required this.label, required this.emoji});
}

class _TabStrip extends StatelessWidget {
  final List<_Tab> tabs;
  final int current;
  final ValueChanged<int> onTap;

  const _TabStrip({required this.tabs, required this.current, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.cardBg,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: List.generate(tabs.length, (i) {
            final active = i == current;
            return InkWell(
              onTap: () => onTap(i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: active ? AppColors.aqua : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Opacity(
                      opacity: active ? 1.0 : 0.6,
                      child: Text(tabs[i].emoji, style: const TextStyle(fontSize: 15)),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      tabs[i].label,
                      style: TextStyle(
                        fontSize: 12,
                        color: active ? AppColors.aqua : AppColors.hint,
                        fontWeight: active ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixed header card
// ─────────────────────────────────────────────────────────────────────────────

class _TeamHeaderCard extends StatelessWidget {
  final Team team;
  final L10n l10n;
  const _TeamHeaderCard({required this.team, required this.l10n});

  @override
  Widget build(BuildContext context) {
    final lines = team.nameLines(l10n.locale);
    // Players register with the federation under the club, so the club is the
    // identity; the team's own name (academy/sponsor) sits beneath it. Tapping
    // the header opens the club profile.
    final canOpenClub = team.clubId != null;

    return InkWell(
      onTap: canOpenClub
          ? () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => ClubDetailScreen(clubId: team.clubId!)),
              )
          : null,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          border: Border(bottom: BorderSide(color: AppColors.border)),
        ),
        child: Row(
          children: [
            CachedLogo(url: team.logo, size: 60),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    lines.primary,
                    style: TextStyle(
                      color: AppColors.aqua,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (lines.alias != null)
                    Text(
                      lines.alias!,
                      style: TextStyle(color: AppColors.white, fontSize: 13),
                    ),
                  if (team.getGroup(l10n.locale) != null)
                    Text(
                      team.getGroup(l10n.locale)!.length <= 2
                          ? '${l10n.group} ${team.getGroup(l10n.locale)}'
                          : team.getGroup(l10n.locale)!,
                      style: TextStyle(color: AppColors.teal, fontSize: 13),
                    ),
                  if (team.getCity(l10n.locale) != null)
                    Text(
                      '📍 ${team.getCity(l10n.locale)}',
                      style: TextStyle(color: AppColors.hint, fontSize: 12),
                    ),
                ],
              ),
            ),
            if (canOpenClub)
              Icon(Icons.chevron_right, color: AppColors.hint, size: 20),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 1 – Coaching staff (+ information / point deduction / field)
// ─────────────────────────────────────────────────────────────────────────────

class _CoachingStaffPage extends StatelessWidget {
  final Team team;
  final L10n l10n;
  const _CoachingStaffPage({required this.team, required this.l10n});

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];

    // Coaching staff — clickable profiles when the feed carries ids, otherwise
    // the legacy plain-name list.
    if (team.staff.isNotEmpty) {
      rows.add(_LinkedSection(
        emoji: '👔',
        label: l10n.coachingStaff,
        children: team.staff
            .map((s) => _PersonRow(
                  name: s.getName(l10n.locale),
                  subtitle: s.getRole(l10n.locale),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => CoachDetailScreen(coachId: s.id)),
                  ),
                ))
            .toList(),
      ));
    } else if (team.players != null && team.players!.coach.isNotEmpty) {
      rows.add(_PositionSection(
          emoji: '👔', label: l10n.coachingStaff, names: team.players!.coach));
    }

    // Remaining team info — group and city now live in the header card.
    if (team.information != null && team.information!.isNotEmpty) {
      rows.add(_infoTile(
        icon: Icons.info_outline,
        label: l10n.information,
        value: team.information!,
      ));
    }
    if (team.pointDeduction > 0) {
      rows.add(_infoTile(
        icon: Icons.remove_circle_outline,
        label: l10n.pointDeduction,
        value: '-${team.pointDeduction}',
        valueColor: AppColors.red,
      ));
    }
    if (team.field != null && team.field!.isNotEmpty) {
      rows.add(_fieldTile(team.field!, team.fieldUrl, l10n));
    }

    if (rows.isEmpty) {
      return Center(child: Text(l10n.noData, style: TextStyle(color: AppColors.teal)));
    }

    return ListView(
      padding: const EdgeInsets.all(14),
      children: rows,
    );
  }

  Widget _infoTile({
    required IconData icon,
    required String label,
    required String value,
    Color? valueColor,
  }) {
    final color = valueColor ?? AppColors.white;
    return _InfoCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(icon, color: AppColors.hint, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(color: AppColors.hint, fontSize: 11)),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: TextStyle(color: color, fontSize: 14, height: 1.5),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _fieldTile(String field, String? url, L10n l10n) {
    return _InfoCard(
      child: Row(
        children: [
          Icon(Icons.stadium_outlined, color: AppColors.hint, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.field, style: TextStyle(color: AppColors.hint, fontSize: 11)),
                const SizedBox(height: 2),
                url != null
                    ? InkWell(
                        onTap: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
                        child: Text(
                          field,
                          style: TextStyle(
                            color: AppColors.aqua,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      )
                    : Text(field,
                        style: TextStyle(
                            color: AppColors.white, fontSize: 15, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          if (url != null)
            Icon(Icons.open_in_new, color: AppColors.teal, size: 16),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final Widget child;
  const _InfoCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: child,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 2 – Squad
// ─────────────────────────────────────────────────────────────────────────────

class _SquadPage extends StatelessWidget {
  final Team team;
  final L10n l10n;
  const _SquadPage({required this.team, required this.l10n});

  @override
  Widget build(BuildContext context) {
    // Newer feed carries the roster with ids → clickable player profiles.
    // Coaching staff lives on its own tab now, so the squad is players only,
    // grouped by position (keeper → attack) with a per-section count, matching
    // the website.
    if (team.roster.isNotEmpty) {
      final sections = groupRosterByPosition<RosterPlayer>(
        team.roster,
        l10n.locale,
        position: (r) => r.position,
        name: (r) => r.getName(l10n.locale),
      );
      return ListView(
        padding: const EdgeInsets.all(14),
        children: [
          for (final s in sections)
            _LinkedSection(
              emoji: s.emoji,
              label: '${s.label} (${s.players.length})',
              children: s.players
                  .map((r) => _PersonRow(
                        name: r.getName(l10n.locale),
                        subtitle: [
                          r.getPosition(l10n.locale),
                          r.birthYear?.toString(),
                        ].whereType<String>().where((x) => x.isNotEmpty).join(' · '),
                        leadingNumber: r.shirt,
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => PlayerDetailScreen(playerId: r.id)),
                        ),
                      ))
                  .toList(),
            ),
        ],
      );
    }

    // Legacy fallback (older feed: plain name lists, no ids) — players only.
    final p = team.players;
    if (p == null ||
        (p.goalkeepers.isEmpty &&
            p.defenders.isEmpty &&
            p.midfielders.isEmpty &&
            p.attackers.isEmpty)) {
      return Center(child: Text(l10n.noData, style: TextStyle(color: AppColors.teal)));
    }
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        if (p.goalkeepers.isNotEmpty)
          _PositionSection(emoji: '🧤', label: l10n.goalkeepers, names: p.goalkeepers),
        if (p.defenders.isNotEmpty)
          _PositionSection(emoji: '🛡️', label: l10n.defenders, names: p.defenders),
        if (p.midfielders.isNotEmpty)
          _PositionSection(emoji: '⚡', label: l10n.midfielders, names: p.midfielders),
        if (p.attackers.isNotEmpty)
          _PositionSection(emoji: '⚽', label: l10n.attackers, names: p.attackers),
      ],
    );
  }
}

// A titled card whose rows link to a profile.
class _LinkedSection extends StatelessWidget {
  final String emoji;
  final String label;
  final List<Widget> children;
  const _LinkedSection({required this.emoji, required this.label, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: Text('$emoji $label',
                style: TextStyle(
                    color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 13)),
          ),
          Divider(height: 1, color: AppColors.border),
          for (int i = 0; i < children.length; i++) ...[
            children[i],
            if (i != children.length - 1)
              Divider(height: 1, indent: 14, endIndent: 14, color: AppColors.border),
          ],
        ],
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  final String name;
  final String? subtitle;
  final int? leadingNumber;
  final VoidCallback onTap;
  const _PersonRow({
    required this.name,
    this.subtitle,
    this.leadingNumber,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        child: Row(
          children: [
            SizedBox(
              width: 22,
              child: leadingNumber != null
                  ? Text('$leadingNumber',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: AppColors.aqua, fontSize: 13, fontWeight: FontWeight.bold))
                  : Icon(Icons.person_outline, color: AppColors.teal, size: 16),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: TextStyle(color: AppColors.white, fontSize: 13, height: 1.3)),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Text(subtitle!, style: TextStyle(color: AppColors.hint, fontSize: 11)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: AppColors.hint, size: 16),
          ],
        ),
      ),
    );
  }
}

class _PositionSection extends StatelessWidget {
  final String emoji;
  final String label;
  final List<String> names;
  const _PositionSection({required this.emoji, required this.label, required this.names});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section header
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: Text(
              '$emoji $label',
              style: TextStyle(
                color: AppColors.aqua,
                fontWeight: FontWeight.bold,
                fontSize: 13,
              ),
            ),
          ),
          Divider(height: 1, color: AppColors.border),
          // One row per name
          ...names.asMap().entries.map((entry) {
            final isLast = entry.key == names.length - 1;
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  child: Row(
                    children: [
                      Icon(Icons.arrow_right, color: AppColors.teal, size: 18),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          entry.value,
                          style: TextStyle(color: AppColors.white, fontSize: 13, height: 1.4),
                        ),
                      ),
                    ],
                  ),
                ),
                if (!isLast)
                  Divider(height: 1, indent: 14, endIndent: 14, color: AppColors.border),
              ],
            );
          }),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 3 – Matches
// ─────────────────────────────────────────────────────────────────────────────

class _MatchesPage extends StatelessWidget {
  final List<Match> matches;
  final String teamId;
  final AppProvider provider;
  final L10n l10n;
  const _MatchesPage({
    required this.matches,
    required this.teamId,
    required this.provider,
    required this.l10n,
  });

  @override
  Widget build(BuildContext context) {
    if (matches.isEmpty) {
      return Center(child: Text(l10n.noMatches, style: TextStyle(color: AppColors.teal)));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: matches.length,
      itemBuilder: (context, i) {
        final m = matches[i];
        return MatchCard(
          match: m,
          homeTeam: provider.teamById(m.homeTeamId),
          awayTeam: provider.teamById(m.awayTeamId),
          locale: l10n.locale,
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: m.id)),
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 4 & 5 – Scorers / Assists (shared widget)
// ─────────────────────────────────────────────────────────────────────────────

class _PlayerListPage extends StatelessWidget {
  final List<MapEntry<String, int>> entries;
  final String emptyMessage;
  final String unit;
  final List<Match> matches;
  final String teamId;
  final List<Team> allTeams;
  final PlayerStatType statType;

  const _PlayerListPage({
    required this.entries,
    required this.emptyMessage,
    required this.unit,
    required this.matches,
    required this.teamId,
    required this.allTeams,
    required this.statType,
  });

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return Center(child: Text(emptyMessage, style: TextStyle(color: AppColors.teal)));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: entries.length,
      itemBuilder: (ctx, i) {
        final e = entries[i];
        return InkWell(
          onTap: () => showPlayerMatchesSheet(
            ctx,
            playerName: e.key,
            teamId: teamId,
            matches: matches,
            teams: allTeams,
            statType: statType,
          ),
          borderRadius: BorderRadius.circular(10),
          child: Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.cardBg,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                // Rank
                SizedBox(
                  width: 28,
                  child: Text(
                    i == 0 ? '🥇' : i == 1 ? '🥈' : i == 2 ? '🥉' : '${i + 1}',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: i == 0
                          ? const Color(0xFFFFD700)
                          : i == 1
                              ? const Color(0xFFC0C0C0)
                              : i == 2
                                  ? const Color(0xFFCD7F32)
                                  : AppColors.hint,
                      fontWeight: i < 3 ? FontWeight.bold : FontWeight.normal,
                      fontSize: i < 3 ? 16 : 13,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(e.key,
                      style: TextStyle(color: AppColors.white, fontSize: 14)),
                ),
                Text(
                  '${e.value} $unit',
                  style: TextStyle(
                      color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 13),
                ),
                const SizedBox(width: 4),
                Icon(Icons.chevron_right, color: AppColors.hint, size: 16),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 6 – Statistics (nested PageView: All / Home / Away)
// ─────────────────────────────────────────────────────────────────────────────

class _StatsPage extends StatefulWidget {
  final _MatchStats allStats;
  final _MatchStats homeStats;
  final _MatchStats awayStats;
  final L10n l10n;
  const _StatsPage({
    required this.allStats,
    required this.homeStats,
    required this.awayStats,
    required this.l10n,
  });

  @override
  State<_StatsPage> createState() => _StatsPageState();
}

class _StatsPageState extends State<_StatsPage> {
  final _ctrl = PageController();
  int _sub = 0;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = widget.l10n;
    final subLabels = [
      l10n.isAr ? 'الكل' : 'All',
      l10n.isAr ? 'ديار' : 'Home',
      l10n.isAr ? 'ضيف' : 'Away',
    ];

    return Column(
      children: [
        // Sub-tab strip
        Container(
          color: AppColors.darkBg,
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: Row(
            children: List.generate(3, (i) {
              final active = _sub == i;
              return Expanded(
                child: GestureDetector(
                  onTap: () => _ctrl.animateToPage(i,
                      duration: const Duration(milliseconds: 250),
                      curve: Curves.easeInOut),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    padding: const EdgeInsets.symmetric(vertical: 7),
                    decoration: BoxDecoration(
                      color: active
                          ? AppColors.aqua.withValues(alpha: 0.15)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: active ? AppColors.aqua : AppColors.border,
                      ),
                    ),
                    child: Text(
                      subLabels[i],
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: active ? AppColors.aqua : AppColors.hint,
                        fontWeight: active ? FontWeight.bold : FontWeight.normal,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
        // Nested PageView
        Expanded(
          child: PageView(
            controller: _ctrl,
            onPageChanged: (i) => setState(() => _sub = i),
            children: [
              _StatsContent(stats: widget.allStats,  l10n: l10n),
              _StatsContent(stats: widget.homeStats, l10n: l10n),
              _StatsContent(stats: widget.awayStats, l10n: l10n),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Stats content (2 parts) ───────────────────────────────────────────────────

class _StatsContent extends StatelessWidget {
  final _MatchStats stats;
  final L10n l10n;
  const _StatsContent({required this.stats, required this.l10n});

  @override
  Widget build(BuildContext context) {
    if (stats.played == 0) {
      return Center(child: Text(l10n.noData, style: TextStyle(color: AppColors.teal)));
    }
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        _MatchResultsCard(stats: stats, l10n: l10n),
        const SizedBox(height: 14),
        _GoalsCard(stats: stats, l10n: l10n),
      ],
    );
  }
}

// ── Part 1 : Match results pie chart ─────────────────────────────────────────

class _MatchResultsCard extends StatelessWidget {
  final _MatchStats stats;
  final L10n l10n;
  const _MatchResultsCard({required this.stats, required this.l10n});

  String _pct(int value) {
    if (stats.played == 0) return '0%';
    return '${(value / stats.played * 100).round()}%';
  }

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
          // Header: section title + total count
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                l10n.matchResults,
                style: TextStyle(
                  color: AppColors.aqua,
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.darkBg,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.border),
                ),
                child: Text(
                  '${l10n.totalMatches}: ${stats.played}',
                  style: TextStyle(color: AppColors.teal, fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          // Pie chart + legend row
          Row(
            children: [
              // Donut chart
              SizedBox(
                width: 130,
                height: 130,
                child: CustomPaint(
                  painter: _DonutPainter(
                    won:   stats.won,
                    drawn: stats.drawn,
                    lost:  stats.lost,
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${stats.played}',
                          style: TextStyle(
                            color: AppColors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          l10n.isAr ? 'مباراة' : 'matches',
                          style: TextStyle(color: AppColors.hint, fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 24),
              // Legend
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _LegendRow(
                      color: AppColors.green,
                      label: l10n.winLabel,
                      count: stats.won,
                      pct: _pct(stats.won),
                    ),
                    const SizedBox(height: 10),
                    _LegendRow(
                      color: AppColors.yellow,
                      label: l10n.drawLabel,
                      count: stats.drawn,
                      pct: _pct(stats.drawn),
                    ),
                    const SizedBox(height: 10),
                    _LegendRow(
                      color: AppColors.red,
                      label: l10n.lossLabel,
                      count: stats.lost,
                      pct: _pct(stats.lost),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LegendRow extends StatelessWidget {
  final Color color;
  final String label;
  final int count;
  final String pct;
  const _LegendRow({
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
          width: 12,
          height: 12,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(label, style: TextStyle(color: AppColors.white, fontSize: 13)),
        ),
        Text(
          '$count',
          style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 14),
        ),
        const SizedBox(width: 6),
        SizedBox(
          width: 38,
          child: Text(
            pct,
            textAlign: TextAlign.end,
            style: TextStyle(color: AppColors.hint, fontSize: 12),
          ),
        ),
      ],
    );
  }
}

class _DonutPainter extends CustomPainter {
  final int won;
  final int drawn;
  final int lost;
  const _DonutPainter({required this.won, required this.drawn, required this.lost});

  @override
  void paint(Canvas canvas, Size size) {
    final total = won + drawn + lost;
    final cx = size.width / 2;
    final cy = size.height / 2;
    final outerR = size.width / 2;
    final innerR = outerR * 0.55;
    final rect = Rect.fromCircle(center: Offset(cx, cy), radius: outerR);
    const gap = 0.04; // radians gap between segments

    if (total == 0) {
      canvas.drawCircle(
        Offset(cx, cy),
        outerR,
        Paint()..color = AppColors.border,
      );
      canvas.drawCircle(
        Offset(cx, cy),
        innerR,
        Paint()..color = AppColors.cardBg,
      );
      return;
    }

    final segments = [
      (won / total,   AppColors.green),
      (drawn / total, AppColors.yellow),
      (lost / total,  AppColors.red),
    ];

    double start = -math.pi / 2;
    for (final seg in segments) {
      final ratio = seg.$1;
      final color = seg.$2;
      if (ratio <= 0) continue;
      final sweep = ratio * 2 * math.pi - (ratio > 0 ? gap : 0);
      canvas.drawArc(
        rect,
        start,
        sweep,
        true,
        Paint()..color = color,
      );
      start += ratio * 2 * math.pi;
    }

    // Hollow centre
    canvas.drawCircle(
      Offset(cx, cy),
      innerR,
      Paint()..color = AppColors.cardBg,
    );
  }

  @override
  bool shouldRepaint(_DonutPainter old) =>
      old.won != won || old.drawn != drawn || old.lost != lost;
}

// ── Part 2 : Goals card ───────────────────────────────────────────────────────

class _GoalsCard extends StatelessWidget {
  final _MatchStats stats;
  final L10n l10n;
  const _GoalsCard({required this.stats, required this.l10n});

  String _rate(int goals) {
    if (stats.played == 0) return '0.0';
    return (goals / stats.played).toStringAsFixed(1);
  }

  @override
  Widget build(BuildContext context) {
    final maxGoals = math.max(stats.goalsFor, stats.goalsAgainst);

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
          Text(
            l10n.isAr ? 'الأهداف' : 'Goals',
            style: TextStyle(
              color: AppColors.aqua,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 16),
          _GoalRow(
            emoji: '⚽',
            label: l10n.goalsScored,
            count: stats.goalsFor,
            rate: _rate(stats.goalsFor),
            rateSuffix: l10n.perMatch,
            color: AppColors.green,
            barFraction: maxGoals > 0 ? stats.goalsFor / maxGoals : 0,
          ),
          const SizedBox(height: 14),
          _GoalRow(
            emoji: '🥅',
            label: l10n.goalsConceded,
            count: stats.goalsAgainst,
            rate: _rate(stats.goalsAgainst),
            rateSuffix: l10n.perMatch,
            color: AppColors.red,
            barFraction: maxGoals > 0 ? stats.goalsAgainst / maxGoals : 0,
          ),
        ],
      ),
    );
  }
}

class _GoalRow extends StatelessWidget {
  final String emoji;
  final String label;
  final int count;
  final String rate;
  final String rateSuffix;
  final Color color;
  final double barFraction;

  const _GoalRow({
    required this.emoji,
    required this.label,
    required this.count,
    required this.rate,
    required this.rateSuffix,
    required this.color,
    required this.barFraction,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(emoji, style: TextStyle(fontSize: 16)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: TextStyle(color: AppColors.white, fontSize: 13),
              ),
            ),
            Text(
              '$count',
              style: TextStyle(
                color: color,
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        // Progress bar
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: barFraction,
            minHeight: 6,
            backgroundColor: AppColors.darkBg,
            valueColor: AlwaysStoppedAnimation<Color>(color),
          ),
        ),
        const SizedBox(height: 5),
        Text(
          '$rate $rateSuffix',
          style: TextStyle(color: AppColors.hint, fontSize: 12),
        ),
      ],
    );
  }
}
