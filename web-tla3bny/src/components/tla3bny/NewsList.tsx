'use client';
import { useEffect, useState } from 'react';
import { tNews, mediaUrl, type TNews } from '@/lib/tla3bnyApi';
import { useApp } from '@/context/AppContext';
import Spinner from '@/components/ui/Spinner';
import { EmptyState, useTT } from './kit';

/**
 * The public news feed, presented like youthscores': a cover-photo card that
 * opens the full item, with a fullscreen photo viewer for the gallery.
 *
 * With `compId` it shows one competition's news; without it, everything.
 */

function formatNewsDate(date: string | null, locale: string): string {
  if (!date) return '';
  try {
    return new Date(date + 'T00:00:00').toLocaleDateString(
      locale === 'ar' ? 'ar-EG' : 'en-US',
      { day: 'numeric', month: 'long', year: 'numeric' },
    );
  } catch { return date; }
}

/** Items from the last three days get a NEW flag, as on youthscores. */
function isRecent(date: string | null): boolean {
  if (!date) return false;
  const days = (Date.now() - new Date(date + 'T00:00:00').getTime()) / 86_400_000;
  return days >= 0 && days <= 3;
}

function NewsDetail({ item, onClose }: { item: TNews; onClose: () => void }) {
  const tt = useTT();
  const { locale } = useApp();
  const [photoIdx, setPhotoIdx] = useState<number | null>(null);
  const photos = item.images.map(i => mediaUrl(i)).filter(Boolean) as string[];

  return (
    <div className="fixed inset-0 z-50 bg-darkBg overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-cardBg/95 backdrop-blur border-b border-bdr px-4 py-3">
        <button onClick={onClose} className="text-aqua text-xl">✕</button>
        <span className="text-text font-bold text-sm truncate">{tt('الخبر', 'Article')}</span>
      </div>

      {photos.length > 0 && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[0]} alt="" onClick={() => setPhotoIdx(0)}
            className="w-full max-h-[320px] object-cover cursor-zoom-in" />
          {photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar p-2">
              {photos.slice(1).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" onClick={() => setPhotoIdx(i + 1)}
                  className="h-16 w-24 object-cover rounded-lg border border-bdr shrink-0 cursor-zoom-in" />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-4 space-y-4">
        <h1 className="text-aqua font-bold text-xl leading-relaxed">{item.title}</h1>
        <div className="flex items-center gap-3 text-hint text-sm flex-wrap">
          <span className="flex items-center gap-1.5">📅 {formatNewsDate(item.date, locale)}</span>
          {item.competition_name && <span className="flex items-center gap-1.5">🏆 {item.competition_name}</span>}
          {!item.is_published && (
            <span className="text-gold text-[11px] border border-gold/40 bg-gold/10 rounded px-1.5 py-0.5 font-bold">
              {tt('مسودة', 'Draft')}
            </span>
          )}
        </div>
        <hr className="border-bdr" />
        {item.body && <p className="text-text text-base leading-[1.9] whitespace-pre-line">{item.body}</p>}
      </div>

      {photoIdx !== null && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/50">
            <button onClick={() => setPhotoIdx(null)} className="text-white text-2xl">✕</button>
            {photos.length > 1 && <span className="text-white text-sm tnum">{photoIdx + 1} / {photos.length}</span>}
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
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

export default function NewsList({ compId, search = false }: { compId?: number; search?: boolean }) {
  const tt = useTT();
  const { locale } = useApp();
  const [items, setItems] = useState<TNews[] | null>(null);
  const [selected, setSelected] = useState<TNews | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    setItems(null);
    tNews({ competition_id: compId }).then(setItems).catch(() => setItems([]));
  }, [compId]);

  if (!items) return <Spinner />;

  const shown = items.filter(n =>
    !q || n.title.toLowerCase().includes(q.toLowerCase())
       || (n.body ?? '').toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      {search && (
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={tt('بحث...', 'Search...')}
          className="w-full bg-cardBg border border-bdr rounded-xl px-4 py-2.5 text-text text-sm placeholder-hint outline-none focus:border-aqua mb-3" />
      )}

      {shown.length === 0 ? (
        <EmptyState icon="📰" text={tt('لا أخبار', 'No news')} />
      ) : (
        <div className="space-y-3">
          {shown.map(n => {
            const thumb = mediaUrl(n.image_path);
            return (
              <button key={n.id} onClick={() => setSelected(n)}
                className="w-full bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl overflow-hidden text-start transition-all hover:border-aqua/30 hover:shadow-[0_14px_34px_-20px_rgba(0,0,0,0.7)] active:opacity-80">
                {thumb && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb} alt={n.title} className="w-full h-40 object-cover" />
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-cardBg to-transparent" />
                    {n.images.length > 1 && (
                      <span className="absolute top-2 end-2 text-[10px] text-white bg-black/60 rounded-md px-1.5 py-0.5 font-bold tnum">
                        📷 {n.images.length}
                      </span>
                    )}
                  </div>
                )}
                <div className="p-3.5 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="flex-1 text-aqua font-bold text-sm leading-relaxed line-clamp-2">{n.title}</span>
                    {isRecent(n.date) && (
                      <span className="flex-shrink-0 text-[10px] text-gold bg-gold/15 border border-gold/40 rounded-md px-1.5 py-0.5 font-extrabold tracking-wide">
                        NEW
                      </span>
                    )}
                  </div>
                  {n.body && <p className="text-teal text-xs line-clamp-2 leading-relaxed">{n.body}</p>}
                  <div className="flex items-center gap-3 text-hint text-xs flex-wrap">
                    <span className="flex items-center gap-1.5">📅 {formatNewsDate(n.date, locale)}</span>
                    {compId == null && n.competition_name && (
                      <span className="flex items-center gap-1.5 truncate">🏆 {n.competition_name}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && <NewsDetail item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
