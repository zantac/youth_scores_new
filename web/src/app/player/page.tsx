'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchPlayer } from '@/lib/api';
import { localize } from '@/lib/utils';
import type { PlayerFull } from '@/lib/types';

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] grid place-items-center"><div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" /></div>}>
      <PlayerJourney />
    </Suspense>
  );
}

function PlayerJourney() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const { locale } = useApp();
  const router = useRouter();
  const [p, setP] = useState<PlayerFull | null>(null);
  const [loading, setLoading] = useState(true);
  const isAr = locale === 'ar';

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    fetchPlayer(id).then(setP).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-[70vh] grid place-items-center"><div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" /></div>;
  if (!p) return <div className="p-8 text-center text-hint">{isAr ? 'اللاعب غير موجود' : 'Player not found'}</div>;

  const name = localize(p.name, locale);
  const monogram = name.split(/\s+/).map(w => w[0]).slice(0, 2).join('');
  const maxGoals = Math.max(1, ...p.career.map(c => c.goals));

  return (
    <div className="min-h-screen bg-darkBg pb-24">
      <div className="sticky top-[var(--header-h,0px)] z-30 bg-cardBg/90 backdrop-blur border-b border-bdr flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-aqua text-xl font-bold">‹</button>
        <span className="flex-1 text-aqua font-bold text-sm truncate">{name}</span>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-b from-cardBg to-cardBg2 border-b border-bdr p-5">
        <div className="absolute -left-10 -top-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,rgb(var(--gold-rgb)/0.16),transparent_65%)]" />
        <div className="relative flex items-center gap-4">
          {p.photo
            ? <img src={p.photo} alt={name} className="w-20 h-20 rounded-2xl object-cover" />
            : <div className="w-20 h-20 rounded-2xl grid place-items-center text-2xl font-black text-on-accent bg-gradient-to-br from-aqua to-aqua/70 shadow-[0_10px_26px_-8px_rgb(var(--accent-rgb))]">{monogram}</div>}
          <div>
            <h1 className="text-xl font-extrabold">{name}</h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(() => {
                // The specific sub-position takes the profile spot when set;
                // otherwise the main position is shown.
                const pos = localize(p.sub_position, locale) || localize(p.position, locale);
                return pos ? <span className="text-[11px] text-teal bg-cardBg2 border border-bdr rounded-full px-2.5 py-0.5">{pos}</span> : null;
              })()}
              <span className="text-[11px] text-teal bg-cardBg2 border border-bdr rounded-full px-2.5 py-0.5 tnum">{isAr ? 'مواليد' : 'Born'} {p.birth_year}</span>
              {p.current_club && <span className="text-[11px] text-gold bg-gold/10 border border-gold/30 rounded-full px-2.5 py-0.5">◆ {p.current_club}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 p-4">
        {[
          { v: p.goals, l: isAr ? 'هدف' : 'Goals', c: 'text-gold' },
          { v: p.assists, l: isAr ? 'صناعة' : 'Assists', c: 'text-aqua' },
          { v: p.appearances, l: isAr ? 'مباراة' : 'Apps', c: 'text-text' },
        ].map(k => (
          <div key={k.l} className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 text-center">
            <p className={`font-extrabold text-2xl tnum ${k.c}`}>{k.v}</p>
            <p className="text-hint text-[11px] mt-0.5">{k.l}</p>
          </div>
        ))}
      </div>

      {/* Career */}
      <div className="px-4">
        <h2 className="text-text font-bold text-sm mb-3">{isAr ? 'المسيرة' : 'Career'}</h2>
        {p.career.length === 0 ? (
          <p className="text-hint text-sm text-center py-4">{isAr ? 'لا توجد بيانات مسيرة' : 'No career data'}</p>
        ) : (
          <div className="space-y-3">
            {p.career.map((c, i) => (
              <div key={i}
                className={`relative flex items-stretch overflow-hidden rounded-2xl border bg-gradient-to-b from-cardBg to-cardBg2 ${c.current ? 'border-gold/40' : 'border-bdr'}`}>
                <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-[radial-gradient(circle,rgb(var(--gold-rgb)/0.12),transparent_65%)]" />
                {/* Club logo — big, spanning the full card height */}
                <div className="relative w-24 flex-shrink-0 bg-darkBg grid place-items-center p-2.5">
                  {c.logo
                    ? <img src={c.logo} alt="" className="w-full h-full object-contain" />
                    : <span className="text-3xl">🛡️</span>}
                </div>
                <div className="relative flex-1 min-w-0 p-3">
                  {/* Club + tags */}
                  <div className="flex items-center gap-2">
                    <p className="text-text text-base font-extrabold truncate flex-1">{c.club}</p>
                    {c.is_guest && <span className="text-teal text-[9px] font-bold border border-teal/40 rounded px-1.5 py-0.5 flex-shrink-0">{isAr ? 'ضيف صاعد' : 'guest'}</span>}
                    {c.current && <span className="text-[9px] font-bold text-gold bg-gold/10 border border-gold/30 rounded px-1.5 py-0.5 flex-shrink-0">{isAr ? 'حالي' : 'now'}</span>}
                  </div>
                  {localize(c.age, locale) && <p className="text-aqua text-xs font-bold mt-1 truncate">{localize(c.age, locale)}</p>}
                  {localize(c.season, locale) && <p className="text-hint text-[11px] mt-0.5 tnum truncate">{localize(c.season, locale)}</p>}
                  {!c.current && c.end_date && <p className="text-hint text-[11px] mt-0.5 tnum truncate">{isAr ? 'غادر' : 'left'} {c.end_date}</p>}
                  {/* Season totals */}
                  <div className="flex gap-4 mt-2">
                    {c.appearances > 0 && (
                      <div className="text-center">
                        <p className="text-text font-bold text-sm tnum">{c.appearances}</p>
                        <p className="text-hint text-[9px]">{isAr ? 'مباراة' : 'apps'}</p>
                      </div>
                    )}
                    {c.assists > 0 && (
                      <div className="text-center">
                        <p className="text-aqua font-bold text-sm tnum">{c.assists}</p>
                        <p className="text-hint text-[9px]">{isAr ? 'صناعة' : 'ast'}</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-gold font-extrabold text-lg tnum leading-none">{c.goals}</p>
                      <p className="text-hint text-[9px] mt-0.5">{isAr ? 'هدف' : 'goals'}</p>
                    </div>
                  </div>
                  {/* Per-competition breakdown */}
                  {c.competitions.length > 0 && (
                    <div className="border-t border-bdr/40 mt-2 pt-2 space-y-1">
                      {c.competitions.map((comp, ci) => (
                        <div key={ci} className="flex items-center gap-2 text-[11px]">
                          <span className="flex-1 text-hint truncate">{localize(comp.name, locale)}</span>
                          {comp.appearances > 0 && <span className="text-hint tnum">{comp.appearances}{isAr ? ' م' : ' ap'}</span>}
                          {comp.assists > 0   && <span className="text-aqua tnum">{comp.assists}{isAr ? ' ص' : ' a'}</span>}
                          <span className="text-gold font-bold tnum w-6 text-end">{comp.goals}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Goals per season bar chart */}
      {p.career.length > 0 && (
        <div className="px-4 pt-4">
          <h2 className="text-text font-bold text-sm mb-3">{isAr ? 'الأهداف لكل موسم' : 'Goals per season'}</h2>
          <div className="space-y-2">
            {p.career.map((c, i) => (
              <div key={i} className="grid grid-cols-[92px_1fr_28px] items-center gap-2.5">
                <span className="text-hint text-[11px] tnum truncate">{[localize(c.season, locale), c.age && localize(c.age, locale)].filter(Boolean).join(' · ')}</span>
                <div className="h-2.5 rounded-full bg-cardBg2 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-l from-gold to-gold/70" style={{ width: `${(c.goals / maxGoals) * 100}%` }} />
                </div>
                <span className="text-text font-bold text-sm tnum text-start">{c.goals}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
