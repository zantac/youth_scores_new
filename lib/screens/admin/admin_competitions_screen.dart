import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/match_entry.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';
import 'admin_matches_screen.dart';

/// Pick a competition to enter matches for. Groups the admin's competitions by
/// season. Mirrors the CompetitionSelect at the top of the web MatchesEntry.
class AdminCompetitionsScreen extends StatefulWidget {
  const AdminCompetitionsScreen({super.key});

  @override
  State<AdminCompetitionsScreen> createState() =>
      _AdminCompetitionsScreenState();
}

class _AdminCompetitionsScreenState extends State<AdminCompetitionsScreen> {
  final _api = AdminApi();
  bool _loading = true;
  String? _error;
  List<EntryCompetition> _comps = const [];

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
      final c = await _api.competitions(token);
      if (!mounted) return;
      setState(() {
        _comps = c;
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
    final locale = isAr ? 'ar' : 'en';

    // Preserve encounter order but group under season headers.
    final bySeason = <String, List<EntryCompetition>>{};
    for (final c in _comps) {
      (bySeason[c.season] ??= []).add(c);
    }

    return Scaffold(
      appBar: AppBar(title: Text(isAr ? 'اختر البطولة' : 'Select competition')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(message: _error!, onRetry: _load)
              : _comps.isEmpty
                  ? Center(
                      child: Text(isAr ? 'لا توجد بطولات' : 'No competitions',
                          style: TextStyle(color: AppColors.hint)))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(12),
                        children: [
                          for (final entry in bySeason.entries) ...[
                            Padding(
                              padding: const EdgeInsets.fromLTRB(4, 10, 4, 6),
                              child: Text(entry.key,
                                  style: TextStyle(
                                      color: AppColors.hint,
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold)),
                            ),
                            for (final c in entry.value)
                              _CompTile(
                                title: c.getName(locale),
                                subtitle: [
                                  c.age,
                                  c.getSector(locale),
                                ].where((s) => s.isNotEmpty).join(' — '),
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => AdminMatchesScreen(
                                        competition: c),
                                  ),
                                ),
                              ),
                          ],
                        ],
                      ),
                    ),
    );
  }
}

class _CompTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _CompTile(
      {required this.title, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(children: [
            const Text('🏆', style: TextStyle(fontSize: 18)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          color: AppColors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 14)),
                  if (subtitle.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(subtitle,
                        style: TextStyle(color: AppColors.teal, fontSize: 12)),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: AppColors.aqua, size: 20),
          ]),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, color: AppColors.hint, size: 40),
            const SizedBox(height: 12),
            Text(message,
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.white)),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
