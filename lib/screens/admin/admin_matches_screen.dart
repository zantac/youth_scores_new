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

  // Bulk mode: tick several shown matches (e.g. a whole round) and edit their
  // date/time/venue/stage/group or delete them together. Editor-only — the
  // bulk endpoints 403 for a data-entry clerk. Mirrors the website's bulk panel.
  bool _bulkMode = false;
  final Set<int> _selected = {};
  bool _confirmBulkDel = false;
  bool _bulkBusy = false;

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
    // Bulk edit/delete are editor-only; a clerk's 403 means we hide the entry.
    final canEdit = context.watch<AdminAuth>().user?.canEdit ?? false;

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
          m.home.label(locale).toLowerCase().contains(q) ||
          m.away.label(locale).toLowerCase().contains(q);
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
          if (!_loading && _error == null && canEdit)
            IconButton(
              icon: Icon(_bulkMode ? Icons.close : Icons.checklist),
              tooltip: _bulkMode
                  ? (isAr ? 'إنهاء التحديد' : 'Exit selection')
                  : (isAr ? 'تحديد متعدد' : 'Bulk select'),
              onPressed: () => setState(() {
                _bulkMode = !_bulkMode;
                _selected.clear();
                _confirmBulkDel = false;
              }),
            ),
          if (!_loading && _error == null)
            IconButton(
              icon: const Icon(Icons.notifications_active_outlined),
              tooltip: isAr ? 'إشعار نتائج الجولة' : 'Round results notification',
              onPressed: () => _openRoundNotify(isAr, locale),
            ),
        ],
      ),
      floatingActionButton: _loading || _error != null || _bulkMode
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
                                  bulkMode: _bulkMode,
                                  selected: _selected.contains(shown[i].id),
                                  onTap: () {
                                    if (!_bulkMode) {
                                      _openEditor(shown[i]);
                                      return;
                                    }
                                    final id = shown[i].id;
                                    setState(() => _selected.contains(id)
                                        ? _selected.remove(id)
                                        : _selected.add(id));
                                  },
                                ),
                              ),
                            ),
                    ),
                    if (_bulkMode && _error == null)
                      _buildBulkBar(isAr, shown),
                  ],
                ),
    );
  }

  // Selection toolbar shown while in bulk mode: select-all-shown, the live
  // count, and the edit / delete actions (delete has an inline confirm step).
  Widget _buildBulkBar(bool isAr, List<EntryMatchRow> shown) {
    final allShownSelected =
        shown.isNotEmpty && shown.every((m) => _selected.contains(m.id));
    final n = _selected.length;
    return Material(
      elevation: 8,
      color: AppColors.cardBg,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              InkWell(
                onTap: shown.isEmpty
                    ? null
                    : () => setState(() {
                          if (allShownSelected) {
                            for (final m in shown) {
                              _selected.remove(m.id);
                            }
                          } else {
                            for (final m in shown) {
                              _selected.add(m.id);
                            }
                          }
                        }),
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(
                        allShownSelected
                            ? Icons.check_box
                            : Icons.check_box_outline_blank,
                        size: 20,
                        color: AppColors.aqua),
                    const SizedBox(width: 6),
                    Text(isAr ? 'تحديد المعروض' : 'Select shown',
                        style: TextStyle(color: AppColors.teal, fontSize: 12.5)),
                  ]),
                ),
              ),
              const Spacer(),
              Text(
                  isAr ? '$n محدّدة' : '$n selected',
                  style: TextStyle(
                      color: AppColors.white,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600)),
            ]),
            const SizedBox(height: 6),
            if (_confirmBulkDel)
              Row(children: [
                Expanded(
                  child: Text(
                      isAr
                          ? 'حذف $n مباراة؟ (قابلة للاسترداد خلال 24 ساعة)'
                          : 'Delete $n matches? (restorable within 24h)',
                      style: TextStyle(color: AppColors.teal, fontSize: 12)),
                ),
                TextButton(
                    onPressed: _bulkBusy
                        ? null
                        : () => setState(() => _confirmBulkDel = false),
                    child: Text(isAr ? 'إلغاء' : 'Cancel')),
                FilledButton(
                  onPressed: _bulkBusy ? null : _bulkDelete,
                  style: FilledButton.styleFrom(backgroundColor: AppColors.red),
                  child: _bulkBusy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : Text(isAr ? 'تأكيد الحذف' : 'Confirm delete'),
                ),
              ])
            else
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: n == 0 ? null : () => _openBulkEdit(isAr),
                    icon: const Icon(Icons.edit_calendar, size: 18),
                    label: Text(isAr ? 'تعديل المحدد' : 'Edit selected'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed:
                        n == 0 ? null : () => setState(() => _confirmBulkDel = true),
                    style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.red,
                        side: BorderSide(color: AppColors.red.withValues(alpha: 0.5))),
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: Text(isAr ? 'حذف المحدد' : 'Delete selected'),
                  ),
                ),
              ]),
          ]),
        ),
      ),
    );
  }

  Future<void> _bulkDelete() async {
    final token = context.read<AdminAuth>().token;
    if (token == null || _selected.isEmpty) return;
    setState(() => _bulkBusy = true);
    try {
      final count = await _api.bulkDeleteMatches(token, _selected.toList());
      if (!mounted) return;
      setState(() {
        _selected.clear();
        _confirmBulkDel = false;
        _bulkBusy = false;
      });
      await _refreshMatches();
      if (!mounted) return;
      final isAr = context.read<AppProvider>().locale == 'ar';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(isAr
            ? '✓ حُذفت $count مباراة — قابلة للاسترداد خلال 24 ساعة'
            : '✓ Deleted $count matches — restorable within 24h'),
      ));
    } catch (e) {
      if (!mounted) return;
      setState(() => _bulkBusy = false);
      if (!handleAdminError(context, e)) showAdminError(context, e);
    }
  }

  Future<void> _openBulkEdit(bool isAr) async {
    final token = context.read<AdminAuth>().token;
    if (token == null || _selected.isEmpty) return;
    final msg = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.darkBg,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _BulkEditSheet(
        api: _api,
        token: token,
        ids: _selected.toList(),
        stages: _stages,
        isAr: isAr,
      ),
    );
    if (msg == null || !mounted) return; // cancelled
    setState(() => _selected.clear());
    await _refreshMatches();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
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
  final bool bulkMode;
  final bool selected;
  const _MatchTile(
      {required this.match,
      required this.locale,
      required this.isAr,
      required this.onTap,
      this.bulkMode = false,
      this.selected = false});

  @override
  Widget build(BuildContext context) {
    // Middle block: the score once played, otherwise the kickoff time (or TBD).
    final centre = match.hasScore
        ? '${match.homeScore} - ${match.awayScore}'
        : (match.date.isNotEmpty
            ? (match.time.isNotEmpty ? match.time : '--:--')
            : (isAr ? 'غير محدد' : 'TBD'));
    final meta = [
      if (match.groupName != null && match.groupName!.isNotEmpty) match.groupName!,
      if (match.week.isNotEmpty) (isAr ? 'الجولة ${match.week}' : 'Round ${match.week}'),
      if (match.date.isNotEmpty) match.date else (isAr ? 'غير محدد' : 'TBD'),
      if (match.venue != null && match.venue!.isNotEmpty) match.venue!,
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: selected ? AppColors.aqua.withValues(alpha: 0.08) : AppColors.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: selected ? AppColors.aqua : AppColors.border),
          ),
          child: Row(children: [
            if (bulkMode) ...[
              Icon(
                  selected ? Icons.check_box : Icons.check_box_outline_blank,
                  color: selected ? AppColors.aqua : AppColors.hint,
                  size: 22),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Column(children: [
            Row(children: [
              // Home — aligned toward the centre.
              Expanded(
                child: Text(match.home.label(locale),
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
                child: Text(match.away.label(locale),
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

// ── Bulk match-edit sheet ─────────────────────────────────────────────────────
// Set date/time/venue and/or move a selection of matches under a stage+group in
// one step. Pops the result message on success. Mirrors the website's bulk
// panel (apiBulkUpdateMatches): no stage picked leaves placement alone; a stage
// with no group clears the group.
class _BulkEditSheet extends StatefulWidget {
  final AdminApi api;
  final String token;
  final List<int> ids;
  final List<MStage> stages;
  final bool isAr;
  const _BulkEditSheet({
    required this.api,
    required this.token,
    required this.ids,
    required this.stages,
    required this.isAr,
  });

  @override
  State<_BulkEditSheet> createState() => _BulkEditSheetState();
}

class _BulkEditSheetState extends State<_BulkEditSheet> {
  String _date = '';
  final _time = TextEditingController();
  final _venue = TextEditingController();
  int? _stageId;
  int? _groupId;
  bool _busy = false;
  String? _err;

  @override
  void dispose() {
    _time.dispose();
    _venue.dispose();
    super.dispose();
  }

  bool get _hasChange =>
      _date.isNotEmpty ||
      _time.text.trim().isNotEmpty ||
      _venue.text.trim().isNotEmpty ||
      _stageId != null;

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

  Future<void> _apply() async {
    final patch = <String, dynamic>{};
    if (_date.isNotEmpty) patch['date'] = _date;
    final t = _time.text.trim();
    if (t.isNotEmpty) patch['time'] = t;
    final v = _venue.text.trim();
    if (v.isNotEmpty) patch['venue'] = v;
    // Stage and group travel together: a group only exists inside its stage, so
    // a stage with no group chosen clears the group (group_id: null).
    if (_stageId != null) {
      patch['stage_id'] = _stageId;
      patch['group_id'] = _groupId;
    }
    if (patch.isEmpty) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final r = await widget.api.bulkUpdateMatches(widget.token, widget.ids, patch);
      if (!mounted) return;
      final isAr = widget.isAr;
      final msg = (isAr
              ? '✓ تم تحديث ${r.updated} مباراة'
              : '✓ Updated ${r.updated} matches') +
          (r.skipped > 0
              ? (isAr
                  ? ' · تُخطّيت ${r.skipped} (مباراة مكرّرة في الدور)'
                  : ' · skipped ${r.skipped} (duplicate in stage)')
              : '');
      Navigator.pop(context, msg);
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
    final stage = widget.stages.where((s) => s.id == _stageId).toList();
    final groups = stage.isEmpty ? const <MGroup>[] : stage.first.groups;

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
              child: Text(
                  isAr
                      ? 'تعديل ${widget.ids.length} مباراة'
                      : 'Edit ${widget.ids.length} matches',
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
                  ? 'الحقول المتروكة فارغة تبقى كما هي.'
                  : 'Fields left blank are left unchanged.',
              style: TextStyle(color: AppColors.hint, fontSize: 11.5)),
          const SizedBox(height: 14),
          // Date
          InkWell(
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
              decoration: _dec(null),
              child: Row(children: [
                Icon(Icons.calendar_month, color: AppColors.hint, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(_date.isEmpty ? (isAr ? 'التاريخ (اختياري)' : 'Date (optional)') : _date,
                      style: TextStyle(
                          color: _date.isEmpty ? AppColors.hint : AppColors.white,
                          fontSize: 13)),
                ),
                if (_date.isNotEmpty)
                  InkWell(
                    onTap: () => setState(() => _date = ''),
                    child: Icon(Icons.clear, color: AppColors.hint, size: 16),
                  ),
              ]),
            ),
          ),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _time,
                style: TextStyle(color: AppColors.white, fontSize: 13),
                decoration: _dec(isAr ? 'الوقت (مثال 18:00)' : 'Time (e.g. 18:00)'),
                onChanged: (_) => setState(() {}),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _venue,
                style: TextStyle(color: AppColors.white, fontSize: 13),
                decoration: _dec(isAr ? 'الملعب' : 'Venue'),
                onChanged: (_) => setState(() {}),
              ),
            ),
          ]),
          const SizedBox(height: 8),
          // Stage → group placement.
          DropdownButtonFormField<int>(
            initialValue: _stageId,
            isExpanded: true,
            dropdownColor: AppColors.cardBg,
            style: TextStyle(color: AppColors.white, fontSize: 13),
            hint: Text(isAr ? 'الدور (اتركه لعدم التغيير)' : 'Stage (leave to keep)',
                style: TextStyle(color: AppColors.hint, fontSize: 13)),
            decoration: _dec(null),
            items: [
              DropdownMenuItem(
                  value: null,
                  child: Text(isAr ? '— عدم التغيير —' : '— leave unchanged —')),
              for (final s in widget.stages)
                DropdownMenuItem(value: s.id, child: Text(s.name(isAr))),
            ],
            onChanged: (v) => setState(() {
              _stageId = v;
              _groupId = null;
            }),
          ),
          if (_stageId != null && groups.isNotEmpty) ...[
            const SizedBox(height: 8),
            DropdownButtonFormField<int>(
              initialValue: _groupId,
              isExpanded: true,
              dropdownColor: AppColors.cardBg,
              style: TextStyle(color: AppColors.white, fontSize: 13),
              hint: Text(isAr ? 'المجموعة (بدون = مسح)' : 'Group (none = clear)',
                  style: TextStyle(color: AppColors.hint, fontSize: 13)),
              decoration: _dec(null),
              items: [
                DropdownMenuItem(
                    value: null,
                    child: Text(isAr ? '— بدون مجموعة —' : '— no group —')),
                for (final g in groups)
                  DropdownMenuItem(value: g.id, child: Text(g.name(isAr))),
              ],
              onChanged: (v) => setState(() => _groupId = v),
            ),
          ],
          if (_err != null) ...[
            const SizedBox(height: 10),
            Text(_err!, style: TextStyle(color: AppColors.red, fontSize: 12)),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: (_busy || !_hasChange) ? null : _apply,
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.aqua,
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              child: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : Text(isAr ? 'تطبيق على المحدد' : 'Apply to selected',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
    );
  }
}
