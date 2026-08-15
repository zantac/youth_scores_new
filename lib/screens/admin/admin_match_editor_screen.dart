import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/match_entry.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';
import 'admin_widgets.dart';

/// Edit an existing match: score, status, schedule, venue, note, plus goals and
/// cards. Mirrors the core of the web MatchEditor. (Subs / shootout / line-up
/// are a later increment.)
class AdminMatchEditorScreen extends StatefulWidget {
  final EntryMatch initial;
  final List<EntryTeam> teams;
  const AdminMatchEditorScreen(
      {super.key, required this.initial, required this.teams});

  @override
  State<AdminMatchEditorScreen> createState() => _AdminMatchEditorScreenState();
}

class _AdminMatchEditorScreenState extends State<AdminMatchEditorScreen> {
  final _api = AdminApi();
  late EntryMatch _m;

  final _home = TextEditingController();
  final _away = TextEditingController();
  final _homePen = TextEditingController();
  final _awayPen = TextEditingController();
  final _week = TextEditingController();
  final _venue = TextEditingController();
  final _note = TextEditingController();
  late String _status;
  DateTime? _date;
  TimeOfDay? _time;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _m = widget.initial;
    _home.text = _m.row.homeScore?.toString() ?? '';
    _away.text = _m.row.awayScore?.toString() ?? '';
    _homePen.text = _m.homePenaltyScore?.toString() ?? '';
    _awayPen.text = _m.awayPenaltyScore?.toString() ?? '';
    _week.text = _m.row.week;
    _venue.text = _m.venue;
    _note.text = _m.note;
    _status = _m.row.status;
    _date = _parseDate(_m.row.date);
    _time = _parseTime(_m.row.time);
  }

  @override
  void dispose() {
    for (final c in [_home, _away, _homePen, _awayPen, _week, _venue, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  DateTime? _parseDate(String s) {
    final p = s.split('-');
    if (p.length != 3) return null;
    final y = int.tryParse(p[0]), m = int.tryParse(p[1]), d = int.tryParse(p[2]);
    if (y == null || m == null || d == null) return null;
    return DateTime(y, m, d);
  }

  TimeOfDay? _parseTime(String s) {
    final p = s.split(':');
    if (p.length < 2) return null;
    final h = int.tryParse(p[0]), m = int.tryParse(p[1]);
    if (h == null || m == null) return null;
    return TimeOfDay(hour: h, minute: m);
  }

  String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String _hm(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  int? _num(TextEditingController c) =>
      c.text.trim().isEmpty ? null : int.tryParse(c.text.trim());

  int _teamIdForSide(String side) =>
      side == 'home' ? _m.row.home.id : _m.row.away.id;

  Future<void> _run(Future<EntryMatch> Function() action) async {
    setState(() => _busy = true);
    try {
      final m = await action();
      if (!mounted) return;
      setState(() => _m = m);
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveCore() async {
    final token = context.read<AdminAuth>().token;
    if (token == null) return;
    final body = <String, dynamic>{
      'home_score': _num(_home),
      'away_score': _num(_away),
      'home_penalty_score': _num(_homePen),
      'away_penalty_score': _num(_awayPen),
      'status': _status,
      'week': _week.text.trim(),
      'venue': _venue.text.trim(),
      'note': _note.text.trim(),
      'date': _date == null ? '' : _ymd(_date!),
      'time': _date == null || _time == null ? '' : _hm(_time!),
    };
    await _run(() => _api.updateMatch(token, _m.id, body));
    if (mounted) {
      final isAr = context.read<AppProvider>().locale == 'ar';
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(isAr ? 'تم الحفظ' : 'Saved')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final locale = isAr ? 'ar' : 'en';

    return Scaffold(
      appBar: AppBar(
        title: Text(isAr ? 'تعديل المباراة' : 'Edit match'),
        actions: [
          if (_busy)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                  child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('${_m.row.home.getName(locale)}  ×  ${_m.row.away.getName(locale)}',
              style: TextStyle(
                  color: AppColors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          // ── Score + status ────────────────────────────────────────────────
          Row(children: [
            Expanded(child: _scoreField(_home, isAr ? 'المضيف' : 'Home')),
            const SizedBox(width: 10),
            Expanded(child: _scoreField(_away, isAr ? 'الضيف' : 'Away')),
          ]),
          AdminField(
            label: isAr ? 'الحالة' : 'Status',
            child: DropdownButtonFormField<String>(
              initialValue: _status,
              isExpanded: true,
              dropdownColor: AppColors.cardBg,
              decoration: adminInputDecoration(),
              items: [
                for (final s in MatchStatus.all)
                  DropdownMenuItem(
                      value: s.value, child: Text(isAr ? s.ar : s.en)),
              ],
              onChanged: (v) => setState(() => _status = v ?? 'scheduled'),
            ),
          ),
          Row(children: [
            Expanded(child: _scoreField(_homePen, isAr ? 'ترجيح المضيف' : 'Pen. home')),
            const SizedBox(width: 10),
            Expanded(child: _scoreField(_awayPen, isAr ? 'ترجيح الضيف' : 'Pen. away')),
          ]),
          // ── Schedule ──────────────────────────────────────────────────────
          Row(children: [
            Expanded(
              child: AdminField(
                label: isAr ? 'التاريخ' : 'Date',
                child: _picker(
                  _date == null ? (isAr ? 'غير محدد' : 'TBD') : _ymd(_date!),
                  Icons.calendar_today,
                  () async {
                    final d = await showDatePicker(
                      context: context,
                      initialDate: _date ?? DateTime.now(),
                      firstDate: DateTime(2015),
                      lastDate: DateTime(2100),
                    );
                    if (d != null) setState(() => _date = d);
                  },
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AdminField(
                label: isAr ? 'الوقت' : 'Time',
                child: _picker(
                  _time == null ? '—' : _hm(_time!),
                  Icons.access_time,
                  () async {
                    final t = await showTimePicker(
                        context: context,
                        initialTime: _time ?? const TimeOfDay(hour: 18, minute: 0));
                    if (t != null) setState(() => _time = t);
                  },
                ),
              ),
            ),
          ]),
          if (_date != null)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: () => setState(() {
                  _date = null;
                  _time = null;
                }),
                icon: Icon(Icons.clear, size: 16, color: AppColors.hint),
                label: Text(isAr ? 'مسح التاريخ' : 'Clear date',
                    style: TextStyle(color: AppColors.hint, fontSize: 12)),
              ),
            ),
          Row(children: [
            Expanded(
              child: AdminField(
                label: isAr ? 'الجولة' : 'Week',
                child: TextField(
                  controller: _week,
                  keyboardType: TextInputType.number,
                  style: TextStyle(color: AppColors.white),
                  decoration: adminInputDecoration(),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AdminField(
                label: isAr ? 'الملعب' : 'Venue',
                child: TextField(
                  controller: _venue,
                  style: TextStyle(color: AppColors.white),
                  decoration: adminInputDecoration(),
                ),
              ),
            ),
          ]),
          AdminField(
            label: isAr ? 'ملاحظة' : 'Note',
            child: TextField(
              controller: _note,
              maxLines: 2,
              style: TextStyle(color: AppColors.white),
              decoration: adminInputDecoration(),
            ),
          ),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _busy ? null : _saveCore,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.aqua,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              icon: const Icon(Icons.save),
              label: Text(isAr ? 'حفظ' : 'Save',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
          const SizedBox(height: 8),
          const Divider(),
          // ── Goals ─────────────────────────────────────────────────────────
          _sectionHeader(isAr ? 'الأهداف' : 'Goals',
              onAdd: () => _editGoal(null)),
          for (final g in _m.goals)
            _eventTile(
              side: g.side,
              locale: locale,
              main: g.scorer,
              sub: [
                if (g.assist != null && g.assist!.isNotEmpty)
                  (isAr ? 'صناعة ${g.assist}' : 'assist ${g.assist}'),
                if (g.isPenalty) (isAr ? 'ركلة جزاء' : 'pen'),
                if (g.isOwnGoal) (isAr ? 'عكسية' : 'OG'),
              ].join(' · '),
              minute: g.minute,
              onEdit: () => _editGoal(g),
              onDelete: () => _run(() =>
                  _api.deleteGoal(context.read<AdminAuth>().token!, g.id)),
            ),
          const SizedBox(height: 8),
          // ── Cards ─────────────────────────────────────────────────────────
          _sectionHeader(isAr ? 'البطاقات' : 'Cards',
              onAdd: () => _editCard(null)),
          for (final c in _m.cards)
            _eventTile(
              side: c.side,
              locale: locale,
              main: c.player,
              sub: _cardLabel(c.cardType, isAr),
              minute: c.minute,
              onEdit: () => _editCard(c),
              onDelete: () => _run(() =>
                  _api.deleteCard(context.read<AdminAuth>().token!, c.id)),
            ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  String _cardLabel(String type, bool isAr) {
    switch (type) {
      case 'red':
        return isAr ? 'حمراء' : 'Red';
      case 'second_yellow':
        return isAr ? 'صفراء ثانية' : '2nd yellow';
      default:
        return isAr ? 'صفراء' : 'Yellow';
    }
  }

  Widget _scoreField(TextEditingController c, String label) => AdminField(
        label: label,
        child: TextField(
          controller: c,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          style: TextStyle(
              color: AppColors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold),
          decoration: adminInputDecoration(),
        ),
      );

  Widget _picker(String text, IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(children: [
            Icon(icon, color: AppColors.aqua, size: 16),
            const SizedBox(width: 8),
            Expanded(
              child: Text(text,
                  style: TextStyle(color: AppColors.white, fontSize: 13.5)),
            ),
          ]),
        ),
      );

  Widget _sectionHeader(String label, {required VoidCallback onAdd}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(children: [
          Text(label,
              style: TextStyle(
                  color: AppColors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 15)),
          const Spacer(),
          TextButton.icon(
            onPressed: _busy ? null : onAdd,
            icon: Icon(Icons.add, size: 18, color: AppColors.aqua),
            label: Text('Add', style: TextStyle(color: AppColors.aqua)),
          ),
        ]),
      );

  Widget _eventTile({
    required String side,
    required String locale,
    required String main,
    required String sub,
    required int? minute,
    required VoidCallback onEdit,
    required VoidCallback onDelete,
  }) {
    final teamName =
        side == 'home' ? _m.row.home.getName(locale) : _m.row.away.getName(locale);
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 3),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(children: [
        if (minute != null)
          Container(
            margin: const EdgeInsets.only(right: 8),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.darkBg,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text("$minute'",
                style: TextStyle(color: AppColors.aqua, fontSize: 11)),
          ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(main.isEmpty ? '—' : main,
                  style: TextStyle(
                      color: AppColors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
              Text([teamName, if (sub.isNotEmpty) sub].join(' · '),
                  style: TextStyle(color: AppColors.hint, fontSize: 11)),
            ],
          ),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          icon: Icon(Icons.edit, size: 18, color: AppColors.teal),
          onPressed: _busy ? null : onEdit,
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          icon: const Icon(Icons.delete_outline, size: 18, color: Colors.redAccent),
          onPressed: _busy ? null : onDelete,
        ),
      ]),
    );
  }

  // ── Goal add/edit ───────────────────────────────────────────────────────
  Future<void> _editGoal(EntryGoal? goal) async {
    final token = context.read<AdminAuth>().token;
    if (token == null) return;
    final body = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.darkBg,
      builder: (_) => _GoalSheet(
        goal: goal,
        homeName: _m.row.home.getName(context.read<AppProvider>().locale),
        awayName: _m.row.away.getName(context.read<AppProvider>().locale),
      ),
    );
    if (body == null) return;
    final side = body.remove('side') as String;
    body['team_id'] = _teamIdForSide(side);
    await _run(() => goal == null
        ? _api.addGoal(token, _m.id, body)
        : _api.updateGoal(token, goal.id, body));
  }

  // ── Card add/edit ───────────────────────────────────────────────────────
  Future<void> _editCard(EntryCard? card) async {
    final token = context.read<AdminAuth>().token;
    if (token == null) return;
    final body = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.darkBg,
      builder: (_) => _CardSheet(
        card: card,
        homeName: _m.row.home.getName(context.read<AppProvider>().locale),
        awayName: _m.row.away.getName(context.read<AppProvider>().locale),
      ),
    );
    if (body == null) return;
    final side = body.remove('side') as String;
    body['team_id'] = _teamIdForSide(side);
    await _run(() => card == null
        ? _api.addCard(token, _m.id, body)
        : _api.updateCard(token, card.id, body));
  }
}

// ── Goal entry sheet ─────────────────────────────────────────────────────────
class _GoalSheet extends StatefulWidget {
  final EntryGoal? goal;
  final String homeName;
  final String awayName;
  const _GoalSheet(
      {required this.goal, required this.homeName, required this.awayName});

  @override
  State<_GoalSheet> createState() => _GoalSheetState();
}

class _GoalSheetState extends State<_GoalSheet> {
  late String _side;
  final _scorer = TextEditingController();
  final _assist = TextEditingController();
  final _minute = TextEditingController();
  bool _pen = false;
  bool _og = false;

  @override
  void initState() {
    super.initState();
    final g = widget.goal;
    _side = g?.side ?? 'home';
    _scorer.text = g?.scorer ?? '';
    _assist.text = g?.assist ?? '';
    _minute.text = g?.minute?.toString() ?? '';
    _pen = g?.isPenalty ?? false;
    _og = g?.isOwnGoal ?? false;
  }

  @override
  void dispose() {
    _scorer.dispose();
    _assist.dispose();
    _minute.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.read<AppProvider>().locale == 'ar';
    return _SheetScaffold(
      title: isAr ? 'هدف' : 'Goal',
      onSave: () {
        if (_scorer.text.trim().isEmpty) return;
        Navigator.pop(context, {
          'side': _side,
          'scorer': _scorer.text.trim(),
          'assist': _assist.text.trim().isEmpty ? null : _assist.text.trim(),
          'minute': _minute.text.trim().isEmpty
              ? null
              : int.tryParse(_minute.text.trim()),
          'is_penalty': _pen,
          'is_own_goal': _og,
        });
      },
      children: [
        _SideToggle(
            side: _side,
            homeName: widget.homeName,
            awayName: widget.awayName,
            onChanged: (s) => setState(() => _side = s)),
        AdminField(
          label: isAr ? 'الهدّاف' : 'Scorer',
          child: TextField(
              controller: _scorer,
              autofocus: true,
              style: TextStyle(color: AppColors.white),
              decoration: adminInputDecoration()),
        ),
        Row(children: [
          Expanded(
            child: AdminField(
              label: isAr ? 'صناعة' : 'Assist',
              child: TextField(
                  controller: _assist,
                  style: TextStyle(color: AppColors.white),
                  decoration: adminInputDecoration()),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: AdminField(
              label: isAr ? 'الدقيقة' : 'Minute',
              child: TextField(
                  controller: _minute,
                  keyboardType: TextInputType.number,
                  style: TextStyle(color: AppColors.white),
                  decoration: adminInputDecoration()),
            ),
          ),
        ]),
        Row(children: [
          Expanded(
            child: CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: AppColors.aqua,
              title: Text(isAr ? 'ركلة جزاء' : 'Penalty',
                  style: TextStyle(color: AppColors.white, fontSize: 13)),
              value: _pen,
              onChanged: (v) => setState(() => _pen = v ?? false),
            ),
          ),
          Expanded(
            child: CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: AppColors.aqua,
              title: Text(isAr ? 'عكسية' : 'Own goal',
                  style: TextStyle(color: AppColors.white, fontSize: 13)),
              value: _og,
              onChanged: (v) => setState(() => _og = v ?? false),
            ),
          ),
        ]),
      ],
    );
  }
}

// ── Card entry sheet ─────────────────────────────────────────────────────────
class _CardSheet extends StatefulWidget {
  final EntryCard? card;
  final String homeName;
  final String awayName;
  const _CardSheet(
      {required this.card, required this.homeName, required this.awayName});

  @override
  State<_CardSheet> createState() => _CardSheetState();
}

class _CardSheetState extends State<_CardSheet> {
  late String _side;
  late String _type;
  final _player = TextEditingController();
  final _minute = TextEditingController();

  @override
  void initState() {
    super.initState();
    final c = widget.card;
    _side = c?.side ?? 'home';
    _type = c?.cardType ?? 'yellow';
    _player.text = c?.player ?? '';
    _minute.text = c?.minute?.toString() ?? '';
  }

  @override
  void dispose() {
    _player.dispose();
    _minute.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.read<AppProvider>().locale == 'ar';
    return _SheetScaffold(
      title: isAr ? 'بطاقة' : 'Card',
      onSave: () {
        if (_player.text.trim().isEmpty) return;
        Navigator.pop(context, {
          'side': _side,
          'player': _player.text.trim(),
          'card_type': _type,
          'minute': _minute.text.trim().isEmpty
              ? null
              : int.tryParse(_minute.text.trim()),
        });
      },
      children: [
        _SideToggle(
            side: _side,
            homeName: widget.homeName,
            awayName: widget.awayName,
            onChanged: (s) => setState(() => _side = s)),
        AdminField(
          label: isAr ? 'اللاعب' : 'Player',
          child: TextField(
              controller: _player,
              autofocus: true,
              style: TextStyle(color: AppColors.white),
              decoration: adminInputDecoration()),
        ),
        Row(children: [
          Expanded(
            child: AdminField(
              label: isAr ? 'النوع' : 'Type',
              child: DropdownButtonFormField<String>(
                initialValue: _type,
                isExpanded: true,
                dropdownColor: AppColors.cardBg,
                decoration: adminInputDecoration(),
                items: [
                  DropdownMenuItem(value: 'yellow', child: Text(isAr ? 'صفراء' : 'Yellow')),
                  DropdownMenuItem(
                      value: 'second_yellow', child: Text(isAr ? 'صفراء ثانية' : '2nd yellow')),
                  DropdownMenuItem(value: 'red', child: Text(isAr ? 'حمراء' : 'Red')),
                ],
                onChanged: (v) => setState(() => _type = v ?? 'yellow'),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: AdminField(
              label: isAr ? 'الدقيقة' : 'Minute',
              child: TextField(
                  controller: _minute,
                  keyboardType: TextInputType.number,
                  style: TextStyle(color: AppColors.white),
                  decoration: adminInputDecoration()),
            ),
          ),
        ]),
      ],
    );
  }
}

// ── Shared sheet chrome ──────────────────────────────────────────────────────
class _SheetScaffold extends StatelessWidget {
  final String title;
  final VoidCallback onSave;
  final List<Widget> children;
  const _SheetScaffold(
      {required this.title, required this.onSave, required this.children});

  @override
  Widget build(BuildContext context) {
    final isAr = context.read<AppProvider>().locale == 'ar';
    return Padding(
      padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Text(title,
                style: TextStyle(
                    color: AppColors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16)),
            const Spacer(),
            IconButton(
                onPressed: () => Navigator.pop(context),
                icon: Icon(Icons.close, color: AppColors.hint)),
          ]),
          ...children,
          const SizedBox(height: 8),
          FilledButton(
            onPressed: onSave,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.aqua,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: Text(isAr ? 'حفظ' : 'Save',
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}

class _SideToggle extends StatelessWidget {
  final String side;
  final String homeName;
  final String awayName;
  final ValueChanged<String> onChanged;
  const _SideToggle(
      {required this.side,
      required this.homeName,
      required this.awayName,
      required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(children: [
        Expanded(child: _btn('home', homeName)),
        const SizedBox(width: 8),
        Expanded(child: _btn('away', awayName)),
      ]),
    );
  }

  Widget _btn(String s, String label) {
    final active = side == s;
    return InkWell(
      onTap: () => onChanged(s),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.aqua.withValues(alpha: 0.15) : AppColors.cardBg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: active ? AppColors.aqua : AppColors.border),
        ),
        child: Text(label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
                color: active ? AppColors.aqua : AppColors.hint,
                fontWeight: FontWeight.bold,
                fontSize: 12.5)),
      ),
    );
  }
}
