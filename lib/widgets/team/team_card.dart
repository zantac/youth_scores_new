import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/competition_data_model.dart';
import '../../core/providers/app_provider.dart';
import '../common/cached_logo.dart';

class TeamCard extends StatelessWidget {
  final Team team;
  final VoidCallback? onTap;

  const TeamCard({super.key, required this.team, this.onTap});

  @override
  Widget build(BuildContext context) {
    final locale = Provider.of<AppProvider>(context, listen: false).locale;
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              CachedLogo(url: team.logo, size: 44),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      team.getName(locale),
                      style: TextStyle(
                        color: AppColors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                    if (team.getCity(locale) != null)
                      Text(
                        team.getCity(locale)!,
                        style: TextStyle(
                          color: AppColors.teal,
                          fontSize: 12,
                        ),
                      ),
                  ],
                ),
              ),
              if (team.getGroup(locale) != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.aqua.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Text(
                    team.getGroup(locale)!,
                    style: TextStyle(color: AppColors.aqua, fontSize: 11),
                  ),
                ),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right, color: AppColors.border, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
