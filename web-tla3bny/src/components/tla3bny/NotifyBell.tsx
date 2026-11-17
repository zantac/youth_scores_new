'use client';
import { useEffect, useState } from 'react';
import { useTT } from './kit';
import { enableNotifications, initNotifications, notifState, type NotifState } from '@/lib/notifications';

// Read-only status badge: shows whether push notifications are on or off.
// Not clickable — the browser permission can't be changed programmatically.
// Auto-prompts on first visit (state='default') so new users get the dialog.
export default function NotifyBell() {
  const tt = useTT();
  const [state, setState] = useState<NotifState>('unsupported');

  useEffect(() => {
    const s = notifState();
    setState(s);
    if (s === 'default') {
      enableNotifications().then(setState).catch(() => {});
    } else {
      initNotifications().catch(() => {});
    }
  }, []);

  if (state === 'unsupported') return null;

  const on = state === 'granted';
  const label = tt(on ? 'الإشعارات مفعّلة' : 'الإشعارات مطفأة', on ? 'Notifications on' : 'Notifications off');

  return (
    <div title={label} aria-label={label}
      className={`flex items-center gap-1 text-sm leading-none rounded-lg px-2 py-1 border select-none
        ${on ? 'border-aqua/60 bg-aqua/10 text-aqua' : 'border-bdr bg-cardBg text-hint'}`}>
      <span>{on ? '🔔' : '🔕'}</span>
      <span className="text-[11px] font-bold">{tt(on ? 'مفعّل' : 'مطفأ', on ? 'On' : 'Off')}</span>
    </div>
  );
}
