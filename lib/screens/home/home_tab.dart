import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/config_model.dart';
import '../../core/models/follows.dart';
import '../../core/models/home_match.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/utils/ad_pick.dart';
import '../../core/utils/date_utils.dart';
import '../../widgets/ads/feed_ad_card.dart';
import '../../widgets/match/match_card.dart';
import '../ads/ad_interstitial_screen.dart';
import '../competition/competition_data_screen.dart';
import '../match/match_detail_screen.dart';
import '../news/news_detail_screen.dart';
import '../info/about_screen.dart';

class HomeTab extends StatefulWidget {
  final VoidCallback onGoToCompetitions;
  final VoidCallback onGoToNews;

  const HomeTab({
    super.key,
    required this.onGoToCompetitions,
    required this.onGoToNews,
  });

  @override
  State<HomeTab> createState() => _HomeTabState();
}

const int _kStep = 120; // matches pulled per direction per "load more"

class _HomeTabState extends State<HomeTab> with WidgetsBindingObserver {
  final _api = ApiService();
  final ItemScrollController _itemCtrl = ItemScrollController();

  List<HomeMatch> _past = [];   // strictly before today, desc from server
  List<HomeMatch> _future = []; // today and later, asc from server
  bool _loading = true;
  bool _error = false;
  int _pastLimit = _kStep;
  int _futureLimit = _kStep;
  bool _didScroll = false;
  String? _restoreDate;
  List<_Row> _rows = const [];
  AdItem? _feedAd; // native sponsored card, picked once per session

  Timer? _pollTimer;
  static const _kPollInterval = Duration(seconds: 45);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _startPolling();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    super.dispose();
  }

  // Live scores: while a today fixture is still unfinished, quietly re-fetch
  // every 45s — no spinner, no scroll jump — so the home list stays current
  // without a manual pull. Polling pauses in the background and resumes (with an
  // immediate refresh) when the app returns to the foreground.
  void _startPolling() {
    _pollTimer ??= Timer.periodic(_kPollInterval, (_) {
      if (_hasUnfinishedTodayMatch) _silentRefresh();
    });
  }

  bool get _hasUnfinishedTodayMatch {
    final today = _today;
    return _future.any(
        (m) => m.date == today && m.status.toLowerCase() != 'completed');
  }

  Future<void> _silentRefresh() async {
    try {
      final res = await Future.wait([
        _api.fetchAllMatches(from: _today, order: 'asc', limit: _futureLimit),
        _api.fetchAllMatches(to: _yesterday, order: 'desc', limit: _pastLimit),
      ]);
      if (!mounted) return;
      // Update scores in place; deliberately no _scheduleScroll() so the user's
      // viewport stays put.
      setState(() { _future = res[0]; _past = res[1]; });
    } catch (_) {/* keep what we have */}
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startPolling();
      _silentRefresh();
    } else if (state == AppLifecycleState.paused) {
      _pollTimer?.cancel();
      _pollTimer = null;
    }
  }

  String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String get _today => _ymd(DateTime.now());
  String get _yesterday => _ymd(DateTime.now().subtract(const Duration(days: 1)));

  Future<void> _load() async {
    setState(() { _loading = true; _error = false; });
    try {
      final res = await Future.wait([
        _api.fetchAllMatches(from: _today, order: 'asc', limit: _futureLimit),
        _api.fetchAllMatches(to: _yesterday, order: 'desc', limit: _pastLimit),
      ]);
      if (!mounted) return;
      setState(() { _future = res[0]; _past = res[1]; _loading = false; });
      _scheduleScroll();
    } catch (_) {
      if (!mounted) return;
      setState(() { _error = true; _loading = false; });
    }
  }

  Future<void> _loadOlder() async {
    // Keep the viewport steady: after older matches prepend, jump back to the
    // date that was previously on top.
    _restoreDate = _ascending.isNotEmpty ? _ascending.first.date : null;
    setState(() => _pastLimit += _kStep);
    try {
      final p = await _api.fetchAllMatches(to: _yesterday, order: 'desc', limit: _pastLimit);
      if (!mounted) return;
      setState(() => _past = p);
      _scheduleScroll();
    } catch (_) {/* keep what we have */}
  }

  Future<void> _loadNewer() async {
    setState(() => _futureLimit += _kStep);
    try {
      final f = await _api.fetchAllMatches(from: _today, order: 'asc', limit: _futureLimit);
      if (!mounted) return;
      setState(() => _future = f);
    } catch (_) {/* keep what we have */}
  }

  // Oldest → nearest(today) → newest.
  List<HomeMatch> get _ascending => [..._past.reversed, ..._future];
  bool get _hasMoreOlder => _past.length >= _pastLimit;
  bool get _hasMoreNewer => _future.length >= _futureLimit;

  // Land on today if present, else the nearest upcoming, else the most recent.
  String? get _anchorDate =>
      _future.isNotEmpty ? _future.first.date : (_past.isNotEmpty ? _past.first.date : null);

  void _scheduleScroll() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_itemCtrl.isAttached) return;
      final restore = _restoreDate;
      if (restore != null) {
        _restoreDate = null;
        final i = _dateIndex(restore);
        if (i != null) _itemCtrl.jumpTo(index: i);
        return;
      }
      if (_didScroll) return;
      final a = _anchorDate;
      if (a == null) return;
      final i = _dateIndex(a);
      if (i != null) {
        _didScroll = true;
        _itemCtrl.jumpTo(index: i);
      }
    });
  }

  int? _dateIndex(String date) {
    for (var i = 0; i < _rows.length; i++) {
      final r = _rows[i];
      if (r is _DateRow && r.date == date) return i;
    }
    return null;
  }

  /// Match ids to render the sponsored card after. Counted from the anchor date
  /// (where the feed lands) downward, so cards sit in the natural forward-scroll
  /// path rather than up among older matches. First card after match N
  /// (feedPosition); if feedRepeat is set, repeats every R after that. Falls
  /// back to the last match when there are fewer than N from the anchor.
  Set<String> _adAfterMatchIds() {
    final ids = <String>{};
    final ad = _feedAd;
    final anchor = _anchorDate;
    if (ad == null || anchor == null) return ids;
    final n = ad.feedPosition < 1 ? 1 : ad.feedPosition;
    final r = (ad.feedRepeat != null && ad.feedRepeat! > 0) ? ad.feedRepeat! : 0;
    var count = 0;
    String? lastId;
    for (final m in _ascending) {
      if (m.date.compareTo(anchor) < 0) continue; // skip older matches above
      lastId = m.id;
      count++;
      if (count == n || (r != 0 && count > n && (count - n) % r == 0)) {
        ids.add(m.id);
      }
    }
    if (ids.isEmpty && lastId != null) ids.add(lastId); // fewer than N: show once
    return ids;
  }

  List<_Row> _buildRows(List<NewsItem> news) {
    // The banner now lives in HomeTopBar above every tab, so the feed no longer
    // carries its own banner row.
    final rows = <_Row>[];

    if (_loading && _ascending.isEmpty) {
      rows.add(const _MsgRow(loading: true));
    } else if (_error && _ascending.isEmpty) {
      rows.add(const _MsgRow(error: true));
    } else if (_ascending.isEmpty) {
      rows.add(const _MsgRow());
    } else {
      if (_hasMoreOlder) rows.add(const _LoadRow(older: true));
      final adAfterIds = _adAfterMatchIds();
      String? date;
      String? comp;
      for (final m in _ascending) {
        if (m.date != date) {
          date = m.date;
          comp = null;
          rows.add(_DateRow(m.date, m.date == _today));
        }
        if (m.competition.id != comp) {
          comp = m.competition.id;
          rows.add(_CompRow(m.competition));
        }
        rows.add(_MatchRow(m));
        // Native sponsored card after the Nth match (and every R after) counted
        // from the anchor date, so it sits in the natural downward-scroll path.
        if (_feedAd != null && adAfterIds.contains(m.id)) {
          rows.add(_AdRow(_feedAd!));
        }
      }
      if (_hasMoreNewer) rows.add(const _LoadRow(older: false));
    }

    // Latest news + footer trail the feed, mirroring the website home order.
    rows.add(const _NewsHeaderRow());
    if (news.isEmpty) {
      rows.add(const _MsgRow(news: true));
    } else {
      for (final n in news.take(3)) {
        rows.add(_NewsRow(n));
      }
    }
    rows.add(const _FooterRow());
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AppProvider>();
    final locale = provider.locale;
    // Pick a feed-placement ad once (stable across rebuilds within a session).
    final feedAds = provider.config?.ads
            .where((a) => a.isLive && a.showsOn('feed'))
            .toList() ??
        const <AdItem>[];
    _feedAd ??= weightedPickAd(feedAds);
    _rows = _buildRows(provider.config?.news ?? const []);

    return RefreshIndicator(
      onRefresh: () async {
        _didScroll = false;
        await _load();
      },
      color: AppColors.aqua,
      child: ScrollablePositionedList.builder(
        itemScrollController: _itemCtrl,
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _rows.length,
        itemBuilder: (ctx, i) => _rowWidget(ctx, _rows[i], locale, provider),
      ),
    );
  }

  Widget _rowWidget(BuildContext ctx, _Row r, String locale, AppProvider provider) {
    final l10n = L10n(locale);
    final isAr = locale == 'ar';

    if (r is _MsgRow) {
      if (r.loading) return _LoadingCard();
      final msg = r.error
          ? (isAr ? 'تعذر تحميل المباريات' : 'Could not load matches')
          : r.news
              ? l10n.noNews
              : l10n.noMatches;
      return _EmptyCard(message: msg);
    }
    if (r is _LoadRow) {
      final label = r.older
          ? (isAr ? '↑ مباريات أقدم' : '↑ Older matches')
          : (isAr ? '↓ مباريات أحدث' : '↓ Newer matches');
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: OutlinedButton(
          onPressed: r.older ? _loadOlder : _loadNewer,
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.aqua,
            side: BorderSide(color: AppColors.aqua.withValues(alpha: 0.4)),
            minimumSize: const Size.fromHeight(44),
          ),
          child: Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
      );
    }
    if (r is _DateRow) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
        child: Row(children: [
          Icon(Icons.calendar_today, size: 13, color: AppColors.aqua),
          const SizedBox(width: 8),
          Text(
            AppDateUtils.formatMatchDate(r.date, locale),
            style: TextStyle(
              color: r.isToday ? AppColors.aqua : AppColors.white,
              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(child: Container(height: 1, color: AppColors.border)),
        ]),
      );
    }
    if (r is _CompRow) {
      final following = provider.isFollowingComp(r.comp.id);
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 4),
        child: InkWell(
          onTap: () => _openCompetition(ctx, r.comp, locale),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
            decoration: BoxDecoration(
              color: AppColors.cardBg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.aqua.withValues(alpha: 0.3)),
            ),
            child: Row(children: [
              const Text('🏆', style: TextStyle(fontSize: 15)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  r.comp.getTitle(locale),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: AppColors.aqua,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                icon: Icon(following ? Icons.star : Icons.star_border,
                    color: following ? AppColors.orange : AppColors.hint, size: 20),
                tooltip: following ? (isAr ? 'إلغاء المتابعة' : 'Unfollow') : (isAr ? 'متابعة' : 'Follow'),
                onPressed: () => provider.toggleFollowComp(FollowedComp(
                    id: r.comp.id, title: r.comp.title, dataUrl: r.comp.dataUrl)),
              ),
              Icon(Icons.chevron_right, color: AppColors.aqua, size: 18),
            ]),
          ),
        ),
      );
    }
    if (r is _MatchRow) {
      final m = r.m;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        child: MatchCard(
          match: m.toMatch(),
          homeTeam: m.homeTeam?.toTeam(),
          awayTeam: m.awayTeam?.toTeam(),
          locale: locale,
          onTap: () => Navigator.push(
            ctx,
            MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: m.id)),
          ),
        ),
      );
    }
    if (r is _AdRow) {
      return FeedAdCard(ad: r.ad);
    }
    if (r is _NewsHeaderRow) {
      return _SectionHeader(
        title: l10n.news,
        actionLabel: l10n.more,
        onAction: widget.onGoToNews,
      );
    }
    if (r is _NewsRow) {
      return _MiniNewsCard(
        item: r.item,
        locale: locale,
        onTap: () => Navigator.push(
          ctx,
          MaterialPageRoute(builder: (_) => NewsDetailScreen(item: r.item)),
        ),
      );
    }
    if (r is _FooterRow) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 24),
        child: _InfoFooter(locale: locale),
      );
    }
    return const SizedBox.shrink();
  }

  void _openCompetition(BuildContext ctx, HomeMatchCompetition comp, String locale) {
    if (comp.dataUrl.isEmpty) return;
    final url = comp.dataUrl;
    // Show an interstitial ad (subject to the frequency cap) before the
    // competition page, mirroring the website and the other open paths.
    AdInterstitialScreen.open(
      ctx,
      dataUrl: url,
      destinationBuilder: (_) => CompetitionDataScreen(
        dataUrl: url,
        title: comp.getTitle(locale),
        seasonName: '',
      ),
    );
  }

}

// ── Feed row model ────────────────────────────────────────────────────────────

sealed class _Row {
  const _Row();
}

class _MsgRow extends _Row {
  final bool loading;
  final bool error;
  final bool news;
  const _MsgRow({this.loading = false, this.error = false, this.news = false});
}

class _LoadRow extends _Row {
  final bool older;
  const _LoadRow({required this.older});
}

class _DateRow extends _Row {
  final String date;
  final bool isToday;
  const _DateRow(this.date, this.isToday);
}

class _CompRow extends _Row {
  final HomeMatchCompetition comp;
  const _CompRow(this.comp);
}

class _MatchRow extends _Row {
  final HomeMatch m;
  const _MatchRow(this.m);
}

class _AdRow extends _Row {
  final AdItem ad;
  const _AdRow(this.ad);
}

class _NewsHeaderRow extends _Row {
  const _NewsHeaderRow();
}

class _NewsRow extends _Row {
  final NewsItem item;
  const _NewsRow(this.item);
}

class _FooterRow extends _Row {
  const _FooterRow();
}

// ── Section header ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _SectionHeader({required this.title, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          Text(
            title,
            style: TextStyle(
              color: AppColors.white,
              fontWeight: FontWeight.bold,
              fontSize: 15,
            ),
          ),
          const Spacer(),
          if (actionLabel != null && onAction != null)
            GestureDetector(
              onTap: onAction,
              child: Text(
                actionLabel!,
                style: TextStyle(color: AppColors.aqua, fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Loading card ──────────────────────────────────────────────────────────────

class _LoadingCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Center(
        child: CircularProgressIndicator(color: AppColors.aqua, strokeWidth: 2),
      ),
    );
  }
}

// ── Empty card ────────────────────────────────────────────────────────────────

class _EmptyCard extends StatelessWidget {
  final String message;

  const _EmptyCard({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: TextStyle(color: AppColors.teal, fontSize: 13),
      ),
    );
  }
}

// ── Mini news card ────────────────────────────────────────────────────────────

class _MiniNewsCard extends StatelessWidget {
  final NewsItem item;
  final String locale;
  final VoidCallback onTap;

  const _MiniNewsCard({
    required this.item,
    required this.locale,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final thumb = item.allImages.isNotEmpty ? item.allImages.first : null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: thumb != null
                  ? CachedNetworkImage(
                      imageUrl: thumb,
                      width: 72,
                      height: 56,
                      fit: BoxFit.cover,
                      errorWidget: (context, url, err) => _fallback(),
                    )
                  : _fallback(),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.getTitle(locale),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: AppColors.aqua,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    AppDateUtils.formatNewsDate(item.date, locale),
                    style: TextStyle(color: AppColors.hint, fontSize: 10),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fallback() => Container(
    width: 72,
    height: 56,
    color: AppColors.darkBg,
    child: Icon(Icons.newspaper, color: AppColors.teal, size: 24),
  );
}

// ── Footer with info links ─────────────────────────────────────────────────────

class _InfoFooter extends StatelessWidget {
  final String locale;
  const _InfoFooter({required this.locale});

  void _push(BuildContext ctx, Widget screen) =>
      Navigator.push(ctx, MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final l10n = L10n(locale);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Column(
        children: [
          Divider(color: AppColors.border),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _link(context, l10n.about,
                  () => _push(context, const AboutScreen())),
              _dot(),
              _link(context, l10n.privacyPolicy,
                  () => _push(context, const PrivacyPolicyScreen())),
              _dot(),
              _link(context, l10n.terms,
                  () => _push(context, const TermsScreen())),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '© 2025 Youth Scores · youthscores.org',
            style: TextStyle(color: AppColors.border, fontSize: 10),
          ),
        ],
      ),
    );
  }

  Widget _link(BuildContext ctx, String label, VoidCallback onTap) =>
      GestureDetector(
        onTap: onTap,
        child: Text(label,
            style: TextStyle(color: AppColors.hint, fontSize: 11)),
      );

  Widget _dot() => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Text('·', style: TextStyle(color: AppColors.border)),
      );
}
