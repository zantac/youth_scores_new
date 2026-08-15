import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/match_entry.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';
import 'admin_match_editor_screen.dart';
import 'admin_new_match_screen.dart';

/// Matches for one competition — filterable list, tap to edit, + to add. Mirrors
/// the match list in the web MatchesEntry.
class AdminMatchesScreen extends StatefulWidget {
  final EntryCompetition competition;
  const AdminMatchesScreen({super.key, required this.competition});

  @override
  State<AdminMatchesScreen> createState() => _AdminMatchesScreenState();
}

class _AdminMatchesScreenState extends State<AdminMatchesScreen> {
  final _api = AdminApi();
  bool _loading = true;
  String? _error;
  List<EntryMatchRow> _matches = const [];
  List<EntryTeam> _teams = const [];
  String _filter = '';

  int get _cid => widget.competition.id;

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
      final results = await Future.wait([
        _api.competitionMatches(token, _cid),
        _api.competitionTeams(token, _cid),
      ]);
      if (!mounted) return;
      setState(() {
        _matches = results[0] as List<EntryMatchRow>;
        _teams = results[1] as List<EntryTeam>;
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

  Future<void> _refreshMatches() async {
    final token = context.read<AdminAuth>().token;
    if (token == null) return;
    try {
      final m = await _api.competitionMatches(token, _cid);
      if (mounted) setState(() => _matches = m);
    } catch (e) {
      if (mounted && !handleAdminError(context, e)) showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final locale = isAr ? 'ar' : 'en';

    final active = _matches.where((m) => !m.isDeleted).toList();
    final q = _filter.trim().toLowerCase();
    final shown = q.isEmpty
        ? active
        : active
            .where((m) =>
                m.home.getName(locale).toLowerCase().contains(q) ||
                m.away.getName(locale).toLowerCase().contains(q))
            .toList();

    return Scaffold(
      appBar: AppBar(title: Text(widget.competition.getName(locale))),
      floatingActionButton: _loading || _error != null
          ? null
          : FloatingActionButton.extended(
              backgroundColor: AppColors.aqua,
              icon: const Icon(Icons.add),
              label: Text(isAr ? 'مباراة' : 'Match'),
              onPressed: () async {
                final created = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => AdminNewMatchScreen(
                        competition: widget.competition, teams: _teams),
                  ),
                );
                if (created == true) _refreshMatches();
              },
            ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text(_error!,
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.white)),
                      const SizedBox(height: 16),
                      OutlinedButton(
                          onPressed: _load, child: const Text('Retry')),
                    ]),
                  ),
                )
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(10),
                      child: TextField(
                        onChanged: (v) => setState(() => _filter = v),
                        style: TextStyle(color: AppColors.white, fontSize: 14),
                        decoration: InputDecoration(
                          isDense: true,
                          prefixIcon:
                              Icon(Icons.search, color: AppColors.hint, size: 20),
                          hintText: isAr ? 'تصفية بالفريق…' : 'Filter by team…',
                          hintStyle:
                              TextStyle(color: AppColors.hint, fontSize: 13),
                          filled: true,
                          fillColor: AppColors.cardBg,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: AppColors.border),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: AppColors.border),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: shown.isEmpty
                          ? Center(
                              child: Text(
                                  isAr ? 'لا توجد مباريات' : 'No matches',
                                  style: TextStyle(color: AppColors.hint)))
                          : RefreshIndicator(
                              onRefresh: _refreshMatches,
                              child: ListView.builder(
                                padding: const EdgeInsets.fromLTRB(10, 0, 10, 90),
                                itemCount: shown.length,
                                itemBuilder: (_, i) => _MatchTile(
                                  match: shown[i],
                                  locale: locale,
                                  isAr: isAr,
                                  onTap: () => _openEditor(shown[i]),
                                ),
                              ),
                            ),
                    ),
                  ],
                ),
    );
  }

  Future<void> _openEditor(EntryMatchRow row) async {
    final token = context.read<AdminAuth>().token;
    if (token == null) return;
    try {
      final full = await _api.getMatch(token, row.id);
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              AdminMatchEditorScreen(initial: full, teams: _teams),
        ),
      );
      _refreshMatches();
    } catch (e) {
      if (mounted && !handleAdminError(context, e)) showAdminError(context, e);
    }
  }
}

class _MatchTile extends StatelessWidget {
  final EntryMatchRow match;
  final String locale;
  final bool isAr;
  final VoidCallback onTap;
  const _MatchTile(
      {required this.match,
      required this.locale,
      required this.isAr,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    final score = match.hasScore
        ? '${match.homeScore} - ${match.awayScore}'
        : (match.date.isNotEmpty ? match.date : (isAr ? 'غير محدد' : 'TBD'));
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${match.home.getName(locale)}  ×  ${match.away.getName(locale)}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: AppColors.white,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Row(children: [
                    if (match.week.isNotEmpty) ...[
                      Text(isAr ? 'ج${match.week}' : 'W${match.week}',
                          style: TextStyle(color: AppColors.hint, fontSize: 11)),
                      const SizedBox(width: 8),
                    ],
                    Text(MatchStatus.label(match.status, isAr),
                        style: TextStyle(color: AppColors.teal, fontSize: 11)),
                  ]),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.darkBg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.border),
              ),
              child: Text(score,
                  style: TextStyle(
                      color: match.hasScore ? AppColors.aqua : AppColors.hint,
                      fontWeight: FontWeight.bold,
                      fontSize: 13)),
            ),
          ]),
        ),
      ),
    );
  }
}
