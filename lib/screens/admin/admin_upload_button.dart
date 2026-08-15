import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';

/// A button that picks an image from device storage, uploads it via
/// `/api/admin/upload`, and returns the hosted URL. Mirrors the website's
/// 📤 رفع control on the news/ads/logo/photo fields.
class AdminUploadButton extends StatefulWidget {
  final String token;
  final ValueChanged<String> onUploaded;
  final String? label;
  const AdminUploadButton({
    super.key,
    required this.token,
    required this.onUploaded,
    this.label,
  });

  @override
  State<AdminUploadButton> createState() => _AdminUploadButtonState();
}

class _AdminUploadButtonState extends State<AdminUploadButton> {
  final _api = AdminApi();
  final _picker = ImagePicker();
  bool _busy = false;

  Future<void> _pick() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    try {
      final file = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 2000,
        imageQuality: 90,
      );
      if (file == null) return;
      setState(() => _busy = true);
      final url = await _api.uploadImage(widget.token, file.path, filename: file.name);
      if (!mounted) return;
      setState(() => _busy = false);
      if (url.isEmpty) {
        showAdminError(context, isAr ? 'فشل رفع الصورة' : 'Upload failed');
        return;
      }
      widget.onUploaded(url);
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
    return OutlinedButton.icon(
      onPressed: _busy ? null : _pick,
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: AppColors.aqua.withValues(alpha: 0.5)),
        foregroundColor: AppColors.aqua,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
      icon: _busy
          ? const SizedBox(
              width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.upload, size: 18),
      label: Text(widget.label ?? (isAr ? 'رفع صورة' : 'Upload'),
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold)),
    );
  }
}
