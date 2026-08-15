import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/match_entry.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_competition_select.dart';
import 'admin_error.dart';
import 'admin_matches_screen.dart';

/// Matches tab — pick a competition with the Season → Competition → Stage
/// cascade (defaulting to the active season), then open its match list. Mirrors
/// the website's MatchesEntry competition picker.
class AdminCompetitionsTab extends StatefulWidget {
  const AdminCompetitionsTab({super.key});

  @override
  State<AdminCompetitionsTab> createState() => _AdminCompetitionsTabState();
}

class _AdminCompetitionsTabState extends State<AdminCompetitionsTab> {
  final _api = AdminApi();
  bool _loading = true;
  String? _error;
  List<EntryCompetition> _comps = const [];
  String? _activeSeason;
  int? _selectedId;

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
      final comps = await _api.competitions(token);
      // Find the active season name so the picker can default to it. Failing
      // that (e.g. clerks without season access), fall back to newest.
      String? active;
      try {
        final seasons = await _api.seasons(token);
        final a = seasons.where((s) => s.isActive).toList();
        if (a.isNotEmpty) active = a.first.name(true);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _comps = comps;
        _activeSeason = active;
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

  void _open() {
    final comp = _comps.where((c) => c.id == _selectedId).toList();
    if (comp.isEmpty) return;
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => AdminMatchesScreen(competition: comp.first)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final locale = isAr ? 'ar' : 'en';

    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.error_outline, color: AppColors.hint, size: 40),
            const SizedBox(height: 12),
            Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: AppColors.white)),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: _load, child: const Text('Retry')),
          ]),
        ),
      );
    }
    if (_comps.isEmpty) {
      return Center(
          child: Text(isAr ? 'لا توجد بطولات' : 'No competitions',
              style: TextStyle(color: AppColors.hint)));
    }

    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Text(isAr ? 'اختر البطولة' : 'Select competition',
            style: TextStyle(color: AppColors.teal, fontSize: 12, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        AdminCompetitionSelect(
          options: [
            for (final c in _comps)
              CompOption(
                id: c.id,
                season: c.season,
                name: c.getName(locale),
                age: c.age,
                sector: c.getSector(locale),
              ),
          ],
          value: _selectedId,
          preferredSeason: _activeSeason,
          onChanged: (id) => setState(() => _selectedId = id),
        ),
        const SizedBox(height: 16),
        if (_selectedId != null)
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _open,
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.aqua,
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              icon: const Icon(Icons.sports_soccer),
              label: Text(isAr ? 'فتح المباريات' : 'Open matches',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
      ],
    );
  }
}
