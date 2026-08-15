import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/admin_data.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';

enum MergeKind { players, coaches }

/// A search result option, normalised so the picker works for both players and
/// coaches.
class _Opt {
  final int id;
  final String name;
  final String subtitle;
  const _Opt(this.id, this.name, this.subtitle);
}

/// Players / Coaches merge tab — mirrors the website's /admin/players and
/// /admin/coaches. Pick a source and a target record, review a side-by-side
/// summary, then merge the source into the target.
class AdminMergeTab extends StatefulWidget {
  final MergeKind kind;
  const AdminMergeTab({super.key, required this.kind});

  @override
  State<AdminMergeTab> createState() => _AdminMergeTabState();
}

class _AdminMergeTabState extends State<AdminMergeTab> {
  final _api = AdminApi();

  int? _srcId;
  int? _tgtId;
  Object? _srcSummary; // PlayerMergeSummary | CoachMergeSummary
  Object? _tgtSummary;
  bool _merging = false;

  String get _token => context.read<AdminAuth>().token ?? '';

  Future<List<_Opt>> _search(String q) async {
    if (widget.kind == MergeKind.players) {
      final r = await _api.searchPlayers(_token, q);
      return r
          .map((p) => _Opt(p.id, p.name,
              [if (p.club != null) p.club!, '${p.birthYear}'].join(' • ')))
          .toList();
    } else {
      final r = await _api.searchCoaches(_token, q);
      return r
          .map((c) => _Opt(c.id, c.name,
              [if (c.role != null) c.role!, if (c.club != null) c.club!].join(' • ')))
          .toList();
    }
  }

  Future<void> _loadSummary(int id, bool isSource) async {
    try {
      final Object s = widget.kind == MergeKind.players
          ? await _api.playerSummary(_token, id)
          : await _api.coachSummary(_token, id);
      if (!mounted) return;
      setState(() {
        if (isSource) {
          _srcId = id;
          _srcSummary = s;
        } else {
          _tgtId = id;
          _tgtSummary = s;
        }
      });
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  void _clear(bool isSource) {
    setState(() {
      if (isSource) {
        _srcId = null;
        _srcSummary = null;
      } else {
        _tgtId = null;
        _tgtSummary = null;
      }
    });
  }

  int? _birthYear(Object? s) {
    if (s is PlayerMergeSummary) return s.birthYear;
    if (s is CoachMergeSummary) return s.birthYear;
    return null;
  }

  String _name(Object? s) {
    if (s is PlayerMergeSummary) return s.name;
    if (s is CoachMergeSummary) return s.name;
    return '';
  }

  Future<void> _merge() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (_srcId == null || _tgtId == null || _srcId == _tgtId) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.dialogBg,
        title: Text(isAr ? 'تأكيد الدمج' : 'Confirm merge',
            style: TextStyle(color: AppColors.white)),
        content: Text(
          isAr
              ? 'سيتم نقل كل بيانات "${_name(_srcSummary)}" إلى "${_name(_tgtSummary)}" وحذف السجل الأول نهائيًا. لا يمكن التراجع.'
              : 'All data from "${_name(_srcSummary)}" will move into "${_name(_tgtSummary)}" and the first record is deleted permanently. This cannot be undone.',
          style: TextStyle(color: AppColors.teal, fontSize: 13),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(isAr ? 'إلغاء' : 'Cancel')),
          FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.red),
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(isAr ? 'دمج' : 'Merge')),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _merging = true);
    try {
      if (widget.kind == MergeKind.players) {
        await _api.mergePlayer(_token, _srcId!, _tgtId!);
      } else {
        await _api.mergeCoach(_token, _srcId!, _tgtId!);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(isAr ? 'تم الدمج بنجاح' : 'Merged successfully')));
      setState(() {
        _srcId = null;
        _tgtId = null;
        _srcSummary = null;
        _tgtSummary = null;
        _merging = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _merging = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final isPlayers = widget.kind == MergeKind.players;

    final sy = _birthYear(_srcSummary);
    final ty = _birthYear(_tgtSummary);
    final birthMismatch = sy != null && ty != null && sy != ty;
    final canMerge = _srcId != null && _tgtId != null && _srcId != _tgtId;

    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Text(
          isPlayers
              ? (isAr ? 'دمج لاعبين مكرّرين' : 'Merge duplicate players')
              : (isAr ? 'دمج مدرّبين/إداريين مكرّرين' : 'Merge duplicate staff'),
          style: TextStyle(
              color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 15),
        ),
        const SizedBox(height: 4),
        Text(
          isAr
              ? 'اختر السجل المُكرَّر (المصدر) والسجل الصحيح (الهدف). سيُدمج المصدر في الهدف.'
              : 'Pick the duplicate (source) and the correct record (target). The source merges into the target.',
          style: TextStyle(color: AppColors.hint, fontSize: 12),
        ),
        const SizedBox(height: 16),
        _MergePicker(
          label: isAr ? 'المصدر (سيُحذف)' : 'Source (will be deleted)',
          accent: AppColors.orange,
          search: _search,
          selectedSummary: _srcSummary,
          onSelect: (o) => _loadSummary(o.id, true),
          onClear: () => _clear(true),
          summaryBuilder: _summaryCard,
        ),
        const SizedBox(height: 14),
        _MergePicker(
          label: isAr ? 'الهدف (سيبقى)' : 'Target (will be kept)',
          accent: AppColors.green,
          search: _search,
          selectedSummary: _tgtSummary,
          onSelect: (o) => _loadSummary(o.id, false),
          onClear: () => _clear(false),
          summaryBuilder: _summaryCard,
        ),
        if (birthMismatch) ...[
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.orange.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.orange.withValues(alpha: 0.5)),
            ),
            child: Row(children: [
              Icon(Icons.warning_amber_rounded, color: AppColors.orange, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  isAr
                      ? 'سنة الميلاد مختلفة ($sy مقابل $ty) — تأكّد أنهما نفس الشخص.'
                      : 'Birth years differ ($sy vs $ty) — make sure this is the same person.',
                  style: TextStyle(color: AppColors.orange, fontSize: 12),
                ),
              ),
            ]),
          ),
        ],
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: (!canMerge || _merging) ? null : _merge,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.aqua,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            icon: _merging
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.merge_type),
            label: Text(isAr ? 'دمج السجلّين' : 'Merge records',
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  // Kind-specific summary card, rendered inside each picker once a record is
  // selected.
  Widget _summaryCard(Object summary) {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (summary is PlayerMergeSummary) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _statRow(isAr ? 'سنة الميلاد' : 'Birth year', '${summary.birthYear}'),
        _statRow(isAr ? 'أهداف' : 'Goals', '${summary.goals}'),
        _statRow(isAr ? 'صناعة' : 'Assists', '${summary.assists}'),
        _statRow(isAr ? 'مباريات' : 'Appearances', '${summary.appearances}'),
        if (summary.teams.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(isAr ? 'الفرق' : 'Teams',
              style: TextStyle(
                  color: AppColors.hint, fontSize: 11, fontWeight: FontWeight.bold)),
          for (final t in summary.teams)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '• ${t.club}${t.age != null ? ' (${t.age})' : ''}'
                '${t.guest ? (isAr ? ' — ضيف' : ' — guest') : ''}'
                '${t.current ? (isAr ? ' — حالي' : ' — current') : ''}'
                ' • ${t.goals}${isAr ? ' هدف' : 'g'}',
                style: TextStyle(color: AppColors.teal, fontSize: 11.5),
              ),
            ),
        ],
      ]);
    }
    if (summary is CoachMergeSummary) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (summary.birthYear != null)
          _statRow(isAr ? 'سنة الميلاد' : 'Birth year', '${summary.birthYear}'),
        if (summary.roles.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(isAr ? 'الأدوار' : 'Roles',
              style: TextStyle(
                  color: AppColors.hint, fontSize: 11, fontWeight: FontWeight.bold)),
          for (final r in summary.roles)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(children: [
                Icon(r.type == 'manager' ? Icons.badge : Icons.sports,
                    size: 14, color: AppColors.hint),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    [
                      if (r.role != null) r.role!,
                      if (r.club != null) r.club!,
                      if (r.age != null) r.age!,
                    ].join(' • ') +
                        (r.current ? (isAr ? ' — حالي' : ' — current') : ''),
                    style: TextStyle(color: AppColors.teal, fontSize: 11.5),
                  ),
                ),
              ]),
            ),
        ],
      ]);
    }
    return const SizedBox.shrink();
  }

  Widget _statRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(label, style: TextStyle(color: AppColors.hint, fontSize: 11.5)),
          Text(value,
              style: TextStyle(
                  color: AppColors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ]),
      );
}

/// A single record picker: debounced search, results dropdown, and — once a
/// record is chosen — a summary card with a "change" button.
class _MergePicker extends StatefulWidget {
  final String label;
  final Color accent;
  final Future<List<_Opt>> Function(String) search;
  final Object? selectedSummary;
  final void Function(_Opt) onSelect;
  final VoidCallback onClear;
  final Widget Function(Object) summaryBuilder;

  const _MergePicker({
    required this.label,
    required this.accent,
    required this.search,
    required this.selectedSummary,
    required this.onSelect,
    required this.onClear,
    required this.summaryBuilder,
  });

  @override
  State<_MergePicker> createState() => _MergePickerState();
}

class _MergePickerState extends State<_MergePicker> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  bool _searching = false;
  List<_Opt> _results = const [];

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() => _results = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _searching = true);
      try {
        final r = await widget.search(q.trim());
        if (!mounted) return;
        setState(() {
          _results = r;
          _searching = false;
        });
      } catch (e) {
        if (!mounted) return;
        setState(() => _searching = false);
        if (handleAdminError(context, e)) return;
        showAdminError(context, e);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final hasSelection = widget.selectedSummary != null;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: widget.accent.withValues(alpha: 0.5)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(widget.label,
            style: TextStyle(
                color: widget.accent, fontSize: 12, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        if (hasSelection) ...[
          widget.summaryBuilder(widget.selectedSummary!),
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton.icon(
              onPressed: () {
                _ctrl.clear();
                setState(() => _results = const []);
                widget.onClear();
              },
              icon: const Icon(Icons.close, size: 16),
              label: Text(isAr ? 'تغيير' : 'Change'),
            ),
          ),
        ] else ...[
          TextField(
            controller: _ctrl,
            onChanged: _onChanged,
            style: TextStyle(color: AppColors.white, fontSize: 13),
            decoration: InputDecoration(
              isDense: true,
              hintText: isAr ? 'ابحث بالاسم…' : 'Search by name…',
              hintStyle: TextStyle(color: AppColors.hint, fontSize: 13),
              prefixIcon: Icon(Icons.search, color: AppColors.hint, size: 18),
              suffixIcon: _searching
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : null,
              filled: true,
              fillColor: AppColors.darkBg,
              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: AppColors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: AppColors.aqua),
              ),
            ),
          ),
          if (_results.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 6),
              constraints: const BoxConstraints(maxHeight: 220),
              decoration: BoxDecoration(
                color: AppColors.darkBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.border),
              ),
              child: ListView(
                shrinkWrap: true,
                padding: EdgeInsets.zero,
                children: [
                  for (final o in _results)
                    ListTile(
                      dense: true,
                      title: Text(o.name,
                          style: TextStyle(color: AppColors.white, fontSize: 13)),
                      subtitle: o.subtitle.isEmpty
                          ? null
                          : Text(o.subtitle,
                              style: TextStyle(color: AppColors.hint, fontSize: 11)),
                      trailing: Text('#${o.id}',
                          style: TextStyle(color: AppColors.hint, fontSize: 11)),
                      onTap: () {
                        _ctrl.clear();
                        setState(() => _results = const []);
                        widget.onSelect(o);
                      },
                    ),
                ],
              ),
            ),
        ],
      ]),
    );
  }
}
