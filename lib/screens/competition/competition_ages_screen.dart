import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/config_model.dart';
import '../../core/providers/app_provider.dart';
import '../ads/ad_interstitial_screen.dart';
import 'ages_screen.dart';
import 'competition_data_screen.dart';

class CompetitionAgesScreen extends StatelessWidget {
  final Competition competition;
  final String seasonName;

  const CompetitionAgesScreen({
    super.key,
    required this.competition,
    required this.seasonName,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = L10n(context.watch<AppProvider>().locale);

    return Scaffold(
      appBar: AppBar(title: Text(competition.getName(l10n.locale))),
      body: competition.ages.isEmpty
          ? Center(
              child: Text(
                l10n.noData,
                style: TextStyle(color: AppColors.teal),
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
              itemCount: competition.ages.length,
              itemBuilder: (context, i) {
                return _AgeButton(
                  age: competition.ages[i],
                  competition: competition,
                  seasonName: seasonName,
                  l10n: l10n,
                );
              },
            ),
    );
  }
}

class _AgeButton extends StatelessWidget {
  final AgeGroup age;
  final Competition competition;
  final String seasonName;
  final L10n l10n;

  const _AgeButton({
    required this.age,
    required this.competition,
    required this.seasonName,
    required this.l10n,
  });

  void _onTap(BuildContext context) {
    final compName = competition.getName(l10n.locale);

    // Age has sub-sectors → show sectors screen first, ad happens per-sector tap.
    if (age.hasSectors) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => AgesScreen(
            age: age,
            competitionName: compName,
            seasonName: seasonName,
          ),
        ),
      );
      return;
    }

    // Age has a direct URL → show ad (subject to cap), then competition data.
    if (age.directMatchesUrl != null) {
      final url = age.directMatchesUrl!;
      AdInterstitialScreen.open(
        context,
        dataUrl: url,
        destinationBuilder: (_) => CompetitionDataScreen(
          dataUrl: url,
          title: '$compName · ${age.getName(l10n.locale)}',
          seasonName: seasonName,
        ),
      );
      return;
    }

    // No data available.
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          l10n.isAr
              ? 'لا تتوفر بيانات لهذه البطولة'
              : 'No data available for this competition',
        ),
        backgroundColor: AppColors.cardBg,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: InkWell(
        onTap: () => _onTap(context),
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
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.teal.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.groups, color: AppColors.teal, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  age.getName(l10n.locale),
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
