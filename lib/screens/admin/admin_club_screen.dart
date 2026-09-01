import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/governorates.dart';
import '../../core/models/admin/admin_data.dart' show CoachSearchResult;
import '../../core/models/admin/structure_models.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';
import 'admin_structure_tab.dart'
    show sDec, sLabel, sheetGrip, showSheet, sectionError, showStructureDelete;
import 'admin_team_screen.dart';
import 'admin_upload_button.dart';

TextStyle _ts() => TextStyle(color: AppColors.white, fontSize: 13);

/// Youth-sector posts, most senior first, mirroring the website. Picking one
/// fills both the Arabic and English role fields.
const _staffRoles = <(String, String)>[
  ('عضو مجلس الإدارة', 'Board Member'),
  ('رئيس قطاع الناشئين', 'Head of Youth Sector'),
  ('نائب رئيس القطاع', 'Vice President of the Sector'),
  ('مشرف القطاع', 'Sector Supervisor'),
  ('المدير الفني للقطاع', 'Technical Director of the Sector'),
  ('المشرف الفني للقطاع', 'Technical Supervisor of the Sector'),
  ('المدير الاداري للقطاع', 'Administrative Director of the Sector'),
  ('مدير الكرة', 'Football Director'),
  ('نائب رئيس جهاز الكرة', 'Deputy Head of Football Staff'),
  ('مشرف الكرة', 'Football Supervisor'),
  ('مدير حراس المرمى بالقطاع', 'Goalkeeping Director'),
  ('مشرف حراس المرمى', 'Goalkeeping Supervisor'),
  ('رئيس الجهاز الطبي', 'Head of Medical Staff'),
  ('طبيب القطاع', 'Sector Doctor'),
  ('مشرف العلاج الطبيعي', 'Physiotherapy Supervisor'),
  ('اخصائي الفريق', 'Team Specialist'),
  ('مخطط أحمال', 'Fitness Load Planner'),
  ('محلل أداء', 'Performance Analyst'),
  ('مسؤول شئون اللاعبين', 'Player Affairs Officer'),
  ('المدير المالي', 'Financial Director'),
  ('مدير عام النادي', 'Club General Manager'),
  ('مدير رياضي', 'Sporting Director'),
];

/// Club management — basic info, youth-sector staff and squads. Mirrors the
/// website's /admin/club. Reached from the Clubs sub-tab.
class AdminClubScreen extends StatefulWidget {
  final MClub club;
  const AdminClubScreen({super.key, required this.club});

  @override
  State<AdminClubScreen> createState() => _AdminClubScreenState();
}

class _AdminClubScreenState extends State<AdminClubScreen> {
  final _api = AdminApi();
  late MClub _club;
  String get _token => context.read<AdminAuth>().token ?? '';

  @override
  void initState() {
    super.initState();
    _club = widget.club;
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Scaffold(
      appBar: AppBar(title: Text(_club.name(isAr))),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _ClubInfo(api: _api, token: _token, club: _club, onSaved: (c) => setState(() => _club = c)),
          const SizedBox(height: 16),
          _StaffSection(api: _api, token: _token, cid: _club.id),
          const SizedBox(height: 16),
          _TeamsSection(api: _api, token: _token, cid: _club.id),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ── Basic info ────────────────────────────────────────────────────────────────

class _ClubInfo extends StatefulWidget {
  final AdminApi api;
  final String token;
  final MClub club;
  final ValueChanged<MClub> onSaved;
  const _ClubInfo({required this.api, required this.token, required this.club, required this.onSaved});

  @override
  State<_ClubInfo> createState() => _ClubInfoState();
}

class _ClubInfoState extends State<_ClubInfo> {
  late final Map<String, TextEditingController> _c;
  final _cityFocus = FocusNode();
  bool _busy = false;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    final c = widget.club;
    _c = {
      'name_ar': TextEditingController(text: c.nameAr ?? ''),
      'name_en': TextEditingController(text: c.nameEn ?? ''),
      'city_ar': TextEditingController(text: c.cityAr ?? ''),
      'city_en': TextEditingController(text: c.cityEn ?? ''),
      'logo_url': TextEditingController(text: c.logoUrl ?? ''),
    };
  }

  @override
  void dispose() {
    for (final v in _c.values) {
      v.dispose();
    }
    _cityFocus.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (_c['name_ar']!.text.trim().isEmpty) {
      showAdminError(context, isAr ? 'الاسم بالعربية مطلوب' : 'Arabic name required');
      return;
    }
    setState(() => _busy = true);
    final body = _c.map((k, v) => MapEntry(k, v.text.trim()));
    try {
      await widget.api.updateClub(widget.token, widget.club.id, body);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _done = true;
      });
      widget.onSaved(MClub(
        id: widget.club.id,
        nameAr: _c['name_ar']!.text.trim(),
        nameEn: _c['name_en']!.text.trim(),
        cityAr: _c['city_ar']!.text.trim(),
        cityEn: _c['city_en']!.text.trim(),
        logoUrl: _c['logo_url']!.text.trim(),
      ));
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
    Widget f(String key, String label, {String? hint}) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(label),
            TextField(
                controller: _c[key],
                style: _ts(),
                onChanged: (_) => setState(() => _done = false),
                decoration: sDec(hint)),
          ]),
        );
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(isAr ? '🛡️ بيانات النادي' : '🛡️ Club info',
            style: TextStyle(color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 14)),
        const SizedBox(height: 12),
        f('name_ar', isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'),
        f('name_en', isAr ? 'الاسم (إنجليزي)' : 'Name (English)'),
        // City (Arabic) suggests Egypt's governorates; picking one auto-fills the
        // English name. Free text still works (custom city → English untouched).
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'المدينة (عربي)' : 'City (Arabic)'),
            RawAutocomplete<String>(
              textEditingController: _c['city_ar']!,
              focusNode: _cityFocus,
              optionsBuilder: (v) {
                final q = foldAr(v.text);
                final names = kEgyptGovernorates.map((g) => g.ar);
                return q.isEmpty ? names : names.where((n) => foldAr(n).contains(q));
              },
              onSelected: (sel) {
                final en = governorateEn(sel);
                setState(() {
                  if (en != null) _c['city_en']!.text = en;
                  _done = false;
                });
                _cityFocus.unfocus();
              },
              fieldViewBuilder: (context, controller, focusNode, onSubmit) => TextField(
                controller: controller,
                focusNode: focusNode,
                style: _ts(),
                onChanged: (v) {
                  final en = governorateEn(v);
                  setState(() {
                    if (en != null) _c['city_en']!.text = en;
                    _done = false;
                  });
                },
                decoration: sDec().copyWith(
                    suffixIcon: Icon(Icons.arrow_drop_down, color: AppColors.hint)),
                onSubmitted: (_) => onSubmit(),
              ),
              optionsViewBuilder: (context, onSelected, options) => Align(
                alignment: Alignment.topRight,
                child: Material(
                  color: AppColors.cardBg,
                  elevation: 4,
                  borderRadius: BorderRadius.circular(10),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 240, maxWidth: 340),
                    child: ListView(
                      padding: EdgeInsets.zero,
                      shrinkWrap: true,
                      children: [
                        for (final o in options)
                          InkWell(
                            onTap: () => onSelected(o),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              child: Text(o, style: TextStyle(color: AppColors.white, fontSize: 13)),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ]),
        ),
        f('city_en', isAr ? 'المدينة (إنجليزي)' : 'City (English)'),
        f('logo_url', isAr ? 'رابط الشعار' : 'Logo URL', hint: 'https://…'),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: AdminUploadButton(
            token: widget.token,
            label: isAr ? 'رفع الشعار من الجهاز' : 'Upload logo',
            onUploaded: (url) => setState(() {
              _c['logo_url']!.text = url;
              _done = false;
            }),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _busy ? null : _save,
            style: FilledButton.styleFrom(backgroundColor: AppColors.aqua),
            child: _busy
                ? const SizedBox(
                    width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(_done
                    ? (isAr ? '✓ تم الحفظ' : '✓ Saved')
                    : (isAr ? 'حفظ البيانات' : 'Save')),
          ),
        ),
      ]),
    );
  }
}

// ── Staff ─────────────────────────────────────────────────────────────────────

class _StaffSection extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int cid;
  const _StaffSection({required this.api, required this.token, required this.cid});

  @override
  State<_StaffSection> createState() => _StaffSectionState();
}

class _StaffSectionState extends State<_StaffSection> {
  bool _loading = true;
  String? _error;
  List<MClubStaff> _items = const [];
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
      final v = await widget.api.clubStaff(widget.token, widget.cid);
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

  Future<void> _move(List<MClubStaff> current, List<MClubStaff> former, int idx, int dir) async {
    final j = idx + dir;
    if (j < 0 || j >= current.length) return;
    final next = [...current];
    final tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    setState(() => _items = [...next, ...former]);
    try {
      await widget.api.reorderClubStaff(widget.token, widget.cid, next.map((x) => x.id).toList());
    } catch (e) {
      if (!mounted) return;
      _load();
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  Future<void> _delete(MClubStaff s) async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.dialogBg,
        title: Text(isAr ? 'حذف المسؤول' : 'Delete staff',
            style: TextStyle(color: AppColors.white, fontSize: 16)),
        content: Text('«${s.name(isAr)}»', style: TextStyle(color: AppColors.teal)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(isAr ? 'إلغاء' : 'Cancel')),
          FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.red),
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(isAr ? 'حذف' : 'Delete')),
        ],
      ),
    );
    if (ok == true) {
      try {
        await widget.api.deleteClubStaff(widget.token, s.id);
        if (!mounted) return;
        _load();
      } catch (e) {
        if (!mounted) return;
        if (handleAdminError(context, e)) return;
        showAdminError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final current = _items.where((s) => s.isCurrent).toList();
    final former = _items.where((s) => !s.isCurrent).toList();

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(
          child: Text(
              isAr
                  ? '👔 مسؤولو قطاع الناشئين${current.isNotEmpty ? ' (${current.length})' : ''}'
                  : '👔 Youth-sector staff${current.isNotEmpty ? ' (${current.length})' : ''}',
              style: TextStyle(color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 14)),
        ),
        TextButton(
          onPressed: () async {
            final ok = await showSheet<bool>(context,
                _AttachStaffSheet(api: widget.api, token: widget.token, cid: widget.cid));
            if (ok == true) _load();
          },
          style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
          child: Text(isAr ? '+ موجود' : '+ Existing', style: const TextStyle(fontSize: 12)),
        ),
        FilledButton(
          onPressed: () async {
            final ok = await showSheet<bool>(
                context, _StaffEditor(api: widget.api, token: widget.token, cid: widget.cid));
            if (ok == true) _load();
          },
          style: FilledButton.styleFrom(
              backgroundColor: AppColors.aqua, visualDensity: VisualDensity.compact),
          child: Text(isAr ? '+ جديد' : '+ New'),
        ),
      ]),
      const SizedBox(height: 8),
      if (_loading)
        const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
      else if (_error != null)
        sectionError(_error!, _load)
      else if (_items.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Center(
              child: Text(isAr ? 'لا يوجد مسؤولون بعد' : 'No staff yet',
                  style: TextStyle(color: AppColors.hint))),
        )
      else ...[
        for (int i = 0; i < current.length; i++)
          _staffRow(current[i], i, current, former, false, isAr),
        if (former.isNotEmpty) ...[
          TextButton(
            onPressed: () => setState(() => _showFormer = !_showFormer),
            child: Text(
                isAr ? 'مسؤولون سابقون (${former.length})' : 'Former staff (${former.length})',
                style: const TextStyle(fontSize: 12)),
          ),
          if (_showFormer)
            for (final s in former) _staffRow(s, -1, current, former, true, isAr),
        ],
      ],
    ]);
  }

  Widget _staffRow(MClubStaff s, int idx, List<MClubStaff> current,
      List<MClubStaff> former, bool isFormer, bool isAr) {
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
                child: Icon(Icons.keyboard_arrow_up,
                    size: 18, color: idx == 0 ? AppColors.border : AppColors.aqua),
              ),
              InkWell(
                onTap: idx == current.length - 1 ? null : () => _move(current, former, idx, 1),
                child: Icon(Icons.keyboard_arrow_down,
                    size: 18,
                    color: idx == current.length - 1 ? AppColors.border : AppColors.aqua),
              ),
            ]),
          CircleAvatar(
            radius: 18,
            backgroundColor: AppColors.darkBg,
            backgroundImage: (s.photo != null) ? NetworkImage(s.photo!) : null,
            child: s.photo == null ? const Text('👤') : null,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.name(isAr),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 13.5)),
              Text(s.role(isAr).isEmpty ? '—' : s.role(isAr),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: AppColors.teal, fontSize: 11.5)),
              if (s.startDate != null || s.endDate != null)
                Text('${s.startDate ?? '…'}${s.endDate != null ? ' → ${s.endDate}' : ''}',
                    style: TextStyle(color: AppColors.hint, fontSize: 10.5)),
            ]),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () async {
              final ok = await showSheet<bool>(context,
                  _StaffEditor(api: widget.api, token: widget.token, cid: widget.cid, staff: s));
              if (ok == true) _load();
            },
            icon: Icon(Icons.edit, color: AppColors.aqua, size: 18),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () => _delete(s),
            icon: Icon(Icons.delete_outline, color: AppColors.red, size: 18),
          ),
        ]),
      ),
    );
  }
}

class _StaffEditor extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int cid;
  final MClubStaff? staff;
  const _StaffEditor({required this.api, required this.token, required this.cid, this.staff});

  @override
  State<_StaffEditor> createState() => _StaffEditorState();
}

class _StaffEditorState extends State<_StaffEditor> {
  late final TextEditingController _nameAr;
  late final TextEditingController _nameEn;
  late final TextEditingController _roleAr;
  late final TextEditingController _roleEn;
  late final TextEditingController _start;
  late final TextEditingController _end;
  late final TextEditingController _photo;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final s = widget.staff;
    _nameAr = TextEditingController(text: s?.nameAr ?? '');
    _nameEn = TextEditingController(text: s?.nameEn ?? '');
    _roleAr = TextEditingController(text: s?.roleAr ?? '');
    _roleEn = TextEditingController(text: s?.roleEn ?? '');
    _start = TextEditingController(text: s?.startDate ?? '');
    _end = TextEditingController(text: s?.endDate ?? '');
    _photo = TextEditingController(text: s?.photo ?? '');
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
      if (widget.staff == null) {
        await widget.api.addClubStaff(widget.token, widget.cid, body);
      } else {
        await widget.api.updateClubStaff(widget.token, widget.staff!.id, body);
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
          widget.staff == null
              ? (isAr ? 'مسؤول جديد' : 'New staff')
              : (isAr ? 'تعديل المسؤول' : 'Edit staff'),
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 14),
      sLabel(isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'),
      TextField(controller: _nameAr, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الاسم (إنجليزي)' : 'Name (English)'),
      TextField(controller: _nameEn, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'المنصب — اختيار سريع' : 'Role — quick pick'),
      DropdownButtonFormField<int>(
        isExpanded: true,
        dropdownColor: AppColors.cardBg,
        style: TextStyle(color: AppColors.white, fontSize: 12.5),
        decoration: sDec(isAr ? 'اختر منصبًا' : 'Pick a role'),
        items: [
          for (int i = 0; i < _staffRoles.length; i++)
            DropdownMenuItem(value: i, child: Text(isAr ? _staffRoles[i].$1 : _staffRoles[i].$2)),
        ],
        onChanged: (i) {
          if (i == null) return;
          _roleAr.text = _staffRoles[i].$1;
          _roleEn.text = _staffRoles[i].$2;
          setState(() {});
        },
      ),
      const SizedBox(height: 10),
      sLabel(isAr ? 'المنصب (عربي)' : 'Role (Arabic)'),
      TextField(controller: _roleAr, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'المنصب (إنجليزي)' : 'Role (English)'),
      TextField(controller: _roleEn, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'تاريخ البداية' : 'Start date'),
            TextField(controller: _start, style: _ts(), decoration: sDec('YYYY-MM-DD')),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(isAr ? 'تاريخ النهاية' : 'End date'),
            TextField(controller: _end, style: _ts(), decoration: sDec('YYYY-MM-DD')),
          ]),
        ),
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

class _AttachStaffSheet extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int cid;
  const _AttachStaffSheet({required this.api, required this.token, required this.cid});

  @override
  State<_AttachStaffSheet> createState() => _AttachStaffSheetState();
}

class _AttachStaffSheetState extends State<_AttachStaffSheet> {
  final _q = TextEditingController();
  final _roleAr = TextEditingController();
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
    _roleAr.dispose();
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
    final roleEn = _staffRoles
        .where((r) => r.$1 == _roleAr.text.trim())
        .map((r) => r.$2)
        .cast<String?>()
        .firstWhere((_) => true, orElse: () => null);
    final body = <String, dynamic>{
      'coach_id': _sel!.id,
      if (_roleAr.text.trim().isNotEmpty) 'role_ar': _roleAr.text.trim(),
      'role_en': ?roleEn,
      if (_start.text.trim().isNotEmpty) 'start_date': _start.text.trim(),
    };
    try {
      await widget.api.attachClubStaff(widget.token, widget.cid, body);
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
      Text(isAr ? 'إضافة مسؤول موجود' : 'Attach existing person',
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 4),
      Text(isAr ? 'مثلاً مدرّب تمت ترقيته لمنصب إداري' : 'e.g. a coach promoted to a management post',
          style: TextStyle(color: AppColors.hint, fontSize: 11.5)),
      const SizedBox(height: 12),
      if (_sel != null)
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppColors.darkBg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.aqua.withValues(alpha: 0.4)),
          ),
          child: Row(children: [
            Expanded(
              child: Text(
                [
                  _sel!.name,
                  if (_sel!.club != null) _sel!.club!,
                  if (_sel!.birthYear != null) '${_sel!.birthYear}',
                ].join(' · '),
                style: TextStyle(color: AppColors.white, fontSize: 13),
              ),
            ),
            TextButton(
                onPressed: () => setState(() => _sel = null),
                child: Text(isAr ? 'تغيير' : 'Change')),
          ]),
        )
      else ...[
        TextField(
          controller: _q,
          onChanged: _onSearch,
          style: _ts(),
          decoration: sDec(isAr ? 'ابحث بالاسم…' : 'Search by name…').copyWith(
            prefixIcon: Icon(Icons.search, color: AppColors.hint, size: 18),
            suffixIcon: _searching
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)))
                : null,
          ),
        ),
        for (final c in _results)
          ListTile(
            dense: true,
            title: Text(c.name, style: TextStyle(color: AppColors.white, fontSize: 13)),
            subtitle: Text(
                [if (c.role != null) c.role!, if (c.club != null) c.club!].join(' · '),
                style: TextStyle(color: AppColors.hint, fontSize: 11)),
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
      sLabel(isAr ? 'المنصب (اختياري)' : 'Role (optional)'),
      TextField(controller: _roleAr, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'تاريخ البداية (اختياري)' : 'Start date (optional)'),
      TextField(controller: _start, style: _ts(), decoration: sDec('YYYY-MM-DD')),
      const SizedBox(height: 14),
      SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: (_sel == null || _busy) ? null : _submit,
          style: FilledButton.styleFrom(
              backgroundColor: AppColors.aqua, padding: const EdgeInsets.symmetric(vertical: 14)),
          child: _busy
              ? const SizedBox(
                  width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text(isAr ? 'إضافة' : 'Attach', style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
      ),
      const SizedBox(height: 8),
    ]);
  }
}

// ── Teams (squads) ────────────────────────────────────────────────────────────

class _TeamsSection extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int cid;
  const _TeamsSection({required this.api, required this.token, required this.cid});

  @override
  State<_TeamsSection> createState() => _TeamsSectionState();
}

class _TeamsSectionState extends State<_TeamsSection> {
  bool _loading = true;
  String? _error;
  List<MTeamFull> _teams = const [];

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
      final v = await widget.api.clubTeams(widget.token, widget.cid);
      if (!mounted) return;
      setState(() {
        _teams = v;
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

  Future<void> _addTeam() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    List<MAge> ages;
    try {
      ages = await widget.api.ageGroups(widget.token);
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
      return;
    }
    if (!mounted) return;
    int? ageId;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          backgroundColor: AppColors.dialogBg,
          title: Text(isAr ? 'فريق جديد' : 'New team',
              style: TextStyle(color: AppColors.white, fontSize: 16)),
          content: DropdownButtonFormField<int>(
            initialValue: ageId,
            isExpanded: true,
            dropdownColor: AppColors.cardBg,
            style: TextStyle(color: AppColors.white, fontSize: 13),
            decoration: sDec(isAr ? 'المرحلة السنية *' : 'Age group *'),
            items: [
              for (final a in ages) DropdownMenuItem(value: a.id, child: Text(a.name(isAr))),
            ],
            onChanged: (v) => setLocal(() => ageId = v),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(isAr ? 'إلغاء' : 'Cancel')),
            FilledButton(
                onPressed: ageId == null ? null : () => Navigator.pop(ctx, true),
                child: Text(isAr ? 'إنشاء' : 'Create')),
          ],
        ),
      ),
    );
    if (ok == true && ageId != null) {
      try {
        await widget.api.createClubTeam(widget.token, widget.cid, {'age_group_id': ageId});
        if (!mounted) return;
        _load();
      } catch (e) {
        if (!mounted) return;
        if (handleAdminError(context, e)) return;
        showAdminError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(
          child: Text(isAr ? '⚽ فرق النادي (حسب المرحلة)' : '⚽ Club squads (by age)',
              style: TextStyle(color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 14)),
        ),
        FilledButton(
          onPressed: _addTeam,
          style: FilledButton.styleFrom(
              backgroundColor: AppColors.aqua, visualDensity: VisualDensity.compact),
          child: Text(isAr ? '+ فريق' : '+ Team'),
        ),
      ]),
      const SizedBox(height: 8),
      if (_loading)
        const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
      else if (_error != null)
        sectionError(_error!, _load)
      else if (_teams.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Center(
              child: Text(
                  isAr
                      ? 'لا توجد فرق — أنشئ فريقًا أو سجّل النادي في بطولة'
                      : 'No squads — create one or enrol the club in a competition',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.hint))),
        )
      else
        for (final t in _teams)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.cardBg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(children: [
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => AdminTeamScreen(team: t)),
                    );
                    _load();
                  },
                  child: Row(children: [
                    Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.darkBg,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(t.age ?? '—',
                          style: TextStyle(
                              color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 11)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(t.title(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 13.5)),
                        if (t.subtitle() != null)
                          Text(t.subtitle()!,
                              style: TextStyle(color: AppColors.hint, fontSize: 11)),
                      ]),
                    ),
                    Icon(Icons.chevron_right, color: AppColors.aqua, size: 18),
                    const SizedBox(width: 4),
                  ]),
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: () async {
                  final ok = await showStructureDelete(
                    context: context,
                    api: widget.api,
                    token: widget.token,
                    kind: 'team',
                    id: t.id,
                    label: isAr
                        ? 'فريق «${t.title()}»${t.age != null ? ' (${t.age})' : ''}'
                        : 'Team "${t.title()}"${t.age != null ? ' (${t.age})' : ''}',
                    deleter: (pw) => widget.api.deleteTeam(widget.token, t.id, pw),
                  );
                  if (ok) _load();
                },
                icon: Icon(Icons.delete_outline, color: AppColors.red, size: 18),
              ),
            ]),
          ),
    ]);
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
