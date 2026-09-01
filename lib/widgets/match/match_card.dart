import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/competition_data_model.dart';
import '../../core/utils/date_utils.dart';
import '../common/cached_logo.dart';

class MatchCard extends StatelessWidget {
  final Match match;
  final Team? homeTeam;
  final Team? awayTeam;
  final VoidCallback? onTap;
  final String locale;

  const MatchCard({
    super.key,
    required this.match,
    this.homeTeam,
    this.awayTeam,
    this.onTap,
    this.locale = 'ar',
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Column(
            children: [
              _buildTeamRow(),
              if (match.venue.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  match.venue,
                  style: TextStyle(color: AppColors.hint, fontSize: 11),
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTeamRow() {
    final homeWon = match.isCompleted &&
        match.homeScore != null &&
        (match.homeScore! > match.awayScore! ||
         (match.homeScore == match.awayScore &&
          match.homePenalty != null && match.homePenalty! > match.awayPenalty!));
    final awayWon = match.isCompleted &&
        match.awayScore != null &&
        (match.awayScore! > match.homeScore! ||
         (match.homeScore == match.awayScore &&
          match.awayPenalty != null && match.awayPenalty! > match.homePenalty!));

    return Row(
      children: [
        Expanded(child: _teamCol(homeTeam, match.homeTeamId, winner: homeWon)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: _buildScoreOrTime(),
        ),
        Expanded(child: _teamCol(awayTeam, match.awayTeamId, winner: awayWon)),
      ],
    );
  }

  Widget _teamCol(Team? team, String fallback, {required bool winner}) {
    return Column(
      children: [
        CachedLogo(url: team?.logo, size: 40),
        const SizedBox(height: 4),
        Text(
          team?.getName(locale) ?? fallback,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: winner ? AppColors.aqua : AppColors.white,
            fontSize: 12,
            fontWeight: winner ? FontWeight.bold : FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildScoreOrTime() {
    final pens = (match.homePenalty != null && match.awayPenalty != null)
        ? Text(
            '${locale == 'ar' ? 'ر.ت' : 'Pens'}: ${match.homePenalty} - ${match.awayPenalty}',
            style: TextStyle(color: AppColors.orange, fontSize: 10),
          )
        : null;
    Widget dateLabel({bool strike = false}) => Text(
          AppDateUtils.formatMatchDate(match.date, locale),
          style: TextStyle(
            color: AppColors.hint,
            fontSize: 9,
            decoration: strike ? TextDecoration.lineThrough : null,
          ),
          textAlign: TextAlign.center,
        );

    // Completed — score (or – : –), a clear "ended" flag, and the date.
    if (match.isCompleted) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (match.homeScore != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.darkBg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.border),
              ),
              child: Text(
                '${match.homeScore} - ${match.awayScore}',
                style: TextStyle(
                  color: AppColors.aqua,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            )
          else
            Text('– : –',
                style: TextStyle(
                    color: AppColors.hint,
                    fontSize: 16,
                    fontWeight: FontWeight.bold)),
          ?pens,
          const SizedBox(height: 2),
          _statusChip(locale == 'ar' ? 'انتهت' : 'FT', AppColors.green),
          const SizedBox(height: 2),
          dateLabel(),
        ],
      );
    }

    // Live — always a clear LIVE badge, then the running score once one is
    // entered, otherwise the kickoff time.
    if (match.isLive) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _liveBadge(),
          const SizedBox(height: 3),
          if (match.homeScore != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.red.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.red),
              ),
              child: Text(
                '${match.homeScore} - ${match.awayScore}',
                style: TextStyle(
                  color: AppColors.red,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            ?pens,
          ] else
            Text(
              match.time.isNotEmpty ? match.time : '--:--',
              style: TextStyle(
                color: AppColors.aqua,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          const SizedBox(height: 2),
          dateLabel(),
        ],
      );
    }

    // Postponed
    if (match.status.toLowerCase() == 'postponed') {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _statusBox(locale == 'ar' ? 'مؤجلة' : 'PPD', AppColors.orange),
          const SizedBox(height: 2),
          dateLabel(),
        ],
      );
    }

    // Cancelled
    if (match.status.toLowerCase() == 'cancelled') {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _statusBox(locale == 'ar' ? 'ملغاة' : 'Canc.', AppColors.red),
          const SizedBox(height: 2),
          dateLabel(strike: true),
        ],
      );
    }

    // Upcoming
    final countdown = AppDateUtils.countdownLabel(match.date, match.time, locale);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          match.time.isNotEmpty ? match.time : '--:--',
          style: TextStyle(
            color: AppColors.aqua,
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        if (countdown != null)
          Text(
            countdown,
            style: TextStyle(
              color: AppColors.orange,
              fontSize: 9,
              fontWeight: FontWeight.w600,
            ),
            textAlign: TextAlign.center,
          ),
        if (!AppDateUtils.isToday(match.date)) dateLabel(),
      ],
    );
  }

  // Red pulsing "LIVE / مباشر" pill — the unmistakable live flag, matching the
  // match detail page.
  Widget _liveBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.red.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.red.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const _PulsingDot(),
          const SizedBox(width: 4),
          Text(
            locale == 'ar' ? 'مباشر' : 'LIVE',
            style: TextStyle(
              color: AppColors.red,
              fontSize: 9,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  // Small outlined chip (FT).
  Widget _statusChip(String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(5),
          border: Border.all(color: color.withValues(alpha: 0.4)),
        ),
        child: Text(label,
            style: TextStyle(
                color: color, fontSize: 9, fontWeight: FontWeight.bold)),
      );

  // Larger status box (postponed / cancelled).
  Widget _statusBox(String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.5)),
        ),
        child: Text(label,
            style: TextStyle(
                color: color, fontSize: 11, fontWeight: FontWeight.bold)),
      );
}

// ── Pulsing live indicator ─────────────────────────────────────────────────────

class _PulsingDot extends StatefulWidget {
  const _PulsingDot();

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>   _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);
    _scale = Tween<double>(begin: 0.6, end: 1.4).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: Icon(Icons.circle, color: AppColors.red, size: 8),
    );
  }
}
