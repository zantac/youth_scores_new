import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/profile_models.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../widgets/common/cached_logo.dart';
import '../../widgets/common/error_retry_widget.dart';
import '../../widgets/common/loading_widget.dart';
import '../../widgets/common/search_field.dart';
import 'club_detail_screen.dart';

/// The clubs directory tab — mirrors the website's /clubs page: searchable list
/// of clubs (logo, name, city) each opening the club detail screen.
class ClubsScreen extends StatefulWidget {
  const ClubsScreen({super.key});

  @override
  State<ClubsScreen> createState() => _ClubsScreenState();
}

class _ClubsScreenState extends State<ClubsScreen> {
  final _ctrl = TextEditingController();
  String _query = '';
  late Future<List<ClubListItem>> _future;

  @override
  void initState() {
    super.initState();
    _future = ApiService().fetchClubs();
  }

  void _reload() => setState(() => _future = ApiService().fetchClubs());

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<AppProvider>().locale;
    final l10n = L10n(locale);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: SearchField(
            controller: _ctrl,
            hint: l10n.isAr ? 'ابحث عن نادٍ...' : 'Search clubs...',
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        Expanded(
          child: FutureBuilder<List<ClubListItem>>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return LoadingWidget(message: l10n.loading);
              }
              if (snap.hasError || snap.data == null) {
                return ErrorRetryWidget(
                  message: l10n.isAr
                      ? 'تعذّر تحميل الأندية'
                      : 'Could not load clubs',
                  onRetry: _reload,
                  retryLabel: l10n.retry,
                );
              }

              final term = _query.trim().toLowerCase();
              final clubs = term.isEmpty
                  ? snap.data!
                  : snap.data!
                      .where((c) =>
                          c.getName(locale).toLowerCase().contains(term) ||
                          (c.getCity(locale)?.toLowerCase().contains(term) ??
                              false))
                      .toList();

              if (clubs.isEmpty) {
                return Center(
                  child: Text(l10n.isAr ? 'لا نتائج' : 'No results',
                      style: TextStyle(color: AppColors.hint)),
                );
              }

              return ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                itemCount: clubs.length + 1,
                itemBuilder: (_, i) {
                  if (i == 0) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8, left: 4, right: 4),
                      child: Text(
                        '${clubs.length} ${l10n.isAr ? 'نادٍ' : 'clubs'}',
                        style: TextStyle(color: AppColors.hint, fontSize: 12),
                      ),
                    );
                  }
                  return _ClubTile(club: clubs[i - 1], locale: locale);
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ClubTile extends StatelessWidget {
  final ClubListItem club;
  final String locale;

  const _ClubTile({required this.club, required this.locale});

  @override
  Widget build(BuildContext context) {
    final city = club.getCity(locale);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ClubDetailScreen(clubId: club.id),
          ),
        ),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              CachedLogo(url: club.logo, size: 42, borderRadius: 10),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      club.getName(locale),
                      style: TextStyle(
                        color: AppColors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (city != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        '📍 $city',
                        style: TextStyle(color: AppColors.hint, fontSize: 11),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: AppColors.teal, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}
