import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/structure_models.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';
import 'admin_structure_tab.dart' show sDec, sLabel, sheetGrip, showSheet, sectionError;

TextStyle _ts() => TextStyle(color: AppColors.white, fontSize: 13);

Future<bool> _confirm(BuildContext context, String title, String message) async {
  final isAr = context.read<AppProvider>().locale == 'ar';
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.dialogBg,
      title: Text(title, style: TextStyle(color: AppColors.white, fontSize: 16)),
      content: Text(message, style: TextStyle(color: AppColors.teal, fontSize: 13)),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(isAr ? 'إلغاء' : 'Cancel')),
        FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(isAr ? 'حذف' : 'Delete')),
      ],
    ),
  );
  return ok == true;
}

/// Stages + groups manager for one competition — the in-app twin of the
/// website's /admin/competition. Reached from the Competitions sub-tab.
class AdminCompetitionStagesScreen extends StatefulWidget {
  final MComp comp;
  const AdminCompetitionStagesScreen({super.key, required this.comp});

  @override
  State<AdminCompetitionStagesScreen> createState() =>
      _AdminCompetitionStagesScreenState();
}

class _AdminCompetitionStagesScreenState
    extends State<AdminCompetitionStagesScreen> {
  final _api = AdminApi();
  bool _loading = true;
  String? _error;
  List<MStage> _stages = const [];
  List<MTeam> _teams = const [];
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
        _api.stages(_token, widget.comp.id),
        _api.compTeamsManage(_token, widget.comp.id),
      ]);
      if (!mounted) return;
      setState(() {
        _stages = results[0] as List<MStage>;
        _teams = results[1] as List<MTeam>;
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
    final c = widget.comp;
    return Scaffold(
      appBar: AppBar(title: Text(isAr ? 'مراحل البطولة' : 'Competition stages')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.aqua,
        onPressed: () async {
          final ok = await showSheet<bool>(
              context, _StageEditor(api: _api, token: _token, cid: c.id));
          if (ok == true) _load();
        },
        icon: const Icon(Icons.add),
        label: Text(isAr ? 'مرحلة' : 'Stage'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? sectionError(_error!, _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
                    children: [
                      // Header
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.cardBg,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(c.name(isAr),
                              style: TextStyle(
                                  color: AppColors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 15)),
                          const SizedBox(height: 2),
                          Text(
                            [
                              c.season,
                              if (c.age != null) c.age!,
                              c.sector(isAr),
                              '${_teams.length} ${isAr ? 'فريق' : 'teams'}',
                            ].where((s) => s.isNotEmpty).join(' · '),
                            style: TextStyle(color: AppColors.hint, fontSize: 12),
                          ),
                        ]),
                      ),
                      const SizedBox(height: 12),
                      Text(isAr ? '🗂️ المراحل' : '🗂️ Stages',
                          style: TextStyle(
                              color: AppColors.aqua,
                              fontWeight: FontWeight.bold,
                              fontSize: 14)),
                      const SizedBox(height: 8),
                      if (_stages.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 20),
                          child: Center(
                              child: Text(
                                  isAr
                                      ? 'لا توجد مراحل — أضف المرحلة الأولى'
                                      : 'No stages — add the first one',
                                  style: TextStyle(color: AppColors.hint))),
                        )
                      else
                        for (final s in _stages)
                          _StageCard(
                            api: _api,
                            token: _token,
                            stage: s,
                            teams: _teams,
                            onChanged: _load,
                          ),
                    ],
                  ),
                ),
    );
  }
}

class _StageCard extends StatelessWidget {
  final AdminApi api;
  final String token;
  final MStage stage;
  final List<MTeam> teams;
  final VoidCallback onChanged;
  const _StageCard({
    required this.api,
    required this.token,
    required this.stage,
    required this.teams,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(children: [
        Row(children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.darkBg,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text('${stage.stageOrder}',
                style: TextStyle(
                    color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 12)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(stage.name(isAr),
                  style: TextStyle(
                      color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 13.5)),
              Text(
                [
                  stageTypeLabel(stage.type, isAr),
                  '${stage.matchCount} ${isAr ? 'مباراة' : 'matches'}',
                  if (stage.type != 'knockout')
                    (stage.carriesPoints
                        ? (isAr ? 'بترحيل النقاط' : 'carries points')
                        : (isAr ? 'يبدأ من الصفر' : 'starts fresh')),
                ].join(' · '),
                style: TextStyle(color: AppColors.hint, fontSize: 11),
              ),
            ]),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () async {
              final ok = await showSheet<bool>(
                  context,
                  _StageEditor(
                      api: api, token: token, cid: stage.competitionId, stage: stage));
              if (ok == true) onChanged();
            },
            icon: Icon(Icons.edit, color: AppColors.aqua, size: 18),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () async {
              if (!await _confirm(
                  context,
                  isAr ? 'حذف المرحلة' : 'Delete stage',
                  isAr ? 'حذف مرحلة «${stage.name(true)}»؟' : 'Delete "${stage.name(false)}"?')) {
                return;
              }
              try {
                await api.deleteStage(token, stage.id);
                onChanged();
              } catch (e) {
                if (context.mounted && !handleAdminError(context, e)) {
                  showAdminError(context, e);
                }
              }
            },
            icon: Icon(Icons.delete_outline, color: AppColors.red, size: 18),
          ),
        ]),
        if (stage.type != 'knockout') ...[
          const Divider(height: 18),
          _GroupsBlock(
            api: api,
            token: token,
            stage: stage,
            teams: teams,
            onChanged: onChanged,
          ),
        ],
      ]),
    );
  }
}

class _GroupsBlock extends StatefulWidget {
  final AdminApi api;
  final String token;
  final MStage stage;
  final List<MTeam> teams;
  final VoidCallback onChanged;
  const _GroupsBlock({
    required this.api,
    required this.token,
    required this.stage,
    required this.teams,
    required this.onChanged,
  });

  @override
  State<_GroupsBlock> createState() => _GroupsBlockState();
}

class _GroupsBlockState extends State<_GroupsBlock> {
  bool _adding = false;
  final _name = TextEditingController();
  int? _openGroup;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  String get _token => widget.token;

  Future<void> _addGroup() async {
    if (_name.text.trim().isEmpty) return;
    try {
      await widget.api.createGroup(_token, widget.stage.id, {'name_ar': _name.text.trim()});
      _name.clear();
      setState(() => _adding = false);
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  Future<void> _moveGroup(int gid, String direction) async {
    try {
      await widget.api.moveGroup(_token, gid, direction);
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text(isAr ? 'المجموعات' : 'Groups',
            style: TextStyle(
                color: AppColors.teal, fontSize: 11.5, fontWeight: FontWeight.bold)),
        const Spacer(),
        if (!_adding)
          TextButton(
            onPressed: () => setState(() => _adding = true),
            style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
            child: Text(isAr ? '+ مجموعة' : '+ Group', style: const TextStyle(fontSize: 12)),
          ),
      ]),
      if (_adding)
        Row(children: [
          Expanded(
            child: TextField(
              controller: _name,
              style: _ts(),
              decoration: sDec(isAr ? 'اسم المجموعة (مثال: 2A)' : 'Group name (e.g. 2A)'),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: _addGroup,
            style: FilledButton.styleFrom(backgroundColor: AppColors.aqua),
            child: Text(isAr ? 'حفظ' : 'Save'),
          ),
          TextButton(
            onPressed: () {
              _name.clear();
              setState(() => _adding = false);
            },
            child: Text(isAr ? 'إلغاء' : 'Cancel'),
          ),
        ]),
      if (widget.stage.groups.isEmpty && !_adding)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Text(
              isAr ? 'بدون مجموعات — جدول واحد لكل الفرق' : 'No groups — one table for all teams',
              style: TextStyle(color: AppColors.hint, fontSize: 11)),
        ),
      for (final g in widget.stage.groups)
        Container(
          margin: const EdgeInsets.only(top: 6),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: AppColors.darkBg.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(children: [
            Row(children: [
              Expanded(
                child: InkWell(
                  onTap: () =>
                      setState(() => _openGroup = _openGroup == g.id ? null : g.id),
                  child: Row(children: [
                    Icon(_openGroup == g.id ? Icons.expand_more : Icons.chevron_right,
                        color: AppColors.aqua, size: 18),
                    const SizedBox(width: 4),
                    Text(g.name(isAr),
                        style: TextStyle(
                            color: AppColors.white, fontSize: 12.5, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 6),
                    Text('(${g.teamCount})',
                        style: TextStyle(color: AppColors.hint, fontSize: 11)),
                  ]),
                ),
              ),
              // Reorder — the standings + public group lists follow this order.
              IconButton(
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                tooltip: isAr ? 'أعلى' : 'Up',
                onPressed: widget.stage.groups.indexOf(g) == 0
                    ? null
                    : () => _moveGroup(g.id, 'up'),
                icon: Icon(Icons.keyboard_arrow_up, size: 20,
                    color: widget.stage.groups.indexOf(g) == 0 ? AppColors.hint : AppColors.aqua),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                tooltip: isAr ? 'أسفل' : 'Down',
                onPressed: widget.stage.groups.indexOf(g) >= widget.stage.groups.length - 1
                    ? null
                    : () => _moveGroup(g.id, 'down'),
                icon: Icon(Icons.keyboard_arrow_down, size: 20,
                    color: widget.stage.groups.indexOf(g) >= widget.stage.groups.length - 1
                        ? AppColors.hint : AppColors.aqua),
              ),
              InkWell(
                onTap: () async {
                  if (!await _confirm(
                      context,
                      isAr ? 'حذف المجموعة' : 'Delete group',
                      isAr
                          ? 'حذف مجموعة «${g.name(true)}» و${g.teamCount} فريق منها؟'
                          : 'Delete group "${g.name(false)}" and its ${g.teamCount} teams?')) {
                    return;
                  }
                  try {
                    await widget.api.deleteGroup(_token, g.id);
                    widget.onChanged();
                  } catch (e) {
                    if (context.mounted && !handleAdminError(context, e)) {
                      showAdminError(context, e);
                    }
                  }
                },
                child: Text(isAr ? 'حذف' : 'Delete',
                    style: TextStyle(color: AppColors.red, fontSize: 11, fontWeight: FontWeight.bold)),
              ),
            ]),
            if (_openGroup == g.id)
              _GroupTeams(
                api: widget.api,
                token: _token,
                group: g,
                compTeams: widget.teams,
                onChanged: widget.onChanged,
              ),
          ]),
        ),
    ]);
  }
}

class _GroupTeams extends StatefulWidget {
  final AdminApi api;
  final String token;
  final MGroup group;
  final List<MTeam> compTeams;
  final VoidCallback onChanged;
  const _GroupTeams({
    required this.api,
    required this.token,
    required this.group,
    required this.compTeams,
    required this.onChanged,
  });

  @override
  State<_GroupTeams> createState() => _GroupTeamsState();
}

class _GroupTeamsState extends State<_GroupTeams> {
  bool _loading = true;
  bool _adding = false;
  List<MGroupTeam> _items = const [];
  final Set<int> _selected = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final v = await widget.api.groupTeams(widget.token, widget.group.id);
      if (!mounted) return;
      setState(() {
        _items = v;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  Future<void> _addSelected() async {
    if (_selected.isEmpty) return;
    setState(() => _adding = true);
    try {
      await widget.api.addGroupTeams(widget.token, widget.group.id, _selected.toList());
      if (!mounted) return;
      _selected.clear();
      await _load();
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  Future<void> _remove(MGroupTeam t) async {
    try {
      await widget.api.removeGroupTeam(widget.token, t.groupTeamId);
      if (!mounted) return;
      await _load();
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final taken = _items.map((e) => e.id).toSet();
    final available = widget.compTeams.where((t) => !taken.contains(t.id)).toList();
    final allSelected =
        available.isNotEmpty && available.every((t) => _selected.contains(t.id));
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(children: [
        if (available.isNotEmpty)
          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(children: [
              // Select-all row.
              InkWell(
                onTap: () => setState(() {
                  if (allSelected) {
                    _selected.clear();
                  } else {
                    _selected.addAll(available.map((t) => t.id));
                  }
                }),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Row(children: [
                    Icon(allSelected ? Icons.check_box : Icons.check_box_outline_blank,
                        size: 18, color: AppColors.aqua),
                    const SizedBox(width: 8),
                    Text(isAr ? 'تحديد الكل (${available.length})' : 'Select all (${available.length})',
                        style: TextStyle(color: AppColors.hint, fontSize: 11, fontWeight: FontWeight.bold)),
                  ]),
                ),
              ),
              const Divider(height: 1),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 220),
                child: ListView(
                  shrinkWrap: true,
                  padding: EdgeInsets.zero,
                  children: [
                    for (final t in available)
                      InkWell(
                        onTap: () => setState(() => _selected.contains(t.id)
                            ? _selected.remove(t.id)
                            : _selected.add(t.id)),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                          child: Row(children: [
                            Icon(
                                _selected.contains(t.id)
                                    ? Icons.check_box
                                    : Icons.check_box_outline_blank,
                                size: 18,
                                color: _selected.contains(t.id) ? AppColors.aqua : AppColors.hint),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                  t.nameAr?.isNotEmpty == true ? t.nameAr! : t.clubName,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: AppColors.white, fontSize: 12.5)),
                            ),
                          ]),
                        ),
                      ),
                  ],
                ),
              ),
              const Divider(height: 1),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: (_adding || _selected.isEmpty) ? null : _addSelected,
                  style: FilledButton.styleFrom(
                      backgroundColor: AppColors.aqua, visualDensity: VisualDensity.compact),
                  child: Text(_adding
                      ? '…'
                      : (isAr ? '+ إضافة المحدد (${_selected.length})' : '+ Add selected (${_selected.length})')),
                ),
              ),
            ]),
          ),
        if (_loading)
          const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator())
        else if (_items.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(isAr ? 'لا توجد فرق في المجموعة' : 'No teams in this group',
                style: TextStyle(color: AppColors.hint, fontSize: 11)),
          )
        else
          for (final t in _items)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.cardBg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(children: [
                Expanded(
                  child: Text(t.label(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: AppColors.white, fontSize: 12)),
                ),
                InkWell(
                  onTap: () => _remove(t),
                  child: Text(isAr ? 'إزالة' : 'Remove',
                      style: TextStyle(color: AppColors.red, fontSize: 11, fontWeight: FontWeight.bold)),
                ),
              ]),
            ),
      ]),
    );
  }
}

class _StageEditor extends StatefulWidget {
  final AdminApi api;
  final String token;
  final int cid;
  final MStage? stage;
  const _StageEditor({
    required this.api,
    required this.token,
    required this.cid,
    this.stage,
  });

  @override
  State<_StageEditor> createState() => _StageEditorState();
}

class _StageEditorState extends State<_StageEditor> {
  late final TextEditingController _nameAr;
  late final TextEditingController _nameEn;
  late String _type;
  late bool _carries;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final s = widget.stage;
    _nameAr = TextEditingController(text: s?.nameAr ?? '');
    _nameEn = TextEditingController(text: s?.nameEn ?? '');
    _type = s?.type ?? 'league';
    _carries = s?.carriesPoints ?? true;
  }

  @override
  void dispose() {
    _nameAr.dispose();
    _nameEn.dispose();
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
      'type': _type,
      'carries_points': _carries,
    };
    try {
      if (widget.stage == null) {
        await widget.api.createStage(widget.token, widget.cid, body);
      } else {
        await widget.api.updateStage(widget.token, widget.stage!.id, body);
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
          widget.stage == null
              ? (isAr ? 'مرحلة جديدة' : 'New stage')
              : (isAr ? 'تعديل المرحلة' : 'Edit stage'),
          style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
      const SizedBox(height: 14),
      sLabel(isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'),
      TextField(controller: _nameAr, style: _ts(), decoration: sDec(isAr ? 'الدوري' : 'League')),
      const SizedBox(height: 10),
      sLabel(isAr ? 'الاسم (إنجليزي)' : 'Name (English)'),
      TextField(controller: _nameEn, style: _ts(), decoration: sDec()),
      const SizedBox(height: 10),
      sLabel(isAr ? 'النوع *' : 'Type *'),
      DropdownButtonFormField<String>(
        initialValue: _type,
        isExpanded: true,
        dropdownColor: AppColors.cardBg,
        style: TextStyle(color: AppColors.white, fontSize: 13),
        decoration: sDec(),
        items: [
          for (final t in stageTypes)
            DropdownMenuItem(value: t, child: Text(stageTypeLabel(t, isAr))),
        ],
        onChanged: (v) => setState(() => _type = v ?? 'league'),
      ),
      if (_type != 'knockout') ...[
        const SizedBox(height: 6),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          activeThumbColor: AppColors.aqua,
          value: _carries,
          onChanged: (v) => setState(() => _carries = v),
          title: Text(isAr ? 'ترحيل النقاط والأهداف' : 'Carry points & goals over',
              style: TextStyle(color: AppColors.white, fontSize: 14)),
          subtitle: Text(
              isAr
                  ? 'مُفعّل = الفرق تكمل بنقاطها · غير مُفعّل = تبدأ من الصفر'
                  : 'On = teams keep points · Off = table starts fresh',
              style: TextStyle(color: AppColors.hint, fontSize: 11)),
        ),
      ],
      const SizedBox(height: 14),
      SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: _busy ? null : _save,
          style: FilledButton.styleFrom(
              backgroundColor: AppColors.aqua,
              padding: const EdgeInsets.symmetric(vertical: 14)),
          child: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text(isAr ? 'حفظ' : 'Save', style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
      ),
      const SizedBox(height: 8),
    ]);
  }
}
