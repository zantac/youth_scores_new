'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { mediaUrl } from '@/lib/tla3bnyApi';
import { PLAYER_POSITIONS, slotBase } from '@/lib/tla3bnyFormations';

/** Bilingual literal helper: tt('عربي', 'English') → the active locale's text. */
export function useTT() {
  const { locale } = useApp();
  return (ar: string, en: string) => (locale === 'ar' ? ar : en);
}

const POSITION_BY_CODE: Record<string, { ar: string; en: string }> =
  Object.fromEntries(PLAYER_POSITIONS.map(p => [p.code, { ar: p.ar, en: p.en }]));

/** Localized label for a stored position code: pos('ST') → "مهاجم" / "Striker".
 *  Positions are stored as canonical codes (GK/CB/CM/ST…) so the pitch/lineup
 *  matching keeps working; this renders them in the active language. Strips a
 *  slot's index ("CB1" → "CB"); an unknown / legacy free-text value is returned
 *  unchanged so a custom position still shows. */
export function usePositionLabel() {
  const { locale } = useApp();
  return (code?: string | null): string => {
    if (!code) return '';
    const m = POSITION_BY_CODE[slotBase(code).toUpperCase()];
    return m ? (locale === 'ar' ? m.ar : m.en) : code;
  };
}

/** Bilingual *data* helper for user-entered names. Pass the primary (Arabic)
 *  value and the optional English one; returns the active locale's, falling
 *  back to whichever is present: nm(a.name, a.name_en). */
export function useName() {
  const { locale } = useApp();
  return (primary?: string | null, en?: string | null): string =>
    ((locale === 'en' ? (en || primary) : (primary || en)) ?? '');
}

/**
 * Full-screen overlay showing one image at up to 90% of the viewport, with a
 * close (✕) button. Dismisses on backdrop click, the button, or Esc; locks
 * body scroll while open. Mirrors the ad lightbox in AdCard.
 */
export function PhotoLightbox({
  src, alt, onClose,
}: { src: string; alt?: string | null; onClose: () => void }) {
  const tt = useTT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button" onClick={onClose} aria-label={tt('إغلاق', 'Close')}
        className="absolute top-4 end-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-2xl font-bold text-white hover:bg-white/25"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src} alt={alt ?? ''}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

/** An <img> that opens itself in a {@link PhotoLightbox} when tapped. Use for
 *  the large profile photos on player/coach pages. `className` styles the
 *  inline image exactly as a raw <img> would. */
export function ZoomableImage({
  src, alt, className,
}: { src: string; alt?: string | null; className?: string }) {
  const tt = useTT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="block w-full cursor-zoom-in"
        aria-label={tt('تكبير الصورة', 'Enlarge photo')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt ?? ''} className={className} />
      </button>
      {open && <PhotoLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Round academy/club/profile avatar, falling back to initials on the accent
 *  gradient. Pass `zoomable` to make a real photo open full-screen on tap —
 *  only where the avatar isn't already a link/navigation target. */
export function LogoAvatar({
  src, name, size = 40, zoomable = false,
}: { src?: string | null; name?: string | null; size?: number; zoomable?: boolean }) {
  const tt = useTT();
  const url = mediaUrl(src);
  const [open, setOpen] = useState(false);
  const initials = (name ?? '?').trim().slice(0, 2).toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    const img = (
      <img
        src={url}
        alt={name ?? ''}
        width={size}
        height={size}
        className="rounded-full object-cover bg-cardBg2 border border-bdr shrink-0"
        style={{ width: size, height: size }}
      />
    );
    if (!zoomable) return img;
    return (
      <>
        <button
          type="button" onClick={() => setOpen(true)}
          className="shrink-0 rounded-full cursor-zoom-in"
          aria-label={tt('تكبير الصورة', 'Enlarge photo')}
        >
          {img}
        </button>
        {open && <PhotoLightbox src={url} alt={name} onClose={() => setOpen(false)} />}
      </>
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

export interface SelectOption {
  value: number;
  /** The visible, locale-resolved name. */
  label: string;
  /** Secondary text shown muted on the right (e.g. the player's team). */
  sublabel?: string | null;
  /** Avatar source, shown when the select is used with ``withPhoto``. */
  photo?: string | null;
  /** Extra text folded into the search (e.g. the other-language name), never shown. */
  keywords?: string | null;
}

/** Normalize Arabic/Latin text for a forgiving type-ahead match: drop tashkeel,
 *  unify the alef / ya / ta-marbuta variants, and lowercase. So "احمد" matches
 *  "أحمد" and "ahmed" matches "Ahmed". */
function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, '')  // tashkeel + dagger alef
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Single-select combobox with type-ahead filtering: the user types a name and
 * the list narrows with each letter until they pick a match. Matching is
 * Arabic-friendly and searches the label, sublabel and keywords. Keyboard: ↑/↓
 * to move the highlight, Enter to pick, Esc to close. When something is chosen
 * an ✕ clears it. Use this in place of a <select> over a long people list.
 */
export function SearchableSelect({
  options, value, onChange, placeholder, emptyText, withPhoto = false, disabled = false,
}: {
  options: SelectOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  emptyText?: string;
  withPhoto?: boolean;
  disabled?: boolean;
}) {
  const tt = useTT();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value) ?? null;
  const q = normalizeSearch(query);
  const filtered = q
    ? options.filter(o => normalizeSearch(`${o.label} ${o.sublabel ?? ''} ${o.keywords ?? ''}`).includes(q))
    : options;

  // Close when the user clicks anywhere outside the control.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Keep the highlight on the first row as the visible list changes.
  useEffect(() => { setActive(0); }, [query, open]);

  const pick = (o: SelectOption) => { onChange(o.value); setQuery(''); setOpen(false); };

  // Open: show what they're typing. Closed: show the chosen name (or nothing).
  const display = open ? query : (selected?.label ?? '');

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={display}
        disabled={disabled}
        placeholder={placeholder ?? tt('ابحث…', 'Search…')}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { if (open && filtered[active]) { e.preventDefault(); pick(filtered[active]); } }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        className={`${inputCls} ${selected && !open ? 'pe-9' : ''}`}
      />
      {selected && !open && (
        <button
          type="button"
          onClick={() => { onChange(null); setQuery(''); }}
          className="absolute inset-y-0 end-2 my-auto h-5 w-5 grid place-items-center rounded-full text-hint hover:text-text hover:bg-cardBg2"
          aria-label={tt('مسح', 'Clear')}
        >✕</button>
      )}
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto bg-darkBg border border-bdr rounded-xl shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-hint">{emptyText ?? tt('لا نتائج', 'No matches')}</div>
          ) : filtered.map((o, i) => (
            <button
              type="button"
              key={o.value}
              onMouseDown={e => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-start text-sm transition-colors ${
                i === active ? 'bg-cardBg2' : 'hover:bg-cardBg2/60'
              } ${o.value === value ? 'text-aqua font-bold' : 'text-text'}`}
            >
              {withPhoto && <LogoAvatar src={o.photo} name={o.label} size={22} />}
              <span className="flex-1 min-w-0 truncate">{o.label}</span>
              {o.sublabel && <span className="text-[11px] text-hint truncate shrink-0 max-w-[45%]">{o.sublabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Arab-League dialing codes, Egypt first (the default). */
export const ARAB_DIAL_CODES: { code: string; ar: string; en: string; flag: string }[] = [
  { code: '20',  ar: 'مصر',        en: 'Egypt',         flag: '🇪🇬' },
  { code: '966', ar: 'السعودية',   en: 'Saudi Arabia',  flag: '🇸🇦' },
  { code: '971', ar: 'الإمارات',   en: 'UAE',           flag: '🇦🇪' },
  { code: '965', ar: 'الكويت',     en: 'Kuwait',        flag: '🇰🇼' },
  { code: '974', ar: 'قطر',        en: 'Qatar',         flag: '🇶🇦' },
  { code: '973', ar: 'البحرين',    en: 'Bahrain',       flag: '🇧🇭' },
  { code: '968', ar: 'عُمان',      en: 'Oman',          flag: '🇴🇲' },
  { code: '967', ar: 'اليمن',      en: 'Yemen',         flag: '🇾🇪' },
  { code: '962', ar: 'الأردن',     en: 'Jordan',        flag: '🇯🇴' },
  { code: '961', ar: 'لبنان',      en: 'Lebanon',       flag: '🇱🇧' },
  { code: '963', ar: 'سوريا',      en: 'Syria',         flag: '🇸🇾' },
  { code: '964', ar: 'العراق',     en: 'Iraq',          flag: '🇮🇶' },
  { code: '970', ar: 'فلسطين',     en: 'Palestine',     flag: '🇵🇸' },
  { code: '249', ar: 'السودان',    en: 'Sudan',         flag: '🇸🇩' },
  { code: '218', ar: 'ليبيا',      en: 'Libya',         flag: '🇱🇾' },
  { code: '216', ar: 'تونس',       en: 'Tunisia',       flag: '🇹🇳' },
  { code: '213', ar: 'الجزائر',    en: 'Algeria',       flag: '🇩🇿' },
  { code: '212', ar: 'المغرب',     en: 'Morocco',       flag: '🇲🇦' },
  { code: '222', ar: 'موريتانيا',  en: 'Mauritania',    flag: '🇲🇷' },
  { code: '252', ar: 'الصومال',    en: 'Somalia',       flag: '🇸🇴' },
  { code: '253', ar: 'جيبوتي',     en: 'Djibouti',      flag: '🇩🇯' },
  { code: '269', ar: 'جزر القمر',  en: 'Comoros',       flag: '🇰🇲' },
];

// Match against the longest code first so 3-digit codes win over "20".
const DIAL_CODES_BY_LEN = [...ARAB_DIAL_CODES].sort((a, b) => b.code.length - a.code.length);

/** Split a stored international number (digits only, e.g. "201001234567") into
 *  its dialing code and the local part. Falls back to Egypt for anything that
 *  doesn't begin with a known Arab code — including a bare local number, which
 *  is exactly the legacy value this input is meant to repair on the next save. */
function splitDial(v: string | null | undefined): { dial: string; local: string } {
  const digits = (v ?? '').replace(/\D/g, '');
  if (!digits) return { dial: '20', local: '' };
  const hit = DIAL_CODES_BY_LEN.find(c => digits.startsWith(c.code));
  if (hit) return { dial: hit.code, local: digits.slice(hit.code.length) };
  return { dial: '20', local: digits };
}

/**
 * A dialing-code <select> (Arab countries, Egypt by default) beside a local
 * number field. Most users type just their local number; this guarantees the
 * value we store — and hand to wa.me — carries the country code, without which
 * the WhatsApp link silently fails. Emits digits only, e.g. "201001234567";
 * a leading local "0" (as Egyptians write it) is dropped when combining.
 */
export function PhoneInput({
  value, onChange, placeholder,
}: { value: string | null | undefined; onChange: (v: string) => void; placeholder?: string }) {
  const { dial, local } = splitDial(value);
  const emit = (d: string, l: string) => {
    const rest = l.replace(/\D/g, '').replace(/^0+/, '');
    onChange(rest ? d + rest : '');
  };
  return (
    <div className="flex gap-2" dir="ltr">
      <select
        value={dial}
        onChange={e => emit(e.target.value, local)}
        aria-label="Country dialing code"
        className="shrink-0 bg-darkBg border border-bdr rounded-xl px-2 py-2.5 text-text text-sm outline-none focus:border-aqua transition-colors"
      >
        {ARAB_DIAL_CODES.map(c => (
          <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>
        ))}
      </select>
      <input
        value={local}
        onChange={e => emit(dial, e.target.value)}
        dir="ltr" inputMode="tel" autoComplete="tel"
        placeholder={placeholder ?? '1001234567'}
        className={`${inputCls} flex-1 min-w-0`}
      />
    </div>
  );
}

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
