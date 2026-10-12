// Canonical display order for the competition families. Names are folded (alef /
// ya / ta-marbuta variants and diacritics) before matching, so a spelling
// variant still lines up. Anything not listed sorts after these, alphabetically.
// Mirrors web/src/lib/compOrder.ts.
const _canonical = [
  'دوري الجمهورية القسم الاول',
  'دوري الجمهورية القسم الثاني أ',
  'دوري الجمهورية القسم الثاني ب',
  'القطاعات',
  'المناطق',
];

final _diacritics = RegExp('[ً-ْـ]');
final _alef = RegExp('[أإآٱ]');
final _spaces = RegExp(r'\s+');

String _fold(String s) => s
    .toLowerCase()
    .replaceAll(_diacritics, '')
    .replaceAll(_alef, 'ا')
    .replaceAll('ى', 'ي')
    .replaceAll('ة', 'ه')
    .replaceAll(_spaces, ' ')
    .trim();

/// Fold Arabic for lenient client-side matching (drop tashkeel/tatweel, unify
/// alef/ya/ta-marbuta, lowercase). Shared with list search/filter boxes.
String foldAr(String s) => _fold(s);

final List<String> _order = _canonical.map(_fold).toList();

int compRank(String name) {
  final i = _order.indexOf(_fold(name));
  return i == -1 ? _order.length : i;
}

/// Sort competition names by the canonical order, then alphabetically.
int compareCompName(String a, String b) {
  final r = compRank(a) - compRank(b);
  return r != 0 ? r : a.compareTo(b);
}
