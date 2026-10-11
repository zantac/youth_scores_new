import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/config_model.dart';
import '../../core/services/api_service.dart';
import '../../core/utils/cloudinary.dart';
import '../../core/utils/safe_launch.dart';

/// A horizontally-scrolling strip of square (1:1) sponsored tiles, shown inline
/// in the home feed. Fixed-width tiles let the next tile peek past the edge so it
/// reads as swipeable. Each tile logs its own impression the first time it builds
/// — the horizontal list builds lazily, so an off-screen tile only logs once
/// scrolled into view — and a click when tapped. No "ad" label or name caption:
/// just the creatives (matching the website rail).
class FeedAdRail extends StatelessWidget {
  final List<AdItem> ads;
  const FeedAdRail({super.key, required this.ads});

  @override
  Widget build(BuildContext context) {
    if (ads.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 2, 0, 2),
      child: SizedBox(
        height: 150,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.only(right: 12),
          itemCount: ads.length,
          separatorBuilder: (_, _) => const SizedBox(width: 8),
          itemBuilder: (_, i) => _SquareTile(ad: ads[i]),
        ),
      ),
    );
  }
}

class _SquareTile extends StatefulWidget {
  final AdItem ad;
  const _SquareTile({required this.ad});

  @override
  State<_SquareTile> createState() => _SquareTileState();
}

class _SquareTileState extends State<_SquareTile> {
  @override
  void initState() {
    super.initState();
    if (widget.ad.id > 0) {
      ApiService().adImpression(widget.ad.id, placement: 'feed');
    }
  }

  void _open() {
    if (widget.ad.id > 0) {
      ApiService().adClick(widget.ad.id, placement: 'feed');
    }
    launchExternal(adDestUri(widget.ad));
  }

  @override
  Widget build(BuildContext context) {
    final ad = widget.ad;
    final hasImage = ad.image != null && ad.image!.startsWith('http');
    return SizedBox(
      width: 150,
      child: Material(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: _open,
          // 1:1 creative, shown whole — BoxFit.cover on a square never crops a
          // square source, so the photo arrives untouched.
          child: AspectRatio(
            aspectRatio: 1,
            child: hasImage
                ? CachedNetworkImage(
                    imageUrl: cloudinaryUrl(ad.image!, width: 400),
                    fit: BoxFit.cover,
                    errorWidget: (_, _, _) => const _RailPlaceholder(),
                  )
                : const _RailPlaceholder(),
          ),
        ),
      ),
    );
  }
}

class _RailPlaceholder extends StatelessWidget {
  const _RailPlaceholder();

  @override
  Widget build(BuildContext context) => Container(
    color: AppColors.darkBg,
    alignment: Alignment.center,
    child: Icon(Icons.campaign, color: AppColors.teal, size: 32),
  );
}
