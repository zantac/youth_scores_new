'use client';
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import Link from 'next/link';
import { tMatches, type TMatch } from '@/lib/tla3bnyApi';
import { useApp } from '@/context/AppContext';
import { formatMatchDate, shiftDay, todayStr } from '@/lib/utils';
import Spinner from '@/components/ui/Spinner';
import MatchRow from './MatchRow';
import { EmptyState, LogoAvatar, useTT, useName } from './kit';

/**
 * The home matches feed, built the way youthscores builds it: a window of
 * fixtures straddling today — older above, newer below — grouped by date and
 * then by competition, with the nearest date scrolled to on first paint and
 * "older / newer" buttons to widen the window.
 *
 * A featured match sits on top: whatever is live, else the next fixture, else
 * the most recent result.
 */

const STEP = 200; // matches pulled per direction per "load more"

interface DateGroup {
  date: string;
  competitions: { id: number; name: string | null; matches: TMatch[] }[];
}

function groupByDateThenCompetition(matches: TMatch[]): DateGroup[] {
  const dates: DateGroup[] = [];
  const dateIdx = new Map<string, DateGroup>();
  const compIdx = new Map<string, DateGroup['competitions'][number]>();
  for (const m of matches) {
    if (!m.date) continue;
    let dg = dateIdx.get(m.date);
    if (!dg) { dg = { date: m.date, competitions: [] }; dateIdx.set(m.date, dg); dates.push(dg); }
    const key = `${m.date}:${m.competition_id}`;
    let cg = compIdx.get(key);
    if (!cg) {
      cg = { id: m.competition_id, name: m.competition_name, matches: [] };
      compIdx.set(key, cg);
      dg.competitions.push(cg);
    }
    cg.matches.push(m);
  }
  return dates;
}

function HeroCard({ m }: { m: TMatch }) {
  const tt = useTT();
  const nm = useName();
  const { locale } = useApp();
  const isLive = m.status === 'live';
  const isFinished = m.status === 'completed' || m.status === 'finished';
  return (
    <Link href={`/match?id=${m.id}`}
      className="relative block w-full overflow-hidden rounded-2xl border border-aqua/25 bg-gradient-to-br from-cardBg to-cardBg2 p-4 hover:border-aqua/50 transition-colors">
      <div className="absolute inset-0 opacity-60 bg-[radial-gradient(70%_100%_at_100%_0,rgb(var(--gold-rgb)/0.12),transparent_55%),radial-gradient(70%_100%_at_0_0,rgb(var(--accent-rgb)/0.14),transparent_55%)]" />
      <div className="relative flex items-center gap-2 mb-4">
        {isLive
          ? <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-loss px-2.5 py-0.5 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />{tt('مباشرة', 'LIVE')}
            </span>
          : <span className="text-[11px] text-gold font-bold bg-gold/10 border border-gold/25 px-2.5 py-0.5 rounded-md">
              {isFinished ? tt('أبرز مباراة', 'Featured') : tt('قادم', 'Upcoming')}
            </span>}
        <span className="text-hint text-[11px] truncate flex-1">
          {[m.competition_name, m.age_category].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="flex flex-col items-center gap-2">
          <LogoAvatar src={m.home_logo} name={nm(m.home_team_name, m.home_team_name_en)} size={56} />
          <span className="text-sm font-bold leading-tight">{nm(m.home_team_name, m.home_team_name_en)}</span>
        </div>
        <div className="flex flex-col items-center min-w-[76px]">
          {(isFinished || isLive) && m.home_score != null
            ? <span className="text-3xl font-extrabold tnum">{m.home_score} - {m.away_score}</span>
            : <span className="text-2xl font-extrabold text-aqua tnum">{m.time || '--:--'}</span>}
          <span className="text-hint text-[10px] mt-1">{formatMatchDate(m.date ?? '', locale)}</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <LogoAvatar src={m.away_logo} name={nm(m.away_team_name, m.away_team_name_en)} size={56} />
          <span className="text-sm font-bold leading-tight">{nm(m.away_team_name, m.away_team_name_en)}</span>
        </div>
      </div>
    </Link>
  );
}

export default function MatchesFeed() {
  const tt = useTT();
  const { locale } = useApp();

  // Resolved on the client: a static export has no idea what "today" is at
  // build time.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => { setToday(todayStr()); }, []);

  const [past, setPast] = useState<TMatch[]>([]);      // before today, newest first
  const [future, setFuture] = useState<TMatch[]>([]);  // today onwards, soonest first
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pastLimit, setPastLimit] = useState(STEP);
  const [futureLimit, setFutureLimit] = useState(STEP);

  useEffect(() => {
    if (!today) return;
    let alive = true;
    setLoading(true); setError(false);
    Promise.all([
      tMatches({ from: today, order: 'asc', limit: futureLimit }),
      tMatches({ to: shiftDay(today, -1), limit: pastLimit }),
    ])
      .then(([f, p]) => { if (alive) { setFuture(f); setPast(p); } })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [today, pastLimit, futureLimit]);

  // Ascending: oldest → today → newest.
  const ascending = useMemo(() => [...past].reverse().concat(future), [past, future]);
  const dateGroups = useMemo(() => groupByDateThenCompetition(ascending), [ascending]);

  const anchorDate = future.length ? future[0].date : (past.length ? past[0].date : null);
  const featured = useMemo(
    () => [...future, ...past].find(m => m.status === 'live') || future[0] || past[0] || null,
    [future, past],
  );

  // Land on the date nearest today once, after the first load — later loads
  // must not yank the view.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const didScroll = useRef(false);
  useEffect(() => {
    if (didScroll.current || loading || !anchorDate || !anchorRef.current) return;
    didScroll.current = true;
    const el = anchorRef.current;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, [loading, anchorDate]);

  // Prepending older matches shifts everything down; keep the viewport steady.
  const pendingOlder = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingOlder.current == null) return;
    window.scrollBy(0, document.body.scrollHeight - pendingOlder.current);
    pendingOlder.current = null;
  }, [past]);

  const hasMoreOlder = past.length >= pastLimit;
  const hasMoreNewer = future.length >= futureLimit;
  const loadOlder = () => { pendingOlder.current = document.body.scrollHeight; setPastLimit(l => l + STEP); };

  if (loading && ascending.length === 0) return <Spinner />;
  if (error) {
    return (
      <div className="bg-cardBg border border-bdr rounded-2xl p-6 text-center space-y-3">
        <p className="text-loss text-sm">{tt('تعذر تحميل المباريات', 'Could not load matches')}</p>
        <button onClick={() => setFutureLimit(l => l + 1)}
          className="bg-aqua text-on-accent font-bold px-6 py-2 rounded-xl text-sm">
          {tt('إعادة المحاولة', 'Retry')}
        </button>
      </div>
    );
  }
  if (dateGroups.length === 0) return <EmptyState icon="📅" text={tt('لا مباريات', 'No matches')} />;

  return (
    <div className="space-y-5">
      {featured && <HeroCard m={featured} />}

      {hasMoreOlder && (
        <button onClick={loadOlder} disabled={loading}
          className="w-full bg-cardBg border border-aqua/30 text-aqua font-bold text-sm py-3 rounded-xl active:bg-aqua/10 disabled:opacity-50">
          {loading ? tt('جاري التحميل...', 'Loading...') : tt('↑ مباريات أقدم', '↑ Older matches')}
        </button>
      )}

      {dateGroups.map(dg => (
        <div key={dg.date} ref={dg.date === anchorDate ? anchorRef : undefined} className="space-y-3 scroll-mt-20">
          <div className="flex items-center gap-2 py-1.5">
            <span className="text-aqua">📅</span>
            <h3 className={`font-bold text-sm ${dg.date === today ? 'text-aqua' : 'text-text'}`}>
              {formatMatchDate(dg.date, locale)}
            </h3>
            <span className="flex-1 h-px bg-bdr" />
          </div>
          {dg.competitions.map(cg => (
            <div key={cg.id} className="space-y-2">
              <Link href={`/competitions?comp=${cg.id}${cg.matches[0]?.competition_age_id ? `&cage=${cg.matches[0].competition_age_id}` : ''}`}
                className="w-full flex items-center gap-2 bg-cardBg border border-aqua/30 rounded-xl px-3 py-2.5 active:bg-aqua/10 transition-colors">
                <span className="text-base">🏆</span>
                <span className="flex-1 text-aqua font-bold text-xs leading-tight">{cg.name}</span>
                <span className="text-aqua text-sm">{locale === 'ar' ? '‹' : '›'}</span>
              </Link>
              {cg.matches.map(m => <MatchRow key={m.id} m={m} />)}
            </div>
          ))}
        </div>
      ))}

      {hasMoreNewer && (
        <button onClick={() => setFutureLimit(l => l + STEP)} disabled={loading}
          className="w-full bg-cardBg border border-aqua/30 text-aqua font-bold text-sm py-3 rounded-xl active:bg-aqua/10 disabled:opacity-50">
          {loading ? tt('جاري التحميل...', 'Loading...') : tt('↓ مباريات أحدث', '↓ Newer matches')}
        </button>
      )}
    </div>
  );
}
