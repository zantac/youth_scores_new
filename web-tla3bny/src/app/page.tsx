'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tNews, mediaUrl, type TNews } from '@/lib/tla3bnyApi';
import MatchesFeed from '@/components/tla3bny/MatchesFeed';
import { Card, useTT } from '@/components/tla3bny/kit';

export default function HomePage() {
  const tt = useTT();
  const [news, setNews] = useState<TNews[]>([]);
  useEffect(() => { tNews({ limit: 4 }).then(setNews).catch(() => setNews([])); }, []);

  return (
    <div className="space-y-6">
      <Card className="p-5 text-center">
        <h1 className="text-2xl font-black text-text">{tt('تلاعبني', 'Tla3bny')}</h1>
        <p className="text-hint text-sm mt-1">
          {tt('بطولات ودية لأكاديميات الناشئين', 'Friendly competitions for youth academies')}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Link href="/competitions"
            className="rounded-xl py-3 font-extrabold bg-gradient-to-l from-aqua to-aqua/85 text-on-accent">
            🏆 {tt('البطولات', 'Competitions')}
          </Link>
          <Link href="/academies"
            className="rounded-xl py-3 font-extrabold bg-cardBg2 border border-bdr text-text hover:border-aqua transition-colors">
            🏫 {tt('الأكاديميات', 'Academies')}
          </Link>
        </div>
      </Card>

      {news.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-black text-text">{tt('آخر الأخبار', 'Latest News')}</h2>
            <Link href="/news" className="text-xs font-bold text-aqua hover:underline">{tt('الكل', 'All')}</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {news.map(n => (
              <Link key={n.id} href="/news" className="shrink-0 w-56">
                <Card className="overflow-hidden h-full hover:border-aqua/40 transition-colors">
                  {mediaUrl(n.image_path) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(n.image_path)!} alt="" className="w-full h-24 object-cover" />
                  )}
                  <div className="p-2.5">
                    <div className="font-bold text-text text-sm line-clamp-2 leading-snug">{n.title}</div>
                    {n.competition_name && <div className="text-[11px] text-teal mt-1 truncate">{n.competition_name}</div>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-black text-text mb-2">{tt('المباريات', 'Matches')}</h2>
        <MatchesFeed />
      </section>
    </div>
  );
}
