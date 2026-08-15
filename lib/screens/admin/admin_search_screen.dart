import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/structure_models.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_club_screen.dart';
import 'admin_error.dart';
import 'admin_team_screen.dart';

/// Global admin search — mirrors the website's AdminSearchOverlay. Searches
/// clubs, teams, players and coaches, then opens the matching management screen.
class AdminSearchScreen extends StatefulWidget {
  const AdminSearchScreen({super.key});

  @override
  State<AdminSearchScreen> createState() => _AdminSearchScreenState();
}

class _AdminSearchScreenState extends State<AdminSearchScreen> {
  final _api = AdminApi();
  final _q = TextEditingController();
  Timer? _debounce;
  bool _searching = false;
  bool _opening = false;
  AdminSearchResults? _results;

  String get _token => context.read<AdminAuth>().token ?? '';

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  void _onSearch(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() => _results = null);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      setState(() => _searching = true);
      try {
        final r = await _api.adminSearch(_token, q.trim());
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

  // Fetch the full entity, then open its management screen.
  Future<void> _open(Future<Widget> Function() build) async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      final screen = await build();
      if (!mounted) return;
      setState(() => _opening = false);
      await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    } catch (e) {
      if (!mounted) return;
      setState(() => _opening = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  void _openTeam(int teamId, int tab) =>
      _open(() async => AdminTeamScreen(team: await _api.team(_token, teamId), initialTab: tab));

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final r = _results;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _q,
          autofocus: true,
          onChanged: _onSearch,
          style: TextStyle(color: AppColors.white, fontSize: 15),
          decoration: InputDecoration(
            border: InputBorder.none,
            hintText: isAr ? 'ابحث عن نادٍ أو فريق أو لاعب أو مدرّب…' : 'Search clubs, teams, players, coaches…',
            hintStyle: TextStyle(color: AppColors.hint, fontSize: 14),
          ),
        ),
        actions: [
          if (_searching)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                  child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))),
            )
          else if (_q.text.isNotEmpty)
            IconButton(
              icon: Icon(Icons.clear, color: AppColors.hint),
              onPressed: () {
                _q.clear();
                setState(() => _results = null);
              },
            ),
        ],
      ),
      body: Stack(children: [
        if (r == null)
          Center(
            child: Text(isAr ? 'اكتب حرفين على الأقل للبحث' : 'Type at least 2 characters',
                style: TextStyle(color: AppColors.hint)),
          )
        else if (r.isEmpty)
          Center(child: Text(isAr ? 'لا نتائج' : 'No results', style: TextStyle(color: AppColors.hint)))
        else
          ListView(
            padding: const EdgeInsets.all(12),
            children: [
              if (r.clubs.isNotEmpty) _group(isAr ? 'الأندية' : 'Clubs'),
              for (final c in r.clubs)
                _tile(
                  icon: Icons.shield,
                  title: c.name,
                  subtitle: c.city ?? '',
                  onTap: () => _open(() async => AdminClubScreen(club: await _api.club(_token, c.id))),
                ),
              if (r.teams.isNotEmpty) _group(isAr ? 'الفرق' : 'Teams'),
              for (final t in r.teams)
                _tile(
                  icon: Icons.groups,
                  title: t.name,
                  subtitle: '',
                  onTap: () => _openTeam(t.id, 1),
                ),
              if (r.players.isNotEmpty) _group(isAr ? 'اللاعبون' : 'Players'),
              for (final p in r.players)
                _tile(
                  icon: Icons.person,
                  title: p.name,
                  subtitle: [if (p.club != null) p.club!, if (p.birthYear != null) '${p.birthYear}']
                      .join(' · '),
                  disabled: p.teamId == null,
                  disabledNote: isAr ? 'بدون فريق' : 'No team',
                  onTap: p.teamId == null ? null : () => _openTeam(p.teamId!, 1),
                ),
              if (r.coaches.isNotEmpty) _group(isAr ? 'المدرّبون' : 'Coaches'),
              for (final c in r.coaches)
                _tile(
                  icon: Icons.sports,
                  title: c.name,
                  subtitle: [if (c.role != null) c.role!, if (c.club != null) c.club!].join(' · '),
                  disabled: c.teamId == null,
                  disabledNote: isAr ? 'بدون فريق' : 'No team',
                  onTap: c.teamId == null ? null : () => _openTeam(c.teamId!, 0),
                ),
              const SizedBox(height: 24),
            ],
          ),
        if (_opening)
          Container(
            color: Colors.black.withValues(alpha: 0.3),
            child: const Center(child: CircularProgressIndicator()),
          ),
      ]),
    );
  }

  Widget _group(String label) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 12, 4, 6),
        child: Text(label,
            style: TextStyle(color: AppColors.hint, fontSize: 12, fontWeight: FontWeight.bold)),
      );

  Widget _tile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback? onTap,
    bool disabled = false,
    String? disabledNote,
  }) {
    return Opacity(
      opacity: disabled ? 0.5 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: ListTile(
          leading: Icon(icon, color: AppColors.aqua),
          title: Text(title, style: TextStyle(color: AppColors.white, fontSize: 14)),
          subtitle: subtitle.isEmpty
              ? null
              : Text(subtitle, style: TextStyle(color: AppColors.hint, fontSize: 12)),
          trailing: disabled
              ? Text(disabledNote ?? '', style: TextStyle(color: AppColors.hint, fontSize: 11))
              : Icon(Icons.chevron_right, color: AppColors.aqua, size: 20),
          onTap: onTap,
        ),
      ),
    );
  }
}
