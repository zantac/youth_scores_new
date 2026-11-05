import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/config_model.dart';
import '../../core/providers/app_provider.dart';
import '../../core/utils/cloudinary.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/share_image.dart';

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
          _NewsShareButton(item: item, l10n: l10n),
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
            imageUrl: cloudinaryUrl(images[0], width: 1000),
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
                  imageUrl: cloudinaryUrl(images[i], width: 800),
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
                  imageUrl: cloudinaryUrl(widget.urls[i], width: 1600),
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

// ── Share-as-image button ─────────────────────────────────────────────────────

/// Shares the article as a styled PNG (title, date, lead photo and a body
/// preview) instead of plain text — matching the standings/rounds share cards.
/// Stateful only to show a spinner while the off-screen frame is captured.
class _NewsShareButton extends StatefulWidget {
  final NewsItem item;
  final L10n l10n;

  const _NewsShareButton({required this.item, required this.l10n});

  @override
  State<_NewsShareButton> createState() => _NewsShareButtonState();
}

class _NewsShareButtonState extends State<_NewsShareButton> {
  bool _sharing = false;

  Future<void> _share() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    final l10n = widget.l10n;
    final item = widget.item;
    final photos = item.allImages;
    // Render and precache the SAME (transformed) URL, or the off-screen frame
    // paints before it decodes and the photo comes out blank.
    final leadImg =
        photos.isNotEmpty ? cloudinaryUrl(photos.first, width: 800) : null;
    await shareWidgetImage(
      context,
      filePrefix: 'news_${item.id ?? item.date.hashCode}',
      errorText: l10n.isAr ? 'تعذّر مشاركة الخبر' : 'Could not share the news',
      preloadLogos: [?leadImg],
      card: _NewsShareCard(
        title: item.getTitle(l10n.locale),
        details: item.getDetails(l10n.locale),
        dateLabel: AppDateUtils.formatNewsDate(item.date, l10n.locale),
        imageUrl: leadImg,
        isAr: l10n.isAr,
      ),
    );
    if (mounted) setState(() => _sharing = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_sharing) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    return IconButton(
      icon: const Icon(Icons.share),
      tooltip: widget.l10n.share,
      onPressed: _share,
    );
  }
}

// ── Off-screen share card ─────────────────────────────────────────────────────

/// The article rendered for image export: brand-coloured header, lead photo,
/// title, a capped body preview and the shared branding footer. Fixed 420px
/// wide like the other share cards so every export looks consistent.
class _NewsShareCard extends StatelessWidget {
  final String title;
  final String? details;
  final String dateLabel;
  final String? imageUrl;
  final bool isAr;

  const _NewsShareCard({
    required this.title,
    required this.details,
    required this.dateLabel,
    required this.imageUrl,
    required this.isAr,
  });

  @override
  Widget build(BuildContext context) {
    // The full article body is exported — no preview cap — so the image is the
    // complete story.
    final body = details;

    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Container(
        width: 420,
        decoration: BoxDecoration(color: ShareColors.bg),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Header ───────────────────────────────────────────────────────
            Row(
              children: [
                const Text('📰', style: TextStyle(fontSize: 22)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isAr ? 'أخبار' : 'News',
                        style: TextStyle(
                          color: ShareColors.teal,
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (dateLabel.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            dateLabel,
                            style:
                                TextStyle(color: ShareColors.hint, fontSize: 11),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // ── Lead photo ───────────────────────────────────────────────────
            if (imageUrl != null) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Image(
                    image: NetworkImage(imageUrl!),
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) =>
                        Container(color: ShareColors.surface),
                  ),
                ),
              ),
              const SizedBox(height: 14),
            ],

            // ── Title ────────────────────────────────────────────────────────
            Text(
              title,
              style: TextStyle(
                color: ShareColors.aqua,
                fontSize: 18,
                fontWeight: FontWeight.bold,
                height: 1.35,
              ),
            ),

            // ── Body preview ─────────────────────────────────────────────────
            if (body != null) ...[
              const SizedBox(height: 10),
              Text(
                body,
                style:
                    TextStyle(color: ShareColors.white, fontSize: 14, height: 1.7),
              ),
            ],

            const SizedBox(height: 14),
            const ShareBrandFooter(),
          ],
        ),
      ),
    );
  }
}
