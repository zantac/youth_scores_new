import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/admin_auth.dart';
import '../../core/services/admin_api.dart';

/// Central handling for admin API failures. On an expired session it logs the
/// admin out and pops back to the public app, returning true so the caller
/// stops. For any other error it returns false so the caller can show it.
bool handleAdminError(BuildContext context, Object error) {
  if (error is AdminSessionExpired) {
    final auth = context.read<AdminAuth>();
    auth.sessionExpired();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(context.read<AdminAuth>().user == null
          ? 'انتهت صلاحية الجلسة — يرجى تسجيل الدخول'
          : 'Session expired — please sign in again'),
    ));
    Navigator.of(context).popUntil((r) => r.isFirst);
    return true;
  }
  return false;
}

/// Show a one-off error message.
void showAdminError(BuildContext context, Object error) {
  final msg = error.toString().replaceFirst('Exception: ', '');
  ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(msg)));
}
