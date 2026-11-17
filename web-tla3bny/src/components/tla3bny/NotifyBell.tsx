'use client';
import { useEffect, useState } from 'react';
import { useTT } from './kit';
import {
  enableNotifications, disableNotifications, initNotifications,
  notifState, type NotifState,
} from '@/lib/notifications';

// Top-bar toggle: on → off → on. Hidden on browsers without web push.
// 'opted_out': permission still granted, FCM token deleted + LS flag set.
// 'denied': browser blocked — user must fix in browser settings.
export default function NotifyBell() {
  const tt = useTT();
  const [state, setState] = useState<NotifState>('unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = notifState();
    setState(s);
    if (s === 'default') {
      // Auto-prompt on first visit so notifications are on by default.
      setBusy(true);
      enableNotifications().then(setState).catch(() => {}).finally(() => setBusy(false));
    } else {
      initNotifications().catch(() => {});
    }
  }, []);

  if (state === 'unsupported') return null;

  const on = state === 'granted';
  const denied = state === 'denied';
  const inactive = state === 'opted_out' || state === 'default';

  const label = on
    ? tt('إيقاف الإشعارات', 'Turn off notifications')
    : denied
      ? tt('الإشعارات محظورة في المتصفح', 'Notifications blocked in browser')
      : inactive
        ? tt('تفعيل الإشعارات', 'Enable notifications')
        : tt('تفعيل الإشعارات', 'Enable notifications');

  const onClick = async () => {
    if (denied || busy) return;
    setBusy(true);
    try {
      if (on) {
        setState(await disableNotifications());
      } else {
        setState(await enableNotifications());
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={denied || busy}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`flex items-center gap-1 text-sm leading-none rounded-lg px-2 py-1 border transition-colors
        ${on
          ? 'border-aqua/60 bg-aqua/10 text-aqua hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400'
          : denied
            ? 'border-bdr bg-cardBg opacity-50 cursor-not-allowed'
            : 'border-bdr bg-cardBg hover:bg-aqua/10'}`}
    >
      <span>{busy ? '…' : denied ? '🔕' : '🔔'}</span>
      {on && <span className="text-[11px] font-bold">{tt('مفعّل', 'On')}</span>}
    </button>
  );
}
