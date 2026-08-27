/// Rewrite a Cloudinary delivery URL to request an auto-optimized variant by
/// inserting transformation flags after "/image/upload/": `f_auto` (best format
/// the client supports), `q_auto` (auto quality) and, when a width is given,
/// `w_<width>,c_limit` (shrinks large originals, never upscales). Typically cuts
/// downloaded bytes 30–60% — which matters because the app shares the website's
/// bandwidth-metered Cloudinary account.
///
/// A no-op for empty URLs, non-Cloudinary URLs, or ones that already carry these
/// flags, so it is safe to wrap any image URL (`/uploads/…`, asset hosts, etc.).
/// Mirrors the website's `cloudinaryUrl()` in web/src/lib/utils.ts.
String cloudinaryUrl(String src, {int? width}) {
  if (src.isEmpty || !src.contains('res.cloudinary.com')) return src;
  const marker = '/image/upload/';
  final at = src.indexOf(marker);
  if (at == -1) return src;
  final rest = src.substring(at + marker.length);
  final firstSeg = rest.split('/').first;
  if (RegExp(r'(^|,)(f_auto|q_auto)(,|$)').hasMatch(firstSeg)) return src;
  final flags = width != null ? 'f_auto,q_auto,w_$width,c_limit' : 'f_auto,q_auto';
  return '${src.substring(0, at + marker.length)}$flags/$rest';
}
