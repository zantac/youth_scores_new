import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/services/review_service.dart';

/// The custom "enjoying the app?" rating prompt.
///
/// Google's native In-App Review card is quota-limited and frequently never
/// appears (and only on Play-installed builds), so we ask with our own dialog
/// and, on accept, open the Play listing via [ReviewService.openStoreListing]
/// (which always works). Self-gates through [ReviewService.shouldShowCustomPrompt]
/// — engaged users, once, outside the cooldown — so it's safe to call on launch.
Future<void> maybeShowRatePrompt(BuildContext context, {required bool isAr}) async {
  if (!await ReviewService.instance.shouldShowCustomPrompt()) return;
  if (!context.mounted) return;
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.cardBg,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Row(
        children: [
          const Text('⭐', style: TextStyle(fontSize: 22)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              isAr ? 'استمتعت بالتطبيق؟' : 'Enjoying the app?',
              style: TextStyle(
                  color: AppColors.aqua, fontWeight: FontWeight.bold, fontSize: 17),
            ),
          ),
        ],
      ),
      content: Text(
        isAr
            ? 'تقييمك على متجر جوجل بلاي يساعدنا كثيراً ولا يستغرق سوى ثوانٍ.'
            : 'A rating on Google Play helps us a lot and takes only seconds.',
        style: TextStyle(color: AppColors.white, fontSize: 14, height: 1.6),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: Text(isAr ? 'لاحقاً' : 'Later',
              style: TextStyle(color: AppColors.hint)),
        ),
        ElevatedButton.icon(
          icon: const Icon(Icons.star_rounded, size: 18),
          label: Text(isAr ? 'قيّم الآن' : 'Rate now'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.aqua,
            foregroundColor: AppColors.darkBg,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          onPressed: () async {
            await ReviewService.instance.markRatePromptDone();
            await ReviewService.instance.openStoreListing();
            if (ctx.mounted) Navigator.pop(ctx);
          },
        ),
      ],
    ),
  );
}
