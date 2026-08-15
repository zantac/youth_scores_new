import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/app_provider.dart';

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

/// Three-step competition picker mirroring the website's CompetitionSelect:
/// Season → Competition → المرحلة (age/sector variant). Defaults to the active
/// season if [preferredSeason] is given, otherwise the newest.
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
      ..sort();
    return s;
  }

  List<CompOption> _variantsFor(String season, String name) {
    final v = widget.options
        .where((o) => o.season == season && o.name == name)
        .toList()
      ..sort((a, b) => a.age.compareTo(b.age));
    return v;
  }

  String _variantLabel(CompOption o) {
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

    // Auto-select the only variant of a chosen competition name.
    if (name != null && variants.length == 1 && variants.first.id != widget.value) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.onChanged(variants.first.id);
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
          setState(() => _name = n);
          widget.onChanged(null);
        },
      ),
      const SizedBox(height: 8),
      _dropdown<int>(
        hint: isAr ? 'المرحلة' : 'Stage',
        value: widget.value,
        enabled: name != null,
        items: [
          for (final o in variants)
            DropdownMenuItem(value: o.id, child: Text(_variantLabel(o), overflow: TextOverflow.ellipsis)),
        ],
        onChanged: widget.onChanged,
      ),
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
