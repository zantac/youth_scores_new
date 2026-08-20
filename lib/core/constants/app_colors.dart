import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  static bool _isDark = true;
  static bool get isDark => _isDark;
  static void setTheme(bool isDark) => _isDark = isDark;

  // ── Theme-sensitive colours ──────────────────────────────────────────────────
  static Color get darkBg          => _isDark ? const Color(0xFF071530) : const Color(0xFFF0F6FF);
  static Color get cardBg          => _isDark ? const Color(0xFF0B2447) : Colors.white;
  static Color get aqua            => _isDark ? const Color(0xFF15D8FF) : const Color(0xFF0077A8);
  static Color get teal            => _isDark ? const Color(0xFF7EC8D8) : const Color(0xFF1B6A8E);
  static Color get border          => _isDark ? const Color(0xFF0D3A52) : const Color(0xFFBDD5E4);
  static Color get hint            => _isDark ? const Color(0xFF4DA8C4) : const Color(0xFF4A7F98);
  static Color get white           => _isDark ? Colors.white             : const Color(0xFF0D1B2A);
  static Color get dialogBg        => _isDark ? const Color(0xFF071530) : const Color(0xFFF0F6FF);
  static Color get cardGradientEnd => _isDark ? const Color(0xFF0A2540) : const Color(0xFFDCEEF8);

  // ── Fixed colours (same in both themes) ─────────────────────────────────────
  static const Color green  = Color(0xFF4CAF50);
  static const Color orange = Color(0xFFFF9800);
  static const Color red    = Color(0xFFF44336);
  static const Color yellow = Color(0xFFFFEB3B);
}
