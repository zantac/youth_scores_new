import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import 'admin_home_screen.dart';

/// Admin sign-in — the in-app twin of the website's /admin/login. On success
/// (or if a saved session is already valid) it replaces itself with the admin
/// home.
class AdminLoginScreen extends StatefulWidget {
  const AdminLoginScreen({super.key});

  @override
  State<AdminLoginScreen> createState() => _AdminLoginScreenState();
}

class _AdminLoginScreenState extends State<AdminLoginScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _showPw = false;
  bool _busy = false;
  String? _error;
  bool _redirected = false;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (_username.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error =
          isAr ? 'أدخل اسم المستخدم وكلمة المرور' : 'Enter username and password');
      return;
    }
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await context.read<AdminAuth>().login(
            _username.text.trim(),
            _password.text,
          );
      if (!mounted) return;
      _toHome();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toHome() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const AdminHomeScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AdminAuth>();
    final isAr = context.watch<AppProvider>().locale == 'ar';

    // A restored session lands straight on the admin home.
    if (!auth.loading && auth.isLoggedIn && !_redirected) {
      _redirected = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _toHome());
    }

    return Scaffold(
      appBar: AppBar(title: Text(isAr ? 'لوحة الإدارة' : 'Admin Panel')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: AppColors.cardBg,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Icon(Icons.admin_panel_settings,
                      color: AppColors.aqua, size: 34),
                ),
                const SizedBox(height: 14),
                Text(isAr ? 'دخول المسؤولين' : 'Admin sign-in',
                    style: TextStyle(
                        color: AppColors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 18)),
                const SizedBox(height: 4),
                Text(
                  isAr
                      ? 'أدخل النتائج والبيانات من هاتفك'
                      : 'Enter results and data from your phone',
                  style: TextStyle(color: AppColors.teal, fontSize: 12.5),
                ),
                const SizedBox(height: 22),
                TextField(
                  controller: _username,
                  autofocus: true,
                  textInputAction: TextInputAction.next,
                  style: TextStyle(color: AppColors.white),
                  decoration: _dec(isAr ? 'اسم المستخدم' : 'Username'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: !_showPw,
                  onSubmitted: (_) => _busy ? null : _submit(),
                  style: TextStyle(color: AppColors.white),
                  decoration: _dec(isAr ? 'كلمة المرور' : 'Password').copyWith(
                    suffixIcon: IconButton(
                      icon: Icon(_showPw ? Icons.visibility_off : Icons.visibility,
                          color: AppColors.hint, size: 20),
                      onPressed: () => setState(() => _showPw = !_showPw),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.withValues(alpha: 0.4)),
                    ),
                    child: Text(_error!,
                        style: const TextStyle(color: Colors.redAccent, fontSize: 12.5)),
                  ),
                ],
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _busy ? null : _submit,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.aqua,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: _busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : Text(isAr ? 'تسجيل الدخول' : 'Sign in',
                            style: const TextStyle(
                                fontWeight: FontWeight.bold, fontSize: 15)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _dec(String label) => InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: AppColors.hint),
        filled: true,
        fillColor: AppColors.cardBg,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.aqua),
        ),
      );
}
