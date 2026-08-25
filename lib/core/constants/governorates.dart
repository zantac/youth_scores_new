// Egypt's 27 governorates (Arabic + English), for the admin "club city" picker:
// the Arabic field suggests these, and picking one auto-fills the English name.
// Mirrors web/src/lib/governorates.ts.
class Governorate {
  final String ar;
  final String en;
  const Governorate(this.ar, this.en);
}

const List<Governorate> kEgyptGovernorates = [
  Governorate('القاهرة', 'Cairo'),
  Governorate('الجيزة', 'Giza'),
  Governorate('الإسكندرية', 'Alexandria'),
  Governorate('الدقهلية', 'Dakahlia'),
  Governorate('الشرقية', 'Sharqia'),
  Governorate('القليوبية', 'Qalyubia'),
  Governorate('كفر الشيخ', 'Kafr El Sheikh'),
  Governorate('الغربية', 'Gharbia'),
  Governorate('المنوفية', 'Monufia'),
  Governorate('البحيرة', 'Beheira'),
  Governorate('الإسماعيلية', 'Ismailia'),
  Governorate('بورسعيد', 'Port Said'),
  Governorate('السويس', 'Suez'),
  Governorate('دمياط', 'Damietta'),
  Governorate('الفيوم', 'Faiyum'),
  Governorate('بني سويف', 'Beni Suef'),
  Governorate('المنيا', 'Minya'),
  Governorate('أسيوط', 'Asyut'),
  Governorate('سوهاج', 'Sohag'),
  Governorate('قنا', 'Qena'),
  Governorate('الأقصر', 'Luxor'),
  Governorate('أسوان', 'Aswan'),
  Governorate('البحر الأحمر', 'Red Sea'),
  Governorate('الوادي الجديد', 'New Valley'),
  Governorate('مطروح', 'Matrouh'),
  Governorate('شمال سيناء', 'North Sinai'),
  Governorate('جنوب سيناء', 'South Sinai'),
];

// Fold Arabic so a match ignores tashkeel/tatweel and alef/ya/ta spelling.
String foldAr(String s) => s
    .replaceAll(RegExp(r'[ً-ْـ]'), '')
    .replaceAll(RegExp(r'[أإآ]'), 'ا')
    .replaceAll('ى', 'ي')
    .replaceAll('ة', 'ه')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

/// The English name for a governorate given its Arabic name, or null when the
/// Arabic text isn't one of the governorates (a custom city).
String? governorateEn(String ar) {
  final key = foldAr(ar);
  if (key.isEmpty) return null;
  for (final g in kEgyptGovernorates) {
    if (foldAr(g.ar) == key) return g.en;
  }
  return null;
}
