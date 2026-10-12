import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/app_provider.dart';
import '../../core/utils/comp_order.dart';

/// One competition flattened for the picker. [name]/[sector] are already
/// localized by the caller.
class CompOption {
  final int id;
  final String season;
  final String name;
  final String age;
  final String sector;
  const CompOption({
    required this.id,
    required this.season,
    required this.name,
    this.age = '',
    this.sector = '',
  });
}

/// Four-step competition picker mirroring the website's CompetitionSelect:
/// Season → البطولة (competition) → القطاع (sector, only when the competition is
/// split into areas) → المرحلة (age, only when more than one remains). Defaults to
/// the active season if [preferredSeason] is given, otherwise the newest.
class AdminCompetitionSelect extends StatefulWidget {
  final List<CompOption> options;
  final int? value;
  final ValueChanged<int?> onChanged;
  final String? preferredSeason;
  const AdminCompetitionSelect({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
    this.preferredSeason,
  });

  @override
  State<AdminCompetitionSelect> createState() => _AdminCompetitionSelectState();
}

class _AdminCompetitionSelectState extends State<AdminCompetitionSelect> {
  String? _season;
  String? _name;
  String _sector = ''; // '' = all areas (sectors)

  List<String> get _seasons {
    final s = {for (final o in widget.options) o.season}
        .where((s) => s.isNotEmpty)
        .toList()
      ..sort((a, b) => b.compareTo(a)); // newest first
    return s;
  }

  @override
  void initState() {
    super.initState();
    _syncFromValue();
  }

  @override
  void didUpdateWidget(AdminCompetitionSelect old) {
    super.didUpdateWidget(old);
    if (old.options.length != widget.options.length || old.value != widget.value) {
      _syncFromValue();
    }
  }

  // Keep the upper levels in step with an externally-set value, and default the
  // season when nothing is chosen yet.
  void _syncFromValue() {
    final seasons = _seasons;
    final sel = widget.options.where((o) => o.id == widget.value).toList();
    if (sel.isNotEmpty) {
      _season = sel.first.season;
      _name = sel.first.name;
      _sector = sel.first.sector;
      return;
    }
    if ((_season == null || !seasons.contains(_season)) && seasons.isNotEmpty) {
      final pref = widget.preferredSeason;
      _season = (pref != null && seasons.contains(pref)) ? pref : seasons.first;
    }
  }

  List<String> _namesFor(String season) {
    final s = {
      for (final o in widget.options.where((o) => o.season == season)) o.name
    }.where((n) => n.isNotEmpty).toList()
      ..sort(compareCompName);
    return s;
  }

  List<CompOption> _variantsFor(String season, String name) => widget.options
      .where((o) => o.season == season && o.name == name)
      .toList();

  // Distinct non-empty areas within a competition; empty → not split into areas.
  List<String> _sectorsOf(List<CompOption> variants) =>
      ({for (final v in variants) v.sector}..remove('')).toList()..sort();

  // The age variants left after the (optional) area filter.
  List<CompOption> _agesOf(List<CompOption> variants, String sector) => variants
      .where((o) => sector.isEmpty || o.sector == sector)
      .toList()
    ..sort((a, b) => a.age.compareTo(b.age));

  // Without an area filter, disambiguate same ages across areas by appending the
  // area; once an area is chosen the label is just the age.
  String _variantLabel(CompOption o) {
    if (_sector.isNotEmpty) return o.age.isEmpty ? o.name : o.age;
    final parts = [o.age, o.sector].where((s) => s.isNotEmpty).toList();
    return parts.isEmpty ? o.name : parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final seasons = _seasons;
    final season = _season;
    final names = season == null ? const <String>[] : _namesFor(season);
    final name = _name;
    final variants =
        (season != null && name != null) ? _variantsFor(season, name) : const <CompOption>[];
    final sectors = _sectorsOf(variants);
    final hasSectors = sectors.isNotEmpty;
    final ages = _agesOf(variants, _sector);

    // Auto-select the only stage left after any area filter.
    if (name != null && ages.length == 1 && ages.first.id != widget.value) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.onChanged(ages.first.id);
      });
    }

    return Column(children: [
      _dropdown<String>(
        hint: isAr ? 'الموسم' : 'Season',
        value: season,
        items: [for (final s in seasons) DropdownMenuItem(value: s, child: Text(s))],
        onChanged: (s) {
          setState(() {
            _season = s;
            _name = null;
            _sector = '';
          });
          widget.onChanged(null);
        },
      ),
      const SizedBox(height: 8),
      _dropdown<String>(
        hint: isAr ? 'البطولة' : 'Competition',
        value: name,
        enabled: season != null,
        items: [
          for (final n in names)
            DropdownMenuItem(value: n, child: Text(n, overflow: TextOverflow.ellipsis)),
        ],
        onChanged: (n) {
          setState(() {
            _name = n;
            _sector = '';
          });
          widget.onChanged(null);
        },
      ),
      // Area (sector) filter — only when the competition is split into areas.
      if (hasSectors) ...[
        const SizedBox(height: 8),
        _dropdown<String>(
          hint: isAr ? 'القطاع' : 'Area',
          value: _sector,
          enabled: name != null,
          items: [
            DropdownMenuItem(value: '', child: Text(isAr ? 'كل القطاعات' : 'All areas')),
            for (final s in sectors)
              DropdownMenuItem(value: s, child: Text(s, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (s) {
            setState(() => _sector = s ?? '');
            widget.onChanged(null);
          },
        ),
      ],
      // Hide the one-item «المرحلة» picker: a single-age competition's lone
      // variant is already auto-selected above. Mirrors `showAges = ages.length > 1`.
      if (ages.length > 1) ...[
        const SizedBox(height: 8),
        _dropdown<int>(
          hint: isAr ? 'المرحلة' : 'Stage',
          value: widget.value,
          enabled: name != null,
          items: [
            for (final o in ages)
              DropdownMenuItem(value: o.id, child: Text(_variantLabel(o), overflow: TextOverflow.ellipsis)),
          ],
          onChanged: widget.onChanged,
        ),
      ],
    ]);
  }

  Widget _dropdown<T>({
    required String hint,
    required T? value,
    required List<DropdownMenuItem<T>> items,
    required ValueChanged<T?> onChanged,
    bool enabled = true,
  }) {
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: DropdownButtonFormField<T>(
        initialValue: value,
        isExpanded: true,
        dropdownColor: AppColors.cardBg,
        style: TextStyle(color: AppColors.white, fontSize: 13),
        hint: Text(hint, style: TextStyle(color: AppColors.hint, fontSize: 13)),
        decoration: InputDecoration(
          isDense: true,
          filled: true,
          fillColor: AppColors.cardBg,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: AppColors.border),
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: AppColors.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: AppColors.aqua),
          ),
        ),
        items: items,
        onChanged: enabled ? onChanged : null,
      ),
    );
  }
}
