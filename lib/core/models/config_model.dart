class ConfigData {
  final List<Season> seasons;
  final List<Venue> venues;
  final List<NewsItem> news;
  final List<AdItem> ads;
  final AppVersion? appVersion;

  const ConfigData({
    required this.seasons,
    required this.venues,
    required this.news,
    required this.ads,
    this.appVersion,
  });

  factory ConfigData.fromJson(Map<String, dynamic> json) => ConfigData(
    seasons: (json['seasons'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Season.fromJson)
        .toList(),
    venues: (json['venues'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Venue.fromJson)
        .toList(),
    news: (json['news'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(NewsItem.fromJson)
        .toList()
        ..sort((a, b) => b.date.compareTo(a.date)),
    ads: (json['Ads'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(AdItem.fromJson)
        .toList(),
    appVersion: json['app_version'] is Map<String, dynamic>
        ? AppVersion.fromJson(json['app_version'] as Map<String, dynamic>)
        : null,
  );
}

class Season {
  final String name;
  final List<Competition> competitions;

  const Season({required this.name, required this.competitions});

  // The season label is a year range (e.g. "2025-2026"), the same in both
  // languages. The backend may send it either as a plain string or as a
  // localized {ar, en} object — flatten both to one string so the card shows
  // the name, not a raw map.
  static String _seasonName(dynamic v) {
    if (v is Map) return (v['ar'] ?? v['en'] ?? '').toString();
    return v?.toString() ?? '';
  }

  factory Season.fromJson(Map<String, dynamic> json) => Season(
    name: _seasonName(json['season']),
    competitions: (json['competitions'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Competition.fromJson)
        .toList(),
  );
}

class Competition {
  final String id;
  final Map<String, String> name;
  final List<AgeGroup> ages;

  const Competition({required this.id, required this.name, required this.ages});

  String getName(String locale) =>
      name[locale] ?? name['en'] ?? name['ar'] ?? '';

  factory Competition.fromJson(Map<String, dynamic> json) {
    final nameRaw = json['name'];
    Map<String, String> nameMap = {};
    if (nameRaw is Map) {
      nameMap = Map<String, String>.from(
        nameRaw.map((k, v) => MapEntry(k.toString(), v?.toString() ?? '')),
      );
    } else if (nameRaw is String) {
      nameMap = {'ar': nameRaw, 'en': nameRaw};
    }
    return Competition(
      id: json['competition_id']?.toString() ?? '',
      name: nameMap,
      ages: (json['ages'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(AgeGroup.fromJson)
          .toList(),
    );
  }
}

class AgeGroup {
  final String age;
  // Bilingual age-group label (config `age_name`). `age` stays a plain string
  // for older data; prefer the localized name and fall back to it.
  final Map<String, String>? ageName;
  final List<int>? matchDays;
  final String? directMatchesUrl;
  final List<Sector> sectors;

  const AgeGroup({
    required this.age,
    this.ageName,
    this.matchDays,
    this.directMatchesUrl,
    this.sectors = const [],
  });

  bool get hasSectors => sectors.isNotEmpty;

  String getName(String locale) {
    final n = ageName;
    if (n != null) {
      final v = n[locale] ?? n['ar'] ?? n['en'];
      if (v != null && v.isNotEmpty) return v;
    }
    return age;
  }

  factory AgeGroup.fromJson(Map<String, dynamic> json) {
    final sectorRaw = json['sector'];
    final urlRaw    = json['matchesurl'];

    final ageNameRaw = json['age_name'];
    Map<String, String>? ageNameMap;
    if (ageNameRaw is Map && ageNameRaw.isNotEmpty) {
      ageNameMap = Map<String, String>.from(
        ageNameRaw.map((k, v) => MapEntry(k.toString(), v?.toString() ?? '')),
      );
    } else if (ageNameRaw is String && ageNameRaw.isNotEmpty) {
      ageNameMap = {'ar': ageNameRaw, 'en': ageNameRaw};
    }

    List<Sector> sectors = [];
    String? directUrl;

    if (sectorRaw is Map && sectorRaw.isNotEmpty) {
      // JSON: sector: { ar: [...], en: [...] }  +  matchesurl: [...]
      final arNames = _toStringList(sectorRaw['ar']);
      final enNames = _toStringList(sectorRaw['en']);
      final urls    = _toStringList(urlRaw);

      for (var i = 0; i < urls.length; i++) {
        if (urls[i].isEmpty) continue;
        sectors.add(Sector(
          name: {
            'ar': i < arNames.length ? arNames[i] : '',
            'en': i < enNames.length ? enNames[i] : '',
          },
          url: urls[i],
        ));
      }
    } else if (sectorRaw is List && sectorRaw.isNotEmpty) {
      // Legacy format: sector is a flat list of strings
      final urls = _toStringList(urlRaw);
      for (var i = 0; i < sectorRaw.length; i++) {
        final name = sectorRaw[i]?.toString() ?? '';
        final url  = i < urls.length ? urls[i] : '';
        if (name.isNotEmpty && url.isNotEmpty) {
          sectors.add(Sector(name: {'ar': name, 'en': name}, url: url));
        }
      }
    } else {
      // No sectors — single direct URL
      if (urlRaw is String) {
        directUrl = urlRaw.isNotEmpty ? urlRaw : null;
      } else if (urlRaw is List && urlRaw.isNotEmpty) {
        directUrl = urlRaw.first?.toString();
      }
    }

    final matchDaysRaw = json['match_days'];
    final matchDays = matchDaysRaw is List
        ? matchDaysRaw.map((e) => int.tryParse(e.toString()) ?? -1).where((d) => d >= 0).toList()
        : null;

    return AgeGroup(
      age: json['age']?.toString() ?? '',
      ageName: ageNameMap,
      matchDays: matchDays,
      directMatchesUrl: directUrl,
      sectors: sectors,
    );
  }

  static List<String> _toStringList(dynamic raw) {
    if (raw is List) {
      return raw.map((e) => e?.toString() ?? '').toList();
    }
    return const [];
  }
}

class Sector {
  final Map<String, String> name;
  final String url;

  const Sector({required this.name, required this.url});

  String getName(String locale) =>
      name[locale] ?? name['ar'] ?? name['en'] ?? '';}


class Venue {
  final String id;
  final Map<String, String> name;
  final String? url;

  const Venue({required this.id, required this.name, this.url});

  String getName(String locale) =>
      name[locale] ?? name['ar'] ?? name['en'] ?? '';

  factory Venue.fromJson(Map<String, dynamic> json) {
    final nameRaw = json['name'];
    Map<String, String> nameMap = {};
    if (nameRaw is Map) {
      nameMap = Map<String, String>.from(
        nameRaw.map((k, v) => MapEntry(k.toString(), v?.toString() ?? '')),
      );
    } else if (nameRaw is String) {
      nameMap = {'ar': nameRaw, 'en': nameRaw};
    }
    return Venue(
      id: json['venue_id']?.toString() ?? '',
      name: nameMap,
      url: json['url']?.toString(),
    );
  }
}

class NewsItem {
  final String date;
  final Map<String, String> title;
  final String? image;
  final Map<String, String>? details;
  final List<String> images;

  const NewsItem({
    required this.date,
    required this.title,
    this.image,
    this.details,
    this.images = const [],
  });

  String getTitle(String locale) =>
      title[locale] ?? title['ar'] ?? title['en'] ?? '';

  String? getDetails(String locale) {
    if (details == null) return null;
    final val = details![locale] ?? details!['ar'] ?? details!['en'];
    return (val == null || val.isEmpty) ? null : val;
  }

  List<String> get allImages {
    if (images.isNotEmpty) return images;
    if (image != null && image!.startsWith('http')) return [image!];
    return [];
  }

  factory NewsItem.fromJson(Map<String, dynamic> json) {
    final titleRaw = json['title'];
    Map<String, String> titleMap = {};
    if (titleRaw is Map) {
      titleMap = Map<String, String>.from(
        titleRaw.map((k, v) => MapEntry(k.toString(), v?.toString() ?? '')),
      );
    } else if (titleRaw is String) {
      titleMap = {'ar': titleRaw, 'en': titleRaw};
    }

    final detailsRaw = json['details'];
    Map<String, String>? detailsMap;
    if (detailsRaw is Map) {
      detailsMap = Map<String, String>.from(
        detailsRaw.map((k, v) => MapEntry(k.toString(), v?.toString() ?? '')),
      );
    } else if (detailsRaw is String && detailsRaw.isNotEmpty) {
      detailsMap = {'ar': detailsRaw, 'en': detailsRaw};
    }

    return NewsItem(
      date:    json['date']?.toString() ?? '',
      title:   titleMap,
      image:   json['image']?.toString(),
      details: detailsMap,
      images: (json['images'] as List? ?? [])
          .map((e) => e?.toString() ?? '')
          .where((s) => s.startsWith('http'))
          .toList(),
    );
  }
}

class AdItem {
  final String name;
  final String? image;
  final String? youtubeVideo;
  final String? facebookLink;
  final String? mobileNumber;
  final String? whatsappNumber;
  final String? location;
  final String? locationUrl;
  final String? expireDate;

  const AdItem({
    required this.name,
    this.image,
    this.youtubeVideo,
    this.facebookLink,
    this.mobileNumber,
    this.whatsappNumber,
    this.location,
    this.locationUrl,
    this.expireDate,
  });

  factory AdItem.fromJson(Map<String, dynamic> json) => AdItem(
    name: json['name']?.toString() ?? '',
    image: json['image']?.toString(),
    youtubeVideo: json['youtube_video']?.toString(),
    facebookLink: json['facebook_link']?.toString(),
    mobileNumber: json['mobile_number']?.toString(),
    whatsappNumber: json['whatsapp_number']?.toString(),
    location: json['location']?.toString(),
    locationUrl: json['location_url']?.toString(),
    expireDate: json['expire_date']?.toString(),
  );
}

class AppVersion {
  final String versionCode;
  final String versionName;

  const AppVersion({required this.versionCode, required this.versionName});

  factory AppVersion.fromJson(Map<String, dynamic> json) => AppVersion(
    versionCode: json['version_code']?.toString() ?? '',
    versionName: json['version_name']?.toString() ?? '',
  );
}
