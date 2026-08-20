import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/config_model.dart';
import '../../core/services/api_service.dart';
import '../../core/utils/safe_launch.dart';

/// A native sponsored card shown inline in the home feed as a flush 2:1 image,
/// styled to blend in with the match cards around it. Logs a feed impression
/// when it first appears and a feed click when tapped.
class FeedAdCard extends StatefulWidget {
  final AdItem ad;
  const FeedAdCard({super.key, required this.ad});

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

  // Where a tap goes: the explicit link, else the first available contact. Each
  // candidate is scheme-checked so a malicious link field can't open anything
  // but a real http(s)/tel/mailto target.
  Uri? get _dest {
    final a = widget.ad;
    return safeUri(a.link) ??
        safeUri(a.facebookLink) ??
        safeUri(a.youtubeVideo) ??
        safeUri(a.locationUrl) ??
        (a.whatsappNumber != null
            ? safeUri('https://wa.me/${Uri.encodeComponent(a.whatsappNumber!)}')
            : null);
  }

  void _open() {
    if (widget.ad.id > 0) {
      ApiService().adClick(widget.ad.id, placement: 'feed');
    }
    launchExternal(_dest);
  }

  @override
  Widget build(BuildContext context) {
    final ad = widget.ad;
    final hasImage = ad.image != null && ad.image!.startsWith('http');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: Material(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: _open,
          child: hasImage
              // Purpose-built 2:1 creative, rendered flush like a match card.
              ? AspectRatio(
                  aspectRatio: 2,
                  child: CachedNetworkImage(
                    imageUrl: ad.image!,
                    fit: BoxFit.cover,
                    errorWidget: (_, _, _) => const SizedBox.shrink(),
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.fromLTRB(12, 16, 12, 16),
                  child: Text(ad.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: AppColors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold)),
                ),
        ),
      ),
    );
  }
}
