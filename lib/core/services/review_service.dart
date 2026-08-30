import 'package:in_app_review/in_app_review.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// App-rating prompts, wrapping Google Play's In-App Review API (`in_app_review`).
///
/// Entry points:
///  * [shouldShowCustomPrompt] — gate for our own "enjoying the app?" dialog,
///    the *reliable* automatic ask. Google's native card ([maybePromptForReview])
///    is quota-limited and frequently never appears (and only on Play-installed
///    builds), so we ask ourselves and, on accept, open the Play listing.
///  * [maybePromptForReview] — best-effort attempt at Play's native card. Kept
///    for completeness; may show nothing.
///  * [openStoreListing] — go straight to the Play Store listing (the manual
///    "Rate the app" button and the custom prompt's "Rate now").
class ReviewService {
  ReviewService._();
  static final ReviewService instance = ReviewService._();

  final InAppReview _inAppReview = InAppReview.instance;

  static const _kOpenCount     = 'review_open_count';
  static const _kLastPromptMs  = 'review_last_prompt_ms';
  // The custom "enjoying the app?" prompt keeps its own state.
  static const _kCustomLastMs  = 'rate_prompt_last_ms';
  static const _kCustomDone    = 'rate_prompt_done';   // rated or dismissed for good

  // Don't ask before the user has opened the app this many times…
  static const _kMinOpens = 3;
  // …and never re-ask within this window (Play may also silently no-op sooner).
  static const _kCooldown = Duration(days: 60);

  // Guard so a single app session prompts at most once even if the trigger
  // (e.g. the home tab rebuilding) fires again.
  bool _promptedThisSession = false;
  bool _customShownThisSession = false;

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

  /// Whether to show the custom "enjoying the app?" prompt now. Same engagement
  /// gate as the native card (>= min opens), but reliable: it's our own dialog,
  /// and accepting opens the Play listing. Once per session, not if already
  /// handled, and outside the cooldown. Records the show time so "Later" (or a
  /// dismiss) means don't-ask-again for the cooldown window.
  Future<bool> shouldShowCustomPrompt() async {
    if (_customShownThisSession) return false;
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(_kCustomDone) ?? false) return false;
      if ((prefs.getInt(_kOpenCount) ?? 0) < _kMinOpens) return false;
      final lastMs = prefs.getInt(_kCustomLastMs) ?? 0;
      if (lastMs > 0 &&
          DateTime.now().millisecondsSinceEpoch - lastMs < _kCooldown.inMilliseconds) {
        return false;
      }
      _customShownThisSession = true;
      await prefs.setInt(_kCustomLastMs, DateTime.now().millisecondsSinceEpoch);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// The user tapped "Rate now" — they've handled it, so never prompt again.
  Future<void> markRatePromptDone() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_kCustomDone, true);
    } catch (_) {}
  }

  /// Open the Play Store listing directly (manual "Rate the app" button and the
  /// custom prompt's "Rate now"). Always works, unlike the quota-limited card.
  Future<void> openStoreListing() async {
    try {
      await _inAppReview.openStoreListing();
    } catch (_) {/* ignore — nothing actionable for the user */}
  }
}
