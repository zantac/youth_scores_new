'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';
import Spinner from '@/components/ui/Spinner';
import NewsDetail from '@/components/news/NewsDetail';
import { formatNewsDate, isRecent, localize, cloudinaryUrl } from '@/lib/utils';
import type { NewsItem } from '@/lib/types';

function NewsPageInner() {
  const { config, configLoading, configError, refreshConfig, locale } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const isAr = locale === 'ar';
  const idParam = params.get('id');

  // A news-notification deep-links to /news?id=<id>. Once the feed is loaded,
  // open that item automatically. Also keeps the URL shareable.
  useEffect(() => {
    if (!idParam || !config?.news) return;
    const found = config.news.find(n => String(n.id) === idParam);
    if (found) setSelected(found);
  }, [idParam, config]);

  const openItem = (item: NewsItem) => {
    setSelected(item);
    if (item.id != null) router.replace(`/news?id=${item.id}`, { scroll: false });
  };
  const closeItem = () => {
    setSelected(null);
    if (idParam) router.replace('/news', { scroll: false });
  };

  const news = (config?.news ?? []).filter(n =>
    !q || localize(n.title, locale).toLowerCase().includes(q.toLowerCase()) || localize(n.details, locale).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <AppBar title={isAr ? 'الأخبار' : 'News'} />

      <div className="p-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={isAr ? 'بحث...' : 'Search...'}
          className="w-full bg-cardBg border border-bdr rounded-xl px-4 py-2.5 text-text text-sm placeholder-hint outline-none focus:border-aqua mb-3" />

        {configLoading && !config && <Spinner />}
        {configError && (
          <div className="text-center py-8 space-y-3">
            <p className="text-red-400 text-sm">{configError}</p>
            <button onClick={refreshConfig} className="bg-aqua text-on-accent font-bold px-5 py-2 rounded-xl text-sm">
              {isAr ? 'إعادة المحاولة' : 'Retry'}
            </button>
          </div>
        )}

        <div className="space-y-3">
          {news.map((item, i) => {
            const recent = isRecent(item.date);
            const thumb  = item.images?.[0] ?? (item.image?.startsWith('http') ? item.image : null);
            return (
              <button key={i} onClick={() => openItem(item)} className="w-full bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl overflow-hidden text-start transition-all hover:border-aqua/30 hover:shadow-[0_14px_34px_-20px_rgba(0,0,0,0.7)] active:opacity-80">
                <div className="p-3.5 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="flex-1 text-aqua font-bold text-sm leading-relaxed line-clamp-2">{localize(item.title, locale)}</span>
                    {recent && (
                      <span className="flex-shrink-0 text-[10px] text-gold bg-gold/15 border border-gold/40 rounded-md px-1.5 py-0.5 font-extrabold tracking-wide">NEW</span>
                    )}
                  </div>
                  {localize(item.details, locale) && <p className="text-teal text-xs line-clamp-2 leading-relaxed">{localize(item.details, locale)}</p>}
                  <div className="flex items-center gap-1.5 text-hint text-xs">
                    <span>📅</span>
                    <span>{formatNewsDate(item.date, locale)}</span>
                  </div>
                </div>
                {/* Cover at the bottom of the card, shrunk to fit the width. */}
                {thumb && (
                  <img src={cloudinaryUrl(thumb, 800)} alt={localize(item.title, locale)} className="w-full h-40 object-cover" />
                )}
              </button>
            );
          })}
          {!configLoading && news.length === 0 && (
            <p className="text-center text-hint py-12">{isAr ? 'لا توجد أخبار' : 'No news'}</p>
          )}
        </div>
      </div>

      {selected && <NewsDetail item={selected} locale={locale} onClose={closeItem} />}
    </>
  );
}

export default function NewsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NewsPageInner />
    </Suspense>
  );
}
