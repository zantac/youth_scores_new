import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../constants/app_colors.dart';

/// Palette for share cards. Follows the live app theme (AppColors tracks it via
/// setTheme), so a light-theme user exports a light card and a dark-theme user a
/// dark one. Runtime getters — hence widgets that use them can't be `const`.
class ShareColors {
  ShareColors._();
  static Color get bg      => AppColors.darkBg;   // page background
  static Color get surface => AppColors.cardBg;   // card / panel fill
  static Color get border  => AppColors.border;
  static Color get aqua    => AppColors.aqua;
  static Color get teal    => AppColors.teal;
  static Color get white   => AppColors.white;    // primary text (near-black on light)
  static Color get hint    => AppColors.hint;
  static Color get green   => AppColors.green;
  static Color get yellow  => AppColors.yellow;
  static Color get red     => AppColors.red;
  // Bright gold is unreadable on a light card, so use a deep amber there.
  static Color get gold =>
      AppColors.isDark ? const Color(0xFFFFD700) : const Color(0xFFB8860B);
}

/// Off-screen-renders [card] to a PNG and opens the share sheet. Returns true on
/// success. On failure, shows [errorText] (when given) via a SnackBar.
///
/// The card is painted through an [OverlayEntry] positioned far off-screen, then
/// captured from its [RepaintBoundary] — the same approach the standings/player
/// share cards use, centralised here so every share looks identical.
Future<bool> shareWidgetImage(
  BuildContext context, {
  required Widget card,
  required String filePrefix,
  String? errorText,
  Iterable<String> preloadLogos = const [],
}) async {
  OverlayEntry? entry;
  final repaintKey = GlobalKey();
  try {
    // Network logos (and the brand icon) must be decoded BEFORE capture, or the
    // off-screen frame paints before they load and they come out blank.
    await precacheShareImages(context, preloadLogos);
    if (!context.mounted) return false;
    entry = OverlayEntry(
      builder: (_) => Positioned(
        left: -10000,
        top: -10000,
        child: RepaintBoundary(
          key: repaintKey,
          child: Material(color: Colors.transparent, child: card),
        ),
      ),
    );
    Overlay.of(context).insert(entry);

    // One frame to insert, one to paint.
    await WidgetsBinding.instance.endOfFrame;
    await WidgetsBinding.instance.endOfFrame;

    final boundary =
        repaintKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null || !boundary.hasSize) return false;

    final image = await boundary.toImage(pixelRatio: 3.0);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) return false;

    final dir = await getTemporaryDirectory();
    final file = File(
        '${dir.path}/${filePrefix}_${DateTime.now().millisecondsSinceEpoch}.png');
    await file.writeAsBytes(bytes.buffer.asUint8List());

    await SharePlus.instance.share(ShareParams(
      files: [XFile(file.path, mimeType: 'image/png')],
    ));
    return true;
  } catch (_) {
    if (context.mounted && errorText != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(errorText),
        backgroundColor: ShareColors.surface,
      ));
    }
    return false;
  } finally {
    entry?.remove();
  }
}

/// The youthscores branding stamp shown at the bottom of every share card:
/// the app icon plus the name/site, in a bright-enough teal to read clearly on
/// the dark card.
class ShareBrandFooter extends StatelessWidget {
  const ShareBrandFooter({super.key});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: ShareColors.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: ShareColors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(5),
              child: Image.asset('assets/icon.png',
                  width: 20, height: 20, fit: BoxFit.cover),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                'بطولات الناشئين  |  Youth Scores  |  youthscores.org',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: ShareColors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.3),
              ),
            ),
          ],
        ),
      );
}

/// Pre-decode the brand icon and any team logos into Flutter's image cache, so a
/// share card rendered off-screen paints them on its first (captured) frame.
/// Failures are swallowed — a missing logo just falls back to a placeholder.
Future<void> precacheShareImages(
    BuildContext context, Iterable<String> logoUrls) async {
  final providers = <ImageProvider>[const AssetImage('assets/icon.png')];
  for (final u in logoUrls) {
    if (u.isNotEmpty && u.startsWith('http')) providers.add(NetworkImage(u));
  }
  await Future.wait(providers.map(
    (p) => precacheImage(p, context, onError: (_, _) {}),
  ));
}

/// A team crest for a share card. Uses a plain [NetworkImage] (pre-decoded via
/// [precacheShareImages]) so it paints synchronously during off-screen capture;
/// falls back to a shield glyph when there's no usable URL.
class ShareLogo extends StatelessWidget {
  final String? url;
  final double size;
  const ShareLogo({super.key, required this.url, this.size = 22});

  @override
  Widget build(BuildContext context) {
    final ok = url != null && url!.isNotEmpty && url!.startsWith('http');
    return SizedBox(
      width: size,
      height: size,
      child: ok
          ? Image(
              image: NetworkImage(url!),
              width: size,
              height: size,
              fit: BoxFit.contain,
              errorBuilder: (_, _, _) => _placeholder(),
            )
          : _placeholder(),
    );
  }

  Widget _placeholder() =>
      Icon(Icons.shield, size: size * 0.85, color: ShareColors.hint);
}

/// A row of last-N form dots (win green / draw grey / loss red), newest last.
/// [results] are 1 = win, 0 = draw, -1 = loss.
class ShareFormDots extends StatelessWidget {
  final List<int> results;
  final double size;
  const ShareFormDots({super.key, required this.results, this.size = 9});

  static Color _color(int r) =>
      r > 0 ? ShareColors.green : (r < 0 ? ShareColors.red : ShareColors.hint);

  @override
  Widget build(BuildContext context) {
    if (results.isEmpty) return const SizedBox.shrink();
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final r in results)
          Container(
            width: size,
            height: size,
            margin: const EdgeInsetsDirectional.only(end: 3),
            decoration: BoxDecoration(
              color: _color(r),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
      ],
    );
  }
}
