import 'dart:math';
import '../models/config_model.dart';

/// Pick one ad weighted by its `weight` (higher weight → shown more often).
/// Returns null for an empty list.
AdItem? weightedPickAd(List<AdItem> ads) {
  if (ads.isEmpty) return null;
  int w(AdItem a) => a.weight > 0 ? a.weight : 1;
  final total = ads.fold<int>(0, (s, a) => s + w(a));
  var r = Random().nextInt(total);
  for (final a in ads) {
    r -= w(a);
    if (r < 0) return a;
  }
  return ads.last;
}
