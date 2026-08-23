import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/admin_data.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';

/// Dashboard tab — mirrors the website's /admin overview: greeting, icon +
/// colored-number stat cards, a match-entry progress card and the competitions
/// that still have unplayed matches. Filters scope every figure.
class AdminDashboardTab extends StatefulWidget {
  const AdminDashboardTab({super.key});

  @override
  State<AdminDashboardTab> createState() => _AdminDashboardTabState();
}

class _AdminDashboardTabState extends State<AdminDashboardTab> {
  final _api = AdminApi();
  bool _loading = true;
  String? _error;
  AdminStats? _stats;
  int? _seasonId;
  int? _competitionId;
  bool _defaulted = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = context.read<AdminAuth>().token;
    if (token == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final s = await _api.stats(token,
          seasonId: _seasonId, competitionId: _competitionId);
      if (!mounted) return;
      // On first load, default the season filter to the active season and
      // re-fetch scoped to it.
      if (!_defaulted && _seasonId == null && s.activeSeason != null) {
        _defaulted = true;
        final match = s.filterSeasons.where((f) => f.name == s.activeSeason).toList();
        if (match.isNotEmpty) {
          setState(() => _seasonId = match.first.id);
          return _load();
        }
      }
      _defaulted = true;
      setState(() {
        _stats = s;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final user = context.watch<AdminAuth>().user;
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _RetryView(message: _error!, onRetry: _load);
    final s = _stats!;

    final comps = _seasonId == null
        ? s.filterComps
        : s.filterComps.where((c) => c.seasonId == _seasonId).toList();

    final pending = s.competitions.where((c) => c.total > c.played).toList()
      ..sort((a, b) => b.remaining - a.remaining);

    // "Most followed" — anonymous device follows (global, unaffected by the
    // filters above). Already sorted desc by the backend.
    final followComps = s.followComps.where((f) => f.followers > 0).toList();
    final followTeams = s.followTeams.where((f) => f.followers > 0).toList();

    final gold = AppColors.orange;
    final white = AppColors.white;
    final name = (user?.fullName?.isNotEmpty == true) ? user!.fullName! : (user?.username ?? '');

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          // ── Greeting ─────────────────────────────────────────────────────
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.aqua.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              RichText(
                text: TextSpan(
                  style: TextStyle(color: white, fontSize: 14),
                  children: [
                    TextSpan(text: isAr ? 'أهلاً، ' : 'Hi, '),
                    TextSpan(
                        text: name,
                        style: TextStyle(color: AppColors.aqua, fontWeight: FontWeight.bold)),
                    const TextSpan(text: ' 👋'),
                  ],
                ),
              ),
              if (s.activeSeason != null) ...[
                const SizedBox(height: 4),
                Text(
                  isAr ? 'الموسم الحالي: ${s.activeSeason}' : 'Active season: ${s.activeSeason}',
                  style: TextStyle(color: AppColors.hint, fontSize: 12),
                ),
              ],
            ]),
          ),
          const SizedBox(height: 12),
          // ── Filters ──────────────────────────────────────────────────────
          Row(children: [
            Expanded(
              child: _FilterDropdown<int?>(
                label: isAr ? 'الموسم' : 'Season',
                value: _seasonId,
                items: [
                  DropdownMenuItem(value: null, child: Text(isAr ? 'الكل' : 'All')),
                  for (final f in s.filterSeasons)
                    DropdownMenuItem(value: f.id, child: Text(f.name)),
                ],
                onChanged: (v) {
                  setState(() {
                    _seasonId = v;
                    _competitionId = null;
                  });
                  _load();
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _FilterDropdown<int?>(
                label: isAr ? 'البطولة' : 'Competition',
                value: _competitionId,
                items: [
                  DropdownMenuItem(value: null, child: Text(isAr ? 'الكل' : 'All')),
                  for (final c in comps)
                    DropdownMenuItem(
                        value: c.id,
                        child: Text(
                            [c.name, c.age].where((x) => x.isNotEmpty).join(' — '),
                            overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (v) {
                  setState(() => _competitionId = v);
                  _load();
                },
              ),
            ),
          ]),
          const SizedBox(height: 14),
          // ── Stat grid 1 ──────────────────────────────────────────────────
          _statGrid(context, [
            _StatData('🗓️', isAr ? 'المواسم' : 'Seasons', '${s.count('seasons')}', white),
            _StatData('🏆', isAr ? 'البطولات' : 'Competitions', '${s.count('competitions')}', white),
            _StatData('🎯', isAr ? 'المراحل السنية' : 'Age groups', '${s.count('age_groups')}', white),
            _StatData('🛡️', isAr ? 'الأندية' : 'Clubs', '${s.count('clubs')}', white),
            _StatData('⚽', isAr ? 'الفرق' : 'Teams', '${s.count('teams')}', white),
            _StatData('👤', isAr ? 'اللاعبون' : 'Players', '${s.count('players')}', white),
          ]),
          const SizedBox(height: 12),
          // ── Match entry progress ─────────────────────────────────────────
          _progressCard(s, isAr),
          const SizedBox(height: 12),
          // ── Stat grid 2 ──────────────────────────────────────────────────
          _statGrid(context, [
            _StatData('🥅', isAr ? 'الأهداف' : 'Goals', '${s.count('goals')}', gold),
            _StatData('📈', isAr ? 'هدف/مباراة' : 'Goals/match', s.goalsPerMatch.toStringAsFixed(1), gold),
            _StatData('🧑‍🏫', isAr ? 'المدربون' : 'Coaches', '${s.count('coaches')}', white),
            _StatData('👥', isAr ? 'لاعب/فريق' : 'Players/team', s.playersPerTeam.toStringAsFixed(1), white),
            _StatData('📰', isAr ? 'الأخبار' : 'News', '${s.count('news')}', white),
            _StatData('📍', isAr ? 'الملاعب' : 'Venues', '${s.count('venues')}', white),
          ]),
          const SizedBox(height: 12),
          // ── Outstanding competitions ─────────────────────────────────────
          if (pending.isNotEmpty) _pendingCard(pending, isAr, gold),
          // ── Most followed (anonymous device follows) ─────────────────────
          if (followComps.isNotEmpty) ...[
            const SizedBox(height: 12),
            _followCard(
                isAr ? '⭐ البطولات الأكثر متابعة' : '⭐ Most followed competitions',
                followComps, isAr),
          ],
          if (followTeams.isNotEmpty) ...[
            const SizedBox(height: 12),
            _followCard(
                isAr ? '⭐ الفرق الأكثر متابعة' : '⭐ Most followed teams',
                followTeams, isAr),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _statGrid(BuildContext context, List<_StatData> stats) {
    final w = (MediaQuery.of(context).size.width - 14 * 2 - 10 * 2) / 3;
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [for (final st in stats) SizedBox(width: w.clamp(90, 220), child: _StatCard(st))],
    );
  }

  Widget _progressCard(AdminStats s, bool isAr) {
    final pct = (s.playedPct * 100).round();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(isAr ? '📋 إدخال النتائج' : '📋 Results entry',
              style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 14)),
          const Spacer(),
          Text('$pct%',
              style: TextStyle(color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 16)),
        ]),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: s.playedPct,
            minHeight: 10,
            backgroundColor: AppColors.darkBg,
            valueColor: AlwaysStoppedAnimation(AppColors.aqua),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          isAr
              ? '${s.matchesPlayed} مكتملة · ${s.matchesRemaining} متبقية · ${s.matchesTotal} إجمالاً'
              : '${s.matchesPlayed} played · ${s.matchesRemaining} remaining · ${s.matchesTotal} total',
          style: TextStyle(color: AppColors.hint, fontSize: 11.5),
        ),
      ]),
    );
  }

  Widget _pendingCard(List<StatComp> pending, bool isAr, Color gold) {
    final shown = pending.take(6).toList();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(isAr ? '⏳ بطولات لم تكتمل نتائجها' : '⏳ Competitions with unplayed matches',
            style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        const SizedBox(height: 8),
        for (final c in shown)
          Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.darkBg.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(children: [
              Expanded(
                child: Text(
                  [c.name, c.sector].where((x) => x.isNotEmpty).join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: AppColors.white, fontSize: 12),
                ),
              ),
              const SizedBox(width: 8),
              Text('${c.remaining}',
                  style: TextStyle(color: gold, fontSize: 13, fontWeight: FontWeight.bold)),
            ]),
          ),
        if (pending.length > 6)
          Text(
            isAr ? 'و${pending.length - 6} بطولة أخرى' : 'and ${pending.length - 6} more',
            style: TextStyle(color: AppColors.hint, fontSize: 11),
          ),
      ]),
    );
  }

  // A "most followed" list — top rows with a 👥 follower count, capped so the
  // card stays compact. Follower = a device that opted into notifications for it
  // (web or app), which is what the tally can see.
  Widget _followCard(String title, List<StatFollow> rows, bool isAr) {
    final shown = rows.take(8).toList();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title,
            style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        const SizedBox(height: 8),
        for (final r in shown)
          Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.darkBg.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(children: [
              Expanded(
                child: Text(
                  [r.name, r.sub].where((x) => x.isNotEmpty).join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: AppColors.white, fontSize: 12),
                ),
              ),
              const SizedBox(width: 8),
              Text('👥 ${r.followers}',
                  style: TextStyle(color: AppColors.aqua, fontSize: 13, fontWeight: FontWeight.bold)),
            ]),
          ),
        if (rows.length > 8)
          Text(
            isAr ? 'و${rows.length - 8} أخرى' : 'and ${rows.length - 8} more',
            style: TextStyle(color: AppColors.hint, fontSize: 11),
          ),
      ]),
    );
  }
}

class _StatData {
  final String emoji;
  final String label;
  final String value;
  final Color tone;
  const _StatData(this.emoji, this.label, this.value, this.tone);
}

class _StatCard extends StatelessWidget {
  final _StatData data;
  const _StatCard(this.data);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${data.emoji} ${data.label}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: AppColors.hint, fontSize: 11)),
        const SizedBox(height: 3),
        Text(data.value,
            style: TextStyle(color: data.tone, fontWeight: FontWeight.bold, fontSize: 21)),
      ]),
    );
  }
}

class _FilterDropdown<T> extends StatelessWidget {
  final String label;
  final T value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;
  const _FilterDropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 4, left: 2),
          child: Text(label,
              style: TextStyle(
                  color: AppColors.teal, fontSize: 11, fontWeight: FontWeight.bold)),
        ),
        DropdownButtonFormField<T>(
          initialValue: value,
          isExpanded: true,
          dropdownColor: AppColors.cardBg,
          style: TextStyle(color: AppColors.white, fontSize: 13),
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: AppColors.cardBg,
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: AppColors.border),
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: AppColors.border),
            ),
          ),
          items: items,
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class _RetryView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _RetryView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, color: AppColors.hint, size: 40),
            const SizedBox(height: 12),
            Text(message,
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.white)),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
