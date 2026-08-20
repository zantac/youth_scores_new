import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/admin_data.dart' show CoachSearchResult, PlayerSearchResult;
import '../../core/models/admin/structure_models.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';
import 'admin_structure_tab.dart'
    show sDec, sLabel, sheetGrip, showSheet, sectionError;
import 'admin_upload_button.dart';

TextStyle _ts() => TextStyle(color: AppColors.white, fontSize: 13);

const _coachRoles = <(String, String)>[
  ('المدير الفني', 'Head Coach'),
  ('مدرب', 'Coach'),
  ('مساعد مدرب', 'Assistant Coach'),
  ('مدرب حراس مرمي', 'Goalkeeping Coach'),
  ('محلل اداء', 'Performance Analyst'),
  ('المعد النفسي', 'Sports Psychologist'),
  ('اداري', 'Team Administrator'),
  ('طبيب', 'Doctor'),
  ('اخصائي اصابات', 'Injury Specialist'),
  ('علاج طبيعي', 'Physiotherapist'),
  ('مدلك', 'Masseur'),
  ('مدرب الاحمال', 'Fitness Coach'),
];

const _positions = <(String, String)>[
  ('حارس مرمي', 'Goalkeeper'),
  ('مدافع', 'Defender'),
  ('لاعب وسط', 'Midfielder'),
  ('مهاجم', 'Forward'),
];

String _normPos(String? p) => (p ?? '').trim().replaceAll('ى', 'ي');

const _subPositions = <String, List<(String, String)>>{
  'حارس مرمي': [],
  'مدافع': [
    ('قلب دفاع', 'Centre-Back'),
    ('ظهير ايمن', 'Right-Back'),
    ('ظهير ايسر', 'Left-Back'),
  ],
  'لاعب وسط': [
    ('وسط دفاعي', 'Defensive Midfielder'),
    ('وسط', 'Central Midfielder'),
    ('وسط هجومي', 'Attacking Midfielder'),
    ('جناح ايمن', 'Right Winger'),
    ('جناح ايسر', 'Left Winger'),
  ],
  'مهاجم': [
    ('رأس حربة', 'Centre-Forward'),
    ('ثاني مهاجم', 'Second Striker'),
    ('جناح ايمن', 'Right Winger'),
    ('جناح ايسر', 'Left Winger'),
  ],
};
List<(String, String)> _subPositionsFor(String posAr) => _subPositions[_normPos(posAr)] ?? const [];

int _posRank(String? p) {
  final i = _positions.indexWhere((e) => _normPos(e.$1) == _normPos(p));
  return i == -1 ? 99 : i;
}

int _byPositionThenName(MRegistration a, MRegistration b, bool isAr) {
  final d = _posRank(a.positionAr) - _posRank(b.positionAr);
  if (d != 0) return d;
  return a.name(isAr).compareTo(b.name(isAr));
}

const _statuses = <(String, String, String)>[
  ('active', 'نشط', 'Active'),
  ('transferred', 'منتقل', 'Transferred'),
  ('loaned', 'إعارة', 'Loan'),
];
String _statusLabel(String v, bool isAr) {
  final s = _statuses.where((e) => e.$1 == v).toList();
  if (s.isEmpty) return v;
  return isAr ? s.first.$2 : s.first.$3;
}

/// Team (squad) management — technical staff and player roster. Mirrors the
/// website's /admin/team. Reached from a club's squads list.
class AdminTeamScreen extends StatelessWidget {
  final MTeamFull team;
  final int initialTab;
  const AdminTeamScreen({super.key, required this.team, this.initialTab = 0});

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final token = context.read<AdminAuth>().token ?? '';
    final api = AdminApi();
    return DefaultTabController(
      length: 2,
      initialIndex: initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: Text(team.title()),
          bottom: TabBar(
            labelColor: AppColors.aqua,
            unselectedLabelColor: AppColors.hint,
            indicatorColor: AppColors.aqua,
            tabs: [
              Tab(text: isAr ? '👔 الجهاز الفني' : '👔 Staff'),
              Tab(text: isAr ? '🧑 اللاعبون' : '🧑 Players'),
            ],
          ),
        ),
        body: Column(children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            color: AppColors.cardBg,
            child: Row(children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.darkBg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(team.age ?? '—',
                    style: TextStyle(color: AppColors.aqua, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(team.title(),
                    style: TextStyle(
                        color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 15)),
              ),
            ]),
          ),
          Expanded(
            child: TabBarView(children: [
              _CoachesSection(api: api, token: token, tid: team.id),
              _RosterSection(api: api, token: token, tid: team.id),
            ]),
          ),
        ]),
      ),
    );
  }
}

Widget _saveBtn(bool busy, VoidCallback onSave, bool isAr) => SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: busy ? null : onSave,
        style: FilledButton.styleFrom(
            backgroundColor: AppColors.aqua, padding: const EdgeInsets.symmetric(vertical: 14)),
        child: busy
            ? const SizedBox(
                width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(isAr ? 'حفظ' : 'Save', style: const TextStyle(fontWeight: FontWeight.bold)),
      ),
    );

Widget _avatar(String? photo) => CircleAvatar(
      radius: 18,
      backgroundColor: AppColors.darkBg,
      backgroundImage: photo != null ? NetworkImage(photo) : null,
      child: photo == null ? const Text('👤') : null,
    );

// ── Coaches ───────────────────────────────────────────────────────────────────

class _CoachesSection extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int tid;
  const _CoachesSection({required this.api, required this.token, required this.tid});

  @override
  State<_CoachesSection> createState() => _CoachesSectionState();
}

class _CoachesSectionState extends State<_CoachesSection> {
  bool _loading = true;
  String? _error;
  List<MTeamCoach> _items = const [];
  bool _showFormer = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final v = await widget.api.teamCoaches(widget.token, widget.tid);
      if (!mounted) return;
      setState(() {
        _items = v;
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

  Future<void> _move(List<MTeamCoach> current, List<MTeamCoach> former, int idx, int dir) async {
    final j = idx + dir;
    if (j < 0 || j >= current.length) return;
    final next = [...current];
    final t = next[idx];
    next[idx] = next[j];
    next[j] = t;
    setState(() => _items = [...next, ...former]);
    try {
      await widget.api.reorderTeamCoaches(widget.token, widget.tid, next.map((x) => x.id).toList());
    } catch (e) {
      if (!mounted) return;
      _load();
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  Future<void> _delete(MTeamCoach c) async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (!await _confirmDelete(context, isAr ? 'حذف المدرّب' : 'Delete coach', '«${c.name(isAr)}»')) {
      return;
    }
    try {
      await widget.api.deleteTeamCoach(widget.token, c.id);
      if (!mounted) return;
      _load();
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return sectionError(_error!, _load);
    final current = _items.where((c) => c.isCurrent).toList();
    final former = _items.where((c) => !c.isCurrent).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Row(children: [
            Expanded(
              child: Text(
                  isAr ? 'الجهاز الفني${current.isNotEmpty ? ' (${current.length})' : ''}'
                      : 'Staff${current.isNotEmpty ? ' (${current.length})' : ''}',
                  style: TextStyle(color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 14)),
            ),
            TextButton(
              onPressed: () async {
                final ok = await showSheet<bool>(
                    context, _AttachCoachSheet(api: widget.api, token: widget.token, tid: widget.tid));
                if (ok == true) _load();
              },
              style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
              child: Text(isAr ? '+ موجود' : '+ Existing', style: const TextStyle(fontSize: 12)),
            ),
            FilledButton(
              onPressed: () async {
                final ok = await showSheet<bool>(
                    context, _CoachEditor(api: widget.api, token: widget.token, tid: widget.tid));
                if (ok == true) _load();
              },
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.aqua, visualDensity: VisualDensity.compact),
              child: Text(isAr ? '+ جديد' : '+ New'),
            ),
          ]),
          const SizedBox(height: 8),
          if (_items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Center(
                  child: Text(isAr ? 'لا يوجد مدرّبون بعد' : 'No coaches yet',
                      style: TextStyle(color: AppColors.hint))),
            )
          else ...[
            for (int i = 0; i < current.length; i++) _row(current[i], i, current, former, false, isAr),
            if (former.isNotEmpty) ...[
              TextButton(
                onPressed: () => setState(() => _showFormer = !_showFormer),
                child: Text(isAr ? 'مدرّبون سابقون (${former.length})' : 'Former coaches (${former.length})',
                    style: const TextStyle(fontSize: 12)),
              ),
              if (_showFormer)
                for (final c in former) _row(c, -1, current, former, true, isAr),
            ],
          ],
        ],
      ),
    );
  }

  Widget _row(MTeamCoach c, int idx, List<MTeamCoach> current, List<MTeamCoach> former, bool isFormer, bool isAr) {
    return Opacity(
      opacity: isFormer ? 0.6 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(children: [
          if (!isFormer && current.length > 1)
            Column(mainAxisSize: MainAxisSize.min, children: [
              InkWell(
                onTap: idx == 0 ? null : () => _move(current, former, idx, -1),
                child: Icon(Icons.keyboard_arrow_up, size: 18, color: idx == 0 ? AppColors.border : AppColors.aqua),
              ),
              InkWell(
                onTap: idx == current.length - 1 ? null : () => _move(current, former, idx, 1),
                child: Icon(Icons.keyboard_arrow_down, size: 18,
                    color: idx == current.length - 1 ? AppColors.border : AppColors.aqua),
              ),
            ]),
          _avatar(c.photo),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.name(isAr),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 13.5)),
              Text(c.role(isAr).isEmpty ? '—' : c.role(isAr),
                  style: TextStyle(color: AppColors.teal, fontSize: 11.5)),
            ]),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () async {
              final ok = await showSheet<bool>(context,
                  _CoachEditor(api: widget.api, token: widget.token, tid: widget.tid, coach: c));
              if (ok == true) _load();
            },
            icon: Icon(Icons.edit, color: AppColors.aqua, size: 18),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () => _delete(c),
            icon: Icon(Icons.delete_outline, color: AppColors.red, size: 18),
          ),
        ]),
      ),
    );
  }
}

class _CoachEditor extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int tid;
  final MTeamCoach? coach;
  const _CoachEditor({required this.api, required this.token, required this.tid, this.coach});

  @override
  State<_CoachEditor> createState() => _CoachEditorState();
}

class _CoachEditorState extends State<_CoachEditor> {
  late final TextEditingController _nameAr, _nameEn, _roleAr, _roleEn, _start, _end, _photo;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final c = widget.coach;
    _nameAr = TextEditingController(text: c?.nameAr ?? '');
    _nameEn = TextEditingController(text: c?.nameEn ?? '');
    _roleAr = TextEditingController(text: c?.roleAr ?? '');
    _roleEn = TextEditingController(text: c?.roleEn ?? '');
    _start = TextEditingController(text: c?.startDate ?? '');
    _end = TextEditingController(text: c?.endDate ?? '');
    _photo = TextEditingController(text: c?.photo ?? '');
  }

  @override
  void dispose() {
    for (final c in [_nameAr, _nameEn, _roleAr, _roleEn, _start, _end, _photo]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (_nameAr.text.trim().isEmpty) {
      showAdminError(context, isAr ? 'الاسم بالعربية مطلوب' : 'Arabic name required');
      return;
    }
    setState(() => _busy = true);
    final body = {
      'name_ar': _nameAr.text.trim(),
      'name_en': _nameEn.text.trim(),
      'role_ar': _roleAr.text.trim(),
      'role_en': _roleEn.text.trim(),
      'start_date': _start.text.trim(),
      'end_date': _end.text.trim(),
      'photo': _photo.text.trim(),
    };
    try {
      if (widget.coach == null) {
        await widget.api.addTeamCoach(widget.token, widget.tid, body);
      } else {
        await widget.api.updateTeamCoach(widget.token, widget.coach!.id, body);
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      sheetGrip(),
      Text(
          widget.coach == null ? (isAr ? 'مدرّب جديد' : 'New coach') : (isAr ? 'تعديل المدرّب' : 'Edit coach'),
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 14),
      sLabel(isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'),
      TextField(controller: _nameAr, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الاسم (إنجليزي)' : 'Name (English)'),
      TextField(controller: _nameEn, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الدور — اختيار سريع' : 'Role — quick pick'),
      DropdownButtonFormField<int>(
        isExpanded: true,
        dropdownColor: AppColors.cardBg,
        style: TextStyle(color: AppColors.white, fontSize: 12.5),
        decoration: sDec(isAr ? 'اختر دورًا' : 'Pick a role'),
        items: [
          for (int i = 0; i < _coachRoles.length; i++)
            DropdownMenuItem(value: i, child: Text(isAr ? _coachRoles[i].$1 : _coachRoles[i].$2)),
        ],
        onChanged: (i) {
          if (i == null) return;
          _roleAr.text = _coachRoles[i].$1;
          _roleEn.text = _coachRoles[i].$2;
          setState(() {});
        },
      ),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الدور (عربي)' : 'Role (Arabic)'),
      TextField(controller: _roleAr, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الدور (إنجليزي)' : 'Role (English)'),
      TextField(controller: _roleEn, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: _dateField(isAr ? 'البداية' : 'Start', _start)),
        const SizedBox(width: 10),
        Expanded(child: _dateField(isAr ? 'النهاية' : 'End', _end)),
      ]),
      const SizedBox(height: 10),
      sLabel(isAr ? 'رابط الصورة' : 'Photo URL'),
      TextField(controller: _photo, style: _ts(), decoration: sDec('https://…')),
      const SizedBox(height: 8),
      Align(
        alignment: AlignmentDirectional.centerStart,
        child: AdminUploadButton(
          token: widget.token,
          label: isAr ? 'رفع صورة من الجهاز' : 'Upload photo',
          onUploaded: (url) => setState(() => _photo.text = url),
        ),
      ),
      const SizedBox(height: 14),
      _saveBtn(_busy, _save, isAr),
      const SizedBox(height: 8),
    ]);
  }
}

Widget _dateField(String label, TextEditingController c) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [sLabel(label), TextField(controller: c, style: _ts(), decoration: sDec('YYYY-MM-DD'))],
    );

// ── Roster ────────────────────────────────────────────────────────────────────

class _RosterSection extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int tid;
  const _RosterSection({required this.api, required this.token, required this.tid});

  @override
  State<_RosterSection> createState() => _RosterSectionState();
}

class _RosterSectionState extends State<_RosterSection> {
  bool _loading = true;
  String? _error;
  List<MRegistration> _items = const [];
  bool _showFormer = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final v = await widget.api.teamRoster(widget.token, widget.tid);
      if (!mounted) return;
      setState(() {
        _items = v;
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

  Future<void> _delete(MRegistration r) async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (!await _confirmDelete(context, isAr ? 'حذف اللاعب' : 'Delete player', '«${r.name(isAr)}»')) {
      return;
    }
    try {
      await widget.api.deleteTeamPlayer(widget.token, r.id);
      if (!mounted) return;
      _load();
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return sectionError(_error!, _load);

    final active = _items.where((r) => r.isCurrent && !r.isGuest).toList()
      ..sort((a, b) => _byPositionThenName(a, b, isAr));
    final guests = _items.where((r) => r.isCurrent && r.isGuest).toList()
      ..sort((a, b) => _byPositionThenName(a, b, isAr));
    final former = _items.where((r) => !r.isCurrent).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Row(children: [
            Expanded(
              child: Text(
                  isAr ? 'قائمة اللاعبين${active.isNotEmpty ? ' (${active.length})' : ''}'
                      : 'Players${active.isNotEmpty ? ' (${active.length})' : ''}',
                  style: TextStyle(color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 14)),
            ),
            TextButton(
              onPressed: () async {
                final ok = await showSheet<bool>(
                    context, _AttachPlayerSheet(api: widget.api, token: widget.token, tid: widget.tid));
                if (ok == true) _load();
              },
              style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
              child: Text(isAr ? '+ موجود' : '+ Existing', style: const TextStyle(fontSize: 12)),
            ),
            FilledButton(
              onPressed: () async {
                final ok = await showSheet<bool>(
                    context, _PlayerEditor(api: widget.api, token: widget.token, tid: widget.tid));
                if (ok == true) _load();
              },
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.aqua, visualDensity: VisualDensity.compact),
              child: Text(isAr ? '+ جديد' : '+ New'),
            ),
          ]),
          const SizedBox(height: 8),
          if (_items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Center(
                  child: Text(isAr ? 'لا يوجد لاعبون بعد' : 'No players yet',
                      style: TextStyle(color: AppColors.hint))),
            )
          else ...[
            for (final r in active) _row(r, 'active', isAr),
            if (guests.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.only(top: 8, bottom: 4),
                child: Text(isAr ? '⬆️ ضيوف — يلعبون صاعداً (${guests.length})' : '⬆️ Guests — playing up (${guests.length})',
                    style: TextStyle(color: AppColors.teal, fontSize: 11.5, fontWeight: FontWeight.bold)),
              ),
              for (final r in guests) _row(r, 'guest', isAr),
            ],
            if (former.isNotEmpty) ...[
              TextButton(
                onPressed: () => setState(() => _showFormer = !_showFormer),
                child: Text(isAr ? 'لاعبون سابقون / منتقلون (${former.length})' : 'Former / transferred (${former.length})',
                    style: const TextStyle(fontSize: 12)),
              ),
              if (_showFormer)
                for (final r in former) _row(r, 'former', isAr),
            ],
          ],
        ],
      ),
    );
  }

  Widget _row(MRegistration r, String variant, bool isAr) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Opacity(
        opacity: variant == 'former' ? 0.6 : 1,
        child: Row(children: [
          _avatar(r.photo),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.name(isAr),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 13.5)),
              Text(
                [
                  if (r.shirtNumber != null) '#${r.shirtNumber}',
                  if (r.position(isAr).isNotEmpty) r.position(isAr),
                  if (r.birthYear != null) '${r.birthYear}${r.birthYearVerified ? '' : '؟'}',
                  if (r.status != 'active' && variant == 'active') _statusLabel(r.status, isAr),
                ].join(' · '),
                style: TextStyle(color: AppColors.hint, fontSize: 11),
              ),
            ]),
          ),
          if (variant == 'guest')
            _tag(isAr ? 'صاعد' : 'Guest', AppColors.teal)
          else if (variant == 'former')
            _tag(r.status == 'transferred' ? (isAr ? 'منتقل' : 'Transferred') : (isAr ? 'سابق' : 'Former'), AppColors.orange),
          if (variant == 'active')
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: isAr ? 'نقل' : 'Transfer',
              onPressed: () async {
                final ok = await showSheet<bool>(context, _TransferSheet(api: widget.api, token: widget.token, reg: r));
                if (ok == true) _load();
              },
              icon: Icon(Icons.swap_horiz, color: AppColors.orange, size: 18),
            ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () async {
              final ok = await showSheet<bool>(context,
                  _PlayerEditor(api: widget.api, token: widget.token, tid: widget.tid, reg: r));
              if (ok == true) _load();
            },
            icon: Icon(Icons.edit, color: AppColors.aqua, size: 18),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () => _delete(r),
            icon: Icon(Icons.delete_outline, color: AppColors.red, size: 18),
          ),
        ]),
      ),
    );
  }

  Widget _tag(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        margin: const EdgeInsets.only(right: 2, left: 2),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: color.withValues(alpha: 0.4)),
        ),
        child: Text(text, style: TextStyle(color: color, fontSize: 9.5)),
      );
}

class _PlayerEditor extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int tid;
  final MRegistration? reg;
  const _PlayerEditor({required this.api, required this.token, required this.tid, this.reg});

  @override
  State<_PlayerEditor> createState() => _PlayerEditorState();
}

class _PlayerEditorState extends State<_PlayerEditor> {
  late final TextEditingController _nameAr, _nameEn, _shirt, _birth, _posAr, _posEn, _subAr, _subEn, _start, _end, _photo;
  late String _status;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final r = widget.reg;
    _nameAr = TextEditingController(text: r?.nameAr ?? '');
    _nameEn = TextEditingController(text: r?.nameEn ?? '');
    _shirt = TextEditingController(text: r?.shirtNumber?.toString() ?? '');
    _birth = TextEditingController(
        text: (r?.birthYear != null && r!.birthYearVerified) ? '${r.birthYear}' : '');
    _posAr = TextEditingController(text: r?.positionAr ?? '');
    _posEn = TextEditingController(text: r?.positionEn ?? '');
    _subAr = TextEditingController(text: r?.subPositionAr ?? '');
    _subEn = TextEditingController(text: r?.subPositionEn ?? '');
    _start = TextEditingController(text: r?.startDate ?? '');
    _end = TextEditingController(text: r?.endDate ?? '');
    _photo = TextEditingController(text: r?.photo ?? '');
    _status = r?.status ?? 'active';
  }

  @override
  void dispose() {
    for (final c in [_nameAr, _nameEn, _shirt, _birth, _posAr, _posEn, _subAr, _subEn, _start, _end, _photo]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (_nameAr.text.trim().isEmpty) {
      showAdminError(context, isAr ? 'الاسم بالعربية مطلوب' : 'Arabic name required');
      return;
    }
    setState(() => _busy = true);
    final body = {
      'name_ar': _nameAr.text.trim(),
      'name_en': _nameEn.text.trim(),
      'shirt_number': _shirt.text.trim(),
      'birth_year': _birth.text.trim(),
      'position_ar': _posAr.text.trim(),
      'position_en': _posEn.text.trim(),
      'sub_position_ar': _subAr.text.trim(),
      'sub_position_en': _subEn.text.trim(),
      'status': _status,
      'start_date': _start.text.trim(),
      'end_date': _end.text.trim(),
      'photo': _photo.text.trim(),
    };
    try {
      if (widget.reg == null) {
        await widget.api.addTeamPlayer(widget.token, widget.tid, body);
      } else {
        await widget.api.updateTeamPlayer(widget.token, widget.reg!.id, body);
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final subs = _subPositionsFor(_posAr.text);
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      sheetGrip(),
      Text(widget.reg == null ? (isAr ? 'لاعب جديد' : 'New player') : (isAr ? 'تعديل اللاعب' : 'Edit player'),
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 14),
      sLabel(isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'),
      TextField(controller: _nameAr, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الاسم (إنجليزي)' : 'Name (English)'),
      TextField(controller: _nameEn, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'رقم القميص' : 'Shirt #'),
            TextField(controller: _shirt, style: _ts(), keyboardType: TextInputType.number, decoration: sDec()),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'سنة الميلاد' : 'Birth year'),
            TextField(controller: _birth, style: _ts(), keyboardType: TextInputType.number, decoration: sDec('2010')),
          ]),
        ),
      ]),
      const SizedBox(height: 10),
      sLabel(isAr ? 'المركز — اختيار سريع' : 'Position — quick pick'),
      DropdownButtonFormField<int>(
        isExpanded: true,
        dropdownColor: AppColors.cardBg,
        style: TextStyle(color: AppColors.white, fontSize: 12.5),
        decoration: sDec(isAr ? 'اختر المركز' : 'Pick a position'),
        items: [
          for (int i = 0; i < _positions.length; i++)
            DropdownMenuItem(value: i, child: Text(isAr ? _positions[i].$1 : _positions[i].$2)),
        ],
        onChanged: (i) {
          if (i == null) return;
          _posAr.text = _positions[i].$1;
          _posEn.text = _positions[i].$2;
          _subAr.clear();
          _subEn.clear();
          setState(() {});
        },
      ),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'المركز (عربي)' : 'Position (Ar)'),
            TextField(controller: _posAr, style: _ts(), decoration: sDec(), onChanged: (_) => setState(() {})),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'المركز (إنج)' : 'Position (En)'),
            TextField(controller: _posEn, style: _ts(), decoration: sDec()),
          ]),
        ),
      ]),
      if (subs.isNotEmpty) ...[
        const SizedBox(height: 10),
        sLabel(isAr ? 'المركز الفرعي — اختيار سريع' : 'Sub-position — quick pick'),
        DropdownButtonFormField<int>(
          isExpanded: true,
          dropdownColor: AppColors.cardBg,
          style: TextStyle(color: AppColors.white, fontSize: 12.5),
          decoration: sDec(isAr ? 'اختر' : 'Pick'),
          items: [
            for (int i = 0; i < subs.length; i++)
              DropdownMenuItem(value: i, child: Text(isAr ? subs[i].$1 : subs[i].$2)),
          ],
          onChanged: (i) {
            if (i == null) return;
            _subAr.text = subs[i].$1;
            _subEn.text = subs[i].$2;
            setState(() {});
          },
        ),
      ],
      const SizedBox(height: 10),
      Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'الفرعي (عربي)' : 'Sub (Ar)'),
            TextField(controller: _subAr, style: _ts(), decoration: sDec()),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'الفرعي (إنج)' : 'Sub (En)'),
            TextField(controller: _subEn, style: _ts(), decoration: sDec()),
          ]),
        ),
      ]),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الحالة' : 'Status'),
      DropdownButtonFormField<String>(
        initialValue: _status,
        isExpanded: true,
        dropdownColor: AppColors.cardBg,
        style: TextStyle(color: AppColors.white, fontSize: 13),
        decoration: sDec(),
        items: [
          for (final s in _statuses) DropdownMenuItem(value: s.$1, child: Text(isAr ? s.$2 : s.$3)),
        ],
        onChanged: (v) => setState(() => _status = v ?? 'active'),
      ),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: _dateField(isAr ? 'التسجيل' : 'Registered', _start)),
        const SizedBox(width: 10),
        Expanded(child: _dateField(isAr ? 'الانتهاء' : 'End', _end)),
      ]),
      const SizedBox(height: 10),
      sLabel(isAr ? 'رابط الصورة' : 'Photo URL'),
      TextField(controller: _photo, style: _ts(), decoration: sDec('https://…')),
      const SizedBox(height: 8),
      Align(
        alignment: AlignmentDirectional.centerStart,
        child: AdminUploadButton(
          token: widget.token,
          label: isAr ? 'رفع صورة من الجهاز' : 'Upload photo',
          onUploaded: (url) => setState(() => _photo.text = url),
        ),
      ),
      const SizedBox(height: 14),
      _saveBtn(_busy, _save, isAr),
      const SizedBox(height: 8),
    ]);
  }
}

// ── Search-and-select sheets (attach coach / attach player / transfer) ─────────

class _AttachCoachSheet extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int tid;
  const _AttachCoachSheet({required this.api, required this.token, required this.tid});
  @override
  State<_AttachCoachSheet> createState() => _AttachCoachSheetState();
}

class _AttachCoachSheetState extends State<_AttachCoachSheet> {
  final _q = TextEditingController();
  final _role = TextEditingController();
  final _start = TextEditingController();
  Timer? _debounce;
  bool _searching = false;
  List<CoachSearchResult> _results = const [];
  CoachSearchResult? _sel;
  bool _busy = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    _role.dispose();
    _start.dispose();
    super.dispose();
  }

  void _onSearch(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() => _results = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      setState(() => _searching = true);
      try {
        final r = await widget.api.searchCoaches(widget.token, q.trim());
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

  Future<void> _submit() async {
    if (_sel == null) return;
    setState(() => _busy = true);
    final body = <String, dynamic>{
      'coach_id': _sel!.id,
      if (_role.text.trim().isNotEmpty) 'role_ar': _role.text.trim(),
      if (_start.text.trim().isNotEmpty) 'start_date': _start.text.trim(),
    };
    try {
      await widget.api.attachTeamCoach(widget.token, widget.tid, body);
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      sheetGrip(),
      Text(isAr ? 'إضافة مدرّب موجود' : 'Attach existing coach',
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 12),
      if (_sel != null)
        _selectedChip(
          text: [_sel!.name, if (_sel!.role != null) _sel!.role!, if (_sel!.club != null) _sel!.club!].join(' · '),
          onClear: () => setState(() => _sel = null),
          isAr: isAr,
        )
      else ...[
        _searchField(_q, _onSearch, _searching, isAr),
        for (final c in _results)
          _resultTile(
            title: c.name,
            subtitle: [if (c.role != null) c.role!, if (c.club != null) c.club!].join(' · '),
            onTap: () {
              _q.clear();
              setState(() {
                _sel = c;
                _results = const [];
              });
            },
          ),
      ],
      const SizedBox(height: 10),
      sLabel(isAr ? 'الدور (اختياري)' : 'Role (optional)'),
      TextField(controller: _role, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'تاريخ الانضمام (اختياري)' : 'Join date (optional)'),
      TextField(controller: _start, style: _ts(), decoration: sDec('YYYY-MM-DD')),
      const SizedBox(height: 14),
      _submitBtn(_sel != null, _busy, _submit, isAr ? 'إضافة' : 'Attach'),
      const SizedBox(height: 8),
    ]);
  }
}

class _AttachPlayerSheet extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int tid;
  const _AttachPlayerSheet({required this.api, required this.token, required this.tid});
  @override
  State<_AttachPlayerSheet> createState() => _AttachPlayerSheetState();
}

class _AttachPlayerSheetState extends State<_AttachPlayerSheet> {
  final _q = TextEditingController();
  final _shirt = TextEditingController();
  final _start = TextEditingController();
  Timer? _debounce;
  bool _searching = false;
  List<PlayerSearchResult> _results = const [];
  PlayerSearchResult? _sel;
  bool _busy = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    _shirt.dispose();
    _start.dispose();
    super.dispose();
  }

  void _onSearch(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() => _results = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      setState(() => _searching = true);
      try {
        final r = await widget.api.searchPlayers(widget.token, q.trim());
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

  Future<void> _submit() async {
    if (_sel == null) return;
    setState(() => _busy = true);
    final body = <String, dynamic>{
      'player_id': _sel!.id,
      if (_shirt.text.trim().isNotEmpty) 'shirt_number': int.tryParse(_shirt.text.trim()),
      if (_start.text.trim().isNotEmpty) 'start_date': _start.text.trim(),
    };
    try {
      await widget.api.attachTeamPlayer(widget.token, widget.tid, body);
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      sheetGrip(),
      Text(isAr ? 'إضافة لاعب موجود' : 'Attach existing player',
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 12),
      if (_sel != null)
        _selectedChip(
          text: [_sel!.name, if (_sel!.club != null) _sel!.club!, '${_sel!.birthYear}'].join(' · '),
          onClear: () => setState(() => _sel = null),
          isAr: isAr,
        )
      else ...[
        _searchField(_q, _onSearch, _searching, isAr),
        for (final p in _results)
          _resultTile(
            title: p.name,
            subtitle: [if (p.club != null) p.club!, '${p.birthYear}'].join(' · '),
            onTap: () {
              _q.clear();
              setState(() {
                _sel = p;
                _results = const [];
              });
            },
          ),
      ],
      const SizedBox(height: 10),
      Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'رقم القميص' : 'Shirt #'),
            TextField(controller: _shirt, style: _ts(), keyboardType: TextInputType.number, decoration: sDec()),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(child: _dateField(isAr ? 'الانضمام' : 'Join date', _start)),
      ]),
      const SizedBox(height: 14),
      _submitBtn(_sel != null, _busy, _submit, isAr ? 'إضافة' : 'Attach'),
      const SizedBox(height: 8),
    ]);
  }
}

class _TransferSheet extends StatefulWidget {
  final AdminApi api;
  final String token;
  final MRegistration reg;
  const _TransferSheet({required this.api, required this.token, required this.reg});
  @override
  State<_TransferSheet> createState() => _TransferSheetState();
}

class _TransferSheetState extends State<_TransferSheet> {
  final _q = TextEditingController();
  final _shirt = TextEditingController();
  final _start = TextEditingController();
  Timer? _debounce;
  bool _searching = false;
  List<AdminSearchTeam> _results = const [];
  AdminSearchTeam? _dest;
  bool _busy = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    _shirt.dispose();
    _start.dispose();
    super.dispose();
  }

  void _onSearch(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() => _results = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      setState(() => _searching = true);
      try {
        final r = await widget.api.searchTeams(widget.token, q.trim());
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

  Future<void> _submit() async {
    if (_dest == null) return;
    setState(() => _busy = true);
    final body = <String, dynamic>{
      'team_id': _dest!.id,
      if (_start.text.trim().isNotEmpty) 'start_date': _start.text.trim(),
      if (_shirt.text.trim().isNotEmpty) 'shirt_number': int.tryParse(_shirt.text.trim()),
    };
    try {
      await widget.api.transferPlayer(widget.token, widget.reg.id, body);
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      sheetGrip(),
      Text(isAr ? 'نقل ${widget.reg.name(true)} إلى فريق آخر' : 'Transfer ${widget.reg.name(false)}',
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 12),
      if (_dest != null)
        _selectedChip(text: _dest!.name, onClear: () => setState(() => _dest = null), isAr: isAr)
      else ...[
        _searchField(_q, _onSearch, _searching, isAr, hint: isAr ? 'ابحث عن الفريق (باسم النادي)…' : 'Search destination team…'),
        for (final t in _results)
          _resultTile(title: t.name, subtitle: '', onTap: () {
            _q.clear();
            setState(() {
              _dest = t;
              _results = const [];
            });
          }),
      ],
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: _dateField(isAr ? 'تاريخ الانتقال' : 'Transfer date', _start)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'رقم القميص' : 'Shirt #'),
            TextField(controller: _shirt, style: _ts(), keyboardType: TextInputType.number, decoration: sDec()),
          ]),
        ),
      ]),
      const SizedBox(height: 14),
      _submitBtn(_dest != null, _busy, _submit, isAr ? 'تأكيد النقل' : 'Confirm transfer'),
      const SizedBox(height: 8),
    ]);
  }
}

// ── Shared sheet pieces ────────────────────────────────────────────────────────

Widget _searchField(TextEditingController c, ValueChanged<String> onChanged, bool searching, bool isAr, {String? hint}) =>
    TextField(
      controller: c,
      onChanged: onChanged,
      style: _ts(),
      decoration: sDec(hint ?? (isAr ? 'ابحث بالاسم…' : 'Search by name…')).copyWith(
        prefixIcon: Icon(Icons.search, color: AppColors.hint, size: 18),
        suffixIcon: searching
            ? const Padding(
                padding: EdgeInsets.all(12),
                child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)))
            : null,
      ),
    );

Widget _resultTile({required String title, required String subtitle, required VoidCallback onTap}) => ListTile(
      dense: true,
      title: Text(title, style: TextStyle(color: AppColors.white, fontSize: 13)),
      subtitle: subtitle.isEmpty ? null : Text(subtitle, style: TextStyle(color: AppColors.hint, fontSize: 11)),
      onTap: onTap,
    );

Widget _selectedChip({required String text, required VoidCallback onClear, required bool isAr}) => Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.darkBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.aqua.withValues(alpha: 0.4)),
      ),
      child: Row(children: [
        Expanded(child: Text(text, style: TextStyle(color: AppColors.white, fontSize: 13))),
        TextButton(onPressed: onClear, child: Text(isAr ? 'تغيير' : 'Change')),
      ]),
    );

Widget _submitBtn(bool enabled, bool busy, VoidCallback onTap, String label) => SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: (!enabled || busy) ? null : onTap,
        style: FilledButton.styleFrom(
            backgroundColor: AppColors.aqua, padding: const EdgeInsets.symmetric(vertical: 14)),
        child: busy
            ? const SizedBox(
                width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
      ),
    );

Future<bool> _confirmDelete(BuildContext context, String title, String body) async {
  final isAr = context.read<AppProvider>().locale == 'ar';
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.dialogBg,
      title: Text(title, style: TextStyle(color: AppColors.white, fontSize: 16)),
      content: Text(body, style: TextStyle(color: AppColors.teal)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(isAr ? 'إلغاء' : 'Cancel')),
        FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(isAr ? 'حذف' : 'Delete')),
      ],
    ),
  );
  return ok == true;
}
