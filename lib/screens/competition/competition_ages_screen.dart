import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/config_model.dart';
import '../../core/providers/app_provider.dart';
import '../ads/ad_interstitial_screen.dart';
import 'competition_data_screen.dart';

/// One area (city/section) with the ages that play within it. The public
/// competitions view pivots age→area into area→age: the user picks the area
/// first, then the age within it. Mirrors the website's /competitions page.
class _Area {
  final String name; // already localized
  final List<_AreaAge> ages = [];
  _Area(this.name);
}

class _AreaAge {
  final String label; // localized age name
  final String url;
  _AreaAge({required this.label, required this.url});
}

class CompetitionAgesScreen extends StatelessWidget {
  final Competition competition;
  final String seasonName;

  const CompetitionAgesScreen({
    super.key,
    required this.competition,
    required this.seasonName,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = L10n(context.watch<AppProvider>().locale);
    final locale = l10n.locale;
    final compName = competition.getName(locale);

    // Pivot age→area into area→age. An age with sectors contributes one entry
    // per area; ages with no sector (a single direct link) have no area and
    // fall into the flat [directAges] list shown below the areas.
    final areaIndex = <String, _Area>{};
    final areas = <_Area>[];
    for (final age in competition.ages) {
      final ageLabel = age.getName(locale);
      for (final sec in age.sectors) {
        final secName = sec.getName(locale);
        var area = areaIndex[secName];
        if (area == null) {
          area = _Area(secName);
          areaIndex[secName] = area;
          areas.add(area);
        }
        area.ages.add(_AreaAge(label: ageLabel, url: sec.url));
      }
    }
    final directAges = competition.ages
        .where((a) => a.sectors.isEmpty && a.directMatchesUrl != null)
        .toList();
    // A first-team-only competition has a single age, so the age is the same
    // under every area — repeating it is noise. Let the area itself be the link.
    final singleAge = competition.ages.length == 1;

    void openData(String url, String title) {
      AdInterstitialScreen.open(
        context,
        dataUrl: url,
        destinationBuilder: (_) => CompetitionDataScreen(
          dataUrl: url,
          title: title,
          seasonName: seasonName,
        ),
      );
    }

    final children = <Widget>[];
    for (final area in areas) {
      if (singleAge) {
        final a = area.ages.first;
        children.add(_LeafButton(
          icon: Icons.place,
          label: area.name,
          onTap: () => openData(a.url, '$compName · ${a.label} · ${area.name}'),
        ));
      } else {
        children.add(_AreaHeader(name: area.name));
        for (final a in area.ages) {
          children.add(_SubButton(
            label: a.label,
            onTap: () =>
                openData(a.url, '$compName · ${a.label} · ${area.name}'),
          ));
        }
      }
    }
    for (final age in directAges) {
      final label = age.getName(locale);
      children.add(_LeafButton(
        icon: Icons.groups,
        label: label,
        onTap: () => openData(age.directMatchesUrl!, '$compName · $label'),
      ));
    }

    return Scaffold(
      appBar: AppBar(title: Text(compName)),
      body: children.isEmpty
          ? Center(child: Text(l10n.noData, style: TextStyle(color: AppColors.teal)))
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
              children: children,
            ),
    );
  }
}

// A tappable leaf — a single-age area, or a flat age with its own direct link.
class _LeafButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _LeafButton(
      {required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 20),
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border, width: 1.5),
            gradient: LinearGradient(
              colors: [AppColors.cardBg, AppColors.cardGradientEnd],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.teal.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: AppColors.teal, size: 26),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.aqua.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.aqua.withValues(alpha: 0.2)),
                ),
                child: Text(isAr ? 'عرض' : 'View',
                    style: TextStyle(
                        color: AppColors.aqua,
                        fontSize: 12,
                        fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// Section label above the ages that play in one area.
class _AreaHeader extends StatelessWidget {
  final String name;
  const _AreaHeader({required this.name});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 4),
      child: Row(children: [
        const Text('📍', style: TextStyle(fontSize: 14)),
        const SizedBox(width: 6),
        Text(name,
            style: TextStyle(
                color: AppColors.aqua,
                fontSize: 13,
                fontWeight: FontWeight.bold)),
      ]),
    );
  }
}

// One age within an area.
class _SubButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _SubButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(children: [
            Text('›', style: TextStyle(color: AppColors.aqua, fontSize: 15)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(label,
                  style: TextStyle(color: AppColors.teal, fontSize: 14)),
            ),
            Icon(Icons.chevron_right, color: AppColors.border, size: 18),
          ]),
        ),
      ),
    );
  }
}
