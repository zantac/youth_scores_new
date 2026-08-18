import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:shimmer/shimmer.dart';
import '../../core/constants/app_colors.dart';

class CachedLogo extends StatelessWidget {
  final String? url;
  final double size;
  final double borderRadius;
  // Fallback glyph when there's no image — a shield for clubs/teams, a person
  // silhouette for people (players, coaches).
  final IconData placeholderIcon;

  const CachedLogo({
    super.key,
    this.url,
    this.size = 40,
    this.borderRadius = 8,
    this.placeholderIcon = Icons.shield,
  });

  @override
  Widget build(BuildContext context) {
    final validUrl = url != null && url!.isNotEmpty && url!.startsWith('http');
    if (!validUrl) return _placeholder();

    return CachedNetworkImage(
      imageUrl: url!,
      width: size,
      height: size,
      fit: BoxFit.contain,
      placeholder: (_, __) => Shimmer.fromColors(
        baseColor: AppColors.cardBg,
        highlightColor: AppColors.border,
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(borderRadius),
          ),
        ),
      ),
      errorWidget: (_, __, ___) => _placeholder(),
    );
  }

  Widget _placeholder() => SizedBox(
    width: size,
    height: size,
    child: Icon(placeholderIcon, color: AppColors.teal, size: size * 0.6),
  );
}
