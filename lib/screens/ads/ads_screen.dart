import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/config_model.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/utils/safe_launch.dart';
import '../../widgets/common/loading_widget.dart';

class AdsScreen extends StatelessWidget {
  const AdsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AppProvider>();
    final l10n     = L10n(provider.locale);

    if (provider.loadingConfig) return LoadingWidget(message: l10n.loading);

    final ads     = (provider.config?.ads ?? []).where((a) => a.isLive).toList();
    final version = provider.config?.appVersion;

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        ...ads.map((ad) => _adCard(ad, l10n, context)),
        const SizedBox(height: 16),
        _versionCard(version, l10n),
        const SizedBox(height: 24),
      ],
    );
  }

  // Log a click, then open the link.
  void _openAd(AdItem ad, Uri uri,
      {LaunchMode mode = LaunchMode.platformDefault}) {
    if (ad.id > 0) ApiService().adClick(ad.id);
    launchExternal(uri, mode: mode);
  }

  Widget _adCard(AdItem ad, L10n l10n, BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (ad.image != null && ad.image!.startsWith('http'))
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(12)),
              child: CachedNetworkImage(
                imageUrl: ad.image!,
                width: double.infinity,
                fit: BoxFit.fitWidth,
                errorWidget: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ad.name,
                  style: TextStyle(
                    color: AppColors.aqua,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (ad.whatsappNumber != null)
                      _actionBtn(
                        icon: Icons.chat,
                        label: l10n.whatsapp,
                        color: const Color(0xFF25D366),
                        onTap: () => _openAd(
                          ad,
                          Uri.parse('https://wa.me/${ad.whatsappNumber}'),
                          mode: LaunchMode.externalApplication,
                        ),
                      ),
                    if (ad.mobileNumber != null)
                      _actionBtn(
                        icon: Icons.phone,
                        label: l10n.call,
                        color: AppColors.teal,
                        onTap: () =>
                            _openAd(ad, Uri.parse('tel:${ad.mobileNumber}')),
                      ),
                    if (ad.facebookLink != null)
                      _actionBtn(
                        icon: Icons.facebook,
                        label: l10n.facebook,
                        color: const Color(0xFF1877F2),
                        onTap: () => _openAd(
                          ad,
                          Uri.parse(ad.facebookLink!),
                          mode: LaunchMode.externalApplication,
                        ),
                      ),
                    if (ad.youtubeVideo != null)
                      _actionBtn(
                        icon: Icons.play_circle,
                        label: l10n.youtube,
                        color: const Color(0xFFFF0000),
                        onTap: () => _openAd(
                          ad,
                          Uri.parse(ad.youtubeVideo!),
                          mode: LaunchMode.externalApplication,
                        ),
                      ),
                    if (ad.locationUrl != null)
                      _actionBtn(
                        icon: Icons.map,
                        label: l10n.openMap,
                        color: AppColors.hint,
                        onTap: () => _openAd(
                          ad,
                          Uri.parse(ad.locationUrl!),
                          mode: LaunchMode.externalApplication,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionBtn({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withOpacity(0.4)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 16),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(color: color, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _versionCard(AppVersion? v, L10n l10n) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Icon(Icons.sports_soccer, color: AppColors.aqua, size: 40),
          const SizedBox(height: 8),
          Text(
            'Youth Scores  |  بطولات الناشئين',
            style: TextStyle(
              color: AppColors.aqua,
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
            textAlign: TextAlign.center,
          ),
          if (v != null) ...[
            const SizedBox(height: 4),
            Text(
              '${l10n.version} ${v.versionName} (${v.versionCode})',
              style: TextStyle(color: AppColors.hint, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}
