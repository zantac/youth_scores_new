import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/app_provider.dart';

/// "Connect" — the in-app twin of the website's contact page: two ways to reach
/// us (WhatsApp for results, email for technical), plus the same encouragement
/// note and data-source disclaimer. Kept deliberately in step with
/// web/src/app/contact/page.tsx.
class ConnectScreen extends StatelessWidget {
  const ConnectScreen({super.key});

  static const _whatsapp = 'https://wa.me/201064428821';
  static const _email = 'mailto:zyadwael2009@gmail.com';

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      await launchUrl(uri, mode: LaunchMode.platformDefault);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    return Scaffold(
      appBar: AppBar(title: Text(isAr ? 'تواصل معنا' : 'Contact Us')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Intro ─────────────────────────────────────────────────────────
          Column(children: [
            const Text('📬', style: TextStyle(fontSize: 44)),
            const SizedBox(height: 10),
            Text(
              isAr
                  ? 'نرحب بجميع استفساراتكم ومقترحاتكم. يمكنكم التواصل معنا عبر الوسائل التالية:'
                  : 'We welcome all your inquiries and suggestions. You can reach us through the following channels:',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.teal, fontSize: 13, height: 1.6),
            ),
          ]),
          const SizedBox(height: 20),

          // ── WhatsApp — match results ──────────────────────────────────────
          _ContactCard(
            emoji: '💬',
            accent: const Color(0xFF25D366),
            title: isAr ? 'إرسال نتائج المباريات' : 'Submit Match Results',
            body: isAr
                ? 'أرسل نتائج المباريات أو أي معلومات عبر واتساب'
                : 'Send match results or any info via WhatsApp',
            actionLabel: isAr ? 'واتساب' : 'WhatsApp',
            onTap: () => _open(_whatsapp),
          ),
          const SizedBox(height: 16),

          // ── Email — technical ─────────────────────────────────────────────
          _ContactCard(
            emoji: '📧',
            accent: const Color(0xFFEA4335),
            title: isAr ? 'الاستفسارات البرمجية' : 'Technical Inquiries',
            body: isAr
                ? 'للاستفسارات التقنية والاقتراحات البرمجية'
                : 'For technical questions and development suggestions',
            actionLabel: isAr ? 'البريد الإلكتروني' : 'Email',
            onTap: () => _open(_email),
          ),
          const SizedBox(height: 20),

          // ── Encouragement note ────────────────────────────────────────────
          _NoteBox(
            bg: AppColors.aqua.withValues(alpha: 0.05),
            border: AppColors.aqua.withValues(alpha: 0.2),
            color: AppColors.teal,
            text: isAr
                ? '💡 مقترحاتكم وملاحظاتكم تساعدنا على تطوير المنصة وتحسين تجربتكم'
                : '💡 Your suggestions and feedback help us improve the platform and your experience',
          ),
          const SizedBox(height: 16),

          // ── Data-source disclaimer ────────────────────────────────────────
          _NoteBox(
            bg: AppColors.cardBg.withValues(alpha: 0.5),
            border: AppColors.border,
            color: AppColors.hint,
            fontSize: 11,
            text: isAr
                ? 'هذه البيانات ليست بيانات رسمية وتم جمعها من خلال المتابعة الشخصية للمباريات أو من رسائل أولياء الأمور واللاعبين أو من صفحات التواصل الاجتماعي للأندية.'
                : 'This data is not official and was collected through personal match monitoring, messages from parents and players, or club social media pages.',
          ),
        ],
      ),
    );
  }
}

class _ContactCard extends StatelessWidget {
  final String emoji;
  final Color accent;
  final String title;
  final String body;
  final String actionLabel;
  final VoidCallback onTap;

  const _ContactCard({
    required this.emoji,
    required this.accent,
    required this.title,
    required this.body,
    required this.actionLabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: accent.withValues(alpha: 0.4)),
        ),
        child: Row(children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(emoji, style: const TextStyle(fontSize: 26)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(
                        color: AppColors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15)),
                const SizedBox(height: 2),
                Text(body,
                    style: TextStyle(color: AppColors.teal, fontSize: 12.5, height: 1.4)),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: accent,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(emoji, style: const TextStyle(fontSize: 13)),
                    const SizedBox(width: 6),
                    Text(actionLabel,
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 13)),
                  ]),
                ),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}

class _NoteBox extends StatelessWidget {
  final Color bg;
  final Color border;
  final Color color;
  final String text;
  final double fontSize;

  const _NoteBox({
    required this.bg,
    required this.border,
    required this.color,
    required this.text,
    this.fontSize = 13,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(color: color, fontSize: fontSize, height: 1.6),
      ),
    );
  }
}
