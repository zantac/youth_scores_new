'use client';
import { useEffect, useRef } from 'react';
import { apiAdImpression, apiAdClick } from '@/lib/api';
import { cloudinaryUrl } from '@/lib/utils';
import type { AdItem } from '@/lib/types';
import { adDest } from './FeedAdCard';

// One 1:1 creative inside the rail. Logs a feed impression the first time it is
// actually revealed: because the rail clips horizontally (overflow-x), a tile
// scrolled off to the side is not intersecting the viewport, so the same
// viewport-root observer the banner card uses covers both the vertical scroll
// (rail below the fold) and the horizontal swipe (tile off the edge) — a tile in
// slot 5 only counts once the user swipes it into view.
function SquareTile({ ad }: { ad: AdItem }) {
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

  return (
    <a
      ref={ref}
      href={dest ?? '#'}
      target={dest ? '_blank' : undefined}
      rel={dest ? 'noopener noreferrer' : undefined}
      onClick={dest ? () => apiAdClick(ad.id, 'feed') : (e) => e.preventDefault()}
      aria-label={ad.name}
      className="flex-shrink-0 w-40 snap-start active:opacity-80 transition-opacity"
    >
      {hasImage ? (
        // 1:1 creative, shown whole — object-cover on a square never crops a
        // square source, so the photo arrives untouched.
        <img src={cloudinaryUrl(ad.image, 400)} alt={ad.name}
          className="w-full aspect-square object-cover rounded-xl border border-bdr bg-cardBg" />
      ) : (
        <div className="w-full aspect-square rounded-xl border border-bdr bg-cardBg grid place-items-center p-3">
          <p className="text-text font-bold text-xs leading-tight line-clamp-3 text-center">{ad.name}</p>
        </div>
      )}
      <p className="mt-1 text-hint text-[11px] leading-tight line-clamp-1">{ad.name}</p>
    </a>
  );
}

/** A horizontally-scrolling strip of square (1:1) sponsored tiles, rendered
 *  inline in the home match feed. Fixed-width tiles let the next card peek past
 *  the edge so it reads as swipeable; each tile logs its own impression/click. */
export default function FeedAdRail({ ads }: { ads: AdItem[] }) {
  if (!ads.length) return null;
  return (
    <div className="mb-2">
      <p className="text-hint text-[10px] font-bold px-0.5 mb-1">إعلان</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-0.5">
        {ads.map(a => <SquareTile key={a.id} ad={a} />)}
      </div>
    </div>
  );
}
