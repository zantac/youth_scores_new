import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/config_model.dart';
import '../../core/providers/app_provider.dart';
import '../../core/utils/date_utils.dart';

class NewsDetailScreen extends StatelessWidget {
  final NewsItem item;

  const NewsDetailScreen({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    final l10n   = L10n(context.read<AppProvider>().locale);
    final photos = item.allImages;
    final title   = item.getTitle(l10n.locale);
    final details = item.getDetails(l10n.locale);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.news),
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: () => SharePlus.instance.share(ShareParams(
              text: '$title\n\n${details ?? ''}\n\nبطولات الناشئين | Youth Scores\nyouthscores.org',
            )),
          ),
        ],
      ),
      // Mirror the website: text first (title, date, details), photos at the
      // bottom of the article.
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Title ──────────────────────────────────────────────────────────
          Text(
            title,
            style: TextStyle(
              color: AppColors.aqua,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),

          // ── Date ───────────────────────────────────────────────────────────
          Row(
            children: [
              Icon(Icons.calendar_today, size: 13, color: AppColors.hint),
              const SizedBox(width: 6),
              Text(
                AppDateUtils.formatNewsDate(item.date, l10n.locale),
                style: TextStyle(color: AppColors.hint, fontSize: 13),
              ),
            ],
          ),

          // ── Body ───────────────────────────────────────────────────────────
          if (details != null) ...[
            const SizedBox(height: 16),
            const Divider(),
            const SizedBox(height: 12),
            Text(
              details,
              style: TextStyle(
                color: AppColors.white,
                fontSize: 15,
                height: 1.8,
              ),
            ),
          ],

          // ── Photo gallery ──────────────────────────────────────────────────
          if (photos.isNotEmpty) ...[
            const SizedBox(height: 24),
            _ImageGallery(
              images: photos,
              onTap: (index) => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => _FullScreenGallery(
                    urls: photos,
                    initialIndex: index,
                    l10n: l10n,
                  ),
                  fullscreenDialog: true,
                ),
              ),
            ),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

// ── Swipeable image gallery with dot indicator ────────────────────────────────

class _ImageGallery extends StatefulWidget {
  final List<String> images;
  final void Function(int index) onTap;

  const _ImageGallery({required this.images, required this.onTap});

  @override
  State<_ImageGallery> createState() => _ImageGalleryState();
}

class _ImageGalleryState extends State<_ImageGallery> {
  int _current = 0;

  @override
  Widget build(BuildContext context) {
    final images = widget.images;

    // Single image — no PageView overhead
    if (images.length == 1) {
      return GestureDetector(
        onTap: () => widget.onTap(0),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: CachedNetworkImage(
            imageUrl: images[0],
            fit: BoxFit.cover,
            errorWidget: (_, _, _) => const SizedBox.shrink(),
          ),
        ),
      );
    }

    // Multiple images — PageView + dots
    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: AspectRatio(
            aspectRatio: 16 / 9,
            child: PageView.builder(
              itemCount: images.length,
              onPageChanged: (i) => setState(() => _current = i),
              itemBuilder: (_, i) => GestureDetector(
                onTap: () => widget.onTap(i),
                child: CachedNetworkImage(
                  imageUrl: images[i],
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) => Container(
                    color: AppColors.cardBg,
                    child: Icon(Icons.broken_image,
                        color: AppColors.hint, size: 48),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        // Dot indicators
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(images.length, (i) {
            final active = i == _current;
            return AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width:  active ? 18 : 6,
              height: 6,
              decoration: BoxDecoration(
                color: active ? AppColors.aqua : AppColors.border,
                borderRadius: BorderRadius.circular(3),
              ),
            );
          }),
        ),
      ],
    );
  }
}

// ── Full-screen gallery viewer ────────────────────────────────────────────────

class _FullScreenGallery extends StatefulWidget {
  final List<String> urls;
  final int initialIndex;
  final L10n l10n;

  const _FullScreenGallery({
    required this.urls,
    required this.initialIndex,
    required this.l10n,
  });

  @override
  State<_FullScreenGallery> createState() => _FullScreenGalleryState();
}

class _FullScreenGalleryState extends State<_FullScreenGallery> {
  late final PageController _ctrl;
  late int _current;
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    _current = widget.initialIndex;
    _ctrl    = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _shareCurrentImage() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final url  = widget.urls[_current];
      final file = await DefaultCacheManager().getSingleFile(url);
      await SharePlus.instance.share(ShareParams(
        files: [XFile(file.path, mimeType: 'image/jpeg')],
        text: 'بطولات الناشئين | Youth Scores\nyouthscores.org',
      ));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.l10n.isAr
                ? 'تعذّر مشاركة الصورة'
                : 'Could not share image'),
            backgroundColor: AppColors.cardBg,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.urls.length;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
        elevation: 0,
        title: total > 1
            ? Text(
                '${_current + 1} / $total',
                style: const TextStyle(color: Colors.white, fontSize: 14),
              )
            : null,
        actions: [
          if (_sharing)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              ),
            )
          else
            IconButton(
              icon: const Icon(Icons.share, color: Colors.white),
              tooltip: widget.l10n.share,
              onPressed: _shareCurrentImage,
            ),
        ],
      ),
      body: Stack(
        children: [
          // ── Swipeable full-res images ────────────────────────────────────
          PageView.builder(
            controller: _ctrl,
            itemCount: total,
            onPageChanged: (i) => setState(() => _current = i),
            itemBuilder: (_, i) => InteractiveViewer(
              minScale: 0.5,
              maxScale: 4.0,
              child: Center(
                child: CachedNetworkImage(
                  imageUrl: widget.urls[i],
                  fit: BoxFit.contain,
                  errorWidget: (_, _, _) => const Icon(
                    Icons.broken_image,
                    color: Colors.white,
                    size: 64,
                  ),
                ),
              ),
            ),
          ),

          // ── Bottom dot indicators (multi-image only) ─────────────────────
          if (total > 1)
            Positioned(
              bottom: 24,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(total, (i) {
                  final active = i == _current;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width:  active ? 18 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: active ? Colors.white : Colors.white38,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  );
                }),
              ),
            ),
        ],
      ),
    );
  }
}
