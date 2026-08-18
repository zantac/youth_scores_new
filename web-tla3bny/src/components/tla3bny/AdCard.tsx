'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { mediaUrl, whatsappLink, tAdSettings, type TAd, type TAdSettings } from '@/lib/tla3bnyApi';
import { safeUrl } from '@/lib/utils';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import { useTT } from './kit';

// The carousel display settings (rotation speed + poster size) are one shared
// value; fetch them once per page load and share across every AdStrip.
const AD_DEFAULTS: TAdSettings = { rotation_seconds: 3, poster_scale: 100 };
let settingsPromise: Promise<TAdSettings> | null = null;
function loadAdSettings(): Promise<TAdSettings> {
  if (!settingsPromise) settingsPromise = tAdSettings().catch(() => AD_DEFAULTS);
  return settingsPromise;
}

/** The WhatsApp glyph, coloured by the button's `currentColor`. */
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a11.9 11.9 0 005.71 1.454h.005c6.554 0 11.892-5.335 11.895-11.9C24 8.9 22.7 5.657 20.52 3.449"/>
    </svg>
  );
}

/**
 * One sponsor ad: the poster plus a button for each contact the sponsor gave
 * (WhatsApp / call / Facebook / Instagram / website). Only present buttons show,
 * and they are icon-only. Tapping the poster opens it full-screen.
 *
 * `variant`:
 *   - `poster` — large, used on the player-profile page and the home banner.
 *   - `strip`  — compact fixed-width card, used in the horizontal sponsor strips
 *                on the competition-match pages.
 */
export default function AdCard({ ad, variant = 'poster' }: { ad: TAd; variant?: 'poster' | 'strip' }) {
  const tt = useTT();
  const [zoom, setZoom] = useState(false);
  const { user } = useTla3bnyAuth();
  // Sponsor ads are shown to the public only — hidden once anyone signs in.
  if (user) return null;
  const poster = mediaUrl(ad.poster_path);
  const wa = whatsappLink(ad.whatsapp_number);

  const buttons: { href: string; label: string; icon: ReactNode; cls: string }[] = [];
  if (wa) buttons.push({ href: wa, label: tt('واتساب', 'WhatsApp'), icon: <WhatsAppIcon />, cls: 'text-win' });
  if (ad.phone) buttons.push({ href: `tel:${ad.phone}`, label: tt('اتصال', 'Call'), icon: '📞', cls: '' });
  const fbUrl = safeUrl(ad.facebook_url);
  const igUrl = safeUrl(ad.instagram_url);
  const webUrl = safeUrl(ad.website_url);
  const locUrl = safeUrl(ad.location_url);
  if (fbUrl) buttons.push({ href: fbUrl, label: 'Facebook', icon: 'f', cls: 'text-[#1877F2]' });
  if (igUrl) buttons.push({ href: igUrl, label: 'Instagram', icon: '◎', cls: 'text-[#E4405F]' });
  if (webUrl) buttons.push({ href: webUrl, label: tt('الموقع الالكتروني', 'Website'), icon: '🌐', cls: 'text-teal' });
  if (locUrl) buttons.push({ href: locUrl, label: tt('الخريطة', 'Map'), icon: '📍', cls: '' });

  const isStrip = variant === 'strip';
  const external = (href: string) => href.startsWith('http');

  const buttonEls = buttons.map(b => (
    <a
      key={b.label} href={b.href}
      target={external(b.href) ? '_blank' : undefined}
      rel={external(b.href) ? 'noopener noreferrer' : undefined}
      aria-label={b.label} title={b.label}
      onClick={e => e.stopPropagation()}
      className={`inline-flex items-center justify-center text-[18px] font-bold w-9 h-9 ${b.cls}`}
    >
      {b.icon}
    </a>
  ));

  return (
    <>
      <div className={`overflow-hidden rounded-2xl ${isStrip ? 'shrink-0 w-56' : 'w-full'}`}>
        {poster && (
          <button type="button" onClick={() => setZoom(true)} className="block w-full" aria-label={tt('تكبير الإعلان', 'Enlarge ad')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={poster} alt={ad.sponsor_name ?? tt('إعلان', 'Ad')}
              className={`w-full ${isStrip ? 'aspect-video object-cover' : 'h-auto'}`}
            />
          </button>
        )}
        {ad.caption && !isStrip && (
          <p className="pt-2 text-center text-[11px] text-hint line-clamp-2">{ad.caption}</p>
        )}
      </div>

      {zoom && poster && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-black/90 p-4"
          onClick={() => setZoom(false)}
        >
          <button
            type="button" onClick={() => setZoom(false)} aria-label={tt('إغلاق', 'Close')}
            className="absolute top-4 end-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-2xl font-bold text-white hover:bg-white/25"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster} alt={ad.sponsor_name ?? tt('إعلان', 'Ad')}
            className="max-h-[75vh] max-w-full rounded-lg object-contain"
            onClick={e => e.stopPropagation()}
          />
          {buttonEls.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2.5">{buttonEls}</div>
          )}
        </div>
      )}
    </>
  );
}

/** A peek carousel of sponsor banners: the active poster sits centred with the
 *  previous and next ones peeking in on either side. Every 3s it advances to the
 *  next ad (looping), scrolling it to centre; the user can still swipe. Each card
 *  taps to fullscreen. Renders nothing when there are no ads, so callers can drop
 *  it in unconditionally. */
export function AdStrip({ ads, className = '' }: { ads: TAd[]; className?: string }) {
  const { user } = useTla3bnyAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [settings, setSettings] = useState<TAdSettings>(AD_DEFAULTS);

  useEffect(() => { loadAdSettings().then(setSettings); }, []);

  useEffect(() => {
    if (ads.length <= 1) return;
    const id = setInterval(() => setI(p => (p + 1) % ads.length), settings.rotation_seconds * 1000);
    return () => clearInterval(id);
  }, [ads.length, settings.rotation_seconds]);

  // Scroll the active card to centre (horizontal only — never nudges the page).
  useEffect(() => {
    const el = ref.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (el && card) {
      el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
    }
  }, [i, settings.poster_scale]);

  if (user || !ads.length) return null;   // public-only: hidden when signed in
  // Base card is 72% of the row; poster_scale (%) grows/shrinks it, and the side
  // padding keeps the first/last card centrable with the rest peeking.
  const cardW = Math.max(30, Math.min(96, 72 * settings.poster_scale / 100));
  const pad = Math.max(0, (100 - cardW) / 2);
  return (
    <div className={`mx-auto max-w-[30rem] ${className}`}>
      <div ref={ref} className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory"
        style={{ paddingLeft: `${pad}%`, paddingRight: `${pad}%` }}>
        {ads.map(ad => (
          <div key={ad.id} className="snap-center shrink-0" style={{ width: `${cardW}%` }}>
            <AdCard ad={ad} variant="poster" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A full-bleed banner of sponsor ads: each poster fills the container width.
 *  With more than one ad it becomes a snap-scrolling carousel. No heading, so
 *  it reads as content rather than a labelled "ads" box. Renders nothing when
 *  there are no ads, so callers can drop it in unconditionally. */
export function AdBanner({ ads, className = '' }: { ads: TAd[]; className?: string }) {
  const { user } = useTla3bnyAuth();
  if (user || !ads.length) return null;   // public-only: hidden when signed in
  if (ads.length === 1) {
    return <div className={className}><AdCard ad={ads[0]} variant="poster" /></div>;
  }
  return (
    <div className={`flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory ${className}`}>
      {ads.map(ad => (
        <div key={ad.id} className="shrink-0 w-full snap-center">
          <AdCard ad={ad} variant="poster" />
        </div>
      ))}
    </div>
  );
}
