import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/structure_models.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_club_screen.dart';
import 'admin_competition_select.dart';
import 'admin_competition_stages_screen.dart';
import 'admin_competitions_tab.dart';
import 'admin_error.dart';
import 'admin_upload_button.dart';

/// The Competition tab, expanded to mirror the website's /admin/structure with
/// six sub-tabs: Seasons, Age groups, Clubs, Competitions, Teams and Matches.
/// The first five need the editor role; Matches stays open to any admin.
class AdminStructureTab extends StatelessWidget {
  const AdminStructureTab({super.key});

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final canEdit = context.watch<AdminAuth>().user?.canEdit ?? false;

    // A clerk only enters results, so they land straight on the matches picker.
    if (!canEdit) return const AdminCompetitionsTab();

    final tabs = <(String, Widget)>[
      (isAr ? 'المواسم' : 'Seasons', const _SeasonsSection()),
      (isAr ? 'المراحل' : 'Ages', const _AgesSection()),
      (isAr ? 'الأندية' : 'Clubs', const _ClubsSection()),
      (isAr ? 'البطولات' : 'Comps', const _CompetitionsSection()),
      (isAr ? 'الفرق' : 'Teams', const _TeamsSection()),
      (isAr ? '⚽ المباريات' : '⚽ Matches', const AdminCompetitionsTab()),
    ];

    return DefaultTabController(
      length: tabs.length,
      initialIndex: tabs.length - 1, // default to Matches, like the web
      child: Column(
        children: [
          TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: AppColors.aqua,
            unselectedLabelColor: AppColors.hint,
            indicatorColor: AppColors.aqua,
            labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            tabs: [for (final t in tabs) Tab(text: t.$1)],
          ),
          Expanded(
            child: TabBarView(children: [for (final t in tabs) t.$2]),
          ),
        ],
      ),
    );
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

InputDecoration sDec([String? hint]) => InputDecoration(
      isDense: true,
      hintText: hint,
      hintStyle: TextStyle(color: AppColors.hint, fontSize: 13),
      filled: true,
      fillColor: AppColors.darkBg,
      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: AppColors.border),
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: AppColors.aqua),
      ),
    );

Widget sLabel(String t) => Padding(
      padding: const EdgeInsets.only(bottom: 5, left: 2),
      child: Text(t,
          style: TextStyle(
              color: AppColors.teal, fontSize: 12, fontWeight: FontWeight.bold)),
    );

TextStyle _txt() => TextStyle(color: AppColors.white, fontSize: 13);

Future<T?> showSheet<T>(BuildContext context, Widget child) => showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.dialogBg,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.7,
          maxChildSize: 0.95,
          builder: (_, scroll) => SingleChildScrollView(
            controller: scroll,
            padding: const EdgeInsets.all(16),
            child: child,
          ),
        ),
      ),
    );

Widget sheetGrip() => Center(
      child: Container(
        width: 40,
        height: 4,
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
            color: AppColors.border, borderRadius: BorderRadius.circular(2)),
      ),
    );

/// The delete-with-password flow used by seasons, age groups, clubs and
/// competitions. Fetches a preview (what blocks the delete / what cascades),
/// then requires the admin's own password to confirm. Returns true on success.
Future<bool> showStructureDelete({
  required BuildContext context,
  required AdminApi api,
  required String token,
  required String kind, // season | age-group | club | competition
  required int id,
  required String label,
  required Future<void> Function(String password) deleter,
}) async {
  final isAr = context.read<AppProvider>().locale == 'ar';
  final pwCtrl = TextEditingController();
  final done = await showDialog<bool>(
    context: context,
    builder: (dctx) {
      DeletePreview? preview;
      String? err;
      bool busy = false;
      bool loading = true;

      return StatefulBuilder(builder: (dctx, setLocal) {
        Future<void> loadPreview() async {
          try {
            final p = await api.deletePreview(token, kind, id);
            preview = p;
          } catch (e) {
            err = e.toString().replaceFirst('Exception: ', '');
          }
          loading = false;
          if (dctx.mounted) setLocal(() {});
        }

        if (loading) {
          loading = false;
          loadPreview();
        }

        final blocked = preview?.blocked ?? false;

        Future<void> confirm() async {
          setLocal(() {
            busy = true;
            err = null;
          });
          try {
            await deleter(pwCtrl.text);
            if (dctx.mounted) Navigator.pop(dctx, true);
          } catch (e) {
            setLocal(() {
              busy = false;
              err = e.toString().replaceFirst('Exception: ', '');
            });
          }
        }

        return AlertDialog(
          backgroundColor: AppColors.dialogBg,
          title: Text(isAr ? '⚠️ تأكيد الحذف' : '⚠️ Confirm delete',
              style: TextStyle(color: AppColors.red, fontSize: 16)),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: TextStyle(color: AppColors.white, fontSize: 13)),
              const SizedBox(height: 12),
              if (preview == null && err == null)
                Text('…', style: TextStyle(color: AppColors.hint)),
              if (blocked) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.red.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.red.withValues(alpha: 0.3)),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(isAr ? 'لا يمكن الحذف — مرتبط بـ:' : 'Cannot delete — linked to:',
                        style: TextStyle(color: AppColors.red, fontSize: 12, fontWeight: FontWeight.bold)),
                    for (final b in preview!.blockers)
                      Text('• ${b.count} ${b.noun}',
                          style: TextStyle(color: AppColors.white, fontSize: 12)),
                  ]),
                ),
              ],
              if (preview != null && !blocked) ...[
                if (preview!.cascades.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.orange.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.orange.withValues(alpha: 0.3)),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(isAr ? 'سيُحذف معه نهائيًا:' : 'Will also be deleted:',
                          style: TextStyle(color: AppColors.orange, fontSize: 12, fontWeight: FontWeight.bold)),
                      for (final c in preview!.cascades)
                        Text('• ${c.count} ${c.noun}',
                            style: TextStyle(color: AppColors.white, fontSize: 12)),
                    ]),
                  )
                else
                  Text(isAr ? 'لا توجد بيانات مرتبطة — الحذف آمن.' : 'No linked data — safe to delete.',
                      style: TextStyle(color: AppColors.hint, fontSize: 12)),
                const SizedBox(height: 12),
                sLabel(isAr ? 'اكتب كلمة المرور للتأكيد' : 'Type your password to confirm'),
                TextField(
                  controller: pwCtrl,
                  obscureText: true,
                  autofocus: true,
                  style: _txt(),
                  decoration: sDec(),
                ),
              ],
              if (err != null) ...[
                const SizedBox(height: 8),
                Text(err!, style: TextStyle(color: AppColors.red, fontSize: 12)),
              ],
            ]),
          ),
          actions: [
            TextButton(
                onPressed: busy ? null : () => Navigator.pop(dctx, false),
                child: Text(isAr ? 'إلغاء' : 'Cancel')),
            if (preview != null && !blocked)
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: AppColors.red),
                onPressed: busy ? null : confirm,
                child: busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(isAr ? 'حذف نهائي' : 'Delete'),
              ),
          ],
        );
      });
    },
  );
  pwCtrl.dispose();
  return done == true;
}

/// Shared empty/error/loading scaffolding for a list section.
class _SectionState<T> {
  bool loading = true;
  String? error;
  List<T> items = const [];
}

Widget sectionError(String msg, VoidCallback onRetry) => Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(msg, style: TextStyle(color: AppColors.white), textAlign: TextAlign.center),
        const SizedBox(height: 12),
        OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
      ]),
    );

// ── Seasons ───────────────────────────────────────────────────────────────────

class _SeasonsSection extends StatefulWidget {
  const _SeasonsSection();
  @override
  State<_SeasonsSection> createState() => _SeasonsSectionState();
}

class _SeasonsSectionState extends State<_SeasonsSection> {
  final _api = AdminApi();
  final _st = _SectionState<MSeason>();
  String get _token => context.read<AdminAuth>().token ?? '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _st.loading = true;
      _st.error = null;
    });
    try {
      final v = await _api.seasons(_token);
      if (!mounted) return;
      setState(() {
        _st.items = v;
        _st.loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      setState(() {
        _st.error = e.toString().replaceFirst('Exception: ', '');
        _st.loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    if (_st.loading) return const Center(child: CircularProgressIndicator());
    if (_st.error != null) return sectionError(_st.error!, _load);
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.aqua,
        onPressed: () async {
          final ok = await showSheet<bool>(context, _SeasonEditor(api: _api, token: _token));
          if (ok == true) _load();
        },
        icon: const Icon(Icons.add),
        label: Text(isAr ? 'موسم' : 'Season'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
          children: [
            for (final s in _st.items)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.cardBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(s.name(isAr),
                          style: TextStyle(
                              color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                      Text('${s.startDate} → ${s.endDate}',
                          style: TextStyle(color: AppColors.hint, fontSize: 11)),
                    ]),
                  ),
                  if (s.isActive)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      margin: const EdgeInsets.only(right: 4, left: 4),
                      decoration: BoxDecoration(
                        color: AppColors.green.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(isAr ? '● نشط' : '● Active',
                          style: TextStyle(color: AppColors.green, fontSize: 10.5)),
                    )
                  else
                    TextButton(
                      onPressed: () async {
                        try {
                          await _api.updateSeason(_token, s.id, {'is_active': true});
                          _load();
                        } catch (e) {
                          if (!context.mounted) return;
                          if (handleAdminError(context, e)) return;
                          showAdminError(context, e);
                        }
                      },
                      child: Text(isAr ? 'تفعيل' : 'Activate',
                          style: const TextStyle(fontSize: 11)),
                    ),
                  IconButton(
                    onPressed: () async {
                      final ok = await showSheet<bool>(
                          context, _SeasonEditor(api: _api, token: _token, season: s));
                      if (ok == true) _load();
                    },
                    icon: Icon(Icons.edit, color: AppColors.aqua, size: 18),
                  ),
                  IconButton(
                    onPressed: () async {
                      final ok = await showStructureDelete(
                        context: context,
                        api: _api,
                        token: _token,
                        kind: 'season',
                        id: s.id,
                        label: isAr ? 'موسم «${s.name(true)}»' : 'Season "${s.name(false)}"',
                        deleter: (pw) => _api.deleteSeason(_token, s.id, pw),
                      );
                      if (ok) _load();
                    },
                    icon: Icon(Icons.delete_outline, color: AppColors.red, size: 18),
                  ),
                ]),
              ),
          ],
        ),
      ),
    );
  }
}

class _SeasonEditor extends StatefulWidget {
  final AdminApi api;
  final String token;
  final MSeason? season;
  const _SeasonEditor({required this.api, required this.token, this.season});
  @override
  State<_SeasonEditor> createState() => _SeasonEditorState();
}

class _SeasonEditorState extends State<_SeasonEditor> {
  late final TextEditingController _nameAr;
  late final TextEditingController _nameEn;
  late final TextEditingController _start;
  late final TextEditingController _end;
  late bool _active;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final s = widget.season;
    _nameAr = TextEditingController(text: s?.nameAr ?? '');
    _nameEn = TextEditingController(text: s?.nameEn ?? '');
    _start = TextEditingController(text: s?.startDate ?? '');
    _end = TextEditingController(text: s?.endDate ?? '');
    _active = s?.isActive ?? false;
  }

  @override
  void dispose() {
    _nameAr.dispose();
    _nameEn.dispose();
    _start.dispose();
    _end.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (_start.text.trim().isEmpty || _end.text.trim().isEmpty) {
      showAdminError(context, isAr ? 'تاريخا البداية والنهاية مطلوبان' : 'Start and end dates required');
      return;
    }
    setState(() => _busy = true);
    final body = {
      'name_ar': _nameAr.text.trim(),
      'name_en': _nameEn.text.trim(),
      'start_date': _start.text.trim(),
      'end_date': _end.text.trim(),
      'is_active': _active,
    };
    try {
      if (widget.season == null) {
        await widget.api.createSeason(widget.token, body);
      } else {
        await widget.api.updateSeason(widget.token, widget.season!.id, body);
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
          widget.season == null
              ? (isAr ? 'موسم جديد' : 'New season')
              : (isAr ? 'تعديل الموسم' : 'Edit season'),
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 14),
      sLabel(isAr ? 'الاسم (عربي)' : 'Name (Arabic)'),
      TextField(controller: _nameAr, style: _txt(), decoration: sDec('2026-2027')),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الاسم (إنجليزي)' : 'Name (English)'),
      TextField(controller: _nameEn, style: _txt(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'تاريخ البداية *' : 'Start date *'),
      _DateField(controller: _start),
      const SizedBox(height: 10),
      sLabel(isAr ? 'تاريخ النهاية *' : 'End date *'),
      _DateField(controller: _end),
      const SizedBox(height: 6),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        activeThumbColor: AppColors.aqua,
        value: _active,
        onChanged: (v) => setState(() => _active = v),
        title: Text(isAr ? 'الموسم الحالي (النشط)' : 'Active season',
            style: TextStyle(color: AppColors.white, fontSize: 14)),
      ),
      const SizedBox(height: 8),
      _saveButton(_busy, _save, isAr),
      const SizedBox(height: 8),
    ]);
  }
}

/// A YYYY-MM-DD text field with a calendar picker button.
class _DateField extends StatelessWidget {
  final TextEditingController controller;
  const _DateField({required this.controller});

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      style: _txt(),
      keyboardType: TextInputType.datetime,
      decoration: sDec('2026-08-01').copyWith(
        suffixIcon: IconButton(
          icon: Icon(Icons.calendar_month, color: AppColors.hint, size: 20),
          onPressed: () async {
            DateTime init;
            try {
              init = DateTime.parse(controller.text.trim());
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
              controller.text = '${picked.year.toString().padLeft(4, '0')}-'
                  '${picked.month.toString().padLeft(2, '0')}-'
                  '${picked.day.toString().padLeft(2, '0')}';
            }
          },
        ),
      ),
    );
  }
}

// ── Age groups ────────────────────────────────────────────────────────────────

class _AgesSection extends StatefulWidget {
  const _AgesSection();
  @override
  State<_AgesSection> createState() => _AgesSectionState();
}

class _AgesSectionState extends State<_AgesSection> {
  final _api = AdminApi();
  final _st = _SectionState<MAge>();
  String get _token => context.read<AdminAuth>().token ?? '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _st.loading = true;
      _st.error = null;
    });
    try {
      final v = await _api.ageGroups(_token);
      if (!mounted) return;
      setState(() {
        _st.items = v;
        _st.loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      setState(() {
        _st.error = e.toString().replaceFirst('Exception: ', '');
        _st.loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    if (_st.loading) return const Center(child: CircularProgressIndicator());
    if (_st.error != null) return sectionError(_st.error!, _load);
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.aqua,
        onPressed: () async {
          final ok = await showSheet<bool>(context, _AgeEditor(api: _api, token: _token));
          if (ok == true) _load();
        },
        icon: const Icon(Icons.add),
        label: Text(isAr ? 'مرحلة' : 'Age'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
          children: [
            for (final a in _st.items)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.cardBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(children: [
                  Expanded(
                    child: Text(a.name(isAr),
                        style: TextStyle(
                            color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  ),
                  Text('≥ ${a.oldestBirthYear}',
                      style: TextStyle(color: AppColors.hint, fontSize: 12)),
                  IconButton(
                    onPressed: () async {
                      final ok = await showSheet<bool>(
                          context, _AgeEditor(api: _api, token: _token, age: a));
                      if (ok == true) _load();
                    },
                    icon: Icon(Icons.edit, color: AppColors.aqua, size: 18),
                  ),
                  IconButton(
                    onPressed: () async {
                      final ok = await showStructureDelete(
                        context: context,
                        api: _api,
                        token: _token,
                        kind: 'age-group',
                        id: a.id,
                        label: isAr ? 'مرحلة «${a.name(true)}»' : 'Age group "${a.name(false)}"',
                        deleter: (pw) => _api.deleteAge(_token, a.id, pw),
                      );
                      if (ok) _load();
                    },
                    icon: Icon(Icons.delete_outline, color: AppColors.red, size: 18),
                  ),
                ]),
              ),
          ],
        ),
      ),
    );
  }
}

class _AgeEditor extends StatefulWidget {
  final AdminApi api;
  final String token;
  final MAge? age;
  const _AgeEditor({required this.api, required this.token, this.age});
  @override
  State<_AgeEditor> createState() => _AgeEditorState();
}

class _AgeEditorState extends State<_AgeEditor> {
  late final TextEditingController _nameAr;
  late final TextEditingController _nameEn;
  late final TextEditingController _year;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final a = widget.age;
    _nameAr = TextEditingController(text: a?.nameAr ?? '');
    _nameEn = TextEditingController(text: a?.nameEn ?? '');
    _year = TextEditingController(text: a != null ? '${a.oldestBirthYear}' : '');
  }

  @override
  void dispose() {
    _nameAr.dispose();
    _nameEn.dispose();
    _year.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    final yr = int.tryParse(_year.text.trim());
    if (yr == null) {
      showAdminError(context, isAr ? 'أدخل سنة ميلاد صحيحة' : 'Enter a valid birth year');
      return;
    }
    setState(() => _busy = true);
    final body = {
      'name_ar': _nameAr.text.trim(),
      'name_en': _nameEn.text.trim(),
      'oldest_birth_year': yr,
    };
    try {
      if (widget.age == null) {
        await widget.api.createAge(widget.token, body);
      } else {
        await widget.api.updateAge(widget.token, widget.age!.id, body);
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
          widget.age == null
              ? (isAr ? 'مرحلة سنية جديدة' : 'New age group')
              : (isAr ? 'تعديل المرحلة' : 'Edit age group'),
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 14),
      sLabel(isAr ? 'الاسم (عربي)' : 'Name (Arabic)'),
      TextField(controller: _nameAr, style: _txt(), decoration: sDec(isAr ? 'تحت 17' : 'U-17')),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الاسم (إنجليزي)' : 'Name (English)'),
      TextField(controller: _nameEn, style: _txt(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'أقدم سنة ميلاد *' : 'Oldest birth year *'),
      TextField(
          controller: _year,
          style: _txt(),
          keyboardType: TextInputType.number,
          decoration: sDec('2009')),
      const SizedBox(height: 6),
      Text(
          isAr
              ? 'اللاعب مؤهّل إذا كانت سنة ميلاده ≥ هذه السنة.'
              : 'A player is eligible if their birth year ≥ this year.',
          style: TextStyle(color: AppColors.hint, fontSize: 11)),
      const SizedBox(height: 14),
      _saveButton(_busy, _save, isAr),
      const SizedBox(height: 8),
    ]);
  }
}

// ── Clubs ─────────────────────────────────────────────────────────────────────

class _ClubsSection extends StatefulWidget {
  const _ClubsSection();
  @override
  State<_ClubsSection> createState() => _ClubsSectionState();
}

class _ClubsSectionState extends State<_ClubsSection> {
  final _api = AdminApi();
  final _q = TextEditingController();
  Timer? _debounce;
  bool _loading = true;
  String? _error;
  List<MClub> _clubs = const [];
  String get _token => context.read<AdminAuth>().token ?? '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final v = await _api.clubs(_token, _q.text.trim());
      if (!mounted) return;
      setState(() {
        _clubs = v;
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

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), _load);
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.aqua,
        onPressed: () async {
          final ok = await showSheet<bool>(context, _ClubEditor(api: _api, token: _token));
          if (ok == true) _load();
        },
        icon: const Icon(Icons.add),
        label: Text(isAr ? 'نادٍ' : 'Club'),
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: TextField(
            controller: _q,
            onChanged: _onSearch,
            style: _txt(),
            decoration: sDec(isAr ? 'بحث عن نادٍ…' : 'Search clubs…').copyWith(
              prefixIcon: Icon(Icons.search, color: AppColors.hint, size: 18),
            ),
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? sectionError(_error!, _load)
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: _clubs.isEmpty
                          ? ListView(children: [
                              const SizedBox(height: 100),
                              Center(
                                  child: Text(isAr ? 'لا نتائج' : 'No results',
                                      style: TextStyle(color: AppColors.hint))),
                            ])
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(12, 4, 12, 90),
                              itemCount: _clubs.length,
                              itemBuilder: (_, i) {
                                final c = _clubs[i];
                                return Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: AppColors.cardBg,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: AppColors.border),
                                  ),
                                  child: Row(children: [
                                    _ClubLogo(url: c.logoUrl),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(c.name(isAr),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                    color: AppColors.white,
                                                    fontWeight: FontWeight.bold,
                                                    fontSize: 13.5)),
                                            if (c.city(isAr).isNotEmpty)
                                              Text(c.city(isAr),
                                                  style: TextStyle(
                                                      color: AppColors.hint, fontSize: 11)),
                                          ]),
                                    ),
                                    IconButton(
                                      visualDensity: VisualDensity.compact,
                                      tooltip: isAr ? 'إدارة' : 'Manage',
                                      onPressed: () async {
                                        await Navigator.push(
                                          context,
                                          MaterialPageRoute(
                                            builder: (_) => AdminClubScreen(club: c),
                                          ),
                                        );
                                        _load();
                                      },
                                      icon: Icon(Icons.tune, color: AppColors.aqua, size: 18),
                                    ),
                                    IconButton(
                                      onPressed: () async {
                                        final ok = await showStructureDelete(
                                          context: context,
                                          api: _api,
                                          token: _token,
                                          kind: 'club',
                                          id: c.id,
                                          label: isAr
                                              ? 'نادي «${c.name(true)}»'
                                              : 'Club "${c.name(false)}"',
                                          deleter: (pw) => _api.deleteClub(_token, c.id, pw),
                                        );
                                        if (ok) _load();
                                      },
                                      icon: Icon(Icons.delete_outline, color: AppColors.red, size: 18),
                                    ),
                                  ]),
                                );
                              },
                            ),
                    ),
        ),
      ]),
    );
  }
}

class _ClubLogo extends StatelessWidget {
  final String? url;
  const _ClubLogo({this.url});
  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 40,
        height: 40,
        color: AppColors.darkBg,
        child: url != null
            ? Image.network(url!, fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const Center(child: Text('🛡️')))
            : const Center(child: Text('🛡️')),
      ),
    );
  }
}

/// Create-form for a new club. Editing an existing club's info is done inside
/// AdminClubScreen (opened from the Manage button on a club row).
class _ClubEditor extends StatefulWidget {
  final AdminApi api;
  final String token;
  const _ClubEditor({required this.api, required this.token});
  @override
  State<_ClubEditor> createState() => _ClubEditorState();
}

class _ClubEditorState extends State<_ClubEditor> {
  late final Map<String, TextEditingController> _c;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _c = {
      'name_ar': TextEditingController(),
      'name_en': TextEditingController(),
      'city_ar': TextEditingController(),
      'city_en': TextEditingController(),
      'logo_url': TextEditingController(),
      'website_url': TextEditingController(),
      'facebook_url': TextEditingController(),
      'instagram_url': TextEditingController(),
    };
  }

  @override
  void dispose() {
    for (final ctrl in _c.values) {
      ctrl.dispose();
    }
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
      await widget.api.createClub(widget.token, body);
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
    Widget f(String key, String label, {String? hint}) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            sLabel(label),
            TextField(controller: _c[key], style: _txt(), decoration: sDec(hint)),
          ]),
        );
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      sheetGrip(),
      Text(isAr ? 'نادٍ جديد' : 'New club',
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 14),
      f('name_ar', isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'),
      f('name_en', isAr ? 'الاسم (إنجليزي)' : 'Name (English)'),
      f('city_ar', isAr ? 'المدينة (عربي)' : 'City (Arabic)'),
      f('city_en', isAr ? 'المدينة (إنجليزي)' : 'City (English)'),
      f('logo_url', isAr ? 'رابط الشعار' : 'Logo URL', hint: 'https://…'),
      Align(
        alignment: AlignmentDirectional.centerStart,
        child: AdminUploadButton(
          token: widget.token,
          label: isAr ? 'رفع الشعار من الجهاز' : 'Upload logo',
          onUploaded: (url) => setState(() => _c['logo_url']!.text = url),
        ),
      ),
      const SizedBox(height: 10),
      f('website_url', isAr ? 'الموقع' : 'Website', hint: 'https://…'),
      f('facebook_url', isAr ? 'فيسبوك' : 'Facebook', hint: 'https://…'),
      f('instagram_url', isAr ? 'إنستغرام' : 'Instagram', hint: 'https://…'),
      const SizedBox(height: 4),
      _saveButton(_busy, _save, isAr),
      const SizedBox(height: 8),
    ]);
  }
}

// ── Competitions ──────────────────────────────────────────────────────────────

class _CompetitionsSection extends StatefulWidget {
  const _CompetitionsSection();
  @override
  State<_CompetitionsSection> createState() => _CompetitionsSectionState();
}

class _CompetitionsSectionState extends State<_CompetitionsSection> {
  final _api = AdminApi();
  bool _loading = true;
  String? _error;
  List<MComp> _comps = const [];
  List<MSeason> _seasons = const [];
  List<MAge> _ages = const [];
  String? _seasonFilter;
  String get _token => context.read<AdminAuth>().token ?? '';

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
      final results = await Future.wait([
        _api.compsManage(_token),
        _api.seasons(_token),
        _api.ageGroups(_token),
      ]);
      if (!mounted) return;
      final comps = results[0] as List<MComp>;
      final seasons = results[1] as List<MSeason>;
      // Default the season filter to the active season on first load.
      if (_seasonFilter == null) {
        final active = seasons.where((s) => s.isActive).toList();
        if (active.isNotEmpty) {
          final byId = comps.where((c) => c.seasonId == active.first.id).toList();
          if (byId.isNotEmpty) _seasonFilter = byId.first.season;
        }
      }
      setState(() {
        _comps = comps;
        _seasons = seasons;
        _ages = results[2] as List<MAge>;
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
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return sectionError(_error!, _load);

    final seasonNames =
        {for (final c in _comps) c.season}.where((s) => s.isNotEmpty).toList()
          ..sort((a, b) => b.compareTo(a));
    final shown = _seasonFilter == null
        ? _comps
        : _comps.where((c) => c.season == _seasonFilter).toList();

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.aqua,
        onPressed: () async {
          final ok = await showSheet<bool>(context,
              _CompEditor(api: _api, token: _token, seasons: _seasons, ages: _ages, comps: _comps));
          if (ok == true) _load();
        },
        icon: const Icon(Icons.add),
        label: Text(isAr ? 'بطولة' : 'Comp'),
      ),
      body: Column(children: [
        if (seasonNames.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            child: DropdownButtonFormField<String?>(
              initialValue: _seasonFilter,
              isExpanded: true,
              dropdownColor: AppColors.cardBg,
              style: TextStyle(color: AppColors.white, fontSize: 13),
              decoration: sDec(),
              items: [
                DropdownMenuItem(value: null, child: Text(isAr ? 'كل المواسم' : 'All seasons')),
                for (final s in seasonNames) DropdownMenuItem(value: s, child: Text(s)),
              ],
              onChanged: (v) => setState(() => _seasonFilter = v),
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: shown.isEmpty
                ? ListView(children: [
                    const SizedBox(height: 100),
                    Center(
                        child: Text(isAr ? 'لا بطولات' : 'No competitions',
                            style: TextStyle(color: AppColors.hint))),
                  ])
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 90),
                    itemCount: shown.length,
                    itemBuilder: (_, i) {
                      final c = shown[i];
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
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
                                  Text(c.name(isAr),
                                      style: TextStyle(
                                          color: AppColors.white,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 13.5)),
                                  Text(
                                    [c.season, if (c.age != null) c.age!, c.sector(isAr)]
                                        .where((s) => s.isNotEmpty)
                                        .join(' · '),
                                    style: TextStyle(color: AppColors.hint, fontSize: 11),
                                  ),
                                ]),
                          ),
                          IconButton(
                            visualDensity: VisualDensity.compact,
                            tooltip: isAr ? 'المراحل' : 'Stages',
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => AdminCompetitionStagesScreen(comp: c),
                              ),
                            ),
                            icon: Icon(Icons.account_tree, color: AppColors.teal, size: 18),
                          ),
                          IconButton(
                            visualDensity: VisualDensity.compact,
                            onPressed: () async {
                              final ok = await showSheet<bool>(
                                  context,
                                  _CompEditor(
                                      api: _api,
                                      token: _token,
                                      seasons: _seasons,
                                      ages: _ages,
                                      comps: _comps,
                                      comp: c));
                              if (ok == true) _load();
                            },
                            icon: Icon(Icons.edit, color: AppColors.aqua, size: 18),
                          ),
                          IconButton(
                            onPressed: () async {
                              final ok = await showStructureDelete(
                                context: context,
                                api: _api,
                                token: _token,
                                kind: 'competition',
                                id: c.id,
                                label: isAr
                                    ? 'بطولة «${c.name(true)}»'
                                    : 'Competition "${c.name(false)}"',
                                deleter: (pw) => _api.deleteComp(_token, c.id, pw),
                              );
                              if (ok) _load();
                            },
                            icon: Icon(Icons.delete_outline, color: AppColors.red, size: 18),
                          ),
                        ]),
                      );
                    },
                  ),
          ),
        ),
      ]),
    );
  }
}

class _CompEditor extends StatefulWidget {
  final AdminApi api;
  final String token;
  final List<MSeason> seasons;
  final List<MAge> ages;
  // Existing competitions, so an existing code auto-fills the Arabic/English name.
  final List<MComp> comps;
  final MComp? comp;
  const _CompEditor({
    required this.api,
    required this.token,
    required this.seasons,
    required this.ages,
    this.comps = const [],
    this.comp,
  });
  @override
  State<_CompEditor> createState() => _CompEditorState();
}

class _CompEditorState extends State<_CompEditor> {
  late final TextEditingController _nameAr;
  late final TextEditingController _nameEn;
  late final TextEditingController _sector;
  late final TextEditingController _code;
  final _codeFocus = FocusNode();
  // Existing code → (Arabic, English) competition name.
  final Map<String, ({String ar, String en})> _codeMap = {};
  int? _seasonId;
  int? _ageId;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final c = widget.comp;
    _nameAr = TextEditingController(text: c?.nameAr ?? '');
    _nameEn = TextEditingController(text: c?.nameEn ?? '');
    _sector = TextEditingController(text: c?.sectorAr ?? '');
    _code = TextEditingController(text: c?.code ?? '');
    _seasonId = c?.seasonId;
    _ageId = c?.ageGroupId;
    for (final x in widget.comps) {
      final code = (x.code ?? '').trim();
      if (code.isNotEmpty && !_codeMap.containsKey(code)) {
        _codeMap[code] = (ar: x.nameAr ?? '', en: x.nameEn ?? '');
      }
    }
  }

  // Fill the names from an existing code (no-op for a new code).
  void _applyCode(String code) {
    final hit = _codeMap[code.trim()];
    if (hit != null) setState(() { _nameAr.text = hit.ar; _nameEn.text = hit.en; });
  }

  @override
  void dispose() {
    _nameAr.dispose();
    _nameEn.dispose();
    _sector.dispose();
    _code.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (_nameAr.text.trim().isEmpty || _seasonId == null) {
      showAdminError(context, isAr ? 'الاسم والموسم مطلوبان' : 'Name and season required');
      return;
    }
    setState(() => _busy = true);
    final body = {
      'name_ar': _nameAr.text.trim(),
      'name_en': _nameEn.text.trim(),
      'code': _code.text.trim(),
      'sector_ar': _sector.text.trim(),
      'season_id': _seasonId,
      'age_group_id': _ageId,
    };
    try {
      if (widget.comp == null) {
        await widget.api.createComp(widget.token, body);
      } else {
        await widget.api.updateComp(widget.token, widget.comp!.id, body);
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
          widget.comp == null
              ? (isAr ? 'بطولة جديدة' : 'New competition')
              : (isAr ? 'تعديل البطولة' : 'Edit competition'),
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 14),
      sLabel(isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'),
      TextField(controller: _nameAr, style: _txt(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الاسم (إنجليزي)' : 'Name (English)'),
      TextField(controller: _nameEn, style: _txt(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الموسم *' : 'Season *'),
      DropdownButtonFormField<int>(
        initialValue: _seasonId,
        isExpanded: true,
        dropdownColor: AppColors.cardBg,
        style: TextStyle(color: AppColors.white, fontSize: 13),
        decoration: sDec(),
        items: [
          for (final s in widget.seasons)
            DropdownMenuItem(value: s.id, child: Text(s.name(isAr))),
        ],
        onChanged: (v) => setState(() => _seasonId = v),
      ),
      const SizedBox(height: 10),
      sLabel(isAr ? 'المرحلة السنية' : 'Age group'),
      DropdownButtonFormField<int?>(
        initialValue: _ageId,
        isExpanded: true,
        dropdownColor: AppColors.cardBg,
        style: TextStyle(color: AppColors.white, fontSize: 13),
        decoration: sDec(),
        items: [
          DropdownMenuItem(value: null, child: Text(isAr ? 'مفتوحة' : 'Open')),
          for (final a in widget.ages)
            DropdownMenuItem(value: a.id, child: Text(a.name(isAr))),
        ],
        onChanged: (v) => setState(() => _ageId = v),
      ),
      const SizedBox(height: 10),
      sLabel(isAr ? 'القطاع (اختياري)' : 'Sector (optional)'),
      TextField(controller: _sector, style: _txt(), decoration: sDec(isAr ? 'القاهرة' : 'Cairo')),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الرمز (اختياري)' : 'Code (optional)'),
      // Typing filters existing codes; picking one (or typing a match) auto-fills
      // the Arabic/English name from that competition. A new code just stays.
      RawAutocomplete<String>(
        textEditingController: _code,
        focusNode: _codeFocus,
        optionsBuilder: (v) {
          final q = v.text.trim().toLowerCase();
          final codes = _codeMap.keys;
          return q.isEmpty ? codes : codes.where((c) => c.toLowerCase().contains(q));
        },
        onSelected: (code) { _applyCode(code); _codeFocus.unfocus(); },
        fieldViewBuilder: (context, controller, focusNode, onSubmit) => TextField(
          controller: controller,
          focusNode: focusNode,
          style: _txt(),
          textDirection: TextDirection.ltr,
          onChanged: _applyCode,
          decoration: sDec('c001').copyWith(
              suffixIcon: _codeMap.isEmpty ? null : Icon(Icons.arrow_drop_down, color: AppColors.hint)),
          onSubmitted: (_) => onSubmit(),
        ),
        optionsViewBuilder: (context, onSelected, options) => Align(
          alignment: Alignment.topLeft,
          child: Material(
            color: AppColors.cardBg,
            elevation: 4,
            borderRadius: BorderRadius.circular(10),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 240, maxWidth: 360),
              child: ListView(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                children: [
                  for (final o in options)
                    InkWell(
                      onTap: () => onSelected(o),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        child: Row(children: [
                          Text(o, style: TextStyle(color: AppColors.aqua, fontSize: 13, fontWeight: FontWeight.bold)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(_codeMap[o]?.ar ?? '',
                                maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: AppColors.white, fontSize: 12)),
                          ),
                        ]),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
      const SizedBox(height: 14),
      _saveButton(_busy, _save, isAr),
      const SizedBox(height: 8),
    ]);
  }
}

// ── Teams (per competition) ───────────────────────────────────────────────────

class _TeamsSection extends StatefulWidget {
  const _TeamsSection();
  @override
  State<_TeamsSection> createState() => _TeamsSectionState();
}

class _TeamsSectionState extends State<_TeamsSection> {
  final _api = AdminApi();
  List<MComp> _comps = const [];
  int? _cid;
  List<MTeam> _teams = const [];
  bool _loadingComps = true;
  bool _loadingTeams = false;
  String? _activeSeason;
  String get _token => context.read<AdminAuth>().token ?? '';

  @override
  void initState() {
    super.initState();
    _loadComps();
  }

  Future<void> _loadComps() async {
    try {
      final results = await Future.wait([
        _api.compsManage(_token),
        _api.seasons(_token),
      ]);
      final comps = results[0] as List<MComp>;
      final seasons = results[1] as List<MSeason>;
      // Match the active season to the string competitions carry, so the picker
      // defaults to it.
      String? active;
      final activeSeason = seasons.where((s) => s.isActive).toList();
      if (activeSeason.isNotEmpty) {
        final byId = comps.where((c) => c.seasonId == activeSeason.first.id).toList();
        if (byId.isNotEmpty) active = byId.first.season;
      }
      if (!mounted) return;
      setState(() {
        _comps = comps;
        _activeSeason = active;
        _loadingComps = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingComps = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  Future<void> _loadTeams() async {
    if (_cid == null) return;
    setState(() => _loadingTeams = true);
    try {
      final t = await _api.compTeamsManage(_token, _cid!);
      if (!mounted) return;
      setState(() {
        _teams = t;
        _loadingTeams = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingTeams = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    if (_loadingComps) return const Center(child: CircularProgressIndicator());
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        sLabel(isAr ? 'اختر البطولة' : 'Select competition'),
        AdminCompetitionSelect(
          options: [
            for (final c in _comps)
              CompOption(
                id: c.id,
                season: c.season,
                name: c.name(isAr),
                age: c.age ?? '',
                sector: c.sector(isAr),
              ),
          ],
          value: _cid,
          preferredSeason: _activeSeason,
          onChanged: (v) {
            setState(() {
              _cid = v;
              _teams = const [];
            });
            _loadTeams();
          },
        ),
        const SizedBox(height: 12),
        if (_cid != null) ...[
          FilledButton.icon(
            onPressed: () async {
              final ok = await showSheet<bool>(
                  context, _EnrollTeamSheet(api: _api, token: _token, cid: _cid!));
              if (ok == true) _loadTeams();
            },
            style: FilledButton.styleFrom(backgroundColor: AppColors.aqua),
            icon: const Icon(Icons.add, size: 18),
            label: Text(isAr ? 'تسجيل نادٍ كفريق' : 'Enrol a club'),
          ),
          const SizedBox(height: 12),
          if (_loadingTeams)
            const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
          else ...[
            Text('${_teams.length} ${isAr ? 'فريق' : 'teams'}',
                style: TextStyle(color: AppColors.hint, fontSize: 12)),
            const SizedBox(height: 6),
            for (final t in _teams)
              _TeamRow(
                api: _api,
                token: _token,
                team: t,
                cid: _cid!,
                onChanged: _loadTeams,
              ),
          ],
        ],
      ],
    );
  }
}

class _TeamRow extends StatefulWidget {
  final AdminApi api;
  final String token;
  final MTeam team;
  final int cid;
  final VoidCallback onChanged;
  const _TeamRow({
    required this.api,
    required this.token,
    required this.team,
    required this.cid,
    required this.onChanged,
  });
  @override
  State<_TeamRow> createState() => _TeamRowState();
}

class _TeamRowState extends State<_TeamRow> {
  bool _open = false;
  late final TextEditingController _name;
  late final TextEditingController _pd;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.team.nameAr ?? '');
    _pd = TextEditingController(text: '${widget.team.pointDeduction}');
  }

  @override
  void dispose() {
    _name.dispose();
    _pd.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await widget.api.updateTeam(widget.token, widget.team.id, {
        'competition_id': widget.cid,
        'point_deduction': int.tryParse(_pd.text.trim()) ?? 0,
        'name_ar': _name.text.trim().isEmpty ? null : _name.text.trim(),
      });
      if (!mounted) return;
      setState(() {
        _open = false;
        _busy = false;
      });
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  Future<void> _remove() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.dialogBg,
        title: Text(isAr ? 'إزالة الفريق' : 'Remove team',
            style: TextStyle(color: AppColors.white, fontSize: 16)),
        content: Text(
            isAr
                ? 'إزالة «${widget.team.clubName}» من هذه البطولة فقط؟'
                : 'Remove "${widget.team.clubName}" from this competition only?',
            style: TextStyle(color: AppColors.teal, fontSize: 13)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(isAr ? 'إلغاء' : 'Cancel')),
          FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.red),
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(isAr ? 'إزالة' : 'Remove')),
        ],
      ),
    );
    if (ok == true) {
      try {
        await widget.api.unenrollTeam(widget.token, widget.cid, widget.team.id);
        if (!mounted) return;
        widget.onChanged();
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
    final t = widget.team;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(children: [
        Row(children: [
          _ClubLogo(url: t.logo),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.clubName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 13.5)),
              if (t.nameAr != null && t.nameAr!.isNotEmpty)
                Text(t.nameAr!, style: TextStyle(color: AppColors.hint, fontSize: 11)),
              if (t.pointDeduction > 0)
                Text(isAr ? 'خصم ${t.pointDeduction} نقطة' : '−${t.pointDeduction} pts',
                    style: TextStyle(color: AppColors.red, fontSize: 11)),
            ]),
          ),
          TextButton(
              onPressed: () => setState(() => _open = !_open),
              child: Text(_open ? (isAr ? 'إغلاق' : 'Close') : (isAr ? 'تعديل' : 'Edit'),
                  style: const TextStyle(fontSize: 12))),
          IconButton(
            onPressed: _remove,
            icon: Icon(Icons.remove_circle_outline, color: AppColors.red, size: 18),
          ),
        ]),
        if (_open) ...[
          const Divider(height: 16),
          sLabel(isAr ? 'اسم بديل (اختياري)' : 'Alternative name (optional)'),
          TextField(controller: _name, style: _txt(), decoration: sDec(t.clubName)),
          const SizedBox(height: 8),
          sLabel(isAr ? 'خصم نقاط' : 'Point deduction'),
          TextField(
              controller: _pd,
              style: _txt(),
              keyboardType: TextInputType.number,
              decoration: sDec('0')),
          const SizedBox(height: 10),
          _saveButton(_busy, _save, isAr),
        ],
      ]),
    );
  }
}

class _EnrollTeamSheet extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int cid;
  const _EnrollTeamSheet({required this.api, required this.token, required this.cid});
  @override
  State<_EnrollTeamSheet> createState() => _EnrollTeamSheetState();
}

class _EnrollTeamSheetState extends State<_EnrollTeamSheet> {
  final _q = TextEditingController();
  final _pd = TextEditingController(text: '0');
  Timer? _debounce;
  bool _searching = false;
  List<MClub> _results = const [];

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    _pd.dispose();
    super.dispose();
  }

  void _onSearch(String q) {
    _debounce?.cancel();
    if (q.trim().isEmpty) {
      setState(() => _results = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      setState(() => _searching = true);
      try {
        final r = await widget.api.clubs(widget.token, q.trim());
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

  Future<void> _enroll(MClub club) async {
    try {
      await widget.api.enrollTeam(widget.token, widget.cid, {
        'club_id': club.id,
        'point_deduction': int.tryParse(_pd.text.trim()) ?? 0,
      });
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      sheetGrip(),
      Text(isAr ? 'تسجيل نادٍ كفريق' : 'Enrol a club',
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 14),
      Row(children: [
        Expanded(
          child: TextField(
            controller: _q,
            onChanged: _onSearch,
            style: _txt(),
            decoration: sDec(isAr ? 'ابحث عن نادٍ…' : 'Search clubs…').copyWith(
              prefixIcon: Icon(Icons.search, color: AppColors.hint, size: 18),
              suffixIcon: _searching
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                          width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)))
                  : null,
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 70,
          child: TextField(
            controller: _pd,
            style: _txt(),
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            decoration: sDec(isAr ? 'خصم' : 'Ded.'),
          ),
        ),
      ]),
      const SizedBox(height: 12),
      for (final c in _results)
        InkWell(
          onTap: () => _enroll(c),
          borderRadius: BorderRadius.circular(10),
          child: Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.darkBg,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(children: [
              _ClubLogo(url: c.logoUrl),
              const SizedBox(width: 10),
              Expanded(
                child: Text(c.name(isAr),
                    style: TextStyle(color: AppColors.white, fontSize: 13)),
              ),
              Text(isAr ? '+ إضافة' : '+ Add',
                  style: TextStyle(color: AppColors.aqua, fontSize: 12, fontWeight: FontWeight.bold)),
            ]),
          ),
        ),
      const SizedBox(height: 8),
    ]);
  }
}

// ── Shared save button ────────────────────────────────────────────────────────

Widget _saveButton(bool busy, VoidCallback onSave, bool isAr) => SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: busy ? null : onSave,
        style: FilledButton.styleFrom(
            backgroundColor: AppColors.aqua,
            padding: const EdgeInsets.symmetric(vertical: 14)),
        child: busy
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(isAr ? 'حفظ' : 'Save', style: const TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
