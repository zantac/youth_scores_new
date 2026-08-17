import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/config_model.dart';
import '../../core/providers/app_provider.dart';
import '../ads/ad_interstitial_screen.dart';
import 'competition_data_screen.dart';

class AgesScreen extends StatelessWidget {
  final AgeGroup age;
  final String competitionName;
  final String seasonName;

  const AgesScreen({
    super.key,
    required this.age,
    required this.competitionName,
    required this.seasonName,
  });

  @override
  Widget build(BuildContext context) {
    final locale = context.read<AppProvider>().locale;

    // Direct URL with no sectors — go straight to competition data.
    if (!age.hasSectors && age.directMatchesUrl != null) {
      return CompetitionDataScreen(
        dataUrl: age.directMatchesUrl!,
        title: '$competitionName · ${age.getName(locale)}',
        seasonName: seasonName,
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('${age.getName(locale)} – $competitionName'),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: age.sectors.length,
        itemBuilder: (ctx, i) {
          final sector = age.sectors[i];
          return Card(
            child: ListTile(
              leading: Icon(Icons.group_work_outlined, color: AppColors.aqua),
              title: Text(
                sector.getName(locale),
                style: TextStyle(color: AppColors.white),
              ),
              trailing: Icon(Icons.chevron_right, color: AppColors.teal),
              onTap: () => AdInterstitialScreen.open(
                ctx,
                dataUrl: sector.url,
                destinationBuilder: (_) => CompetitionDataScreen(
                  dataUrl: sector.url,
                  title: '${sector.getName(locale)} · ${age.getName(locale)}',
                  seasonName: seasonName,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
