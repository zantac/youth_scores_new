import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';

/// First-party ad analytics: per-ad impression/click totals + a 30-day trend.
class AdminAdStatsScreen extends StatefulWidget {
  final AdminApi api;
  final String token;
  const AdminAdStatsScreen({super.key, required this.api, required this.token});

  @override
  State<AdminAdStatsScreen> createState() => _AdminAdStatsScreenState();
}

class _AdminAdStatsScreenState extends State<AdminAdStatsScreen> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.adStats(widget.token);
  }

  void _reload() =>
      setState(() => _future = widget.api.adStats(widget.token));

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Scaffold(
      appBar: AppBar(
        title: Text(isAr ? 'إحصائيات الإعلانات' : 'Ad stats'),
        actions: [
          IconButton(onPressed: _reload, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError || snap.data == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(
                    snap.error?.toString().replaceFirst('Exception: ', '') ??
                        (isAr ? 'تعذّر التحميل' : 'Failed to load'),
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.white),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(onPressed: _reload, child: const Text('Retry')),
                ]),
              ),
            );
          }

          final data = snap.data!;
          final ads = (data['ads'] as List? ?? [])
              .whereType<Map>()
              .map((e) => e.cast<String, dynamic>())
              .toList();
          final daily = (data['daily'] as List? ?? [])
              .whereType<Map>()
              .map((e) => e.cast<String, dynamic>())
              .toList();

          int toInt(dynamic v) =>
              v is int ? v : int.tryParse('${v ?? 0}') ?? 0;
          final totalImpr =
              ads.fold<int>(0, (s, a) => s + toInt(a['impressions']));
          final totalClk =
              ads.fold<int>(0, (s, a) => s + toInt(a['clicks']));
          final ctr =
              totalImpr > 0 ? (totalClk / totalImpr * 100) : 0.0;

          return RefreshIndicator(
            onRefresh: () async => _reload(),
            child: ListView(
              padding: const EdgeInsets.all(14),
              children: [
                // ── Totals ─────────────────────────────────────────────────
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  decoration: BoxDecoration(
                    color: AppColors.cardBg,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _stat('$totalImpr', isAr ? 'مشاهدات' : 'Impressions',
                          AppColors.aqua),
                      _divider(),
                      _stat('$totalClk', isAr ? 'نقرات' : 'Clicks',
                          AppColors.green),
                      _divider(),
                      _stat('${ctr.toStringAsFixed(1)}%',
                          isAr ? 'نسبة النقر' : 'CTR', AppColors.orange),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // ── 30-day trend ───────────────────────────────────────────
                if (daily.isNotEmpty) ...[
                  Text(isAr ? 'آخر 30 يوم — مشاهدات' : 'Last 30 days — impressions',
                      style: TextStyle(
                          color: AppColors.aqua,
                          fontSize: 13,
                          fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  _DailyBars(daily: daily),
                  const SizedBox(height: 14),
                ],

                // ── Per ad ─────────────────────────────────────────────────
                Text(isAr ? 'لكل إعلان' : 'Per ad',
                    style: TextStyle(
                        color: AppColors.aqua,
                        fontSize: 13,
                        fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (ads.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Center(
                        child: Text(isAr ? 'لا بيانات بعد' : 'No data yet',
                            style: TextStyle(color: AppColors.hint))),
                  )
                else
                  ...ads.map((a) => _adRow(a, toInt, isAr)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _divider() =>
      Container(width: 1, height: 40, color: AppColors.border);

  Widget _stat(String value, String label, Color color) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value,
              style: TextStyle(
                  color: color, fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(color: AppColors.hint, fontSize: 11)),
        ],
      );

  Widget _adRow(Map<String, dynamic> a, int Function(dynamic) i, bool isAr) {
    final impr = i(a['impressions']);
    final clk = i(a['clicks']);
    final ctr = a['ctr'];
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text('${a['name'] ?? ''}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: AppColors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.bold)),
          ),
          _pill('$impr', isAr ? 'مشاهدة' : 'imp', AppColors.aqua),
          const SizedBox(width: 8),
          _pill('$clk', isAr ? 'نقرة' : 'clk', AppColors.green),
          const SizedBox(width: 8),
          _pill('$ctr%', 'CTR', AppColors.orange),
        ],
      ),
    );
  }

  Widget _pill(String value, String label, Color color) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value,
              style: TextStyle(
                  color: color, fontSize: 14, fontWeight: FontWeight.bold)),
          Text(label, style: TextStyle(color: AppColors.hint, fontSize: 9)),
        ],
      );
}

// Compact 30-day impressions bar chart.
class _DailyBars extends StatelessWidget {
  final List<Map<String, dynamic>> daily;
  const _DailyBars({required this.daily});

  @override
  Widget build(BuildContext context) {
    int im(Map<String, dynamic> d) =>
        d['impressions'] is int ? d['impressions'] : int.tryParse('${d['impressions'] ?? 0}') ?? 0;
    final maxV = daily.fold<int>(1, (m, d) => im(d) > m ? im(d) : m);
    return Container(
      height: 90,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: daily.map((d) {
          final frac = im(d) / maxV;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Container(
                    height: (frac * 62).clamp(2, 62),
                    decoration: BoxDecoration(
                      color: AppColors.aqua.withValues(alpha: 0.8),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
