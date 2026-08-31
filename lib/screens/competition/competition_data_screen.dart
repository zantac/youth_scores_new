import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/providers/app_provider.dart';
import '../../widgets/common/error_retry_widget.dart';
import '../../widgets/common/loading_widget.dart';
import 'tabs/matches_tab.dart';
import 'tabs/standings_tab.dart';
import 'tabs/teams_tab.dart';
import 'tabs/stats_tab.dart';

class CompetitionDataScreen extends StatefulWidget {
  final String dataUrl;
  final String title;
  final String seasonName;
  // When set (e.g. opened from a round-results notification), the Matches tab
  // opens on this round instead of today's.
  final String? initialWeek;
  // Which main tab to open on (0=Matches, 1=Standings, 2=Teams, 3=Stats) — set
  // from a shared website link's ?tab=. Defaults to Matches.
  final int initialTab;
  // Which stats sub-tab to open on (?stat=), used only when initialTab is Stats.
  final int initialStat;

  const CompetitionDataScreen({
    super.key,
    required this.dataUrl,
    required this.title,
    required this.seasonName,
    this.initialWeek,
    this.initialTab = 0,
    this.initialStat = 0,
  });

  @override
  State<CompetitionDataScreen> createState() => _CompetitionDataScreenState();
}

class _CompetitionDataScreenState extends State<CompetitionDataScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late TabController _tabs;

  Timer? _pollTimer;
  static const _kPollInterval = Duration(seconds: 45);

  @override
  void initState() {
    super.initState();
    _tabs = TabController(
      length: 4,
      vsync: this,
      initialIndex: widget.initialTab.clamp(0, 3),
    );
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final p = context.read<AppProvider>();
      p.setCompetitionMeta(widget.title, widget.seasonName);
      p.loadCompetition(widget.dataUrl);
    });
    _startPolling();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    _tabs.dispose();
    context.read<AppProvider>().clearCompetition(notify: false);
    super.dispose();
  }

  // Live scores/standings: while a fixture in this competition is today-and-
  // unfinished, quietly re-fetch every 45s — no spinner — so the page stays
  // current without a manual pull. Pauses in the background, resumes (with an
  // immediate refresh) on return to the foreground. Mirrors the home tab.
  void _startPolling() {
    _pollTimer ??= Timer.periodic(_kPollInterval, (_) {
      if (!mounted) return;
      if (_hasUnfinishedTodayMatch) {
        context.read<AppProvider>().refreshCompetitionSilent();
      }
    });
  }

  String get _today {
    final d = DateTime.now();
    return '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }

  bool get _hasUnfinishedTodayMatch {
    final matches = context.read<AppProvider>().competition?.matches ?? const [];
    final today = _today;
    return matches.any(
        (m) => m.date == today && m.status.toLowerCase() != 'completed');
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startPolling();
      context.read<AppProvider>().refreshCompetitionSilent();
    } else if (state == AppLifecycleState.paused) {
      _pollTimer?.cancel();
      _pollTimer = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AppProvider>();
    final l10n     = L10n(provider.locale);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title, style: const TextStyle(fontSize: 15)),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: false,
          // Colored emoji icons mirror the website's competition tabs.
          tabs: [
            Tab(icon: const Text('⚽',  style: TextStyle(fontSize: 18)), text: l10n.matches),
            Tab(icon: const Text('📊', style: TextStyle(fontSize: 18)), text: l10n.standings),
            Tab(icon: const Text('👕', style: TextStyle(fontSize: 18)), text: l10n.teams),
            Tab(icon: const Text('📈', style: TextStyle(fontSize: 18)), text: l10n.statistics),
          ],
        ),
      ),
      body: _body(provider, l10n),
    );
  }

  Widget _body(AppProvider provider, L10n l10n) {
    if (provider.loadingComp) {
      return LoadingWidget(message: l10n.loading);
    }
    if (provider.compError != null) {
      return ErrorRetryWidget(
        message: provider.compError!,
        onRetry: () => provider.loadCompetition(widget.dataUrl),
        retryLabel: l10n.retry,
      );
    }
    if (provider.competition == null) {
      return LoadingWidget(message: l10n.loading);
    }

    return TabBarView(
      controller: _tabs,
      children: [
        MatchesTab(initialWeek: widget.initialWeek),
        const StandingsTab(),
        const TeamsTab(),
        StatsTab(initialStat: widget.initialStat),
      ],
    );
  }
}
