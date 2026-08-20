import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/profile_models.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../widgets/common/cached_logo.dart';

// Career highlights (goals / current club) use a warm gold, matching the site.
const _gold = Color(0xFFF5C542);

class PlayerDetailScreen extends StatefulWidget {
  final int playerId;
  const PlayerDetailScreen({super.key, required this.playerId});

  @override
  State<PlayerDetailScreen> createState() => _PlayerDetailScreenState();
}

class _PlayerDetailScreenState extends State<PlayerDetailScreen> {
  late Future<PlayerFull> _future;
  // Own controller so the list never attaches to the app-wide
  // PrimaryScrollController and can't restore a stale offset (which otherwise
  // sometimes opened the screen scrolled down); keepScrollOffset:false = top.
  final ScrollController _scroll = ScrollController(keepScrollOffset: false);

  @override
  void initState() {
    super.initState();
    _future = ApiService().fetchPlayer(widget.playerId);
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
      appBar: AppBar(title: Text(isAr ? 'اللاعب' : 'Player')),
      body: FutureBuilder<PlayerFull>(
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
          final p = snap.data!;
          return ListView(
            controller: _scroll,
            padding: const EdgeInsets.all(14),
            children: [
              _header(p, locale, isAr),
              const SizedBox(height: 14),
              _statsRow(p, isAr),
              if (p.career.isNotEmpty) ...[
                const SizedBox(height: 14),
                _sectionTitle(isAr ? 'المسيرة' : 'Career'),
                ...p.career.map((c) => _careerTile(c, locale, isAr)),
                const SizedBox(height: 8),
                _sectionTitle(isAr ? 'الأهداف لكل موسم' : 'Goals per season'),
                _goalsPerSeason(p.career, locale, isAr),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _header(PlayerFull p, String locale, bool isAr) {
    // Mirrors the site hero: line 2 is position + birth year as pill chips
    // (teal on a bordered fill); line 3 is the club as a gold pill.
    final position = p.getPosition(locale);
    final hasClub = p.currentClub != null && p.currentClub!.isNotEmpty;
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
                url: p.photo,
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
                Text(p.getName(locale),
                    style: TextStyle(
                        color: AppColors.aqua, fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                // Line 2: position · birth year pills.
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (position != null && position.isNotEmpty) _chip(position),
                    if (p.birthYear != null)
                      _chip('${isAr ? 'مواليد' : 'Born'} ${p.birthYear}'),
                  ],
                ),
                // Line 3: club name in a gold pill.
                if (hasClub) ...[
                  const SizedBox(height: 6),
                  _chip('◆ ${p.currentClub!}',
                      textColor: _gold,
                      bgColor: _gold.withValues(alpha: 0.1),
                      borderColor: _gold.withValues(alpha: 0.3)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  // A rounded pill label matching the site's chips. Defaults to the teal
  // "position / birth year" look; pass gold colours for the club chip.
  Widget _chip(String text, {Color? textColor, Color? bgColor, Color? borderColor}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(
          color: bgColor ?? AppColors.cardGradientEnd,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: borderColor ?? AppColors.border),
        ),
        child: Text(text,
            style: TextStyle(
                color: textColor ?? AppColors.teal,
                fontSize: 11,
                fontWeight: FontWeight.w600)),
      );

  Widget _statsRow(PlayerFull p, bool isAr) {
    Widget cell(String label, int value, Color color) => Expanded(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 4),
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              color: AppColors.cardBg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                Text('$value',
                    style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(label, style: TextStyle(color: AppColors.hint, fontSize: 11)),
              ],
            ),
          ),
        );
    return Row(
      children: [
        cell(isAr ? 'أهداف' : 'Goals', p.goals, AppColors.green),
        cell(isAr ? 'صناعة' : 'Assists', p.assists, AppColors.aqua),
        cell(isAr ? 'مباريات' : 'Apps', p.appearances, AppColors.white),
      ],
    );
  }

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4, right: 4, left: 4),
        child: Text(text,
            style: TextStyle(color: AppColors.aqua, fontSize: 14, fontWeight: FontWeight.bold)),
      );

  // A career card mirroring the website: full-height club logo, club + guest/now
  // tags, age, season, a "left" date for past clubs, the season's app/assist/goal
  // totals, and a per-competition breakdown.
  Widget _careerTile(PlayerCareerEntry c, String locale, bool isAr) {
    final age    = c.ageName(locale);
    final season = c.seasonName(locale);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: c.current ? _gold.withValues(alpha: 0.5) : AppColors.border),
        gradient: LinearGradient(
          colors: [AppColors.cardBg, AppColors.cardGradientEnd],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Big club logo, spanning the full card height. No own background
            // so the card's gradient shows through unbroken (matches the site).
            Container(
              width: 84,
              padding: const EdgeInsets.all(10),
              child: Center(child: CachedLogo(url: c.logo, size: 62)),
            ),
            // Details
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Club + tags
                    Row(
                      children: [
                        Expanded(
                          child: Text(c.club,
                              style: TextStyle(
                                  color: AppColors.white,
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold)),
                        ),
                        if (c.isGuest) _tag(isAr ? 'ضيف صاعد' : 'guest', AppColors.teal),
                        if (c.current) ...[
                          const SizedBox(width: 6),
                          _tag(isAr ? 'حالي' : 'now', _gold),
                        ],
                      ],
                    ),
                    if (age != null) ...[
                      const SizedBox(height: 4),
                      Text(age,
                          style: TextStyle(
                              color: AppColors.aqua,
                              fontSize: 12,
                              fontWeight: FontWeight.bold)),
                    ],
                    if (season.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(season, style: TextStyle(color: AppColors.hint, fontSize: 11)),
                    ],
                    if (!c.current && c.endDate != null && c.endDate!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text('${isAr ? 'غادر' : 'left'} ${c.endDate}',
                          style: TextStyle(color: AppColors.hint, fontSize: 11)),
                    ],
                    // Season totals
                    const SizedBox(height: 10),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        if (c.appearances > 0)
                          _total('${c.appearances}', isAr ? 'مباراة' : 'apps', AppColors.white),
                        if (c.assists > 0)
                          _total('${c.assists}', isAr ? 'صناعة' : 'ast', AppColors.aqua),
                        _total('${c.goals}', isAr ? 'هدف' : 'goals', _gold, big: true),
                      ],
                    ),
                    // Per-competition breakdown
                    if (c.competitions.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Divider(height: 1, color: AppColors.border),
                      const SizedBox(height: 8),
                      ...c.competitions.map((comp) => Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(comp.getName(locale),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(color: AppColors.hint, fontSize: 11)),
                                ),
                                if (comp.appearances > 0) ...[
                                  Text('${comp.appearances}${isAr ? ' م' : ' ap'}',
                                      style: TextStyle(color: AppColors.hint, fontSize: 11)),
                                  const SizedBox(width: 8),
                                ],
                                if (comp.assists > 0) ...[
                                  Text('${comp.assists}${isAr ? ' ص' : ' a'}',
                                      style: TextStyle(color: AppColors.aqua, fontSize: 11)),
                                  const SizedBox(width: 8),
                                ],
                                SizedBox(
                                  width: 22,
                                  child: Text('${comp.goals}',
                                      textAlign: TextAlign.end,
                                      style: TextStyle(
                                          color: _gold,
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold)),
                                ),
                              ],
                            ),
                          )),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // One app/assist/goal total in a career card.
  Widget _total(String value, String label, Color color, {bool big = false}) => Padding(
        padding: const EdgeInsetsDirectional.only(end: 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(value,
                style: TextStyle(
                    color: color,
                    fontSize: big ? 18 : 14,
                    fontWeight: FontWeight.bold,
                    height: 1.1)),
            Text(label, style: TextStyle(color: AppColors.hint, fontSize: 9)),
          ],
        ),
      );

  // A small pill tag ("guest" / "now").
  Widget _tag(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: color.withValues(alpha: 0.4)),
        ),
        child: Text(text,
            style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold)),
      );

  // Horizontal bars of goals per SEASON: sum a player's goals across every
  // club/competition they played in that season (career rows split per
  // club/competition), one bar per season, labelled with the season only.
  Widget _goalsPerSeason(List<PlayerCareerEntry> career, String locale, bool isAr) {
    final order = <String>[];
    final goalsByKey = <String, int>{};
    final sampleByKey = <String, PlayerCareerEntry>{};
    for (final c in career) {
      final key = (c.season['en']?.isNotEmpty ?? false)
          ? c.season['en']!
          : (c.season['ar'] ?? c.seasonName(locale));
      if (!goalsByKey.containsKey(key)) {
        order.add(key);
        goalsByKey[key] = 0;
        sampleByKey[key] = c;
      }
      goalsByKey[key] = goalsByKey[key]! + c.goals;
    }
    final maxGoals = goalsByKey.values.fold<int>(1, (m, g) => g > m ? g : m);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: order.map((key) {
          final goals = goalsByKey[key]!;
          final label = sampleByKey[key]!.seasonName(locale);
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                SizedBox(
                  width: 96,
                  child: Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: AppColors.hint, fontSize: 11)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: goals / maxGoals,
                      minHeight: 8,
                      backgroundColor: AppColors.darkBg,
                      valueColor: const AlwaysStoppedAnimation<Color>(_gold),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 24,
                  child: Text('$goals',
                      textAlign: TextAlign.end,
                      style: TextStyle(
                          color: AppColors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}
