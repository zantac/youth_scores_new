import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/providers/app_provider.dart';
import '../../core/utils/safe_launch.dart';
import '../../widgets/common/empty_widget.dart';
import '../../widgets/common/loading_widget.dart';
import '../../widgets/common/search_field.dart';

class VenuesScreen extends StatefulWidget {
  const VenuesScreen({super.key});

  @override
  State<VenuesScreen> createState() => _VenuesScreenState();
}

class _VenuesScreenState extends State<VenuesScreen> {
  final _ctrl  = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    // Opening the Venues tab clears its bottom-bar badge. Deferred past the first
    // frame so notifyListeners() doesn't fire during the parent's build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<AppProvider>().markVenuesSeen();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AppProvider>();
    final l10n     = L10n(provider.locale);

    if (provider.loadingConfig) return LoadingWidget(message: l10n.loading);

    final locale = provider.locale;
    final all    = provider.config?.venues ?? [];
    final venues = _query.isEmpty
        ? all
        : all
            .where((v) =>
                v.getName(locale).toLowerCase().contains(_query.toLowerCase()))
            .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: SearchField(
            controller: _ctrl,
            hint: l10n.search,
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        Expanded(
          child: all.isEmpty
              ? EmptyWidget(message: l10n.noData, icon: Icons.stadium_outlined)
              : venues.isEmpty
                  ? EmptyWidget(message: l10n.noData, icon: Icons.search_off)
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                      itemCount: venues.length,
                      itemBuilder: (_, i) {
                        final v = venues[i];
                        return Card(
                          child: ListTile(
                            leading: Icon(Icons.stadium, color: AppColors.aqua),
                            title: Text(v.getName(locale),
                                style: TextStyle(color: AppColors.white)),
                            trailing: v.url != null
                                ? IconButton(
                                    icon: Icon(Icons.map_outlined,
                                        color: AppColors.teal),
                                    tooltip: l10n.openMap,
                                    onPressed: () => launchExternal(safeUri(v.url)),
                                  )
                                : null,
                            onTap: v.url != null
                                ? () => launchExternal(safeUri(v.url))
                                : null,
                          ),
                        );
                      },
                    ),
        ),
      ],
    );
  }
}
