import 'package:url_launcher/url_launcher.dart';

/// Schemes we allow to open from admin/user-supplied link fields. Blocks
/// `javascript:`, `intent:`, `file:` and other unexpected/abusable schemes.
/// Cleartext `http` is intentionally absent: safeUri() upgrades it to https
/// rather than ever launching a plaintext URL.
const _allowedSchemes = {'https', 'tel', 'mailto', 'whatsapp'};

/// Parse + scheme-check an admin-supplied URL string. Returns null for anything
/// that isn't a safe external scheme. Bare domains ("example.com/x") are
/// upgraded to https.
Uri? safeUri(String? raw) {
  if (raw == null) return null;
  final s = raw.trim();
  if (s.isEmpty) return null;
  final uri = Uri.tryParse(s);
  if (uri == null) return null;
  if (!uri.hasScheme) {
    final https = Uri.tryParse('https://$s');
    return (https != null && https.host.isNotEmpty) ? https : null;
  }
  // Upgrade cleartext http to https so an existing http link still opens, but
  // never over plaintext.
  if (uri.scheme.toLowerCase() == 'http') {
    return uri.replace(scheme: 'https');
  }
  return _allowedSchemes.contains(uri.scheme.toLowerCase()) ? uri : null;
}

/// Open an external URL safely: scheme-checked, existence-checked, and never
/// throwing (a malformed/absent-handler URL just no-ops). Returns whether it
/// launched.
Future<bool> launchExternal(
  Uri? uri, {
  LaunchMode mode = LaunchMode.externalApplication,
}) async {
  if (uri == null) return false;
  if (!_allowedSchemes.contains(uri.scheme.toLowerCase())) return false;
  try {
    if (!await canLaunchUrl(uri)) return false;
    return await launchUrl(uri, mode: mode);
  } catch (_) {
    return false;
  }
}
