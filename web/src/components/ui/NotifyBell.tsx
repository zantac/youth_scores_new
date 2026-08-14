'use client';
import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { enableNotifications, notifState, type NotifState } from '@/lib/notifications';

// A top-bar toggle to turn on web push. Hidden entirely on browsers that can't
// do it (e.g. iOS Safari outside an installed PWA) so it never dead-ends.
export default function NotifyBell() {
  const { locale } = useApp();
  const isAr = locale === 'ar';
  const [state, setState] = useState<NotifState>('unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setState(notifState()); }, []);

  if (state === 'unsupported') return null;

  const on = state === 'granted';
  const denied = state === 'denied';

  const label = on
    ? (isAr ? 'الإشعارات مفعّلة' : 'Notifications on')
    : denied
      ? (isAr ? 'الإشعارات محظورة في المتصفح' : 'Notifications blocked in browser')
      : (isAr ? 'تفعيل الإشعارات' : 'Enable notifications');

  const onClick = async () => {
    if (on || denied || busy) return;
    setBusy(true);
    try { setState(await enableNotifications()); }
    finally { setBusy(false); }
  };

  return (
    <button
      onClick={onClick}
      disabled={on || denied || busy}
      title={label}
      aria-label={label}
      className={`text-sm leading-none rounded-lg px-2 py-1 border transition-colors
        ${on ? 'border-aqua/60 bg-aqua/10 text-aqua'
             : denied ? 'border-bdr bg-cardBg opacity-50'
             : 'border-bdr bg-cardBg hover:bg-aqua/10'}`}
    >
      {busy ? '…' : on ? '🔔' : denied ? '🔕' : '🔔'}
    </button>
  );
}
