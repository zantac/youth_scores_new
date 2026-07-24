'use client';
import { useEffect, useState } from 'react';
import { tNews, mediaUrl, type TNews } from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { Card, EmptyState, useTT } from '@/components/tla3bny/kit';

export default function NewsPage() {
  const tt = useTT();
  const [news, setNews] = useState<TNews[] | null>(null);
  useEffect(() => { tNews(undefined, 100).then(setNews).catch(() => setNews([])); }, []);

  if (!news) return <Spinner />;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-text">{tt('الأخبار', 'News')}</h1>
      {news.length === 0 ? (
        <EmptyState icon="📰" text={tt('لا أخبار بعد', 'No news yet')} />
      ) : (
        <div className="space-y-3">
          {news.map(n => (
            <Card key={n.id} className="p-3">
              {mediaUrl(n.image_path) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(n.image_path)!} alt="" className="w-full h-44 object-cover rounded-xl border border-bdr mb-2" />
              )}
              <div className="text-[11px] text-teal font-bold">{n.competition_name}</div>
              <div className="font-bold text-text">{n.title}</div>
              {n.body && <p className="text-sm text-hint mt-1 whitespace-pre-line">{n.body}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
