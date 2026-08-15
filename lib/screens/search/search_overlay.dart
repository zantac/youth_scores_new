import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/config_model.dart';
import '../../core/models/search_results.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../widgets/common/cached_logo.dart';
import '../club/club_detail_screen.dart';
import '../coach/coach_detail_screen.dart';
import '../competition/competition_data_screen.dart';
import '../player/player_detail_screen.dart';

/// Opens the full-screen global search — the in-app twin of the website's
/// SearchOverlay. Searches teams/players/coaches via `/api/search`, plus the
/// user's competitions locally from the loaded config.
void showSearchOverlay(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => const _SearchScreen(),
  ));
}

// A single competition "leaf" (season → competition → age → sector) that has a
// data URL and can be opened directly, built from the local config.
class _CompLeaf {
  final String dataUrl;
  final String seasonName;
  final Map<String, String> title; // localized display title
  final String blob; // lower-cased haystack across locales for matching
  const _CompLeaf(this.dataUrl, this.seasonName, this.title, this.blob);

  String getTitle(String locale) =>
      title[locale] ?? title['ar'] ?? title['en'] ?? '';
}

List<_CompLeaf> _buildCompLeaves(ConfigData? config) {
  final leaves = <_CompLeaf>[];
  if (config == null) return leaves;
  for (final season in config.seasons) {
    for (final comp in season.competitions) {
      for (final age in comp.ages) {
        void add(Map<String, String> extra, String url) {
          if (url.isEmpty) return;
          String join(String locale) => [
                comp.getName(locale),
                age.getName(locale),
                if (extra[locale]?.isNotEmpty ?? false) extra[locale],
              ].where((s) => s != null && s.isNotEmpty).join(' — ');
          final title = {'ar': join('ar'), 'en': join('en')};
          final blob = '${comp.name.values.join(' ')} '
                  '${age.getName('ar')} ${age.getName('en')} '
                  '${extra.values.join(' ')}'
              .toLowerCase();
          leaves.add(_CompLeaf(url, season.name, title, blob));
        }

        if (age.sectors.isNotEmpty) {
          for (final sec in age.sectors) {
            add({'ar': sec.getName('ar'), 'en': sec.getName('en')}, sec.url);
          }
        } else if (age.directMatchesUrl != null) {
          add(const {}, age.directMatchesUrl!);
        }
      }
    }
  }
  return leaves;
}

class _SearchScreen extends StatefulWidget {
  const _SearchScreen();

  @override
  State<_SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<_SearchScreen> {
  final _api = ApiService();
  final _controller = TextEditingController();
  Timer? _debounce;
  int _reqId = 0;

  String _term = '';
  bool _loading = false;
  SearchResults _res = SearchResults.empty;
  List<_CompLeaf> _allLeaves = const [];
  List<_CompLeaf> _compHits = const [];

  @override
  void initState() {
    super.initState();
    _allLeaves = _buildCompLeaves(context.read<AppProvider>().config);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    final term = value.trim();
    setState(() => _term = term);
    _debounce?.cancel();
    if (term.length < 2) {
      setState(() {
        _loading = false;
        _res = SearchResults.empty;
        _compHits = const [];
      });
      return;
    }
    // Local competition filter is instant; the network search is debounced.
    final lower = term.toLowerCase();
    _compHits = _allLeaves.where((l) => l.blob.contains(lower)).take(20).toList();
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      final id = ++_reqId;
      final r = await _api.fetchSearch(term);
      if (!mounted || id != _reqId) return; // a newer query superseded this one
      setState(() {
        _res = r;
        _loading = false;
      });
    });
  }

  void _go(Widget screen) {
    Navigator.of(context).pop(); // close the overlay first
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<AppProvider>().locale;
    final isAr = locale == 'ar';
    final typed = _term.length >= 2;
    final total = _res.total + _compHits.length;

    return Scaffold(
      backgroundColor: AppColors.darkBg,
      body: SafeArea(
        child: Column(
          children: [
            // ── Search field ────────────────────────────────────────────────
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.cardBg,
                border: Border(bottom: BorderSide(color: AppColors.border)),
              ),
              child: Row(children: [
                Icon(Icons.search, color: AppColors.hint, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _controller,
                    autofocus: true,
                    onChanged: _onChanged,
                    style: TextStyle(color: AppColors.white, fontSize: 14),
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      isCollapsed: true,
                      border: InputBorder.none,
                      hintText: isAr
                          ? 'ابحث عن بطولة أو فريق أو لاعب أو مدرب…'
                          : 'Search competitions, teams, players, coaches…',
                      hintStyle: TextStyle(color: AppColors.hint, fontSize: 13),
                    ),
                  ),
                ),
                if (_term.isNotEmpty)
                  InkWell(
                    onTap: () {
                      _controller.clear();
                      _onChanged('');
                    },
                    child: Icon(Icons.close, color: AppColors.hint, size: 20),
                  ),
                const SizedBox(width: 4),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(isAr ? 'إلغاء' : 'Cancel',
                      style: TextStyle(
                          color: AppColors.aqua, fontWeight: FontWeight.bold)),
                ),
              ]),
            ),
            // ── Results ─────────────────────────────────────────────────────
            Expanded(
              child: !typed
                  ? _hint(isAr
                      ? 'اكتب حرفين على الأقل للبحث'
                      : 'Type at least two characters to search')
                  : (_loading && total == 0)
                      ? Center(
                          child: CircularProgressIndicator(
                              color: AppColors.aqua, strokeWidth: 2))
                      : total == 0
                          ? _hint(isAr ? 'لا توجد نتائج' : 'No results')
                          : _resultsList(locale, isAr),
            ),
          ],
        ),
      ),
    );
  }

  Widget _hint(String text) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(text,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.hint, fontSize: 13)),
        ),
      );

  Widget _resultsList(String locale, bool isAr) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        if (_compHits.isNotEmpty)
          _section(
            isAr ? 'البطولات' : 'Competitions',
            [
              for (final c in _compHits)
                _row(
                  leading: const Text('🏆', style: TextStyle(fontSize: 18)),
                  round: false,
                  title: c.getTitle(locale),
                  sub: c.seasonName,
                  isAr: isAr,
                  onTap: () => _go(CompetitionDataScreen(
                    dataUrl: c.dataUrl,
                    title: c.getTitle(locale),
                    seasonName: c.seasonName,
                  )),
                ),
            ],
          ),
        if (_res.clubs.isNotEmpty)
          _section(
            isAr ? 'الفرق' : 'Teams',
            [
              for (final t in _res.clubs)
                _row(
                  leading: CachedLogo(url: t.logo, size: 34),
                  round: false,
                  title: t.getName(locale),
                  sub: t.getCity(locale),
                  isAr: isAr,
                  onTap: () => _go(ClubDetailScreen(clubId: t.id)),
                ),
            ],
          ),
        if (_res.players.isNotEmpty)
          _section(
            isAr ? 'اللاعبون' : 'Players',
            [
              for (final p in _res.players)
                _row(
                  leading: _avatar(p.photo, '👤'),
                  round: true,
                  title: p.getName(locale),
                  sub: [
                    p.getClub(locale),
                    p.getPosition(locale),
                    if (p.birthYear != null)
                      isAr ? 'مواليد ${p.birthYear}' : '${p.birthYear}',
                  ].where((s) => s.isNotEmpty).join(' · '),
                  isAr: isAr,
                  onTap: () => _go(PlayerDetailScreen(playerId: p.id)),
                ),
            ],
          ),
        if (_res.coaches.isNotEmpty)
          _section(
            isAr ? 'المدربون' : 'Coaches',
            [
              for (final c in _res.coaches)
                _row(
                  leading: _avatar(c.photo, '👤'),
                  round: true,
                  title: c.getName(locale),
                  sub: [
                    c.getRole(locale).isNotEmpty
                        ? c.getRole(locale)
                        : (isAr ? 'مدرب' : 'Coach'),
                    c.getClub(locale),
                  ].where((s) => s.isNotEmpty).join(' · '),
                  isAr: isAr,
                  onTap: () => _go(CoachDetailScreen(coachId: c.id)),
                ),
            ],
          ),
      ],
    );
  }

  Widget _section(String label, List<Widget> rows) {
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 4, 6),
          child: Text(label.toUpperCase(),
              style: TextStyle(
                  color: AppColors.hint,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5)),
        ),
        Container(
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(children: rows),
        ),
        const SizedBox(height: 14),
      ],
    );
  }

  Widget _avatar(String? url, String fallbackEmoji) {
    if (url != null && url.startsWith('http')) {
      return ClipOval(child: CachedLogo(url: url, size: 34, borderRadius: 17));
    }
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(color: AppColors.darkBg, shape: BoxShape.circle),
      alignment: Alignment.center,
      child: Text(fallbackEmoji, style: const TextStyle(fontSize: 15)),
    );
  }

  Widget _row({
    required Widget leading,
    required bool round,
    required String title,
    required String sub,
    required bool isAr,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.border.withValues(alpha: 0.4))),
        ),
        child: Row(children: [
          SizedBox(width: 34, height: 34, child: Center(child: leading)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title.isEmpty ? '—' : title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: AppColors.white,
                        fontSize: 13.5,
                        fontWeight: FontWeight.bold)),
                if (sub.isNotEmpty)
                  Text(sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: AppColors.hint, fontSize: 11)),
              ],
            ),
          ),
          Icon(isAr ? Icons.chevron_left : Icons.chevron_right,
              color: AppColors.hint, size: 18),
        ]),
      ),
    );
  }
}
