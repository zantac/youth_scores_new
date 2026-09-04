'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tCompetition, type TCompetition } from '@/lib/tla3bnyApi';
import { sortAges } from '@/lib/utils';
import Spinner from '@/components/ui/Spinner';
import CompetitionInfo from '@/components/tla3bny/CompetitionInfo';
import CompetitionHero from '@/components/tla3bny/CompetitionHero';
import FollowButton from '@/components/tla3bny/FollowButton';
import NewsList from '@/components/tla3bny/NewsList';
import { EmptyState, useTT } from '@/components/tla3bny/kit';

type Tab = 'about' | 'subs' | 'news';

// The public competition page. Its hero sits on top, then three tabs:
//   • about — who runs it, معلومات, contact (CompetitionInfo)
//   • subs  — المنافسات (the sub-competitions), each opening its own view
//   • news  — this competition's news (moved here from the sub-competition view)
function CompetitionContent() {
  const tt = useTT();
  const params = useSearchParams();
  const router = useRouter();
  const id = Number(params.get('id'));
  const [comp, setComp] = useState<TCompetition | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get('tab');
    return t === 'subs' || t === 'news' ? t : 'about';
  });

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    tCompetition(id).then(setComp).catch(() => setComp(null)).finally(() => setLoading(false));
  }, [id]);

  // Keep the open tab in the address bar so a view can be shared/reopened.
  const selectTab = useCallback((t: Tab) => {
    setTab(t);
    const p = new URLSearchParams({ id: String(id) });
    if (t !== 'about') p.set('tab', t);
    router.replace(`/competition?${p.toString()}`, { scroll: false });
  }, [id, router]);

  if (loading) return <Spinner />;
  if (!comp) return <EmptyState icon="🏆" text={tt('البطولة غير موجودة', 'Competition not found')} />;

  const ages = sortAges(comp.ages ?? []);
  const tabs: Tab[] = ['about', 'subs', 'news'];
  const label: Record<Tab, [string, string]> = {
    about: ['عن البطولة', 'About'],
    subs: ['المنافسات', 'Competitions'],
    news: ['الأخبار', 'News'],
  };

  return (
    <div className="space-y-5">
      <Link href="/competitions" className="inline-block text-aqua text-xs font-bold">→ {tt('البطولات', 'Competitions')}</Link>

      {/* Blurb (description) is intentionally hidden in the hero — it shows in the
          About tab instead, so it doesn't crowd the hero on small screens. */}
      <CompetitionHero comp={comp} description={null} action={<FollowButton competitionId={String(comp.id)} />} />

      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t} onClick={() => selectTab(t)}
            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t ? 'border-aqua text-aqua' : 'border-transparent text-teal hover:text-text'}`}>
            {tt(label[t][0], label[t][1])}
          </button>
        ))}
      </div>

      {tab === 'about' && <CompetitionInfo comp={comp} />}

      {tab === 'subs' && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-text font-black text-base">{tt('المنافسات', 'Competitions')}</h2>
            <span className="text-hint text-xs tnum">{ages.length}</span>
          </div>
          {ages.length === 0 ? (
            <EmptyState icon="📋" text={tt('لا منافسات بعد', 'No competitions yet')} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ages.map(a => (
                <Link key={a.id} href={`/competitions?comp=${comp.id}&cage=${a.id}`}
                  className="group flex items-center gap-3 bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 hover:border-aqua/50 active:opacity-80 transition-colors">
                  <span className="w-11 h-11 rounded-xl bg-aqua/10 grid place-items-center text-lg flex-shrink-0">🏆</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-text font-bold text-sm truncate">{a.name || a.age_category}</span>
                    {a.name && a.age_category && (
                      <span className="block text-hint text-[11px] mt-0.5">{a.age_category}</span>
                    )}
                  </span>
                  <span className="text-aqua text-lg flex-shrink-0">‹</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'news' && <NewsList compId={comp.id} />}
    </div>
  );
}

export default function CompetitionPage() {
  return <Suspense fallback={<Spinner />}><CompetitionContent /></Suspense>;
}
