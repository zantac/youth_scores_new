import 'package:in_app_review/in_app_review.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Wraps Google Play's In-App Review API (via the `in_app_review` package).
///
/// Two entry points:
///  * [maybePromptForReview] — the *automatic* prompt. It shows Play's native
///    in-app rating card at a natural moment (after the user has opened the app
///    a few times), but only rarely: Google itself quota-limits how often the
///    card can appear, and on top of that we gate on launch count + a long
///    cooldown so we never nag.
///  * [openStoreListing] — the *manual* path behind a "Rate the app" button.
///    A user who taps it expects something to happen, so we go straight to the
///    Play Store listing rather than the quota-limited in-app card.
class ReviewService {
  ReviewService._();
  static final ReviewService instance = ReviewService._();

  final InAppReview _inAppReview = InAppReview.instance;

  static const _kOpenCount    = 'review_open_count';
  static const _kLastPromptMs = 'review_last_prompt_ms';

  // Don't ask before the user has opened the app this many times…
  static const _kMinOpens = 3;
  // …and never re-ask within this window (Play may also silently no-op sooner).
  static const _kCooldown = Duration(days: 60);

  // Guard so a single app session prompts at most once even if the trigger
  // (e.g. the home tab rebuilding) fires again.
  bool _promptedThisSession = false;

  /// Call once per cold start (from AppProvider.init) to count engagement.
  Future<void> registerAppOpen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_kOpenCount, (prefs.getInt(_kOpenCount) ?? 0) + 1);
  }

  /// Show the in-app review card if the user looks engaged and we're outside
  /// the cooldown. Safe to call often — it self-gates and swallows errors.
  Future<void> maybePromptForReview() async {
    if (_promptedThisSession) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final opens = prefs.getInt(_kOpenCount) ?? 0;
      if (opens < _kMinOpens) return;

      final lastMs = prefs.getInt(_kLastPromptMs) ?? 0;
      if (lastMs > 0) {
        final since = DateTime.now().millisecondsSinceEpoch - lastMs;
        if (since < _kCooldown.inMilliseconds) return;
      }

      if (!await _inAppReview.isAvailable()) return;

      _promptedThisSession = true;
      await prefs.setInt(_kLastPromptMs, DateTime.now().millisecondsSinceEpoch);
      await _inAppReview.requestReview();
    } catch (_) {
      // Never let a rating prompt break the app.
    }
  }

  /// Open the Play Store listing directly (manual "Rate the app" button).
  Future<void> openStoreListing() async {
    try {
      await _inAppReview.openStoreListing();
    } catch (_) {/* ignore — nothing actionable for the user */}
  }
}
