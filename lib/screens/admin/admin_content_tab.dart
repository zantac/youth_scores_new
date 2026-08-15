import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/admin/admin_data.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';
import 'admin_upload_button.dart';

/// Content tab — mirrors the website's /admin/content: News, Venues and Ads.
/// Images are added by URL; the multipart upload from the web is a follow-up.
class AdminContentTab extends StatelessWidget {
  const AdminContentTab({super.key});

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return DefaultTabController(
      length: 3,
      child: Column(
        children: [
          TabBar(
            labelColor: AppColors.aqua,
            unselectedLabelColor: AppColors.hint,
            indicatorColor: AppColors.aqua,
            tabs: [
              Tab(text: isAr ? 'الأخبار' : 'News'),
              Tab(text: isAr ? 'الملاعب' : 'Venues'),
              Tab(text: isAr ? 'الإعلانات' : 'Ads'),
            ],
          ),
          const Expanded(
            child: TabBarView(
              children: [_NewsSection(), _VenuesSection(), _AdsSection()],
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

String _today() {
  final d = DateTime.now();
  return '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

// ── News ─────────────────────────────────────────────────────────────────────

class _NewsSection extends StatefulWidget {
  const _NewsSection();

  @override
  State<_NewsSection> createState() => _NewsSectionState();
}

class _NewsSectionState extends State<_NewsSection> {
  final _api = AdminApi();
  bool _loading = true;
  String? _error;
  List<AdminNews> _news = const [];

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
      final n = await _api.listNews(_token);
      if (!mounted) return;
      setState(() {
        _news = n;
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

  Future<void> _openEditor([AdminNews? news]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.dialogBg,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => _NewsEditor(api: _api, token: _token, news: news),
    );
    if (saved == true) _load();
  }

  Future<void> _delete(AdminNews n) async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.dialogBg,
        title: Text(isAr ? 'حذف الخبر' : 'Delete news',
            style: TextStyle(color: AppColors.white)),
        content: Text('«${n.title(isAr)}»', style: TextStyle(color: AppColors.teal)),
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
        await _api.deleteNews(_token, n.id);
        if (!mounted) return;
        _load();
      } catch (e) {
        if (!mounted) return;
        if (handleAdminError(context, e)) return;
        showAdminError(context, e);
      }
    }
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
        label: Text(isAr ? 'خبر' : 'News'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _news.isEmpty
            ? ListView(children: [
                const SizedBox(height: 120),
                Center(
                    child: Text(isAr ? 'لا أخبار' : 'No news',
                        style: TextStyle(color: AppColors.hint))),
              ])
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
                itemCount: _news.length,
                itemBuilder: (_, i) {
                  final n = _news[i];
                  final cover = n.imageUrl ?? (n.images.isNotEmpty ? n.images.first : null);
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    decoration: BoxDecoration(
                      color: AppColors.cardBg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(children: [
                      ClipRRect(
                        borderRadius: const BorderRadiusDirectional.horizontal(
                                start: Radius.circular(12))
                            .resolve(Directionality.of(context)),
                        child: Container(
                          width: 64,
                          height: 64,
                          color: AppColors.darkBg,
                          child: cover != null
                              ? Image.network(cover, fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) =>
                                      Icon(Icons.image_not_supported,
                                          color: AppColors.hint, size: 20))
                              : Icon(Icons.article, color: AppColors.hint),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(n.title(isAr),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    color: AppColors.white,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13.5)),
                            const SizedBox(height: 2),
                            Text(
                              [
                                n.date,
                                if (n.images.length > 1)
                                  '${n.images.length}${isAr ? ' صور' : ' imgs'}',
                                if (!n.isPublished) (isAr ? 'مسودة' : 'draft'),
                              ].join(' · '),
                              style: TextStyle(color: AppColors.hint, fontSize: 11.5),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                          onPressed: () => _openEditor(n),
                          icon: Icon(Icons.edit, color: AppColors.aqua, size: 19)),
                      IconButton(
                          onPressed: () => _delete(n),
                          icon: Icon(Icons.delete_outline, color: AppColors.red, size: 19)),
                    ]),
                  );
                },
              ),
      ),
    );
  }
}

class _NewsEditor extends StatefulWidget {
  final AdminApi api;
  final String token;
  final AdminNews? news;
  const _NewsEditor({required this.api, required this.token, this.news});

  @override
  State<_NewsEditor> createState() => _NewsEditorState();
}

class _NewsEditorState extends State<_NewsEditor> {
  late final TextEditingController _titleAr;
  late final TextEditingController _titleEn;
  late final TextEditingController _details;
  late final TextEditingController _date;
  final _imageUrl = TextEditingController();
  late List<String> _images;
  late bool _publish;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final n = widget.news;
    _titleAr = TextEditingController(text: n?.titleAr ?? '');
    _titleEn = TextEditingController(text: n?.titleEn ?? '');
    _details = TextEditingController(text: n?.detailsAr ?? '');
    _date = TextEditingController(text: n?.date ?? _today());
    _images = List<String>.from(n?.images ?? const []);
    _publish = n?.isPublished ?? true;
  }

  @override
  void dispose() {
    _titleAr.dispose();
    _titleEn.dispose();
    _details.dispose();
    _date.dispose();
    _imageUrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (_titleAr.text.trim().isEmpty) {
      showAdminError(context, isAr ? 'العنوان بالعربية مطلوب' : 'Arabic title required');
      return;
    }
    setState(() => _busy = true);
    final body = {
      'title_ar': _titleAr.text.trim(),
      'title_en': _titleEn.text.trim(),
      'details_ar': _details.text.trim(),
      'date': _date.text.trim(),
      'is_published': _publish,
      'images': _images,
    };
    try {
      if (widget.news == null) {
        await widget.api.createNews(widget.token, body);
      } else {
        await widget.api.updateNews(widget.token, widget.news!.id, body);
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

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final bottom = MediaQuery.of(context).viewInsets.bottom;
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
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            Text(
                widget.news == null
                    ? (isAr ? 'خبر جديد' : 'New news')
                    : (isAr ? 'تعديل الخبر' : 'Edit news'),
                style: TextStyle(
                    color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 14),
            _label(isAr ? 'العنوان (عربي) *' : 'Title (Arabic) *'),
            TextField(controller: _titleAr, style: _txt(), decoration: _dec(null)),
            const SizedBox(height: 10),
            _label(isAr ? 'العنوان (إنجليزي)' : 'Title (English)'),
            TextField(controller: _titleEn, style: _txt(), decoration: _dec(null)),
            const SizedBox(height: 10),
            _label(isAr ? 'التفاصيل' : 'Details'),
            TextField(
                controller: _details,
                style: _txt(),
                maxLines: 4,
                decoration: _dec(null)),
            const SizedBox(height: 10),
            _label(isAr ? 'التاريخ (YYYY-MM-DD)' : 'Date (YYYY-MM-DD)'),
            TextField(controller: _date, style: _txt(), decoration: _dec('2026-01-01')),
            const SizedBox(height: 10),
            _label(isAr ? 'الصور (روابط) — الأولى للغلاف' : 'Images (URLs) — first is cover'),
            for (int i = 0; i < _images.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(children: [
                  Expanded(
                    child: Text(_images[i],
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: AppColors.teal, fontSize: 12)),
                  ),
                  IconButton(
                    onPressed: () => setState(() => _images.removeAt(i)),
                    icon: Icon(Icons.close, color: AppColors.red, size: 18),
                  ),
                ]),
              ),
            Row(children: [
              Expanded(
                child: TextField(
                    controller: _imageUrl,
                    style: _txt(),
                    decoration: _dec(isAr ? 'ألصق رابط صورة' : 'Paste image URL')),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: () {
                  final u = _imageUrl.text.trim();
                  if (u.isNotEmpty) {
                    setState(() {
                      _images.add(u);
                      _imageUrl.clear();
                    });
                  }
                },
                icon: Icon(Icons.add_circle, color: AppColors.aqua),
              ),
            ]),
            const SizedBox(height: 8),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: AdminUploadButton(
                token: widget.token,
                label: isAr ? 'رفع صورة من الجهاز' : 'Upload from device',
                onUploaded: (url) => setState(() => _images.add(url)),
              ),
            ),
            const SizedBox(height: 6),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              activeThumbColor: AppColors.aqua,
              value: _publish,
              onChanged: (v) => setState(() => _publish = v),
              title: Text(isAr ? 'منشور' : 'Published',
                  style: TextStyle(color: AppColors.white, fontSize: 14)),
              subtitle: Text(
                  isAr
                      ? 'يُرسل إشعارًا عند الإنشاء فقط'
                      : 'Sends a push on create only',
                  style: TextStyle(color: AppColors.hint, fontSize: 11)),
            ),
            const SizedBox(height: 12),
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

// ── Venues ───────────────────────────────────────────────────────────────────

class _VenuesSection extends StatefulWidget {
  const _VenuesSection();

  @override
  State<_VenuesSection> createState() => _VenuesSectionState();
}

class _VenuesSectionState extends State<_VenuesSection> {
  final _api = AdminApi();
  bool _loading = true;
  String? _error;
  List<AdminVenue> _venues = const [];

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
      final v = await _api.listVenues(_token);
      if (!mounted) return;
      setState(() {
        _venues = v;
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

  Future<void> _openEditor([AdminVenue? venue]) async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    final nameAr = TextEditingController(text: venue?.nameAr ?? '');
    final nameEn = TextEditingController(text: venue?.nameEn ?? '');
    final url = TextEditingController(text: venue?.url ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.dialogBg,
        title: Text(
            venue == null
                ? (isAr ? 'ملعب جديد' : 'New venue')
                : (isAr ? 'تعديل الملعب' : 'Edit venue'),
            style: TextStyle(color: AppColors.white, fontSize: 16)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
              controller: nameAr,
              style: TextStyle(color: AppColors.white),
              decoration: _dec(isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *')),
          const SizedBox(height: 10),
          TextField(
              controller: nameEn,
              style: TextStyle(color: AppColors.white),
              decoration: _dec(isAr ? 'الاسم (إنجليزي)' : 'Name (English)')),
          const SizedBox(height: 10),
          TextField(
              controller: url,
              style: TextStyle(color: AppColors.white),
              decoration: _dec(isAr ? 'رابط خرائط جوجل' : 'Google Maps URL')),
        ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(isAr ? 'إلغاء' : 'Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(isAr ? 'حفظ' : 'Save')),
        ],
      ),
    );
    if (ok == true && nameAr.text.trim().isNotEmpty) {
      final body = {
        'name_ar': nameAr.text.trim(),
        'name_en': nameEn.text.trim(),
        'url': url.text.trim(),
      };
      try {
        if (venue == null) {
          await _api.createVenue(_token, body);
        } else {
          await _api.updateVenue(_token, venue.id, body);
        }
        if (!mounted) return;
        _load();
      } catch (e) {
        if (!mounted) return;
        if (handleAdminError(context, e)) return;
        showAdminError(context, e);
      }
    }
    nameAr.dispose();
    nameEn.dispose();
    url.dispose();
  }

  Future<void> _delete(AdminVenue v) async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.dialogBg,
        title: Text(isAr ? 'حذف الملعب' : 'Delete venue',
            style: TextStyle(color: AppColors.white)),
        content: Text('«${v.name(isAr)}»', style: TextStyle(color: AppColors.teal)),
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
        await _api.deleteVenue(_token, v.id);
        if (!mounted) return;
        _load();
      } catch (e) {
        if (!mounted) return;
        if (handleAdminError(context, e)) return;
        showAdminError(context, e);
      }
    }
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
        icon: const Icon(Icons.add_location_alt),
        label: Text(isAr ? 'ملعب' : 'Venue'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _venues.isEmpty
            ? ListView(children: [
                const SizedBox(height: 120),
                Center(
                    child: Text(isAr ? 'لا ملاعب' : 'No venues',
                        style: TextStyle(color: AppColors.hint))),
              ])
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
                itemCount: _venues.length,
                itemBuilder: (_, i) {
                  final v = _venues[i];
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.cardBg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(children: [
                      Icon(Icons.stadium, color: AppColors.hint, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(v.name(isAr),
                                style: TextStyle(
                                    color: AppColors.white,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13.5)),
                            if (v.url != null)
                              Text(isAr ? 'به رابط خريطة' : 'Has map link',
                                  style: TextStyle(color: AppColors.hint, fontSize: 11)),
                          ],
                        ),
                      ),
                      IconButton(
                          onPressed: () => _openEditor(v),
                          icon: Icon(Icons.edit, color: AppColors.aqua, size: 19)),
                      IconButton(
                          onPressed: () => _delete(v),
                          icon: Icon(Icons.delete_outline, color: AppColors.red, size: 19)),
                    ]),
                  );
                },
              ),
      ),
    );
  }
}

// ── Ads ──────────────────────────────────────────────────────────────────────

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

  @override
  void initState() {
    super.initState();
    final a = widget.ad;
    _c = {
      'name': TextEditingController(text: a?.name ?? ''),
      'image': TextEditingController(text: a?.image ?? ''),
      'mobile_number': TextEditingController(text: a?.mobileNumber ?? ''),
      'whatsapp_number': TextEditingController(text: a?.whatsappNumber ?? ''),
      'facebook_link': TextEditingController(text: a?.facebookLink ?? ''),
      'youtube_video': TextEditingController(text: a?.youtubeVideo ?? ''),
      'location': TextEditingController(text: a?.location ?? ''),
      'location_url': TextEditingController(text: a?.locationUrl ?? ''),
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
    final body = _c.map((k, v) => MapEntry(k, v.text.trim()));
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
            f('expire_date', isAr ? 'تاريخ الانتهاء (فارغ = دائم)' : 'Expiry date (empty = permanent)', hint: 'YYYY-MM-DD'),
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
