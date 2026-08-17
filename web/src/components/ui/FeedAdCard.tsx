'use client';
import { useEffect } from 'react';
import { apiAdImpression, apiAdClick } from '@/lib/api';
import type { AdItem } from '@/lib/types';

// Where a feed-card tap goes: the explicit link, else the first contact.
function adDest(ad: AdItem): string | undefined {
  return ad.link
    ?? ad.facebook_link
    ?? ad.youtube_video
    ?? ad.location_url
    ?? (ad.whatsapp_number ? `https://wa.me/${ad.whatsapp_number}` : undefined);
}

/** A native "sponsored" card rendered inline in the home match feed. Logs a
 *  feed impression when mounted and a feed click when tapped. */
export default function FeedAdCard({ ad, isAr }: { ad: AdItem; isAr: boolean }) {
  useEffect(() => { apiAdImpression(ad.id, 'feed'); }, [ad.id]);

  const dest = adDest(ad);
  const hasImage = !!ad.image?.startsWith('http');
  const click = () => apiAdClick(ad.id, 'feed');

  return (
    <a
      href={dest ?? '#'}
      target={dest ? '_blank' : undefined}
      rel={dest ? 'noopener noreferrer' : undefined}
      onClick={dest ? click : (e) => e.preventDefault()}
      className="block overflow-hidden rounded-2xl border border-aqua/30 bg-gradient-to-br from-cardBg to-cardBg/60 active:bg-aqua/5 transition-colors"
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span className="px-1.5 py-0.5 rounded bg-aqua/15 text-aqua text-[9px] font-bold">
          {isAr ? 'إعلان' : 'Sponsored'}
        </span>
        <span className="flex-1" />
        <span className="text-aqua text-sm">{isAr ? '‹' : '›'}</span>
      </div>
      {hasImage && (
        <img src={ad.image} alt={ad.name} className="w-full max-h-56 object-contain bg-darkBg" />
      )}
      <p className="px-3 py-3 text-text font-bold text-sm leading-tight line-clamp-2">
        {ad.name}
      </p>
    </a>
  );
}
