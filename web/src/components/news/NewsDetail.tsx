'use client';
import { useState } from 'react';
import { formatNewsDate, localize } from '@/lib/utils';
import type { NewsItem } from '@/lib/types';

// Full-screen news reader, shared by the /news page and the home-page popup so
// both look identical. Text comes first; photos sit at the bottom — a single
// cover shrunk to fit, several photos as a circular thumbnail strip. Tap any
// photo to view it fullscreen.
export default function NewsDetail({ item, locale, onClose }: { item: NewsItem; locale: string; onClose: () => void }) {
  const photos = item.images?.length ? item.images : (item.image?.startsWith('http') ? [item.image] : []);
  const [photoIdx, setPhotoIdx] = useState<number | null>(null);
  const isAr = locale === 'ar';
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
              <img src={photos[0]} alt={title} onClick={() => setPhotoIdx(0)}
                className="mx-auto max-h-56 w-auto max-w-full rounded-2xl object-contain border border-bdr cursor-pointer" />
            ) : (
              <div dir={isAr ? 'rtl' : 'ltr'} className="flex gap-3 overflow-x-auto no-scrollbar py-1">
                {photos.map((p, i) => (
                  <img key={i} src={p} alt="" onClick={() => setPhotoIdx(i)}
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
            {photos.length > 1 && <span className="text-white text-sm">{photoIdx + 1} / {photos.length}</span>}
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <img src={photos[photoIdx]} alt="" className="max-w-full max-h-full object-contain" />
          </div>
          {photos.length > 1 && (
            <div className="flex justify-center gap-2 pb-8">
              {photos.map((_, i) => (
                <button key={i} onClick={() => setPhotoIdx(i)}
                  className={`rounded-full transition-all ${i === photoIdx ? 'bg-white w-4 h-2' : 'bg-white/40 w-2 h-2'}`} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
