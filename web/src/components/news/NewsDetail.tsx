'use client';
import { useState, useRef, useEffect } from 'react';
import { formatNewsDate, localize, cloudinaryUrl } from '@/lib/utils';
import type { NewsItem } from '@/lib/types';

// Fullscreen image with pinch / double-tap / wheel zoom and drag-to-pan. Pointer
// events cover both touch and mouse; no external dependency. Zoom resets when the
// photo changes. When not zoomed, a horizontal drag is treated as a swipe and
// reported via onSwipe(+1 = next, -1 = prev) so the parent can change photo.
// Direction follows reading order: in RTL a right-swipe advances, in LTR a
// left-swipe advances.
function ZoomableImage({ src, rtl, onSwipe }: { src: string; rtl?: boolean; onSwipe?: (dir: number) => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const pts = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const pan = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => { setScale(1); setPos({ x: 0, y: 0 }); }, [src]);

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setActive(true);
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { dist: gap(a, b), scale };
      pan.current = null;
    } else if (pts.current.size === 1) {
      pan.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
      const now = Date.now();
      if (now - lastTap.current < 300) {           // double-tap toggles zoom
        if (scale > 1) { setScale(1); setPos({ x: 0, y: 0 }); } else setScale(2.5);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const move = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2 && pinch.current) {
      const [a, b] = [...pts.current.values()];
      setScale(clamp(pinch.current.scale * (gap(a, b) / pinch.current.dist), 1, 4));
    } else if (pts.current.size === 1 && scale > 1 && pan.current) {
      setPos({ x: pan.current.px + (e.clientX - pan.current.x), y: pan.current.py + (e.clientY - pan.current.y) });
    }
  };

  const up = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (pts.current.size === 0) {
      const start = pan.current;
      pan.current = null;
      setActive(false);
      if (scale <= 1) {
        setPos({ x: 0, y: 0 });
        // Not zoomed: a dominant horizontal drag navigates between photos.
        if (start && onSwipe) {
          const dx = e.clientX - start.x, dy = e.clientY - start.y;
          // LTR: swipe left (dx<0) = next. RTL: swipe right (dx>0) = next.
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) onSwipe((dx < 0 ? 1 : -1) * (rtl ? -1 : 1));
        }
      }
    }
  };

  const wheel = (e: React.WheelEvent) => {
    setScale(s => {
      const next = clamp(s * (e.deltaY < 0 ? 1.15 : 0.87), 1, 4);
      if (next <= 1) setPos({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <div className="flex-1 overflow-hidden flex items-center justify-center touch-none"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
      <img src={src} alt="" draggable={false}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: active ? 'none' : 'transform 0.15s ease-out', cursor: scale > 1 ? 'grab' : 'default' }}
        className="max-w-full max-h-full object-contain select-none" />
    </div>
  );
}

// Full-screen news reader, shared by the /news page and the home-page popup so
// both look identical. Text comes first; photos sit at the bottom — a single
// cover shrunk to fit, several photos as a circular thumbnail strip. Tap any
// photo to view it fullscreen.
export default function NewsDetail({ item, locale, onClose }: { item: NewsItem; locale: string; onClose: () => void }) {
  const photos = item.images?.length ? item.images : (item.image?.startsWith('http') ? [item.image] : []);
  const [photoIdx, setPhotoIdx] = useState<number | null>(null);
  const isAr = locale === 'ar';

  // Move between photos while the fullscreen viewer is open; clamps at the ends.
  const go = (dir: number) => setPhotoIdx(i =>
    i === null ? i : Math.min(photos.length - 1, Math.max(0, i + dir)));

  // Desktop keyboard: arrows navigate, Escape closes.
  useEffect(() => {
    if (photoIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') setPhotoIdx(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photoIdx, photos.length]);

  const title   = localize(item.title, locale);
  const details = localize(item.details, locale) || null;

  return (
    <div className="fixed inset-0 z-50 bg-darkBg flex flex-col">
      <div className="flex items-center bg-cardBg border-b border-bdr px-4 py-3 gap-3">
        <button onClick={onClose} className="text-aqua text-xl font-bold">✕</button>
        <span className="flex-1 text-aqua font-bold text-sm">{isAr ? 'الأخبار' : 'News'}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Text first */}
        <div className="p-4 space-y-4">
          <h1 className="text-aqua font-bold text-xl leading-relaxed">{title}</h1>
          <div className="flex items-center gap-2 text-hint text-sm">
            <span>📅</span>
            <span>{formatNewsDate(item.date, locale)}</span>
          </div>
          {details && <>
            <hr className="border-bdr" />
            <p className="text-text text-base leading-[1.9] whitespace-pre-line">{details}</p>
          </>}
        </div>

        {/* Photos at the bottom, shrunk to fit. A single cover is centered; several
            photos become a horizontal strip of the same large rectangles. Tap any
            to view it fullscreen. */}
        {photos.length > 0 && (
          <div className="px-4 pb-8 pt-2">
            {photos.length === 1 ? (
              <img src={cloudinaryUrl(photos[0], 1000)} alt={title} onClick={() => setPhotoIdx(0)}
                className="mx-auto max-h-56 w-auto max-w-full rounded-2xl object-contain border border-bdr cursor-pointer" />
            ) : (
              <div dir={isAr ? 'rtl' : 'ltr'} className="flex gap-3 overflow-x-auto no-scrollbar py-1">
                {photos.map((p, i) => (
                  <img key={i} src={cloudinaryUrl(p, 800)} alt="" onClick={() => setPhotoIdx(i)}
                    className="h-56 w-auto max-w-[90%] rounded-2xl object-contain border border-bdr flex-shrink-0 cursor-pointer" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen photo viewer */}
      {photoIdx !== null && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/50">
            <button onClick={() => setPhotoIdx(null)} className="text-white text-2xl">✕</button>
            <span className="text-white/60 text-[11px]">قرّب بإصبعين أو اضغط مرتين</span>
            {photos.length > 1 && <span className="text-white text-sm">{photoIdx + 1} / {photos.length}</span>}
          </div>
          <ZoomableImage key={photoIdx} src={cloudinaryUrl(photos[photoIdx], 1600)} rtl={isAr} onSwipe={photos.length > 1 ? go : undefined} />
          {photos.length > 1 && <>
            {/* Desktop arrows; hidden on touch where swipe is natural. */}
            <button onClick={() => go(-1)} disabled={photoIdx === 0} aria-label="prev"
              className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white text-2xl disabled:opacity-25">‹</button>
            <button onClick={() => go(1)} disabled={photoIdx === photos.length - 1} aria-label="next"
              className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white text-2xl disabled:opacity-25">›</button>
            <div className="flex justify-center gap-2 pb-8">
              {photos.map((_, i) => (
                <button key={i} onClick={() => setPhotoIdx(i)}
                  className={`rounded-full transition-all ${i === photoIdx ? 'bg-white w-4 h-2' : 'bg-white/40 w-2 h-2'}`} />
              ))}
            </div>
          </>}
        </div>
      )}
    </div>
  );
}
