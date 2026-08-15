import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/match_full.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/utils/date_utils.dart';
import '../../widgets/common/cached_logo.dart';
import '../player/player_detail_screen.dart';
import '../team/team_detail_screen.dart';

/// Match centre — fetches the full match by id (goals, cards, subs, line-up) so
/// it works from anywhere, including the aggregate home feed, and refreshes
/// itself while the match is live. Mirrors the web match page.
class MatchDetailScreen extends StatefulWidget {
  final String matchId;
  const MatchDetailScreen({super.key, required this.matchId});

  @override
  State<MatchDetailScreen> createState() => _MatchDetailScreenState();
}

class _MatchDetailScreenState extends State<MatchDetailScreen> {
  final _api = ApiService();
  MatchFull? _m;
  bool _loading = true;
  bool _failed = false;
  int _tab = 0;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _fetch(initial: true);
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _fetch({bool initial = false}) async {
    final id = int.tryParse(widget.matchId);
    if (id == null) {
      setState(() { _failed = true; _loading = false; });
      return;
    }
    try {
      final m = await _api.fetchMatchFull(id);
      if (!mounted) return;
      setState(() { _m = m; _loading = false; _failed = false; });
      _managerPolling();
    } catch (_) {
      if (!mounted) return;
      if (initial) setState(() { _failed = true; _loading = false; });
    }
  }

  // Poll every 20s while the match is live; stop once it isn't.
  void _managerPolling() {
    if (_m?.isLive == true) {
      _poll ??= Timer.periodic(const Duration(seconds: 20), (_) => _fetch());
    } else {
      _poll?.cancel();
      _poll = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<AppProvider>().locale;
    final isAr = locale == 'ar';

    if (_loading) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(
          child: CircularProgressIndicator(color: AppColors.aqua, strokeWidth: 2),
        ),
      );
    }
    final m = _m;
    if (_failed || m == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(
          child: Text(isAr ? 'المباراة غير موجودة' : 'Match not found',
              style: TextStyle(color: AppColors.teal)),
        ),
      );
    }

    final homeName = m.home.getName(locale);
    final awayName = m.away.getName(locale);
    final context0 = [
      if (m.compName != null) pickLocaleMap(m.compName!, locale),
      if (m.compAge != null) pickLocaleMap(m.compAge!, locale),
      if (m.week.isNotEmpty) '${isAr ? 'الجولة' : 'Round'} ${m.week}',
    ].where((s) => s.isNotEmpty).join(' · ');

    final tabs = <_TabDef>[
      if (m.hasLineup) _TabDef(isAr ? 'التشكيلة' : 'Lineup', Icons.format_list_numbered),
      if (m.hasEvents) _TabDef(isAr ? 'الأحداث' : 'Events', Icons.timeline),
    ];
    final tabIndex = _tab.clamp(0, tabs.isEmpty ? 0 : tabs.length - 1);

    return Scaffold(
      appBar: AppBar(
        title: Text(context0.isNotEmpty ? context0 : (isAr ? 'المباراة' : 'Match'),
            style: const TextStyle(fontSize: 14),
            maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: () => _share(m, homeName, awayName, locale),
          ),
        ],
      ),
      body: ListView(
        children: [
          _hero(m, homeName, awayName, context0, isAr),
          if (tabs.isNotEmpty) ...[
            const SizedBox(height: 8),
            _tabBar(tabs, tabIndex),
            const SizedBox(height: 4),
            if (tabs[tabIndex].label.startsWith(isAr ? 'التشكيلة' : 'Lineup'))
              _lineup(m, homeName, awayName, isAr)
            else
              _events(m, locale, isAr),
          ] else
            Padding(
              padding: const EdgeInsets.all(28),
              child: Center(
                child: Text(
                  isAr
                      ? 'لا توجد أحداث أو تشكيلة مسجّلة لهذه المباراة'
                      : 'No recorded events or lineup for this match',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.hint, fontSize: 13),
                ),
              ),
            ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // ── Hero ──────────────────────────────────────────────────────────────────
  Widget _hero(MatchFull m, String homeName, String awayName, String context0, bool isAr) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.cardBg, AppColors.cardGradientEnd],
        ),
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        children: [
          if (context0.isNotEmpty) ...[
            Text(context0,
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.hint, fontSize: 11)),
            const SizedBox(height: 16),
          ],
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _sideCol(m.home, homeName)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: _centre(m, isAr),
              ),
              Expanded(child: _sideCol(m.away, awayName)),
            ],
          ),
          if (m.venue.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text('🏟️ ${m.venue}',
                style: TextStyle(color: AppColors.hint, fontSize: 11)),
          ],
          if (m.note.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.orange.withValues(alpha: 0.3)),
              ),
              child: Text('📝 ${m.note}',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.orange, fontSize: 12)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _sideCol(MatchSide side, String name) {
    return InkWell(
      onTap: side.id == null
          ? null
          : () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => TeamDetailScreen(teamId: side.id.toString()))),
      borderRadius: BorderRadius.circular(8),
      child: Column(
        children: [
          CachedLogo(url: side.logo, size: 60),
          const SizedBox(height: 8),
          Text(name,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: AppColors.white, fontSize: 13, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _centre(MatchFull m, bool isAr) {
    final showScore = m.hasScore && (m.isCompleted || m.isLive);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showScore)
          Text('${m.homeScore} - ${m.awayScore}',
              style: TextStyle(
                  color: AppColors.white,
                  fontSize: 44,
                  fontWeight: FontWeight.w800))
        else
          Text(m.time.isNotEmpty ? m.time : '--:--',
              style: TextStyle(
                  color: AppColors.aqua,
                  fontSize: 24,
                  fontWeight: FontWeight.w800)),
        if (m.homePenalty != null && m.awayPenalty != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
                isAr
                    ? 'ركلات الجزاء ${m.homePenalty}-${m.awayPenalty}'
                    : 'Pens ${m.homePenalty}-${m.awayPenalty}',
                style: TextStyle(color: AppColors.orange, fontSize: 11, fontWeight: FontWeight.bold)),
          ),
        const SizedBox(height: 6),
        _statusPill(m, isAr),
      ],
    );
  }

  Widget _statusPill(MatchFull m, bool isAr) {
    late final Color color;
    late final String label;
    if (m.isLive) {
      color = AppColors.red;
      label = isAr ? '● مباشر' : '● LIVE';
    } else if (m.isCompleted) {
      color = AppColors.green;
      label = isAr ? 'انتهت' : 'FT';
    } else if (m.isPostponed) {
      color = AppColors.orange;
      label = isAr ? 'مؤجلة' : 'Postponed';
    } else if (m.isCancelled) {
      color = AppColors.red;
      label = isAr ? 'ملغاة' : 'Cancelled';
    } else {
      color = AppColors.hint;
      label = AppDateUtils.formatMatchDate(m.date, isAr ? 'ar' : 'en');
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(label,
          style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }

  // ── Tab bar ───────────────────────────────────────────────────────────────
  Widget _tabBar(List<_TabDef> tabs, int current) {
    return Row(
      children: List.generate(tabs.length, (i) {
        final active = i == current;
        return Expanded(
          child: InkWell(
            onTap: () => setState(() => _tab = i),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 11),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(
                    color: active ? AppColors.aqua : AppColors.border,
                    width: active ? 2.5 : 1,
                  ),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(tabs[i].icon,
                      size: 15, color: active ? AppColors.aqua : AppColors.hint),
                  const SizedBox(width: 6),
                  Text(tabs[i].label,
                      style: TextStyle(
                        color: active ? AppColors.aqua : AppColors.hint,
                        fontSize: 13,
                        fontWeight: active ? FontWeight.bold : FontWeight.normal,
                      )),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }

  // ── Lineup ────────────────────────────────────────────────────────────────
  Widget _lineup(MatchFull m, String homeName, String awayName, bool isAr) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: _lineupCol(homeName, m.lineupHome, m.home.logo, isAr)),
          const SizedBox(width: 10),
          Expanded(child: _lineupCol(awayName, m.lineupAway, m.away.logo, isAr)),
        ],
      ),
    );
  }

  Widget _lineupCol(String name, LineupSide lu, String? logo, bool isAr) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            CachedLogo(url: logo, size: 24),
            const SizedBox(width: 6),
            Expanded(
              child: Text(name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.white, fontSize: 12, fontWeight: FontWeight.bold)),
            ),
          ]),
          const SizedBox(height: 8),
          Text(isAr ? 'التشكيلة الأساسية' : 'Starters',
              style: TextStyle(color: AppColors.aqua, fontSize: 11, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          if (lu.starters.isEmpty)
            Text('—', style: TextStyle(color: AppColors.hint, fontSize: 11))
          else
            ...List.generate(lu.starters.length, (i) => Container(
                  margin: const EdgeInsets.only(bottom: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.darkBg,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.border.withValues(alpha: 0.6)),
                  ),
                  child: Row(children: [
                    SizedBox(
                      width: 16,
                      child: Text('${i + 1}',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.hint, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(lu.starters[i],
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: AppColors.white, fontSize: 12)),
                    ),
                  ]),
                )),
          if (lu.bench.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(isAr ? 'البدلاء' : 'Bench',
                style: TextStyle(color: AppColors.hint, fontSize: 11, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            ...lu.bench.map((n) => Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(n, style: TextStyle(color: AppColors.hint, fontSize: 12)),
                )),
          ],
        ],
      ),
    );
  }

  // ── Events timeline ───────────────────────────────────────────────────────
  Widget _events(MatchFull m, String locale, bool isAr) {
    final events = <_Ev>[
      for (final g in m.goals)
        _Ev(
          minute: g.minute,
          side: g.side,
          icon: '⚽',
          color: AppColors.orange,
          main: g.scorer.isNotEmpty ? g.scorer : '—',
          sub: [
            if (g.assist != null) '🅰️ ${g.assist}',
            if (g.isPenalty) (isAr ? 'ركلة جزاء' : 'pen'),
            if (g.isOwnGoal) (isAr ? 'عكسي' : 'OG'),
          ].join(' · '),
          playerId: g.scorerId,
        ),
      for (final c in m.cards)
        _Ev(
          minute: c.minute,
          side: c.side,
          icon: c.type == 'red'
              ? '🟥'
              : c.type == 'second_yellow'
                  ? '🟨🟥'
                  : '🟨',
          color: c.type == 'yellow' ? AppColors.yellow : AppColors.red,
          main: c.player.isNotEmpty ? c.player : '—',
          sub: c.type == 'second_yellow' ? (isAr ? 'صفراء ثانية' : '2nd yellow') : '',
        ),
      for (final s in m.subs)
        _Ev(
          minute: s.minute,
          side: s.side,
          icon: '🔁',
          color: AppColors.green,
          main: s.playerIn.isNotEmpty ? s.playerIn : '—',
          sub: s.playerOut.isNotEmpty ? '🔻 ${s.playerOut}' : '',
        ),
    ]..sort((a, b) => (b.minute ?? -1).compareTo(a.minute ?? -1));

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Stack(
        children: [
          // The web's central timeline spine.
          Positioned.fill(
            child: Center(child: Container(width: 1, color: AppColors.border)),
          ),
          Column(children: events.map(_eventRow).toList()),
        ],
      ),
    );
  }

  Widget _eventRow(_Ev e) {
    final isHome = e.side == 'home';
    final card = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        textDirection: isHome ? TextDirection.rtl : TextDirection.ltr,
        children: [
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: e.color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(e.icon, style: const TextStyle(fontSize: 11)),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment:
                  isHome ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                InkWell(
                  onTap: e.playerId == null
                      ? null
                      : () => Navigator.push(context, MaterialPageRoute(
                          builder: (_) => PlayerDetailScreen(playerId: e.playerId!))),
                  child: Text(e.main,
                      style: TextStyle(
                          color: e.playerId == null ? AppColors.white : AppColors.aqua,
                          fontSize: 12,
                          fontWeight: FontWeight.bold)),
                ),
                if (e.sub.isNotEmpty)
                  Text(e.sub, style: TextStyle(color: AppColors.hint, fontSize: 10)),
              ],
            ),
          ),
        ],
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: isHome
                ? Align(alignment: Alignment.centerRight, child: card)
                : const SizedBox.shrink(),
          ),
          Container(
            width: 40,
            alignment: Alignment.center,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.darkBg,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.border),
              ),
              child: Text(e.minute != null ? "${e.minute}'" : '—',
                  style: TextStyle(color: AppColors.hint, fontSize: 10, fontWeight: FontWeight.bold)),
            ),
          ),
          Expanded(
            child: isHome
                ? const SizedBox.shrink()
                : Align(alignment: Alignment.centerLeft, child: card),
          ),
        ],
      ),
    );
  }

  void _share(MatchFull m, String homeName, String awayName, String locale) {
    final score = (m.hasScore && (m.isCompleted || m.isLive))
        ? '${m.homeScore} - ${m.awayScore}'
        : m.time;
    final buf = StringBuffer()
      ..write('$homeName $score $awayName')
      ..write('\n${m.date}  ${m.time}');
    if (m.venue.isNotEmpty) buf.write('\n📍 ${m.venue}');
    final scorers = m.goals.where((g) => g.scorer.isNotEmpty).map((g) => g.scorer).toList();
    if (scorers.isNotEmpty) buf.write('\n⚽ ${scorers.join(' · ')}');
    buf.write('\n\nبطولات الناشئين | Youth Scores\nyouthscores.org');
    SharePlus.instance.share(ShareParams(text: buf.toString()));
  }
}

/// Localized-map picker used by the header context line.
String pickLocaleMap(Map<String, String> m, String locale) =>
    m[locale] ?? m['ar'] ?? m['en'] ?? '';

class _TabDef {
  final String label;
  final IconData icon;
  const _TabDef(this.label, this.icon);
}

class _Ev {
  final int? minute;
  final String side;
  final String icon;
  final Color color;
  final String main;
  final String sub;
  final int? playerId;
  const _Ev({
    required this.minute,
    required this.side,
    required this.icon,
    required this.color,
    required this.main,
    required this.sub,
    this.playerId,
  });
}
