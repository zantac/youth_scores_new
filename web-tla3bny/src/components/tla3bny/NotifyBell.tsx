'use client';
import { useEffect, useState } from 'react';
import { useTT } from './kit';
import { enableNotifications, initNotifications, notifState, type NotifState } from '@/lib/notifications';

// Top-bar toggle to turn on tla3bny web push (the always-on news topic). Hidden
// on browsers that can't do web push so it never dead-ends. Also re-asserts an
// already-opted-in device's subscription once per app load (tokens rotate).
export default function NotifyBell() {
  const tt = useTT();
  const [state, setState] = useState<NotifState>('unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState(notifState());
    initNotifications().catch(() => {});
  }, []);

  if (state === 'unsupported') return null;
  const on = state === 'granted';
  const denied = state === 'denied';
  const label = on
    ? tt('الإشعارات مفعّلة', 'Notifications on')
    : denied
      ? tt('الإشعارات محظورة في المتصفح', 'Notifications blocked in browser')
      : tt('تفعيل الإشعارات', 'Enable notifications');

  const onClick = async () => {
    if (on || denied || busy) return;
    setBusy(true);
    try { setState(await enableNotifications()); } finally { setBusy(false); }
  };

  return (
    <button onClick={onClick} disabled={on || denied || busy} title={label} aria-label={label}
      className={`text-sm leading-none rounded-lg px-2 py-1 border transition-colors
        ${on ? 'border-aqua/60 bg-aqua/10 text-aqua' : denied ? 'border-bdr bg-cardBg opacity-50' : 'border-bdr bg-cardBg hover:bg-aqua/10'}`}>
      {busy ? '…' : denied ? '🔕' : '🔔'}
    </button>
  );
}
