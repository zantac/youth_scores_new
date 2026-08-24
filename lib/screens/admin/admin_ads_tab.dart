import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/admin_data.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';
import 'admin_upload_button.dart';

/// Ads — a top-level admin tab (mirrors the website's /admin/ads). Two sub-tabs:
/// «الإعلانات» to create/manage ads, and «الإحصائيات» for the analytics.
class AdminAdsTab extends StatelessWidget {
  const AdminAdsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          TabBar(
            labelColor: AppColors.aqua,
            unselectedLabelColor: AppColors.hint,
            indicatorColor: AppColors.aqua,
            tabs: [
              Tab(text: isAr ? 'الإعلانات' : 'Ads'),
              Tab(text: isAr ? 'الإحصائيات' : 'Stats'),
            ],
          ),
          const Expanded(
            child: TabBarView(
              children: [_AdsSection(), _AdStatsSection()],
            ),
          ),
        ],
      ),
    );
  }
}

InputDecoration _dec(String? hint) => InputDecoration(
      isDense: true,
      hintText: hint,
      hintStyle: TextStyle(color: AppColors.hint, fontSize: 13),
      filled: true,
      fillColor: AppColors.darkBg,
      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: AppColors.border),
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: AppColors.aqua),
      ),
    );

// ── Ads: create/manage list ──────────────────────────────────────────────────

class _AdsSection extends StatefulWidget {
  const _AdsSection();

  @override
  State<_AdsSection> createState() => _AdsSectionState();
}

class _AdsSectionState extends State<_AdsSection> {
  final _api = AdminApi();
  bool _loading = true;
  String? _error;
  List<AdminAd> _ads = const [];

  String get _token => context.read<AdminAuth>().token ?? '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final v = await _api.listAds(_token);
      if (!mounted) return;
      setState(() {
        _ads = v;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _openEditor([AdminAd? ad]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.dialogBg,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => _AdEditor(api: _api, token: _token, ad: ad),
    );
    if (saved == true) _load();
  }

  Future<void> _delete(AdminAd a) async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.dialogBg,
        title: Text(isAr ? 'حذف الإعلان' : 'Delete ad',
            style: TextStyle(color: AppColors.white)),
        content: Text('«${a.name}»', style: TextStyle(color: AppColors.teal)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(isAr ? 'إلغاء' : 'Cancel')),
          FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.red),
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(isAr ? 'حذف' : 'Delete')),
        ],
      ),
    );
    if (ok == true) {
      try {
        await _api.deleteAd(_token, a.id);
        if (!mounted) return;
        _load();
      } catch (e) {
        if (!mounted) return;
        if (handleAdminError(context, e)) return;
        showAdminError(context, e);
      }
    }
  }

  bool _expired(String? d) {
    if (d == null || d.isEmpty) return false;
    final dt = DateTime.tryParse(d);
    if (dt == null) return false;
    final now = DateTime.now();
    return dt.isBefore(DateTime(now.year, now.month, now.day));
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_error!, style: TextStyle(color: AppColors.white)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _load, child: const Text('Retry')),
        ]),
      );
    }
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.aqua,
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add),
        label: Text(isAr ? 'إعلان' : 'Ad'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _ads.isEmpty
            ? ListView(children: [
                const SizedBox(height: 120),
                Center(
                    child: Text(isAr ? 'لا إعلانات' : 'No ads',
                        style: TextStyle(color: AppColors.hint))),
              ])
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
                itemCount: _ads.length,
                itemBuilder: (_, i) {
                  final a = _ads[i];
                  final expired = _expired(a.expireDate);
                  return Opacity(
                    opacity: expired ? 0.5 : 1,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: AppColors.cardBg,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(children: [
                        ClipRRect(
                          borderRadius:
                              const BorderRadius.horizontal(left: Radius.circular(12)),
                          child: Container(
                            width: 64,
                            height: 64,
                            color: AppColors.darkBg,
                            child: a.image != null
                                ? Image.network(a.image!, fit: BoxFit.cover,
                                    errorBuilder: (_, _, _) => Icon(
                                        Icons.image_not_supported,
                                        color: AppColors.hint, size: 20))
                                : Icon(Icons.campaign, color: AppColors.hint),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(a.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      color: AppColors.white,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 13.5)),
                              const SizedBox(height: 2),
                              Text(
                                a.expireDate == null || a.expireDate!.isEmpty
                                    ? (isAr ? 'دائم' : 'Permanent')
                                    : (expired
                                        ? (isAr ? 'منتهٍ · ${a.expireDate}' : 'Expired · ${a.expireDate}')
                                        : (isAr ? 'ينتهي ${a.expireDate}' : 'Expires ${a.expireDate}')),
                                style: TextStyle(
                                    color: expired ? AppColors.red : AppColors.hint,
                                    fontSize: 11.5),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                            onPressed: () => _openEditor(a),
                            icon: Icon(Icons.edit, color: AppColors.aqua, size: 19)),
                        IconButton(
                            onPressed: () => _delete(a),
                            icon: Icon(Icons.delete_outline, color: AppColors.red, size: 19)),
                      ]),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class _AdEditor extends StatefulWidget {
  final AdminApi api;
  final String token;
  final AdminAd? ad;
  const _AdEditor({required this.api, required this.token, this.ad});

  @override
  State<_AdEditor> createState() => _AdEditorState();
}

class _AdEditorState extends State<_AdEditor> {
  late final Map<String, TextEditingController> _c;
  bool _busy = false;
  bool _active = true;
  String _placement = 'interstitial';

  @override
  void initState() {
    super.initState();
    final a = widget.ad;
    _active = a?.active ?? true;
    _placement = a?.placement ?? 'interstitial';
    _c = {
      'name': TextEditingController(text: a?.name ?? ''),
      'image': TextEditingController(text: a?.image ?? ''),
      'link': TextEditingController(text: a?.link ?? ''),
      'mobile_number': TextEditingController(text: a?.mobileNumber ?? ''),
      'whatsapp_number': TextEditingController(text: a?.whatsappNumber ?? ''),
      'facebook_link': TextEditingController(text: a?.facebookLink ?? ''),
      'youtube_video': TextEditingController(text: a?.youtubeVideo ?? ''),
      'location': TextEditingController(text: a?.location ?? ''),
      'location_url': TextEditingController(text: a?.locationUrl ?? ''),
      'weight': TextEditingController(text: '${a?.weight ?? 1}'),
      'feed_position': TextEditingController(text: '${a?.feedPosition ?? 3}'),
      'feed_repeat':
          TextEditingController(text: a?.feedRepeat?.toString() ?? ''),
      'start_date': TextEditingController(text: a?.startDate ?? ''),
      'expire_date': TextEditingController(text: a?.expireDate ?? ''),
    };
  }

  @override
  void dispose() {
    for (final v in _c.values) {
      v.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (_c['name']!.text.trim().isEmpty) {
      showAdminError(context, isAr ? 'اسم الإعلان مطلوب' : 'Ad name required');
      return;
    }
    setState(() => _busy = true);
    final body = <String, dynamic>{
      for (final e in _c.entries) e.key: e.value.text.trim(),
      'active': _active,
      'placement': _placement,
    };
    try {
      if (widget.ad == null) {
        await widget.api.createAd(widget.token, body);
      } else {
        await widget.api.updateAd(widget.token, widget.ad!.id, body);
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  Widget _placeOpt(String value, String label) {
    final on = _placement == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _placement = value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: on ? AppColors.aqua.withValues(alpha: 0.15) : AppColors.cardBg,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: on ? AppColors.aqua : AppColors.border),
          ),
          child: Text(label,
              style: TextStyle(
                  color: on ? AppColors.aqua : AppColors.hint,
                  fontSize: 12,
                  fontWeight: FontWeight.bold)),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    Widget f(String key, String label, {String? hint}) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _label(label),
            TextField(controller: _c[key], style: _txt(), decoration: _dec(hint)),
          ]),
        );
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.85,
        maxChildSize: 0.95,
        builder: (_, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.all(16),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                    color: AppColors.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            Text(
                widget.ad == null
                    ? (isAr ? 'إعلان جديد' : 'New ad')
                    : (isAr ? 'تعديل الإعلان' : 'Edit ad'),
                style: TextStyle(
                    color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 14),
            f('name', isAr ? 'اسم الإعلان *' : 'Ad name *'),
            f('image', isAr ? 'رابط الصورة (بملء الشاشة)' : 'Image URL (fullscreen)', hint: 'https://…'),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: AdminUploadButton(
                token: widget.token,
                label: isAr ? 'رفع صورة من الجهاز' : 'Upload from device',
                onUploaded: (url) => setState(() => _c['image']!.text = url),
              ),
            ),
            const SizedBox(height: 10),
            f('link', isAr ? '🔗 رابط الإعلان (بالضغط على الصورة)' : '🔗 Ad link (whole-ad tap)', hint: 'https://…'),
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                  isAr ? 'أزرار التواصل تظهر فقط عند تعبئة حقلها.' : 'Contact buttons appear only when filled.',
                  style: TextStyle(color: AppColors.hint, fontSize: 11)),
            ),
            f('mobile_number', isAr ? '📞 رقم الموبايل' : '📞 Mobile number'),
            f('whatsapp_number', isAr ? '💬 واتساب (رقم دولي)' : '💬 WhatsApp (intl)', hint: '201234567890'),
            f('facebook_link', isAr ? '📘 رابط فيسبوك' : '📘 Facebook link', hint: 'https://…'),
            f('youtube_video', isAr ? '▶ فيديو يوتيوب' : '▶ YouTube video', hint: 'https://…'),
            f('location', isAr ? '📍 اسم الموقع' : '📍 Location name'),
            f('location_url', isAr ? '🗺️ رابط الخريطة' : '🗺️ Map URL', hint: 'https://…'),
            f('start_date', isAr ? 'تاريخ البدء (فارغ = الآن)' : 'Start date (empty = now)', hint: 'YYYY-MM-DD'),
            f('expire_date', isAr ? 'تاريخ الانتهاء (فارغ = دائم)' : 'Expiry date (empty = permanent)', hint: 'YYYY-MM-DD'),
            f('weight', isAr ? 'الوزن (الأعلى يظهر أكثر)' : 'Weight (higher shows more)', hint: '1'),
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(children: [
                Expanded(child: _label(isAr ? 'مُفعّل' : 'Active')),
                Switch(
                  value: _active,
                  activeThumbColor: AppColors.aqua,
                  onChanged: (v) => setState(() => _active = v),
                ),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _label(isAr ? 'مكان الظهور' : 'Placement'),
                const SizedBox(height: 6),
                Row(children: [
                  _placeOpt('interstitial', isAr ? 'ملء الشاشة' : 'Fullscreen'),
                  const SizedBox(width: 6),
                  _placeOpt('feed', isAr ? 'في القائمة' : 'Feed'),
                  const SizedBox(width: 6),
                  _placeOpt('both', isAr ? 'كلاهما' : 'Both'),
                ]),
              ]),
            ),
            if (_placement == 'feed' || _placement == 'both') ...[
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                    child: f('feed_position',
                        isAr ? 'الموضع (بعد مباراة رقم N)' : 'Slot (after match N)',
                        hint: '3')),
                const SizedBox(width: 8),
                Expanded(
                    child: f('feed_repeat',
                        isAr ? 'تكرار كل (فارغ = بدون)' : 'Repeat every (empty = none)',
                        hint: isAr ? 'بدون' : 'none')),
              ]),
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                    isAr
                        ? 'تظهر البطاقة بعد هذا العدد من المباريات بدءًا من مباريات اليوم. استخدم صورة بنسبة 2:1 (مثال 1200×600) لأنها تُعرض كاملة بدون عنوان.'
                        : 'Card shows after this many matches starting from today\'s matches. Use a 2:1 image (e.g. 1200×600) — it renders full-bleed with no title.',
                    style: TextStyle(color: AppColors.hint, fontSize: 11)),
              ),
            ],
            const SizedBox(height: 4),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _busy ? null : _save,
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.aqua,
                    padding: const EdgeInsets.symmetric(vertical: 14)),
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(isAr ? 'حفظ' : 'Save',
                        style: const TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  TextStyle _txt() => TextStyle(color: AppColors.white, fontSize: 13);
  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 5, left: 2),
        child: Text(t,
            style: TextStyle(
                color: AppColors.teal, fontSize: 12, fontWeight: FontWeight.bold)),
      );
}

// ── Stats: totals + 30-day line trend + per-ad ────────────────────────────────

class _AdStatsSection extends StatefulWidget {
  const _AdStatsSection();

  @override
  State<_AdStatsSection> createState() => _AdStatsSectionState();
}

class _AdStatsSectionState extends State<_AdStatsSection> {
  final _api = AdminApi();
  late Future<Map<String, dynamic>> _future;

  String get _token => context.read<AdminAuth>().token ?? '';

  @override
  void initState() {
    super.initState();
    _future = _api.adStats(_token);
  }

  void _reload() => setState(() => _future = _api.adStats(_token));

  int _toInt(dynamic v) => v is int ? v : int.tryParse('${v ?? 0}') ?? 0;

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return FutureBuilder<Map<String, dynamic>>(
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

        final totalImpr = ads.fold<int>(0, (s, a) => s + _toInt(a['impressions']));
        final totalClk = ads.fold<int>(0, (s, a) => s + _toInt(a['clicks']));
        final ctr = totalImpr > 0 ? (totalClk / totalImpr * 100) : 0.0;

        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView(
            padding: const EdgeInsets.all(14),
            children: [
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
                    _stat('$totalImpr', isAr ? 'مشاهدات' : 'Impressions', AppColors.aqua),
                    _divider(),
                    _stat('$totalClk', isAr ? 'نقرات' : 'Clicks', AppColors.green),
                    _divider(),
                    _stat('${ctr.toStringAsFixed(1)}%', isAr ? 'نسبة النقر' : 'CTR', AppColors.orange),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              if (daily.isNotEmpty) ...[
                _DailyBars(daily: daily, isAr: isAr),
                const SizedBox(height: 14),
              ],
              Text(isAr ? 'لكل إعلان' : 'Per ad',
                  style: TextStyle(
                      color: AppColors.aqua, fontSize: 13, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              if (ads.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Center(
                      child: Text(isAr ? 'لا بيانات بعد' : 'No data yet',
                          style: TextStyle(color: AppColors.hint))),
                )
              else
                ...ads.map((a) => _adRow(a, isAr)),
            ],
          ),
        );
      },
    );
  }

  Widget _divider() => Container(width: 1, height: 40, color: AppColors.border);

  Widget _stat(String value, String label, Color color) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value,
              style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(color: AppColors.hint, fontSize: 11)),
        ],
      );

  Widget _adRow(Map<String, dynamic> a, bool isAr) {
    final impr = _toInt(a['impressions']);
    final clk = _toInt(a['clicks']);
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
                    color: AppColors.white, fontSize: 14, fontWeight: FontWeight.bold)),
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
              style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.bold)),
          Text(label, style: TextStyle(color: AppColors.hint, fontSize: 9)),
        ],
      );
}

// 30-day impressions as one bar per day. Tapping a bar reads out that day's
// exact date, views and clicks (a bare sparkline showed no numbers, so a day's
// value couldn't be read). The series is zero-filled server side, so every bar
// maps to a real calendar day; a faded stub still marks a zero day. An
// expandable list gives the exact numbers for every active day at a glance.
class _DailyBars extends StatefulWidget {
  final List<Map<String, dynamic>> daily;
  final bool isAr;
  const _DailyBars({required this.daily, required this.isAr});

  @override
  State<_DailyBars> createState() => _DailyBarsState();
}

class _DailyBarsState extends State<_DailyBars> {
  int? _sel; // null = default to the latest day
  bool _showDetails = false;

  int _im(Map<String, dynamic> d) =>
      d['impressions'] is int ? d['impressions'] : int.tryParse('${d['impressions'] ?? 0}') ?? 0;
  int _ck(Map<String, dynamic> d) =>
      d['clicks'] is int ? d['clicks'] : int.tryParse('${d['clicks'] ?? 0}') ?? 0;
  String _date(Map<String, dynamic> d) => '${d['date'] ?? ''}';
  String _md(String s) => s.length >= 10 ? s.substring(5) : s; // MM-DD

  @override
  Widget build(BuildContext context) {
    final isAr = widget.isAr;
    final daily = widget.daily;
    final n = daily.length;
    final maxV = daily.fold<int>(1, (m, d) => _im(d) > m ? _im(d) : m);
    final idx = (_sel != null && _sel! < n) ? _sel! : n - 1;
    final cur = daily[idx];

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Header + selected-day readout.
      Row(children: [
        Text(isAr ? 'آخر 30 يوم' : 'Last 30 days',
            style: TextStyle(color: AppColors.aqua, fontSize: 13, fontWeight: FontWeight.bold)),
        const Spacer(),
        Flexible(
          child: Text(
            '${_date(cur)} · ${_im(cur)} ${isAr ? 'مشاهدة' : 'imp'} · ${_ck(cur)} ${isAr ? 'نقرة' : 'clk'}',
            textAlign: TextAlign.end,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: AppColors.hint, fontSize: 11),
          ),
        ),
      ]),
      const SizedBox(height: 8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        // LTR so the timeline runs oldest→newest left→right regardless of locale.
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: Column(children: [
            SizedBox(
              height: 80,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < n; i++)
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => setState(() => _sel = i),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 1),
                          child: Align(
                            alignment: Alignment.bottomCenter,
                            child: FractionallySizedBox(
                              widthFactor: 1,
                              heightFactor: (_im(daily[i]) / maxV).clamp(0.03, 1.0),
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: i == idx
                                      ? AppColors.aqua
                                      : AppColors.aqua.withValues(
                                          alpha: _im(daily[i]) == 0 ? 0.15 : 0.4),
                                  borderRadius:
                                      const BorderRadius.vertical(top: Radius.circular(2)),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            if (n > 0)
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(_md(_date(daily.first)),
                    style: TextStyle(color: AppColors.hint, fontSize: 9)),
                Text(_md(_date(daily[n ~/ 2])),
                    style: TextStyle(color: AppColors.hint, fontSize: 9)),
                Text(_md(_date(daily.last)),
                    style: TextStyle(color: AppColors.hint, fontSize: 9)),
              ]),
          ]),
        ),
      ),
      TextButton(
        onPressed: () => setState(() => _showDetails = !_showDetails),
        style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 4), minimumSize: Size.zero),
        child: Text(
          _showDetails
              ? (isAr ? '▾ إخفاء التفاصيل اليومية' : '▾ Hide daily details')
              : (isAr ? '▸ عرض التفاصيل اليومية' : '▸ Show daily details'),
          style: TextStyle(color: AppColors.aqua, fontSize: 11, fontWeight: FontWeight.bold),
        ),
      ),
      if (_showDetails) _detailsList(daily, isAr),
    ]);
  }

  Widget _detailsList(List<Map<String, dynamic>> daily, bool isAr) {
    final active = [
      for (var i = daily.length - 1; i >= 0; i--)
        if (_im(daily[i]) != 0 || _ck(daily[i]) != 0) daily[i]
    ];
    if (active.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Text(isAr ? 'لا مشاهدات في آخر 30 يوم' : 'No views in the last 30 days',
            style: TextStyle(color: AppColors.hint, fontSize: 11)),
      );
    }
    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 200),
      child: ListView(
        shrinkWrap: true,
        children: [
          for (final d in active)
            Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.darkBg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(children: [
                Expanded(
                  child: Directionality(
                    textDirection: TextDirection.ltr,
                    child: Text(_date(d),
                        style: TextStyle(color: AppColors.hint, fontSize: 11)),
                  ),
                ),
                Text('${_im(d)} 👁',
                    style: TextStyle(color: AppColors.aqua, fontSize: 11)),
                const SizedBox(width: 10),
                Text('${_ck(d)} 👆',
                    style: TextStyle(color: AppColors.green, fontSize: 11)),
              ]),
            ),
        ],
      ),
    );
  }
}
