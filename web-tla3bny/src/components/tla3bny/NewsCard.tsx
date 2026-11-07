'use client';
import { mediaUrl, type TNews } from '@/lib/tla3bnyApi';
import { useApp } from '@/context/AppContext';

export function formatNewsDate(date: string | null, locale: string): string {
  if (!date) return '';
  try {
    return new Date(date + 'T00:00:00').toLocaleDateString(
      locale === 'ar' ? 'ar-EG' : 'en-US',
      { day: 'numeric', month: 'long', year: 'numeric' },
    );
  } catch { return date; }
}

/**
 * The shared news card: cover photo (with a photo-count badge for a gallery),
 * title, snippet, date and — outside a single competition — the competition
 * name. Used both by the News tab list and the home "Latest News" section so
 * they look identical. Purely presentational; the caller wraps it in the
 * button/Link that opens the item.
 */
export default function NewsCard({ item, isNew = false, showCompetition = true }: {
  item: TNews; isNew?: boolean; showCompetition?: boolean;
}) {
  const { locale } = useApp();
  const thumb = mediaUrl(item.image_path);
  return (
    <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl overflow-hidden transition-all hover:border-aqua/30 hover:shadow-[0_14px_34px_-20px_rgba(0,0,0,0.7)]">
      {thumb && (
        <div className="relative h-40 overflow-hidden">
          {/* A blurred, zoomed copy of the cover fills the band so a portrait
              image — e.g. a player's/coach's profile photo on an "of the round"
              award item — can be shown whole (object-contain) and centered with
              no black bars, instead of a wide crop that cuts off the face. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt="" aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt={item.title} className="relative w-full h-full object-contain" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-cardBg to-transparent" />
          {item.images.length > 1 && (
            <span className="absolute top-2 end-2 text-[10px] text-white bg-black/60 rounded-md px-1.5 py-0.5 font-bold tnum">
              📷 {item.images.length}
            </span>
          )}
        </div>
      )}
      <div className="p-3.5 space-y-1.5">
        <div className="flex items-start gap-2">
          <span className="flex-1 text-aqua font-bold text-sm leading-relaxed line-clamp-2">{item.title}</span>
          {isNew && (
            <span className="flex-shrink-0 text-[10px] text-gold bg-gold/15 border border-gold/40 rounded-md px-1.5 py-0.5 font-extrabold tracking-wide">
              NEW
            </span>
          )}
        </div>
        {item.body && <p className="text-teal text-xs line-clamp-2 leading-relaxed">{item.body}</p>}
        <div className="flex items-center gap-3 text-hint text-xs flex-wrap">
          <span className="flex items-center gap-1.5">📅 {formatNewsDate(item.date, locale)}</span>
          {/* Competition · sub-competition · age bracket — so a reader sees which
              age an auto-published honour belongs to, not just the competition. */}
          {(() => {
            const scope = [
              showCompetition ? item.competition_name : null,
              item.sub_competition_label,
            ].filter(Boolean).join(' · ');
            return scope ? <span className="flex items-center gap-1.5 truncate">🏆 {scope}</span> : null;
          })()}
        </div>
      </div>
    </div>
  );
}
