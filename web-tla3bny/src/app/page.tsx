'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tHome, mediaUrl, type THome } from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import MatchRow from '@/components/tla3bny/MatchRow';
import { Card, EmptyState, useTT } from '@/components/tla3bny/kit';

export default function HomePage() {
  const tt = useTT();
  const [data, setData] = useState<THome | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tHome().then(setData).catch(() => setData({ today_matches: [], recent_news: [] }))
      .finally(() => setLoading(false));
  }, []);

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

      {loading ? <Spinner /> : (
        <>
          <section>
            <h2 className="text-lg font-black text-text mb-2">{tt('مباريات اليوم', 'Today’s Matches')}</h2>
            {data && data.today_matches.length > 0 ? (
              <div className="space-y-2">
                {data.today_matches.map(m => <MatchRow key={m.id} m={m} showComp />)}
              </div>
            ) : (
              <EmptyState icon="📅" text={tt('لا مباريات اليوم', 'No matches today')} />
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-black text-text">{tt('آخر الأخبار', 'Latest News')}</h2>
              <Link href="/news" className="text-xs font-bold text-aqua hover:underline">{tt('الكل', 'All')}</Link>
            </div>
            {data && data.recent_news.length > 0 ? (
              <div className="space-y-2">
                {data.recent_news.map(n => (
                  <Card key={n.id} className="p-3 flex gap-3 items-center">
                    {mediaUrl(n.image_path) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(n.image_path)!} alt="" className="w-16 h-16 rounded-xl object-cover border border-bdr shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-text text-sm truncate">{n.title}</div>
                      <div className="text-[11px] text-teal">{n.competition_name}</div>
                      {n.body && <p className="text-xs text-hint line-clamp-2 mt-0.5">{n.body}</p>}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState icon="📰" text={tt('لا أخبار بعد', 'No news yet')} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
