'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchPlayer } from '@/lib/api';
import { localize, cloudinaryUrl } from '@/lib/utils';
import TabStrip from '@/components/ui/TabStrip';
import type { PlayerFull, PlayerMatch, PlayerSeasonStats } from '@/lib/types';

const Spinner = () => (
  <div className="min-h-[70vh] grid place-items-center">
    <div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" />
  </div>
);

export default function PlayerPage() {
  return <Suspense fallback={<Spinner />}><PlayerJourney /></Suspense>;
}

// One stat cell (big summary grids).
function StatCard({ v, label, color }: { v: number; label: string; color: string }) {
  return (
    <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl py-3 px-1 text-center">
      <p className={`font-extrabold text-xl tnum ${color}`}>{v}</p>
      <p className="text-hint text-[10px] mt-0.5">{label}</p>
    </div>
  );
}

// The five stats the user asked for: participation, goals, assists, yellow, red.
function StatGrid({ s, isAr }: { s: { appearances: number; goals: number; assists: number; yellow_cards: number; red_cards: number }; isAr: boolean }) {
  const cells = [
    { v: s.appearances,  l: isAr ? 'مباراة' : 'Apps',    c: 'text-text' },
    { v: s.goals,        l: isAr ? 'هدف'    : 'Goals',   c: 'text-gold' },
    { v: s.assists,      l: isAr ? 'صناعة'  : 'Assists', c: 'text-aqua' },
    { v: s.yellow_cards, l: isAr ? 'صفراء'  : 'Yellow',  c: 'text-yellow-400' },
    { v: s.red_cards,    l: isAr ? 'حمراء'  : 'Red',     c: 'text-red-500' },
  ];
  return <div className="grid grid-cols-5 gap-2">{cells.map(k => <StatCard key={k.l} v={k.v} label={k.l} color={k.c} />)}</div>;
}

// Compact non-zero contribution chips for list rows (competitions, matches).
function Contrib({ goals, assists, yellow, red, isAr }: { goals: number; assists: number; yellow: number; red: number; isAr: boolean }) {
  const chips: React.ReactNode[] = [];
  if (goals > 0)   chips.push(<span key="g" className="text-gold font-bold tnum">⚽ {goals}</span>);
  if (assists > 0) chips.push(<span key="a" className="text-aqua font-bold tnum">🅰️ {assists}</span>);
  if (yellow > 0)  chips.push(<span key="y" className="tnum">🟨 {yellow}</span>);
  if (red > 0)     chips.push(<span key="r" className="tnum">🟥 {red}</span>);
  if (!chips.length) return null;
  return <div className="flex items-center gap-2.5 text-[11px]">{chips}</div>;
}

function PlayerJourney() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const { locale } = useApp();
  const router = useRouter();
  const [p, setP] = useState<PlayerFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const isAr = locale === 'ar';

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    fetchPlayer(id).then(setP).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (!p) return <div className="p-8 text-center text-hint">{isAr ? 'اللاعب غير موجود' : 'Player not found'}</div>;

  const name = localize(p.name, locale);
  const monogram = name.split(/\s+/).map(w => w[0]).slice(0, 2).join('');
  const pos = localize(p.sub_position, locale) || localize(p.position, locale);

  // Career tab: flatten every (season, competition) the player featured in into
  // one list, newest season first (the feed already orders career that way).
  const careerRows = p.career.flatMap(c =>
    c.competitions.map(comp => ({ comp, season: c.season, club: c.club, age: c.age, current: c.current })));

  const cs: PlayerSeasonStats | undefined = p.current_season;
  const matches: PlayerMatch[] = p.matches ?? [];

  const tabs = [
    { label: isAr ? 'هذا الموسم' : 'This season', icon: '📅' },
    { label: isAr ? 'المسيرة'    : 'Career',      icon: '📊' },
    { label: isAr ? 'المباريات'  : 'Matches',     icon: '⚽' },
  ];

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
              {pos && <span className="text-[11px] text-teal bg-cardBg2 border border-bdr rounded-full px-2.5 py-0.5">{pos}</span>}
              <span className="text-[11px] text-teal bg-cardBg2 border border-bdr rounded-full px-2.5 py-0.5 tnum">{isAr ? 'مواليد' : 'Born'} {p.birth_year}</span>
            </div>
            {p.current_club && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className="text-[11px] text-gold bg-gold/10 border border-gold/30 rounded-full px-2.5 py-0.5">◆ {p.current_club}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-[calc(var(--header-h,0px)+49px)] z-20">
        <TabStrip tabs={tabs} current={tab} onChange={setTab} />
      </div>

      {/* ── This season ── */}
      {tab === 0 && (
        <div className="p-4 space-y-3">
          {cs && localize(cs.season, locale) && (
            <p className="text-hint text-xs tnum">{localize(cs.season, locale)}</p>
          )}
          {cs && (cs.appearances || cs.goals || cs.assists || cs.yellow_cards || cs.red_cards) ? (
            <StatGrid s={cs} isAr={isAr} />
          ) : (
            <p className="text-hint text-sm text-center py-10">
              {isAr ? 'لم يشارك في أي مباراة هذا الموسم' : 'No matches played this season yet'}
            </p>
          )}
        </div>
      )}

      {/* ── Career (totals + per competition) ── */}
      {tab === 1 && (
        <div className="p-4 space-y-4">
          <div>
            <h2 className="text-text font-bold text-sm mb-2">{isAr ? 'الإجمالي' : 'Career total'}</h2>
            <StatGrid s={{ appearances: p.appearances, goals: p.goals, assists: p.assists, yellow_cards: p.yellow_cards ?? 0, red_cards: p.red_cards ?? 0 }} isAr={isAr} />
          </div>

          <div>
            <h2 className="text-text font-bold text-sm mb-2">{isAr ? 'حسب البطولة' : 'By competition'}</h2>
            {careerRows.length === 0 ? (
              <p className="text-hint text-sm text-center py-6">{isAr ? 'لا توجد بيانات' : 'No data yet'}</p>
            ) : (
              <div className="space-y-2">
                {careerRows.map(({ comp, season, club, age }, i) => (
                  <div key={i} className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-text text-sm font-bold truncate">{localize(comp.name, locale)}</p>
                        <p className="text-hint text-[11px] tnum truncate">
                          {[club, localize(age, locale), localize(season, locale)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className="text-text font-bold text-sm tnum flex-shrink-0">{comp.appearances}<span className="text-hint text-[10px]"> {isAr ? 'م' : 'ap'}</span></span>
                    </div>
                    <div className="mt-2">
                      <Contrib goals={comp.goals} assists={comp.assists} yellow={comp.yellow_cards ?? 0} red={comp.red_cards ?? 0} isAr={isAr} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Matches ── */}
      {tab === 2 && (
        <div className="p-4">
          {matches.length === 0 ? (
            <p className="text-hint text-sm text-center py-10">{isAr ? 'لا توجد مباريات' : 'No matches'}</p>
          ) : (
            <div className="space-y-2">
              {matches.map(m => {
                const homeSide = m.side === 'home';
                return (
                  <button key={m.id} onClick={() => router.push(`/match?id=${m.id}`)}
                    className="w-full text-start bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl p-3 transition-colors hover:border-aqua/30">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-hint text-[10px] tnum truncate">{localize(m.competition, locale)}</span>
                      <span className="text-hint text-[10px] tnum flex-shrink-0">{m.date}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className={`flex items-center gap-1.5 flex-1 min-w-0 justify-end ${homeSide ? 'font-bold text-text' : 'text-hint'}`}>
                        <span className="truncate text-sm text-end">{localize(m.home.name, locale)}</span>
                        {m.home.logo ? <img src={cloudinaryUrl(m.home.logo, 48)} alt="" className="w-6 h-6 object-contain flex-shrink-0" /> : <span className="text-base">🛡️</span>}
                      </div>
                      <span className="text-text font-extrabold text-sm tnum flex-shrink-0 px-1">{m.home_score ?? '-'} : {m.away_score ?? '-'}</span>
                      <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${!homeSide ? 'font-bold text-text' : 'text-hint'}`}>
                        {m.away.logo ? <img src={cloudinaryUrl(m.away.logo, 48)} alt="" className="w-6 h-6 object-contain flex-shrink-0" /> : <span className="text-base">🛡️</span>}
                        <span className="truncate text-sm">{localize(m.away.name, locale)}</span>
                      </div>
                    </div>
                    {(m.goals > 0 || m.assists > 0 || m.yellow_cards > 0 || m.red_cards > 0) && (
                      <div className="mt-2 pt-2 border-t border-bdr/40 flex justify-center">
                        <Contrib goals={m.goals} assists={m.assists} yellow={m.yellow_cards} red={m.red_cards} isAr={isAr} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
