import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

/// A football-shirt icon with the player's squad number on the torso — the
/// native mirror of the website's roster jersey badge. The torso is kept wide
/// so a two-digit number reads clearly.
class JerseyNumber extends StatelessWidget {
  final int? shirt;
  const JerseyNumber({super.key, this.shirt});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 44,
      height: 36,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(size: const Size(44, 36), painter: _JerseyPainter()),
          // Nudge the number down onto the torso (below the collar).
          Padding(
            padding: const EdgeInsets.only(top: 5),
            child: Text(
              shirt?.toString() ?? '—',
              style: TextStyle(
                color: AppColors.aqua,
                fontWeight: FontWeight.w800,
                fontSize: 11,
                height: 1,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _JerseyPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // Same silhouette as the web SVG (viewBox 30x26), scaled to the box.
    final sx = size.width / 30, sy = size.height / 26;
    final path = Path()
      ..moveTo(11 * sx, 2 * sy)
      ..lineTo(4 * sx, 5 * sy)
      ..lineTo(1.5 * sx, 9 * sy)
      ..lineTo(6 * sx, 11.5 * sy)
      ..lineTo(8.5 * sx, 10 * sy)
      ..lineTo(8.5 * sx, 24 * sy)
      ..lineTo(21.5 * sx, 24 * sy)
      ..lineTo(21.5 * sx, 10 * sy)
      ..lineTo(24 * sx, 11.5 * sy)
      ..lineTo(28.5 * sx, 9 * sy)
      ..lineTo(26 * sx, 5 * sy)
      ..lineTo(19 * sx, 2 * sy)
      ..cubicTo(18 * sx, 4.2 * sy, 16.5 * sx, 5 * sy, 15 * sx, 5 * sy)
      ..cubicTo(13.5 * sx, 5 * sy, 12 * sx, 4.2 * sy, 11 * sx, 2 * sy)
      ..close();
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.fill
        ..color = AppColors.aqua.withValues(alpha: 0.15),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..strokeJoin = StrokeJoin.round
        ..color = AppColors.aqua.withValues(alpha: 0.6),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
