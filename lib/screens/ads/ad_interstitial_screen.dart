import 'dart:async';
import 'dart:math';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/config_model.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/utils/cloudinary.dart';
import '../../core/utils/safe_launch.dart';

class AdInterstitialScreen extends StatefulWidget {
  final WidgetBuilder destinationBuilder;
  final String dataUrl;

  const AdInterstitialScreen({
    super.key,
    required this.destinationBuilder,
    required this.dataUrl,
  });

  /// Open [destinationBuilder], showing the interstitial ad first whenever there
  /// is a live interstitial ad — i.e. on every competition open, mirroring the
  /// website. Falls straight through to the destination when there are no ads.
  static void open(
    BuildContext context, {
    required String dataUrl,
    required WidgetBuilder destinationBuilder,
  }) {
    final ads = context
            .read<AppProvider>()
            .config
            ?.ads
            .where((a) => a.isLive && a.showsOn('interstitial'))
            .toList() ??
        const [];
    if (ads.isNotEmpty) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => AdInterstitialScreen(
              dataUrl: dataUrl, destinationBuilder: destinationBuilder),
        ),
      );
    } else {
      Navigator.push(context, MaterialPageRoute(builder: destinationBuilder));
    }
  }

  @override
  State<AdInterstitialScreen> createState() => _AdInterstitialScreenState();
}

/// Pick an ad weighted by its `weight` (higher weight → shown more often).
AdItem _weightedPick(List<AdItem> ads) {
  int w(AdItem a) => a.weight > 0 ? a.weight : 1;
  final total = ads.fold<int>(0, (s, a) => s + w(a));
  var r = Random().nextInt(total);
  for (final a in ads) {
    r -= w(a);
    if (r < 0) return a;
  }
  return ads.last;
}

class _AdInterstitialScreenState extends State<AdInterstitialScreen>
    with SingleTickerProviderStateMixin {
  int _countdown = 5;
  bool _canClose = false;
  Timer? _timer;
  late AnimationController _pulseController;
  AdItem? _ad;

  @override
  void initState() {
    super.initState();

    // Pick a live interstitial ad up front so we can log its impression once.
    final ads = context
            .read<AppProvider>()
            .config
            ?.ads
            .where((a) => a.isLive && a.showsOn('interstitial'))
            .toList() ??
        const [];
    if (ads.isNotEmpty) _ad = _weightedPick(ads);

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..repeat(reverse: true);

    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() {
        if (_countdown > 1) {
          _countdown--;
        } else {
          _countdown = 0;
          _canClose = true;
          _pulseController.stop();
          t.cancel();
        }
      });
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<AppProvider>().loadCompetition(widget.dataUrl);
      final ad = _ad;
      if (ad != null && ad.id > 0) {
        ApiService().adImpression(ad.id, placement: 'interstitial');
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  void _close() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: widget.destinationBuilder),
    );
  }

  // A CTA tap counts as a click, then opens the link.
  void _click(Uri uri, {LaunchMode mode = LaunchMode.platformDefault}) {
    final ad = _ad;
    if (ad != null && ad.id > 0) {
      ApiService().adClick(ad.id, placement: 'interstitial');
    }
    launchExternal(uri, mode: mode);
  }

  @override
  Widget build(BuildContext context) {
    final ad = _ad;
    final topPad  = MediaQuery.of(context).padding.top;
    final botPad  = MediaQuery.of(context).padding.bottom;

    // WhatsApp button target: prefer a wa.me link in the main link field — the
    // admin's link builder puts the number AND the prefilled message there, so the
    // button carries the message. Fall back to the bare whatsapp_number otherwise.
    final waUrl = ad == null
        ? null
        : (isWhatsAppUrl(ad.link)
            ? ad.link
            : (ad.whatsappNumber != null && ad.whatsappNumber!.isNotEmpty
                ? 'https://wa.me/${ad.whatsappNumber!.replaceAll(RegExp(r'\D'), '')}'
                : null));

    // Determine which action buttons to show
    final hasActions = ad != null && (
      waUrl             != null ||
      ad.mobileNumber   != null ||
      ad.facebookLink   != null ||
      ad.youtubeVideo   != null ||
      ad.locationUrl    != null
    );

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── Fullscreen image (tappable when the ad has a primary link) ─────
          GestureDetector(
            onTap: (ad?.link != null && ad!.link!.isNotEmpty)
                ? () => _click(Uri.parse(ad.link!),
                    mode: LaunchMode.externalApplication)
                : null,
            child: (ad?.image != null && ad!.image!.startsWith('http'))
                ? CachedNetworkImage(
                    // Upgrade a cleartext admin-entered image URL to https (a
                    // non-Cloudinary http src would otherwise load over http).
                    imageUrl: cloudinaryUrl(
                        ad.image!.replaceFirst('http://', 'https://'), width: 1200),
                    fit: BoxFit.contain,
                    width: double.infinity,
                    height: double.infinity,
                    errorWidget: (_, _, _) => const _Placeholder(),
                  )
                : const _Placeholder(),
          ),

          // ── Bottom gradient + action buttons (ad name is an internal admin
          //    label and is not shown to users) ────────────────────────────────
          if (hasActions)
            Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: EdgeInsets.fromLTRB(16, 32, 16, botPad + 16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.92),
                  ],
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        if (waUrl != null)
                          _ActionBtn(
                            icon: Icons.chat,
                            label: 'WhatsApp',
                            color: const Color(0xFF25D366),
                            onTap: () => _click(
                              Uri.parse(waUrl),
                              mode: LaunchMode.externalApplication,
                            ),
                          ),
                        if (ad.mobileNumber != null)
                          _ActionBtn(
                            icon: Icons.phone,
                            label: 'Call',
                            color: AppColors.teal,
                            onTap: () =>
                                _click(Uri.parse('tel:${ad.mobileNumber}')),
                          ),
                        if (ad.facebookLink != null)
                          _ActionBtn(
                            icon: Icons.facebook,
                            label: 'Facebook',
                            color: const Color(0xFF1877F2),
                            onTap: () => _click(
                              Uri.parse(ad.facebookLink!),
                              mode: LaunchMode.externalApplication,
                            ),
                          ),
                        if (ad.youtubeVideo != null)
                          _ActionBtn(
                            icon: Icons.play_circle,
                            label: 'YouTube',
                            color: const Color(0xFFFF0000),
                            onTap: () => _click(
                              Uri.parse(ad.youtubeVideo!),
                              mode: LaunchMode.externalApplication,
                            ),
                          ),
                        if (ad.locationUrl != null)
                          _ActionBtn(
                            icon: Icons.map,
                            label: 'Map',
                            color: AppColors.hint,
                            onTap: () => _click(
                              Uri.parse(ad.locationUrl!),
                              mode: LaunchMode.externalApplication,
                            ),
                          ),
                      ],
                    ),
                  ],
              ),
            ),
          ),

          // ── Top-right: countdown or close ──────────────────────────────────
          Positioned(
            top: topPad + 12,
            right: 12,
            child: _canClose
                ? _CloseButton(onTap: _close)
                : _CountdownBadge(count: _countdown, pulse: _pulseController),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class _Placeholder extends StatelessWidget {
  const _Placeholder();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.darkBg,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.campaign, color: AppColors.aqua, size: 100),
            const SizedBox(height: 16),
            Text(
              'إعلان  ·  Advertisement',
              style: TextStyle(color: AppColors.teal, fontSize: 16),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ActionBtn({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.6)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 16),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _CloseButton extends StatelessWidget {
  final VoidCallback onTap;
  const _CloseButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.65),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white70, width: 1.5),
        ),
        child: const Icon(Icons.close, color: Colors.white, size: 22),
      ),
    );
  }
}

class _CountdownBadge extends StatelessWidget {
  final int count;
  final AnimationController pulse;
  const _CountdownBadge({required this.count, required this.pulse});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: pulse,
      builder: (_, _) {
        final scale = 1.0 + pulse.value * 0.08;
        return Transform.scale(
          scale: scale,
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.65),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white38, width: 1.5),
            ),
            child: Center(
              child: Text(
                '$count',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
