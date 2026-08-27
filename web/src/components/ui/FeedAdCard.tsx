'use client';
import { useEffect, useRef } from 'react';
import { apiAdImpression, apiAdClick } from '@/lib/api';
import { safeUrl, cloudinaryUrl } from '@/lib/utils';
import type { AdItem } from '@/lib/types';

// Where a feed-card tap goes: the explicit link, else the first contact. Each
// candidate is scheme-checked so a malicious link field can't inject javascript:.
function adDest(ad: AdItem): string | undefined {
  return safeUrl(ad.link)
    ?? safeUrl(ad.facebook_link)
    ?? safeUrl(ad.youtube_video)
    ?? safeUrl(ad.location_url)
    ?? (ad.whatsapp_number ? `https://wa.me/${encodeURIComponent(ad.whatsapp_number)}` : undefined);
}

/** A native "sponsored" card rendered inline in the home match feed. Logs one
 *  feed impression the first time the card scrolls into view (so repeated slots
 *  only count cards the user actually sees) and a feed click when tapped. */
export default function FeedAdCard({ ad }: { ad: AdItem }) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let logged = false;
    const io = new IntersectionObserver((entries) => {
      if (!logged && entries.some(e => e.isIntersecting)) {
        logged = true;
        apiAdImpression(ad.id, 'feed');
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [ad.id]);

  const dest = adDest(ad);
  const hasImage = !!ad.image?.startsWith('http');
  const click = () => apiAdClick(ad.id, 'feed');

  return (
    <a
      ref={ref}
      href={dest ?? '#'}
      target={dest ? '_blank' : undefined}
      rel={dest ? 'noopener noreferrer' : undefined}
      onClick={dest ? click : (e) => e.preventDefault()}
      aria-label={ad.name}
      className="block overflow-hidden rounded-xl border border-bdr mb-2 bg-cardBg active:opacity-80 transition-opacity"
    >
      {hasImage ? (
        // Purpose-built 2:1 creative, rendered flush like a match card.
        <img src={cloudinaryUrl(ad.image, 800)} alt={ad.name} className="w-full aspect-[2/1] object-cover" />
      ) : (
        <p className="px-3 py-4 text-text font-bold text-sm leading-tight line-clamp-2">
          {ad.name}
        </p>
      )}
    </a>
  );
}
