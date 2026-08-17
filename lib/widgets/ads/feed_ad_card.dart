import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/config_model.dart';
import '../../core/services/api_service.dart';

/// A native "sponsored" card shown inline in the home feed. Logs a feed
/// impression when it first appears and a feed click when tapped.
class FeedAdCard extends StatefulWidget {
  final AdItem ad;
  final bool isAr;
  const FeedAdCard({super.key, required this.ad, required this.isAr});

  @override
  State<FeedAdCard> createState() => _FeedAdCardState();
}

class _FeedAdCardState extends State<FeedAdCard> {
  @override
  void initState() {
    super.initState();
    if (widget.ad.id > 0) {
      ApiService().adImpression(widget.ad.id, placement: 'feed');
    }
  }

  // Where a tap goes: the explicit link, else the first available contact.
  String? get _dest {
    final a = widget.ad;
    return a.link ??
        a.facebookLink ??
        a.youtubeVideo ??
        a.locationUrl ??
        (a.whatsappNumber != null ? 'https://wa.me/${a.whatsappNumber}' : null);
  }

  void _open() {
    if (widget.ad.id > 0) {
      ApiService().adClick(widget.ad.id, placement: 'feed');
    }
    final url = _dest;
    if (url != null) {
      launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ad = widget.ad;
    final isAr = widget.isAr;
    final hasImage = ad.image != null && ad.image!.startsWith('http');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Material(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: _open,
          borderRadius: BorderRadius.circular(14),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.aqua.withValues(alpha: 0.35)),
              gradient: LinearGradient(
                colors: [AppColors.cardBg, AppColors.cardGradientEnd],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Sponsored disclosure
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
                  child: Row(children: [
                    Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.aqua.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(isAr ? 'إعلان' : 'Sponsored',
                          style: TextStyle(
                              color: AppColors.aqua,
                              fontSize: 9,
                              fontWeight: FontWeight.bold)),
                    ),
                    const Spacer(),
                    Icon(Icons.chevron_left, color: AppColors.hint, size: 16),
                  ]),
                ),
                if (hasImage)
                  CachedNetworkImage(
                    imageUrl: ad.image!,
                    height: 150,
                    fit: BoxFit.contain,
                    errorWidget: (_, _, _) => const SizedBox.shrink(),
                  ),
                Padding(
                  padding: EdgeInsets.fromLTRB(12, hasImage ? 8 : 0, 12, 12),
                  child: Text(ad.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: AppColors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
