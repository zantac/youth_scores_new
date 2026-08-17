import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Fixed dark palette for share cards, matching the app's dark theme so exported
/// images look consistent regardless of the live (light/dark) theme.
class ShareColors {
  ShareColors._();
  static const bg      = Color(0xFF071530); // darkBg
  static const surface = Color(0xFF0B2447); // cardBg
  static const border  = Color(0xFF0D3A52);
  static const aqua    = Color(0xFF15D8FF);
  static const teal    = Color(0xFF7EC8D8);
  static const white   = Color(0xFFFFFFFF);
  static const hint    = Color(0xFF4DA8C4);
  static const gold    = Color(0xFFFFD700);
  static const green   = Color(0xFF4CAF50);
  static const yellow  = Color(0xFFFFEB3B);
  static const red     = Color(0xFFF44336);
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
}) async {
  OverlayEntry? entry;
  final repaintKey = GlobalKey();
  try {
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

/// The youthscores branding stamp shown at the bottom of every share card.
class ShareBrandFooter extends StatelessWidget {
  const ShareBrandFooter({super.key});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: ShareColors.surface,
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Text(
          'بطولات الناشئين  |  Youth Scores  |  youthscores.org',
          textAlign: TextAlign.center,
          style: TextStyle(
              color: ShareColors.hint, fontSize: 11, letterSpacing: 0.5),
        ),
      );
}
