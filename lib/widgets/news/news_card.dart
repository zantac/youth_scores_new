import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/config_model.dart';
import '../../core/utils/date_utils.dart';

class NewsCard extends StatelessWidget {
  final NewsItem item;
  final String locale;
  final VoidCallback? onTap;
  final bool isNew;

  const NewsCard({
    super.key,
    required this.item,
    this.locale = 'ar',
    this.onTap,
    this.isNew = false,
  });

  @override
  Widget build(BuildContext context) {
    // Mirror the website: title + details + date first, cover photo at the
    // bottom of the card. Use the first gallery image, falling back to `image`.
    final thumb = item.allImages.isNotEmpty ? item.allImages.first : null;
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.getTitle(locale),
                          style: TextStyle(
                            color: AppColors.aqua,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isNew)
                        Container(
                          margin: const EdgeInsetsDirectional.only(start: 8),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.aqua.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: AppColors.aqua),
                          ),
                          child: Text(
                            'NEW',
                            style: TextStyle(
                                color: AppColors.aqua, fontSize: 10),
                          ),
                        ),
                    ],
                  ),
                  if (item.getDetails(locale) != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      item.getDetails(locale)!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: AppColors.teal, fontSize: 12),
                    ),
                  ],
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(Icons.calendar_today,
                          size: 12, color: AppColors.hint),
                      const SizedBox(width: 4),
                      Text(
                        AppDateUtils.formatNewsDate(item.date, locale),
                        style: TextStyle(
                            color: AppColors.hint, fontSize: 11),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (thumb != null)
              ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(bottom: Radius.circular(12)),
                child: CachedNetworkImage(
                  imageUrl: thumb,
                  height: 160,
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) => const SizedBox.shrink(),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
