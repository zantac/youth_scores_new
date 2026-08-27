import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/config_model.dart';
import '../../core/providers/app_provider.dart';
import '../../core/utils/cloudinary.dart';
import '../../widgets/common/error_retry_widget.dart';
import '../../widgets/common/loading_widget.dart';
import '../competition/season_competitions_screen.dart';

const _seasonLogoUrl =
    'https://res.cloudinary.com/debq5s4sn/image/upload/v1783596194/Egyptian-FA-01_ehrgye.png';

class CompetitionsTab extends StatelessWidget {
  const CompetitionsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AppProvider>();
    final l10n = L10n(provider.locale);

    if (provider.loadingConfig) {
      return LoadingWidget(message: l10n.loading);
    }
    if (provider.configError != null) {
      return ErrorRetryWidget(
        message: provider.configError!,
        onRetry: () => provider.loadConfig(),
        retryLabel: l10n.retry,
      );
    }
    final config = provider.config;
    if (config == null || config.seasons.isEmpty) {
      return Center(
        child: Text(l10n.noData, style: TextStyle(color: AppColors.teal)),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
      itemCount: config.seasons.length,
      itemBuilder: (context, i) {
        final season = config.seasons[i];
        return _SeasonButton(season: season, l10n: l10n);
      },
    );
  }
}

class _SeasonButton extends StatelessWidget {
  final Season season;
  final L10n l10n;

  const _SeasonButton({required this.season, required this.l10n});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => SeasonCompetitionsScreen(season: season),
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
                imageUrl: cloudinaryUrl(_seasonLogoUrl, width: 128),
                width: 52,
                height: 52,
                fit: BoxFit.contain,
                errorWidget: (_, __, ___) =>
                    Icon(Icons.emoji_events, color: AppColors.aqua, size: 36),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  season.name,
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 18,
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
