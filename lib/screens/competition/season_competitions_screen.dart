import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/config_model.dart';
import '../../core/providers/app_provider.dart';
import '../../core/utils/cloudinary.dart';
import '../../core/utils/comp_order.dart';
import 'competition_ages_screen.dart';

class SeasonCompetitionsScreen extends StatelessWidget {
  final Season season;

  const SeasonCompetitionsScreen({super.key, required this.season});

  @override
  Widget build(BuildContext context) {
    final l10n = L10n(context.watch<AppProvider>().locale);
    // Canonical family order (القسم الاول → الثاني أ → الثاني ب → القطاعات → المناطق).
    final comps = [...season.competitions]
      ..sort((a, b) => compareCompName(a.getName('ar'), b.getName('ar')));

    return Scaffold(
      appBar: AppBar(title: Text(season.name)),
      body: comps.isEmpty
          ? Center(
              child: Text(
                l10n.noData,
                style: TextStyle(color: AppColors.teal),
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
              itemCount: comps.length,
              itemBuilder: (context, i) {
                return _CompetitionButton(
                  competition: comps[i],
                  seasonName: season.name,
                  l10n: l10n,
                );
              },
            ),
    );
  }
}

class _CompetitionButton extends StatelessWidget {
  final Competition competition;
  final String seasonName;
  final L10n l10n;

  const _CompetitionButton({
    required this.competition,
    required this.seasonName,
    required this.l10n,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => CompetitionAgesScreen(
              competition: competition,
              seasonName: seasonName,
            ),
          ),
        ),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 20),
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border, width: 1.5),
            gradient: LinearGradient(
              colors: [AppColors.cardBg, AppColors.cardGradientEnd],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Row(
            children: [
              CachedNetworkImage(
                imageUrl: cloudinaryUrl(
                    'https://res.cloudinary.com/debq5s4sn/image/upload/v1783596194/Egyptian-FA-01_ehrgye.png',
                    width: 128),
                width: 52,
                height: 52,
                fit: BoxFit.contain,
                errorWidget: (_, _, _) =>
                    Icon(Icons.sports_soccer, color: AppColors.aqua, size: 32),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  competition.getName(l10n.locale),
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
              Icon(Icons.chevron_right, color: AppColors.teal, size: 28),
            ],
          ),
        ),
      ),
    );
  }
}
