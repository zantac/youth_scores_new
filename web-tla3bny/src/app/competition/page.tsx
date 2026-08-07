'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tCompetition, type TCompetition } from '@/lib/tla3bnyApi';
import { sortAges, subCompLabel } from '@/lib/utils';
import Spinner from '@/components/ui/Spinner';
import CompetitionInfo from '@/components/tla3bny/CompetitionInfo';
import CompetitionHero from '@/components/tla3bny/CompetitionHero';
import { EmptyState, useTT } from '@/components/tla3bny/kit';

// The public competition page: who runs it and its معلومات, then its
// المنافسات (sub-competitions) — each opening its own standings/matches view.
// No media tabs (tla3bny stores none) and news lives on its own page, so the
// only listing here is the sub-competitions.
function CompetitionContent() {
  const tt = useTT();
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const [comp, setComp] = useState<TCompetition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    tCompetition(id).then(setComp).catch(() => setComp(null)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (!comp) return <EmptyState icon="🏆" text={tt('البطولة غير موجودة', 'Competition not found')} />;

  const ages = sortAges(comp.ages ?? []);

  return (
    <div className="space-y-5">
      <Link href="/competitions" className="inline-block text-aqua text-xs font-bold">→ {tt('البطولات', 'Competitions')}</Link>

      <CompetitionHero comp={comp} />

      {/* المنافسات — the sub-competitions, each links to its own view */}
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
                  <span className="block text-text font-bold text-sm truncate">{subCompLabel(a)}</span>
                  <span className="block text-hint text-[11px] mt-0.5">{tt('الترتيب والمباريات', 'Standings & matches')}</span>
                </span>
                <span className="text-aqua text-lg flex-shrink-0">‹</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Contact / facts / registration — About lives in the hero above. */}
      <CompetitionInfo comp={comp} hideAbout />
    </div>
  );
}

export default function CompetitionPage() {
  return <Suspense fallback={<Spinner />}><CompetitionContent /></Suspense>;
}
