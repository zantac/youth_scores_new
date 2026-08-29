import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/l10n/app_l10n.dart';
import '../../core/models/config_model.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/seen_service.dart';
import '../../widgets/common/empty_widget.dart';
import '../../widgets/common/loading_widget.dart';
import '../../widgets/common/search_field.dart';
import '../../widgets/news/news_card.dart';
import 'news_detail_screen.dart';

class NewsScreen extends StatefulWidget {
  const NewsScreen({super.key});

  @override
  State<NewsScreen> createState() => _NewsScreenState();
}

class _NewsScreenState extends State<NewsScreen> {
  final _ctrl  = TextEditingController();
  String _query = '';

  // Articles this user has opened; a card's "NEW" tag shows only while unread.
  Set<String> _readIds = {};

  @override
  void initState() {
    super.initState();
    // Deferred to after the first frame so the mark-seen notifyListeners() (and
    // the read-set load) don't fire during the parent's build.
    WidgetsBinding.instance.addPostFrameCallback((_) => _initSeen());
  }

  Future<void> _initSeen() async {
    if (!mounted) return;
    final provider = context.read<AppProvider>();
    // Opening the News tab clears its bottom-bar badge.
    await provider.markNewsSeen();
    // First run: treat the whole current feed as read so NEW only tags later
    // arrivals (no-op once a read-set exists), then load it.
    final cfg = provider.config;
    if (cfg != null) {
      await SeenService.instance
          .seedReadNewsIfFirstRun(cfg.news.map((n) => n.seenKey).toList());
    }
    final read = await SeenService.instance.getReadNews();
    if (mounted) setState(() => _readIds = read);
  }

  Future<void> _openNews(NewsItem item) async {
    await SeenService.instance.markNewsRead(item.seenKey);
    if (mounted) setState(() => _readIds = {..._readIds, item.seenKey});
    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => NewsDetailScreen(item: item)),
    );
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

    final locale  = provider.locale;
    final allNews = provider.config?.news ?? [];
    final news    = _query.isEmpty
        ? allNews
        : allNews
            .where((n) =>
                n.getTitle(locale).toLowerCase().contains(_query.toLowerCase()) ||
                (n.getDetails(locale)?.toLowerCase().contains(_query.toLowerCase()) ??
                    false))
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
          child: RefreshIndicator(
            onRefresh: () => provider.refreshConfig(),
            color: AppColors.aqua,
            child: news.isEmpty
                ? ListView(children: [EmptyWidget(message: l10n.noNews, icon: Icons.newspaper)])
                : ListView.builder(
                    padding: const EdgeInsets.only(bottom: 16),
                    itemCount: news.length,
                    itemBuilder: (_, i) => NewsCard(
                      item: news[i],
                      locale: l10n.locale,
                      // "NEW" = unread: shown until the user opens the article.
                      isNew: !_readIds.contains(news[i].seenKey),
                      onTap: () => _openNews(news[i]),
                    ),
                  ),
          ),
        ),
      ],
    );
  }
}
