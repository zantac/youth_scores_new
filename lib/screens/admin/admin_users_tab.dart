import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/providers/app_provider.dart';
import '../../core/services/admin_api.dart';
import 'admin_error.dart';

/// Users tab (superadmin only) — mirrors the website's /admin/users. Create
/// admin accounts and manage their role, password and active state.
class AdminUsersTab extends StatefulWidget {
  const AdminUsersTab({super.key});

  @override
  State<AdminUsersTab> createState() => _AdminUsersTabState();
}

const _roles = ['clerk', 'editor', 'superadmin'];

String _roleLabel(String role, bool isAr) {
  switch (role) {
    case 'superadmin':
      return isAr ? 'مدير عام' : 'Super Admin';
    case 'editor':
      return isAr ? 'محرّر' : 'Editor';
    default:
      return isAr ? 'مُدخِل بيانات' : 'Data Entry';
  }
}

class _AdminUsersTabState extends State<AdminUsersTab> {
  final _api = AdminApi();
  bool _loading = true;
  String? _error;
  List<AdminUser> _users = const [];

  // Create form
  bool _showCreate = false;
  final _username = TextEditingController();
  final _fullName = TextEditingController();
  final _password = TextEditingController();
  String _newRole = 'clerk';
  bool _creating = false;

  String get _token => context.read<AdminAuth>().token ?? '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _username.dispose();
    _fullName.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final u = await _api.users(_token);
      if (!mounted) return;
      setState(() {
        _users = u;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _create() async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    if (_username.text.trim().isEmpty || _password.text.length < 8) {
      showAdminError(
          context,
          isAr
              ? 'اسم المستخدم مطلوب وكلمة المرور 8 أحرف على الأقل'
              : 'Username required and password ≥ 8 chars');
      return;
    }
    setState(() => _creating = true);
    try {
      await _api.createUser(_token, {
        'username': _username.text.trim(),
        'password': _password.text,
        'role': _newRole,
        if (_fullName.text.trim().isNotEmpty) 'full_name': _fullName.text.trim(),
      });
      if (!mounted) return;
      _username.clear();
      _fullName.clear();
      _password.clear();
      setState(() {
        _newRole = 'clerk';
        _showCreate = false;
        _creating = false;
      });
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() => _creating = false);
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  Future<void> _patch(AdminUser u, Map<String, dynamic> body) async {
    try {
      await _api.updateUser(_token, u.id, body);
      if (!mounted) return;
      await _load();
    } catch (e) {
      if (!mounted) return;
      if (handleAdminError(context, e)) return;
      showAdminError(context, e);
    }
  }

  Future<void> _resetPassword(AdminUser u) async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.dialogBg,
        title: Text(isAr ? 'كلمة مرور جديدة' : 'New password',
            style: TextStyle(color: AppColors.white)),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          obscureText: true,
          style: TextStyle(color: AppColors.white),
          decoration: InputDecoration(
            hintText: isAr ? '8 أحرف على الأقل' : 'At least 8 chars',
            hintStyle: TextStyle(color: AppColors.hint),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(isAr ? 'إلغاء' : 'Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(isAr ? 'حفظ' : 'Save')),
        ],
      ),
    );
    if (ok == true && ctrl.text.length >= 8) {
      await _patch(u, {'password': ctrl.text});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(isAr ? 'تم تحديث كلمة المرور' : 'Password updated')));
      }
    }
    ctrl.dispose();
  }

  Future<void> _delete(AdminUser u) async {
    final isAr = context.read<AppProvider>().locale == 'ar';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.dialogBg,
        title: Text(isAr ? 'حذف المستخدم' : 'Delete user',
            style: TextStyle(color: AppColors.white)),
        content: Text(
            isAr ? 'حذف "${u.username}" نهائيًا؟' : 'Delete "${u.username}" permanently?',
            style: TextStyle(color: AppColors.teal)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(isAr ? 'إلغاء' : 'Cancel')),
          FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.red),
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(isAr ? 'حذف' : 'Delete')),
        ],
      ),
    );
    if (ok == true) {
      try {
        await _api.deleteUser(_token, u.id);
        if (!mounted) return;
        await _load();
      } catch (e) {
        if (!mounted) return;
        if (handleAdminError(context, e)) return;
        showAdminError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppProvider>().locale == 'ar';
    final meId = context.watch<AdminAuth>().user?.id;

    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_error!, style: TextStyle(color: AppColors.white)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _load, child: const Text('Retry')),
        ]),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          // ── Create ────────────────────────────────────────────────────────
          if (!_showCreate)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: FilledButton.icon(
                onPressed: () => setState(() => _showCreate = true),
                style: FilledButton.styleFrom(backgroundColor: AppColors.aqua),
                icon: const Icon(Icons.person_add, size: 18),
                label: Text(isAr ? 'مستخدم جديد' : 'New user'),
              ),
            )
          else
            _createForm(isAr),
          const SizedBox(height: 16),
          // ── List ──────────────────────────────────────────────────────────
          for (final u in _users) _userCard(u, isAr, u.id == meId),
        ],
      ),
    );
  }

  Widget _createForm(bool isAr) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(isAr ? 'مستخدم جديد' : 'New user',
              style: TextStyle(
                  color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 14)),
          const Spacer(),
          IconButton(
              onPressed: () => setState(() => _showCreate = false),
              icon: Icon(Icons.close, color: AppColors.hint, size: 20)),
        ]),
        _field(_username, isAr ? 'اسم المستخدم' : 'Username'),
        const SizedBox(height: 10),
        _field(_fullName, isAr ? 'الاسم الكامل (اختياري)' : 'Full name (optional)'),
        const SizedBox(height: 10),
        _field(_password, isAr ? 'كلمة المرور' : 'Password', obscure: true),
        const SizedBox(height: 10),
        DropdownButtonFormField<String>(
          initialValue: _newRole,
          dropdownColor: AppColors.cardBg,
          style: TextStyle(color: AppColors.white, fontSize: 13),
          decoration: _dec(),
          items: [
            for (final r in _roles)
              DropdownMenuItem(value: r, child: Text(_roleLabel(r, isAr))),
          ],
          onChanged: (v) => setState(() => _newRole = v ?? 'clerk'),
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _creating ? null : _create,
            style: FilledButton.styleFrom(backgroundColor: AppColors.aqua),
            child: _creating
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(isAr ? 'إنشاء' : 'Create'),
          ),
        ),
      ]),
    );
  }

  Widget _userCard(AdminUser u, bool isAr, bool isSelf) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: AppColors.aqua.withValues(alpha: 0.15),
            child: Text(
              (u.fullName?.isNotEmpty == true ? u.fullName! : u.username)
                  .characters
                  .first
                  .toUpperCase(),
              style: TextStyle(color: AppColors.aqua, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(
                  child: Text(
                    u.fullName?.isNotEmpty == true ? u.fullName! : u.username,
                    style: TextStyle(
                        color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                ),
                if (isSelf) ...[
                  const SizedBox(width: 6),
                  Text(isAr ? '(أنت)' : '(you)',
                      style: TextStyle(color: AppColors.hint, fontSize: 11)),
                ],
              ]),
              Text('@${u.username}',
                  style: TextStyle(color: AppColors.hint, fontSize: 11.5)),
            ]),
          ),
          if (!u.isActive)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.red.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(isAr ? 'معطّل' : 'Disabled',
                  style: TextStyle(color: AppColors.red, fontSize: 10.5)),
            ),
        ]),
        if (!isSelf) ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: u.role,
                dropdownColor: AppColors.cardBg,
                isDense: true,
                style: TextStyle(color: AppColors.white, fontSize: 12.5),
                decoration: _dec(),
                items: [
                  for (final r in _roles)
                    DropdownMenuItem(value: r, child: Text(_roleLabel(r, isAr))),
                ],
                onChanged: (v) {
                  if (v != null && v != u.role) _patch(u, {'role': v});
                },
              ),
            ),
          ]),
          const SizedBox(height: 8),
          Wrap(spacing: 6, runSpacing: 6, children: [
            _actionChip(
              icon: u.isActive ? Icons.block : Icons.check_circle,
              label: u.isActive
                  ? (isAr ? 'تعطيل' : 'Disable')
                  : (isAr ? 'تفعيل' : 'Enable'),
              color: u.isActive ? AppColors.orange : AppColors.green,
              onTap: () => _patch(u, {'is_active': !u.isActive}),
            ),
            _actionChip(
              icon: Icons.key,
              label: isAr ? 'كلمة المرور' : 'Password',
              color: AppColors.teal,
              onTap: () => _resetPassword(u),
            ),
            _actionChip(
              icon: Icons.delete_outline,
              label: isAr ? 'حذف' : 'Delete',
              color: AppColors.red,
              onTap: () => _delete(u),
            ),
          ]),
        ],
      ]),
    );
  }

  Widget _actionChip({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.4)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 5),
          Text(label, style: TextStyle(color: color, fontSize: 12)),
        ]),
      ),
    );
  }

  Widget _field(TextEditingController c, String hint, {bool obscure = false}) {
    return TextField(
      controller: c,
      obscureText: obscure,
      style: TextStyle(color: AppColors.white, fontSize: 13),
      decoration: _dec(hint: hint),
    );
  }

  InputDecoration _dec({String? hint}) => InputDecoration(
        isDense: true,
        hintText: hint,
        hintStyle: TextStyle(color: AppColors.hint, fontSize: 13),
        filled: true,
        fillColor: AppColors.darkBg,
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: AppColors.border),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: AppColors.aqua),
        ),
      );
}
