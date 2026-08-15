import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/match_entry.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';
import 'admin_widgets.dart';

/// Create a fixture in a competition. Mirrors the web NewMatchForm (league
/// case): pick the two teams, date/time, week, venue and status.
class AdminNewMatchScreen extends StatefulWidget {
  final EntryCompetition competition;
  final List<EntryTeam> teams;
  const AdminNewMatchScreen(
      {super.key, required this.competition, required this.teams});

  @override
  State<AdminNewMatchScreen> createState() => _AdminNewMatchScreenState();
}

class _AdminNewMatchScreenState extends State<AdminNewMatchScreen> {
  final _api = AdminApi();
  int? _homeId;
  int? _awayId;
  DateTime _date = DateTime.now();
  TimeOfDay _time = const TimeOfDay(hour: 18, minute: 0);
  bool _tbd = false;
  final _week = TextEditingController();
  final _venue = TextEditingController();
  String _status = 'scheduled';
  bool _busy = false;

  @override
  void dispose() {
    _week.dispose();
    _venue.dispose();
    super.dispose();
  }

  String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String get _hm =>
      '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    final token = context.read<AdminAuth>().token;
    if (token == null) return;
    if (_homeId == null || _awayId == null) {
      showAdminError(context, isAr ? 'اختر الفريقين' : 'Pick both teams');
      return;
    }
    if (_homeId == _awayId) {
      showAdminError(
          context, isAr ? 'الفريقان متطابقان' : 'Teams must differ');
      return;
    }
    setState(() => _busy = true);
    try {
      await _api.createMatch(token, widget.competition.id, {
        'home_team_id': _homeId,
        'away_team_id': _awayId,
        'date': _tbd ? '' : _ymd(_date),
        'time': _tbd ? '' : _hm,
        'week': _week.text.trim(),
        'venue': _venue.text.trim(),
        'status': _status,
      });
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final locale = isAr ? 'ar' : 'en';
    final teamItems = [
      for (final t in widget.teams)
        DropdownMenuItem(value: t.id, child: Text(t.getName(locale))),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(isAr ? 'مباراة جديدة' : 'New match')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AdminField(
            label: isAr ? 'الفريق المضيف' : 'Home team',
            child: DropdownButtonFormField<int>(
              initialValue: _homeId,
              isExpanded: true,
              dropdownColor: AppColors.cardBg,
              decoration: adminInputDecoration(),
              items: teamItems,
              onChanged: (v) => setState(() => _homeId = v),
            ),
          ),
          AdminField(
            label: isAr ? 'الفريق الضيف' : 'Away team',
            child: DropdownButtonFormField<int>(
              initialValue: _awayId,
              isExpanded: true,
              dropdownColor: AppColors.cardBg,
              decoration: adminInputDecoration(),
              items: teamItems,
              onChanged: (v) => setState(() => _awayId = v),
            ),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(isAr ? 'موعد غير محدد' : 'Date TBD',
                style: TextStyle(color: AppColors.white, fontSize: 14)),
            value: _tbd,
            activeThumbColor: AppColors.aqua,
            onChanged: (v) => setState(() => _tbd = v),
          ),
          if (!_tbd)
            Row(children: [
              Expanded(
                child: AdminField(
                  label: isAr ? 'التاريخ' : 'Date',
                  child: _PickerTile(
                    text: _ymd(_date),
                    icon: Icons.calendar_today,
                    onTap: () async {
                      final d = await showDatePicker(
                        context: context,
                        initialDate: _date,
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
                  child: _PickerTile(
                    text: _hm,
                    icon: Icons.access_time,
                    onTap: () async {
                      final t = await showTimePicker(
                          context: context, initialTime: _time);
                      if (t != null) setState(() => _time = t);
                    },
                  ),
                ),
              ),
            ]),
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
            ),
          ]),
          AdminField(
            label: isAr ? 'الملعب' : 'Venue',
            child: TextField(
              controller: _venue,
              style: TextStyle(color: AppColors.white),
              decoration: adminInputDecoration(),
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _busy ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.aqua,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : Text(isAr ? 'إنشاء المباراة' : 'Create match',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
    );
  }
}

class _PickerTile extends StatelessWidget {
  final String text;
  final IconData icon;
  final VoidCallback onTap;
  const _PickerTile(
      {required this.text, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
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
          Text(text, style: TextStyle(color: AppColors.white, fontSize: 13.5)),
        ]),
      ),
    );
  }
}
