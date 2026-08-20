import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/profile_models.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/utils/safe_launch.dart';
import '../../widgets/common/cached_logo.dart';
import '../coach/coach_detail_screen.dart';
import '../team/team_profile_screen.dart';

class ClubDetailScreen extends StatefulWidget {
  final int clubId;
  const ClubDetailScreen({super.key, required this.clubId});

  @override
  State<ClubDetailScreen> createState() => _ClubDetailScreenState();
}

class _ClubDetailScreenState extends State<ClubDetailScreen> {
  late Future<ClubPublic> _future;
  // Own controller so the list never attaches to the app-wide
  // PrimaryScrollController and can't restore a stale offset (which otherwise
  // sometimes opened the screen scrolled down); keepScrollOffset:false = top.
  final ScrollController _scroll = ScrollController(keepScrollOffset: false);

  @override
  void initState() {
    super.initState();
    _future = ApiService().fetchClub(widget.clubId);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _open(String url) {
    launchExternal(safeUri(url));
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<AppProvider>().locale;
    final isAr = locale == 'ar';

    return Scaffold(
      appBar: AppBar(title: Text(isAr ? 'النادي' : 'Club')),
      body: FutureBuilder<ClubPublic>(
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
              _socials(c),
              if (c.managers.isNotEmpty) ...[
                const SizedBox(height: 14),
                _title(isAr ? 'الجهاز الإداري' : 'Management'),
                ...c.managers.map((m) => _managerTile(m, locale)),
              ],
              if (c.teams.isNotEmpty) ...[
                const SizedBox(height: 14),
                _title(isAr ? 'الفرق' : 'Teams'),
                ...c.teams.map((t) => _teamTile(t, locale)),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _title(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4, left: 4, right: 4),
        child: Text(text,
            style: TextStyle(color: AppColors.aqua, fontSize: 14, fontWeight: FontWeight.bold)),
      );

  Widget _header(ClubPublic c, String locale, bool isAr) {
    final sub = [
      c.getCity(locale),
      if (c.established != null && c.established!.isNotEmpty)
        '${isAr ? 'تأسس' : 'Est.'} ${c.established!.split('-').first}',
    ].whereType<String>().join(' · ');
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          CachedLogo(url: c.logo, size: 64),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(c.getName(locale),
                    style: TextStyle(
                        color: AppColors.aqua, fontSize: 18, fontWeight: FontWeight.bold)),
                if (sub.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(sub, style: TextStyle(color: AppColors.teal, fontSize: 13)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _socials(ClubPublic c) {
    final links = <(IconData, String)>[
      if (c.website != null && c.website!.isNotEmpty) (Icons.language, c.website!),
      if (c.facebook != null && c.facebook!.isNotEmpty) (Icons.facebook, c.facebook!),
      if (c.instagram != null && c.instagram!.isNotEmpty) (Icons.camera_alt_outlined, c.instagram!),
      if (c.youtube != null && c.youtube!.isNotEmpty) (Icons.ondemand_video_outlined, c.youtube!),
      if (c.twitter != null && c.twitter!.isNotEmpty) (Icons.alternate_email, c.twitter!),
    ];
    if (links.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: links
            .map((l) => InkWell(
                  onTap: () => _open(l.$2),
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.cardBg,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Icon(l.$1, color: AppColors.aqua, size: 20),
                  ),
                ))
            .toList(),
      ),
    );
  }

  Widget _managerTile(ClubManager m, String locale) {
    return InkWell(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => CoachDetailScreen(coachId: m.id)),
      ),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: CachedLogo(
                  url: m.photo,
                  size: 40,
                  borderRadius: 10,
                  fit: BoxFit.cover,
                  placeholderIcon: Icons.person),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(m.getName(locale),
                      style: TextStyle(color: AppColors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                  if (m.getRole(locale) != null)
                    Text(m.getRole(locale)!, style: TextStyle(color: AppColors.hint, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: AppColors.hint, size: 18),
          ],
        ),
      ),
    );
  }

  Widget _teamTile(ClubTeamEntry t, String locale) {
    // On the club page the club is implicit, so show the age only (falling back
    // to the team name). Tapping opens the standalone team page.
    final label = t.ageName(locale) ?? t.getName(locale);
    return InkWell(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => TeamProfileScreen(teamId: t.id)),
      ),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Icon(Icons.groups_outlined, color: AppColors.teal, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(label,
                  style: TextStyle(color: AppColors.white, fontSize: 14)),
            ),
            Icon(Icons.chevron_right, color: AppColors.hint, size: 18),
          ],
        ),
      ),
    );
  }
}
