import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/profile_models.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../widgets/common/cached_logo.dart';

class CoachDetailScreen extends StatefulWidget {
  final int coachId;
  const CoachDetailScreen({super.key, required this.coachId});

  @override
  State<CoachDetailScreen> createState() => _CoachDetailScreenState();
}

class _CoachDetailScreenState extends State<CoachDetailScreen> {
  late Future<CoachFull> _future;
  // Own controller so the list never attaches to the app-wide
  // PrimaryScrollController and can't restore a stale offset (which otherwise
  // sometimes opened the screen scrolled down); keepScrollOffset:false = top.
  final ScrollController _scroll = ScrollController(keepScrollOffset: false);

  @override
  void initState() {
    super.initState();
    _future = ApiService().fetchCoach(widget.coachId);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<AppProvider>().locale;
    final isAr = locale == 'ar';

    return Scaffold(
      appBar: AppBar(title: Text(isAr ? 'الجهاز الفني' : 'Coach')),
      body: FutureBuilder<CoachFull>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError || snap.data == null) {
            return Center(
              child: Text(isAr ? 'تعذّر تحميل البيانات' : 'Could not load data',
                  style: TextStyle(color: AppColors.teal)),
            );
          }
          final c = snap.data!;
          return ListView(
            controller: _scroll,
            padding: const EdgeInsets.all(14),
            children: [
              _header(c, locale, isAr),
              if (c.career.isNotEmpty) ...[
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.only(bottom: 8, left: 4, right: 4),
                  child: Text(isAr ? 'المسيرة' : 'Career',
                      style: TextStyle(
                          color: AppColors.aqua, fontSize: 14, fontWeight: FontWeight.bold)),
                ),
                ...c.career.map((e) => _careerTile(e, locale, isAr)),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _header(CoachFull c, String locale, bool isAr) {
    // Mirrors the site hero: birth year + nationality as teal pill chips.
    final nationality = c.getNationality(locale);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: CachedLogo(
                url: c.photo,
                size: 72,
                borderRadius: 16,
                fit: BoxFit.cover,
                placeholderIcon: Icons.person),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(c.getName(locale),
                    style: TextStyle(
                        color: AppColors.aqua, fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (c.birthYear != null)
                      _chip('${isAr ? 'مواليد' : 'Born'} ${c.birthYear}'),
                    if (nationality != null && nationality.isNotEmpty) _chip(nationality),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // A rounded teal pill matching the site's hero chips.
  Widget _chip(String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(
          color: AppColors.cardGradientEnd,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.border),
        ),
        child: Text(text,
            style: TextStyle(
                color: AppColors.teal, fontSize: 11, fontWeight: FontWeight.w600)),
      );

  Widget _careerTile(CoachCareerEntry e, String locale, bool isAr) {
    final isManager = e.type == 'manager';
    final typeLabel = isManager ? (isAr ? 'إداري' : 'Manager') : (isAr ? 'مدرّب' : 'Coach');
    // Age and season sit on separate lines, mirroring the website.
    final age    = e.ageName(locale);
    final season = e.seasonName(locale);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          CachedLogo(url: e.logo, size: 36),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(e.club,
                          style: TextStyle(
                              color: AppColors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                    ),
                    if (e.current)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.green.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(isAr ? 'حالي' : 'Current',
                            style: TextStyle(color: AppColors.green, fontSize: 10)),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  [e.roleName(locale), typeLabel].where((s) => s.isNotEmpty).join(' · '),
                  style: TextStyle(color: AppColors.teal, fontSize: 12),
                ),
                if (age != null && age.isNotEmpty)
                  Text(age, style: TextStyle(color: AppColors.hint, fontSize: 11)),
                if (season != null && season.isNotEmpty)
                  Text(season, style: TextStyle(color: AppColors.hint, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
