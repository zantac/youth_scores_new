import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

/// A labelled form field wrapper used across the admin screens.
class AdminField extends StatelessWidget {
  final String label;
  final Widget child;
  const AdminField({super.key, required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 6, left: 2),
            child: Text(label,
                style: TextStyle(
                    color: AppColors.teal,
                    fontSize: 12,
                    fontWeight: FontWeight.bold)),
          ),
          child,
        ],
      ),
    );
  }
}

InputDecoration adminInputDecoration({String? hint}) => InputDecoration(
      isDense: true,
      hintText: hint,
      hintStyle: TextStyle(color: AppColors.hint, fontSize: 13),
      filled: true,
      fillColor: AppColors.cardBg,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.border),
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.aqua),
      ),
    );
