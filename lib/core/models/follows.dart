// Locally-followed competitions and teams (favorites). Stored as small records
// — not just ids — so the home "Following" section can render a label/logo and
// navigate without the item being present in the current match window.

Map<String, String> _locMap(dynamic raw) {
  if (raw is Map) {
    return raw.map((k, v) => MapEntry(k.toString(), v?.toString() ?? ''))
        .cast<String, String>();
  }
  if (raw is String && raw.isNotEmpty) return {'ar': raw, 'en': raw};
  return {};
}

String _pick(Map<String, String> m, String locale) =>
    m[locale] ?? m['ar'] ?? m['en'] ?? '';

class FollowedComp {
  final String id;
  final Map<String, String> title;
  final String dataUrl;
  const FollowedComp({required this.id, required this.title, required this.dataUrl});

  String getTitle(String locale) => _pick(title, locale);

  Map<String, dynamic> toJson() =>
      {'id': id, 'title': title, 'data_url': dataUrl};

  factory FollowedComp.fromJson(Map<String, dynamic> j) => FollowedComp(
        id: j['id']?.toString() ?? '',
        title: _locMap(j['title']),
        dataUrl: j['data_url']?.toString() ?? '',
      );
}

class FollowedTeam {
  final String id;
  final Map<String, String> name;
  final String? logo;
  // The competition data URL the team was followed from, so the home "Following"
  // chip can load that competition before opening the (provider-backed) team page.
  final String? compDataUrl;
  const FollowedTeam({
    required this.id,
    required this.name,
    this.logo,
    this.compDataUrl,
  });

  String getName(String locale) => _pick(name, locale);

  Map<String, dynamic> toJson() =>
      {'id': id, 'name': name, 'logo': logo, 'comp_data_url': compDataUrl};

  factory FollowedTeam.fromJson(Map<String, dynamic> j) => FollowedTeam(
        id: j['id']?.toString() ?? '',
        name: _locMap(j['name']),
        logo: (j['logo']?.toString().isNotEmpty ?? false)
            ? j['logo'].toString()
            : null,
        compDataUrl: (j['comp_data_url']?.toString().isNotEmpty ?? false)
            ? j['comp_data_url'].toString()
            : null,
      );
}
