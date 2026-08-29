import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/profile_models.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../widgets/common/cached_logo.dart';
import '../match/match_detail_screen.dart';

// Career highlights (goals / current club) use a warm gold, matching the site.
const _gold  = Color(0xFFF5C542);
// A readable amber for yellow-card counts (the theme's bright yellow washes out
// on the light background).
const _amber = Color(0xFFF5A623);

class PlayerDetailScreen extends StatefulWidget {
  final int playerId;
  // Which tab to open on (0=season, 1=career, 2=matches) — set from a shared
  // website link's ?tab=. Defaults to the season tab.
  final int initialTab;
  const PlayerDetailScreen({super.key, required this.playerId, this.initialTab = 0});

  @override
  State<PlayerDetailScreen> createState() => _PlayerDetailScreenState();
}

class _PlayerDetailScreenState extends State<PlayerDetailScreen>
    with SingleTickerProviderStateMixin {
  late Future<PlayerFull> _future;
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _future = ApiService().fetchPlayer(widget.playerId);
    _tabs = TabController(
        length: 3, vsync: this, initialIndex: widget.initialTab.clamp(0, 2));
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<AppProvider>().locale;
    final isAr = locale == 'ar';

    return Scaffold(
      appBar: AppBar(title: Text(isAr ? 'اللاعب' : 'Player')),
      body: FutureBuilder<PlayerFull>(
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
          final p = snap.data!;
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
                child: _header(p, locale, isAr),
              ),
              TabBar(
                controller: _tabs,
                labelColor: AppColors.aqua,
                unselectedLabelColor: AppColors.hint,
                indicatorColor: AppColors.aqua,
                labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                tabs: [
                  Tab(text: isAr ? 'هذا الموسم' : 'Season'),
                  Tab(text: isAr ? 'المسيرة' : 'Career'),
                  Tab(text: isAr ? 'المباريات' : 'Matches'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    _currentSeasonTab(p, locale, isAr),
                    _careerTab(p, locale, isAr),
                    _matchesTab(p, locale, isAr),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  // ── Hero ───────────────────────────────────────────────────────────────────
  Widget _header(PlayerFull p, String locale, bool isAr) {
    final position = p.getPosition(locale);
    final hasClub = p.currentClub != null && p.currentClub!.isNotEmpty;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: CachedLogo(
                url: p.photo,
                size: 72,
                borderRadius: 16,
                fit: BoxFit.cover,
                placeholderIcon: Icons.person),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.getName(locale),
                    style: TextStyle(
                        color: AppColors.aqua, fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (position != null && position.isNotEmpty) _chip(position),
                    if (p.birthYear != null)
                      _chip('${isAr ? 'مواليد' : 'Born'} ${p.birthYear}'),
                  ],
                ),
                if (hasClub) ...[
                  const SizedBox(height: 6),
                  _chip('◆ ${p.currentClub!}',
                      textColor: _gold,
                      bgColor: _gold.withValues(alpha: 0.1),
                      borderColor: _gold.withValues(alpha: 0.3)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String text, {Color? textColor, Color? bgColor, Color? borderColor}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(
          color: bgColor ?? AppColors.cardGradientEnd,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: borderColor ?? AppColors.border),
        ),
        child: Text(text,
            style: TextStyle(
                color: textColor ?? AppColors.teal,
                fontSize: 11,
                fontWeight: FontWeight.w600)),
      );

  // ── Shared: the five-stat grid + contribution chips ────────────────────────
  Widget _statCell(String label, int value, Color color) => Expanded(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 3),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 2),
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: [
              Text('$value',
                  style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 3),
              Text(label,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.hint, fontSize: 9)),
            ],
          ),
        ),
      );

  // Five stats + an optional sixth "clean sheets" cell (goalkeepers only).
  Widget _statGrid(int apps, int goals, int assists, int yellow, int red, bool isAr,
          {int? cs}) =>
      Row(
        children: [
          _statCell(isAr ? 'مباراة' : 'Apps', apps, AppColors.white),
          _statCell(isAr ? 'هدف' : 'Goals', goals, _gold),
          _statCell(isAr ? 'صناعة' : 'Assists', assists, AppColors.aqua),
          _statCell(isAr ? 'صفراء' : 'Yellow', yellow, _amber),
          _statCell(isAr ? 'حمراء' : 'Red', red, AppColors.red),
          if (cs != null) _statCell(isAr ? 'نظيفة' : 'Clean', cs, AppColors.green),
        ],
      );

  // Non-zero contribution chips (🧤 ⚽ 🅰️ 🟨 🟥) for competition + match rows.
  Widget _contrib(int goals, int assists, int yellow, int red, {int clean = 0}) {
    final chips = <Widget>[];
    void add(String text, Color color) => chips.add(Text(text,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)));
    if (clean > 0) add('🧤 $clean', AppColors.green);
    if (goals > 0) add('⚽ $goals', _gold);
    if (assists > 0) add('🅰️ $assists', AppColors.aqua);
    if (yellow > 0) add('🟨 $yellow', _amber);
    if (red > 0) add('🟥 $red', AppColors.red);
    if (chips.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 12, runSpacing: 4, children: chips);
  }

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(text,
            style: TextStyle(color: AppColors.aqua, fontSize: 14, fontWeight: FontWeight.bold)),
      );

  Widget _empty(String text) => Padding(
        padding: const EdgeInsets.only(top: 48),
        child: Center(child: Text(text, style: TextStyle(color: AppColors.hint, fontSize: 13))),
      );

  // ── Tab 1: current season ──────────────────────────────────────────────────
  Widget _currentSeasonTab(PlayerFull p, String locale, bool isAr) {
    final cs = p.currentSeason;
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        if (cs?.seasonName(locale) != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(cs!.seasonName(locale)!,
                style: TextStyle(color: AppColors.hint, fontSize: 12)),
          ),
        if (cs != null && !cs.isEmpty)
          _statGrid(cs.appearances, cs.goals, cs.assists, cs.yellowCards, cs.redCards, isAr,
              cs: p.isGoalkeeper ? cs.cleanSheets : null)
        else
          _empty(isAr ? 'لم يشارك في أي مباراة هذا الموسم' : 'No matches played this season yet'),
      ],
    );
  }

  // ── Tab 2: career (totals + by competition) ────────────────────────────────
  Widget _careerTab(PlayerFull p, String locale, bool isAr) {
    final gk = p.isGoalkeeper;
    final compRows = <Widget>[];
    for (final c in p.career) {
      for (final comp in c.competitions) {
        compRows.add(_compRow(comp, c, locale, isAr, gk));
      }
    }
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        _sectionTitle(isAr ? 'الإجمالي' : 'Career total'),
        _statGrid(p.appearances, p.goals, p.assists, p.yellowCards, p.redCards, isAr,
            cs: gk ? p.cleanSheets : null),
        const SizedBox(height: 16),
        _sectionTitle(isAr ? 'حسب البطولة' : 'By competition'),
        if (compRows.isEmpty) _empty(isAr ? 'لا توجد بيانات' : 'No data yet') else ...compRows,
      ],
    );
  }

  Widget _compRow(PlayerCareerComp comp, PlayerCareerEntry e, String locale, bool isAr, bool gk) {
    final subtitle = [e.club, e.ageName(locale), e.seasonName(locale)]
        .where((s) => s != null && s.isNotEmpty)
        .join(' · ');
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(comp.getName(locale),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: AppColors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                    if (subtitle.isNotEmpty)
                      Text(subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: AppColors.hint, fontSize: 11)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              RichText(
                text: TextSpan(children: [
                  TextSpan(
                      text: '${comp.appearances}',
                      style: TextStyle(
                          color: AppColors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                  TextSpan(
                      text: isAr ? ' م' : ' ap',
                      style: TextStyle(color: AppColors.hint, fontSize: 10)),
                ]),
              ),
            ],
          ),
          if (comp.goals > 0 || comp.assists > 0 || comp.yellowCards > 0 ||
              comp.redCards > 0 || (gk && comp.cleanSheets > 0)) ...[
            const SizedBox(height: 6),
            _contrib(comp.goals, comp.assists, comp.yellowCards, comp.redCards,
                clean: gk ? comp.cleanSheets : 0),
          ],
        ],
      ),
    );
  }

  // ── Tab 3: matches ─────────────────────────────────────────────────────────
  Widget _matchesTab(PlayerFull p, String locale, bool isAr) {
    if (p.matches.isEmpty) {
      return _empty(isAr ? 'لا توجد مباريات' : 'No matches');
    }
    return ListView.builder(
      padding: const EdgeInsets.all(14),
      itemCount: p.matches.length,
      itemBuilder: (_, i) => _matchTile(p.matches[i], locale, isAr, p.isGoalkeeper),
    );
  }

  Widget _matchTile(PlayerMatch m, String locale, bool isAr, bool gk) {
    final homeSide = m.side == 'home';
    final score = '${m.homeScore ?? '-'} : ${m.awayScore ?? '-'}';
    Text sideName(String name, bool mine) => Text(name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
            color: mine ? AppColors.white : AppColors.hint,
            fontSize: 13,
            fontWeight: mine ? FontWeight.bold : FontWeight.normal));

    return InkWell(
      onTap: () => Navigator.push(context,
          MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: '${m.id}'))),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(m.competitionName(locale),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: AppColors.hint, fontSize: 10)),
                ),
                Text(m.date, style: TextStyle(color: AppColors.hint, fontSize: 10)),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Flexible(child: sideName(m.home.getName(locale), homeSide)),
                      const SizedBox(width: 6),
                      CachedLogo(url: m.home.logo, size: 24),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(score,
                      style: TextStyle(
                          color: AppColors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                ),
                Expanded(
                  child: Row(
                    children: [
                      CachedLogo(url: m.away.logo, size: 24),
                      const SizedBox(width: 6),
                      Flexible(child: sideName(m.away.getName(locale), !homeSide)),
                    ],
                  ),
                ),
              ],
            ),
            if (m.goals > 0 || m.assists > 0 || m.yellowCards > 0 || m.redCards > 0 ||
                (gk && m.cleanSheet)) ...[
              const SizedBox(height: 8),
              Divider(height: 1, color: AppColors.border),
              const SizedBox(height: 6),
              _contrib(m.goals, m.assists, m.yellowCards, m.redCards,
                  clean: gk && m.cleanSheet ? 1 : 0),
            ],
          ],
        ),
      ),
    );
  }
}
