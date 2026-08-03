'use client';
import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { mediaUrl } from '@/lib/tla3bnyApi';

/** Bilingual literal helper: tt('عربي', 'English') → the active locale's text. */
export function useTT() {
  const { locale } = useApp();
  return (ar: string, en: string) => (locale === 'ar' ? ar : en);
}

/** Bilingual *data* helper for user-entered names. Pass the primary (Arabic)
 *  value and the optional English one; returns the active locale's, falling
 *  back to whichever is present: nm(a.name, a.name_en). */
export function useName() {
  const { locale } = useApp();
  return (primary?: string | null, en?: string | null): string =>
    ((locale === 'en' ? (en || primary) : (primary || en)) ?? '');
}

/** Round academy/club logo, falling back to initials on the accent gradient. */
export function LogoAvatar({
  src, name, size = 40,
}: { src?: string | null; name?: string | null; size?: number }) {
  const url = mediaUrl(src);
  const initials = (name ?? '?').trim().slice(0, 2).toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name ?? ''}
        width={size}
        height={size}
        className="rounded-full object-cover bg-cardBg2 border border-bdr shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full grid place-items-center font-extrabold text-on-accent bg-gradient-to-br from-aqua to-aqua/70 shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  approved: 'text-win bg-win/10 border-win/30',
  active: 'text-win bg-win/10 border-win/30',
  pending: 'text-gold bg-gold/10 border-gold/30',
  rejected: 'text-loss bg-loss/10 border-loss/30',
  scheduled: 'text-teal bg-cardBg2 border-bdr',
  live: 'text-loss bg-loss/10 border-loss/30',
  completed: 'text-hint bg-cardBg2 border-bdr',
  finished: 'text-hint bg-cardBg2 border-bdr',
  postponed: 'text-gold bg-gold/10 border-gold/30',
  cancelled: 'text-loss bg-loss/10 border-loss/30',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cls = STATUS_COLORS[status] ?? 'text-hint bg-cardBg2 border-bdr';
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {label ?? status}
    </span>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl ${className}`}>
      {children}
    </div>
  );
}

export function Field({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-teal text-xs font-bold mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full bg-darkBg border border-bdr rounded-xl px-4 py-2.5 text-text text-sm outline-none focus:border-aqua transition-colors';

export function EmptyState({ icon = '📭', text }: { icon?: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="text-4xl opacity-70">{icon}</div>
      <p className="text-hint text-sm">{text}</p>
    </div>
  );
}

export function PrimaryButton({
  children, className = '', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`bg-gradient-to-l from-aqua to-aqua/85 text-on-accent font-extrabold py-2.5 px-5 rounded-xl disabled:opacity-50 transition-opacity shadow-[0_10px_24px_-10px_rgb(var(--accent-rgb))] ${className}`}
    >
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">{children}</p>
  );
}

/**
 * Warns the user before they close the tab / navigate away while a form
 * has unsaved changes.  Does NOT block in-app tab switches — pair with
 * <UnsavedBadge> to make the dirty state visible inside the page.
 */
export function useUnsavedGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}

/** Small inline badge shown when a form has unsaved changes. */
export function UnsavedBadge({ isDirty }: { isDirty: boolean }) {
  const tt = useTT();
  if (!isDirty) return null;
  return (
    <span className="text-[11px] font-bold text-gold animate-pulse">
      ● {tt('تغييرات غير محفوظة', 'Unsaved changes')}
    </span>
  );
}
