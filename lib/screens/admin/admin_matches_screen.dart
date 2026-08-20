import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/match_entry.dart';
import '../../core/models/admin/structure_models.dart';
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
  List<MStage> _stages = const [];
  String _filter = '';
  String _week = '';
  String _date = '';

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
        _api.stages(token, _cid),
      ]);
      if (!mounted) return;
      setState(() {
        _matches = results[0] as List<EntryMatchRow>;
        _teams = results[1] as List<EntryTeam>;
        _stages = results[2] as List<MStage>;
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

  InputDecoration _filterDec({String? hint, IconData? prefix}) => InputDecoration(
        isDense: true,
        hintText: hint,
        hintStyle: TextStyle(color: AppColors.hint, fontSize: 13),
        prefixIcon: prefix == null ? null : Icon(prefix, color: AppColors.hint, size: 18),
        filled: true,
        fillColor: AppColors.cardBg,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.aqua),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final locale = isAr ? 'ar' : 'en';

    final active = _matches.where((m) => !m.isDeleted).toList();
    final q = _filter.trim().toLowerCase();
    // Distinct rounds present, sorted numerically then lexically.
    final weeks = {for (final m in active) m.week}.where((w) => w.isNotEmpty).toList()
      ..sort((a, b) =>
          (int.tryParse(a) ?? 0).compareTo(int.tryParse(b) ?? 0) == 0
              ? a.compareTo(b)
              : (int.tryParse(a) ?? 0).compareTo(int.tryParse(b) ?? 0));
    final shown = active.where((m) {
      final matchesQ = q.isEmpty ||
          m.home.getName(locale).toLowerCase().contains(q) ||
          m.away.getName(locale).toLowerCase().contains(q);
      final matchesWeek = _week.isEmpty || m.week == _week;
      final matchesDate = _date.isEmpty || m.date == _date;
      return matchesQ && matchesWeek && matchesDate;
    }).toList();
    final filtering = _filter.isNotEmpty || _week.isNotEmpty || _date.isNotEmpty;
    // Result count, mirroring the website: "X of Y" while filtering, else "Y".
    final countText = filtering
        ? (isAr
            ? '${shown.length} من ${active.length} مباراة'
            : '${shown.length} of ${active.length} matches')
        : (isAr ? '${active.length} مباراة' : '${active.length} matches');

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.competition.getName(locale)),
        actions: [
          if (!_loading && _error == null)
            IconButton(
              icon: const Icon(Icons.notifications_active_outlined),
              tooltip: isAr ? 'إشعار نتائج الجولة' : 'Round results notification',
              onPressed: () => _openRoundNotify(isAr, locale),
            ),
        ],
      ),
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
                      child: Column(children: [
                        TextField(
                          onChanged: (v) => setState(() => _filter = v),
                          style: TextStyle(color: AppColors.white, fontSize: 14),
                          decoration: _filterDec(
                            hint: isAr ? 'تصفية بالفريق…' : 'Filter by team…',
                            prefix: Icons.search,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              initialValue: _week.isEmpty ? null : _week,
                              isExpanded: true,
                              dropdownColor: AppColors.cardBg,
                              style: TextStyle(color: AppColors.white, fontSize: 13),
                              hint: Text(isAr ? 'كل الجولات' : 'All rounds',
                                  style: TextStyle(color: AppColors.hint, fontSize: 13)),
                              decoration: _filterDec(),
                              items: [
                                DropdownMenuItem(
                                    value: '', child: Text(isAr ? 'كل الجولات' : 'All rounds')),
                                for (final w in weeks)
                                  DropdownMenuItem(
                                      value: w, child: Text(isAr ? 'الجولة $w' : 'Round $w')),
                              ],
                              onChanged: (v) => setState(() => _week = v ?? ''),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: InkWell(
                              onTap: () async {
                                DateTime init;
                                try {
                                  init = DateTime.parse(_date);
                                } catch (_) {
                                  init = DateTime.now();
                                }
                                final picked = await showDatePicker(
                                  context: context,
                                  initialDate: init,
                                  firstDate: DateTime(2000),
                                  lastDate: DateTime(2100),
                                );
                                if (picked != null) {
                                  setState(() => _date =
                                      '${picked.year.toString().padLeft(4, '0')}-'
                                      '${picked.month.toString().padLeft(2, '0')}-'
                                      '${picked.day.toString().padLeft(2, '0')}');
                                }
                              },
                              child: InputDecorator(
                                decoration: _filterDec(prefix: Icons.calendar_month),
                                child: Text(_date.isEmpty ? (isAr ? 'كل التواريخ' : 'All dates') : _date,
                                    style: TextStyle(
                                        color: _date.isEmpty ? AppColors.hint : AppColors.white,
                                        fontSize: 13)),
                              ),
                            ),
                          ),
                        ]),
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Row(children: [
                            Text(countText,
                                style: TextStyle(
                                    color: AppColors.teal,
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600)),
                            const Spacer(),
                            if (filtering)
                              TextButton.icon(
                                onPressed: () => setState(() {
                                  _filter = '';
                                  _week = '';
                                  _date = '';
                                }),
                                style: TextButton.styleFrom(
                                    visualDensity: VisualDensity.compact),
                                icon: const Icon(Icons.close, size: 16),
                                label: Text(isAr ? 'مسح الفلاتر' : 'Clear filters'),
                              ),
                          ]),
                        ),
                      ]),
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

  void _openRoundNotify(bool isAr, String locale) {
    final token = context.read<AdminAuth>().token;
    if (token == null) return;
    final active = _matches.where((m) => !m.isDeleted).toList();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.darkBg,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _RoundNotifySheet(
        api: _api,
        token: token,
        cid: _cid,
        matches: active,
        isAr: isAr,
        locale: locale,
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
              AdminMatchEditorScreen(initial: full, teams: _teams, stages: _stages),
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
    // Middle block: the score once played, otherwise the kickoff time (or TBD).
    final centre = match.hasScore
        ? '${match.homeScore} - ${match.awayScore}'
        : (match.date.isNotEmpty
            ? (match.time.isNotEmpty ? match.time : '--:--')
            : (isAr ? 'غير محدد' : 'TBD'));
    final meta = [
      if (match.week.isNotEmpty) (isAr ? 'الجولة ${match.week}' : 'Round ${match.week}'),
      if (match.date.isNotEmpty) match.date else (isAr ? 'غير محدد' : 'TBD'),
    ].join(' · ');

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
          child: Column(children: [
            Row(children: [
              // Home — aligned toward the centre.
              Expanded(
                child: Text(match.home.getName(locale),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.end,
                    style: TextStyle(
                        color: AppColors.white,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600)),
              ),
              // Centre score/time + status.
              Container(
                constraints: const BoxConstraints(minWidth: 66),
                margin: const EdgeInsets.symmetric(horizontal: 8),
                child: Column(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.darkBg,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Text(centre,
                        style: TextStyle(
                            color: match.hasScore ? AppColors.aqua : AppColors.hint,
                            fontWeight: FontWeight.bold,
                            fontSize: 14)),
                  ),
                  const SizedBox(height: 3),
                  Text(MatchStatus.label(match.status, isAr),
                      style: TextStyle(color: AppColors.teal, fontSize: 9.5)),
                ]),
              ),
              // Away — aligned toward the centre.
              Expanded(
                child: Text(match.away.getName(locale),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.start,
                    style: TextStyle(
                        color: AppColors.white,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600)),
              ),
            ]),
            const SizedBox(height: 6),
            Text(meta,
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.hint, fontSize: 10.5)),
          ]),
        ),
      ),
    );
  }
}

// ── Round-results notification sheet ──────────────────────────────────────────
// Pick a round, see how many of its matches have a result, and send ONE digest
// push to the competition's followers. Mirrors the website's RoundNotify.
class _RoundNotifySheet extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int cid;
  final List<EntryMatchRow> matches;
  final bool isAr;
  final String locale;
  const _RoundNotifySheet({
    required this.api,
    required this.token,
    required this.cid,
    required this.matches,
    required this.isAr,
    required this.locale,
  });

  @override
  State<_RoundNotifySheet> createState() => _RoundNotifySheetState();
}

class _RoundNotifySheetState extends State<_RoundNotifySheet> {
  String _week = '';
  bool _confirm = false;
  bool _busy = false;
  String? _msg;
  String? _err;

  InputDecoration _dec(String? hint) => InputDecoration(
        isDense: true,
        hintText: hint,
        hintStyle: TextStyle(color: AppColors.hint, fontSize: 13),
        filled: true,
        fillColor: AppColors.cardBg,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: AppColors.border)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: AppColors.border)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: AppColors.aqua)),
      );

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _err = null;
      _msg = null;
    });
    try {
      final r = await widget.api.notifyRound(widget.token, widget.cid, _week);
      if (!mounted) return;
      final count = r['count'] ?? 0;
      final notif = r['notification'];
      final dry = notif is Map && notif['status'] == 'dry_run';
      final isAr = widget.isAr;
      setState(() {
        _msg = dry
            ? (isAr
                ? '✓ جُهّز الإشعار (وضع التجربة) — $count مباراة. يُرسل فعليًا بعد ربط Firebase.'
                : '✓ Prepared (dry run) — $count matches. Sends for real once Firebase is configured.')
            : (isAr
                ? '✓ أُرسل الإشعار — $count مباراة.'
                : '✓ Notification sent — $count matches.');
        _confirm = false;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      setState(() {
        _err = e.toString().replaceFirst('Exception: ', '');
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = widget.isAr;
    final weeks = {for (final m in widget.matches) m.week}
        .where((w) => w.isNotEmpty)
        .toList()
      ..sort((a, b) {
        final na = int.tryParse(a) ?? 0, nb = int.tryParse(b) ?? 0;
        return na != nb ? na.compareTo(nb) : a.compareTo(b);
      });
    final inWeek = widget.matches.where((m) => m.week == _week).toList();
    final done = inWeek.where((m) => m.status == 'completed').length;
    final total = inWeek.length;
    final allDone = total > 0 && done == total;

    return Padding(
      padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(isAr ? '🔔 إشعار نتائج الجولة' : '🔔 Round results',
                  style: TextStyle(
                      color: AppColors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 16)),
            ),
            IconButton(
                onPressed: () => Navigator.pop(context),
                icon: Icon(Icons.close, color: AppColors.hint)),
          ]),
          Text(
              isAr
                  ? 'بعد إدخال نتائج الجولة، أرسِل إشعارًا واحدًا لمتابعي هذه البطولة — بدل إشعار لكل مباراة.'
                  : "After a round's results are entered, send one digest to this competition's followers instead of one per match.",
              style: TextStyle(color: AppColors.hint, fontSize: 11.5, height: 1.5)),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _week.isEmpty ? null : _week,
            isExpanded: true,
            dropdownColor: AppColors.cardBg,
            style: TextStyle(color: AppColors.white, fontSize: 13),
            hint: Text(isAr ? '— اختر الجولة —' : '— Select round —',
                style: TextStyle(color: AppColors.hint, fontSize: 13)),
            decoration: _dec(null),
            items: [
              for (final w in weeks)
                DropdownMenuItem(
                    value: w, child: Text(isAr ? 'الجولة $w' : 'Round $w')),
            ],
            onChanged: (v) => setState(() {
              _week = v ?? '';
              _msg = null;
              _confirm = false;
            }),
          ),
          if (_week.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
                '${allDone ? '✅' : '⏳'} $done/$total ${isAr ? 'مباراة لها نتيجة' : 'matches have a result'}',
                style: TextStyle(
                    color: allDone ? AppColors.green : AppColors.orange,
                    fontSize: 12.5,
                    fontWeight: FontWeight.bold)),
          ],
          if (_err != null) ...[
            const SizedBox(height: 10),
            Text(_err!, style: TextStyle(color: AppColors.red, fontSize: 12)),
          ],
          if (_msg != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.green.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.green.withValues(alpha: 0.3)),
              ),
              child: Text(_msg!,
                  style: TextStyle(color: AppColors.green, fontSize: 12)),
            ),
          ],
          const SizedBox(height: 16),
          if (!_confirm)
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: (_week.isEmpty || done == 0)
                    ? null
                    : () => setState(() => _confirm = true),
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.aqua,
                    padding: const EdgeInsets.symmetric(vertical: 14)),
                child: Text(
                    isAr ? '🔔 أرسل إشعار نتائج الجولة' : '🔔 Send round notification',
                    style: const TextStyle(fontWeight: FontWeight.bold)),
              ),
            )
          else
            Row(children: [
              Expanded(
                child: Text(
                    isAr
                        ? 'إرسال إشعار بـ$done نتيجة لمتابعي البطولة؟'
                        : 'Send a $done-result digest to followers?',
                    style: TextStyle(color: AppColors.teal, fontSize: 12)),
              ),
              TextButton(
                  onPressed:
                      _busy ? null : () => setState(() => _confirm = false),
                  child: Text(isAr ? 'إلغاء' : 'Cancel')),
              FilledButton(
                onPressed: _busy ? null : _send,
                style: FilledButton.styleFrom(backgroundColor: AppColors.aqua),
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : Text(isAr ? 'تأكيد' : 'Confirm'),
              ),
            ]),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
