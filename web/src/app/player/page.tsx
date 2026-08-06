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
      <div className="sticky top-0 z-30 bg-cardBg/90 backdrop-blur border-b border-bdr flex items-center gap-3 px-4 py-3">
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
              {localize(p.position, locale) && <span className="text-[11px] text-teal bg-cardBg2 border border-bdr rounded-full px-2.5 py-0.5">{localize(p.position, locale)}</span>}
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
          <div className="relative pr-4">
            <div className="absolute top-3 bottom-3 right-[13px] w-0.5 bg-gradient-to-b from-aqua to-bdr" />
            {p.career.map((c, i) => (
              <div key={i} className="grid grid-cols-[28px_1fr] gap-3 pb-3">
                <div className="relative z-10">
                  {c.logo ? <img src={c.logo} alt="" className="w-7 h-7 object-contain rounded" /> : <div className="w-7 h-7 rounded bg-bdr grid place-items-center text-xs">🛡️</div>}
                </div>
                <div className={`border rounded-xl p-3 space-y-2 ${c.current ? 'border-gold/35 bg-gold/[0.04]' : 'border-bdr bg-cardBg'}`}>
                  {/* Club + season + season totals */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-text text-sm font-bold truncate">
                        {c.club}
                        {c.age && <span className="text-aqua font-extrabold"> · {localize(c.age, locale)}</span>}
                        {c.is_guest && <span className="text-teal text-[10px] font-bold border border-teal/40 rounded px-1.5 py-0.5 ms-1 align-middle">{isAr ? 'ضيف صاعد' : 'guest'}</span>}
                      </p>
                      <p className="text-hint text-[10px] tnum">{localize(c.season, locale)}{c.current ? ` · ${isAr ? 'حالي' : 'now'}` : c.end_date ? ` · ${isAr ? 'غادر' : 'left'} ${c.end_date}` : ''}</p>
                    </div>
                    <div className="flex gap-3">
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
                        <p className="text-gold font-extrabold text-lg tnum">{c.goals}</p>
                        <p className="text-hint text-[9px]">{isAr ? 'هدف' : 'goals'}</p>
                      </div>
                    </div>
                  </div>
                  {/* Per-competition breakdown */}
                  {c.competitions.length > 0 && (
                    <div className="border-t border-bdr/40 pt-2 space-y-1">
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
