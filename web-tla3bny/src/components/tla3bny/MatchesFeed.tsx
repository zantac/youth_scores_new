'use client';
import { Fragment, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import Link from 'next/link';
import { tMatches, type TMatch, type TAd } from '@/lib/tla3bnyApi';
import { useApp } from '@/context/AppContext';
import { formatMatchDate, shiftDay, todayStr } from '@/lib/utils';
import Spinner from '@/components/ui/Spinner';
import MatchRow from './MatchRow';
import { AdStrip } from './AdCard';
import { EmptyState, useTT } from './kit';

/**
 * The home matches feed, built the way youthscores builds it: a window of
 * fixtures straddling today — older above, newer below — grouped by date and
 * then by competition, with the nearest date scrolled to on first paint and
 * "older / newer" buttons to widen the window.
 */

const STEP = 200; // matches pulled per direction per "load more"

// One row of matches in the feed: a single sub-competition on a given date.
// Carries the mother competition name, the sub-competition name and the round so
// the header can show the full context, plus the sub-competition id (cage) so the
// header links straight to that sub-competition's matches tab. One group per
// (sub-competition, round) so matches are grouped by round within a day.
interface FeedGroup {
  key: string;
  cageId: number | null;
  competitionId: number;
  competitionName: string | null;
  subName: string | null;
  ageCategory: string | null;
  round: string | null;
  matches: TMatch[];
}
interface DateGroup {
  date: string;
  groups: FeedGroup[];
}

// How many of a day's matches to show before the sponsor strip. The feed opens
// scrolled to a day's header, so placing the strip a few matches in keeps it on
// that first screen — the user sees it without scrolling — while still sitting
// *between* matches rather than above them.
const AD_AFTER_MATCHES = 3;

function groupByDateThenSubCompetition(matches: TMatch[]): DateGroup[] {
  const dates: DateGroup[] = [];
  const dateIdx = new Map<string, DateGroup>();
  const groupIdx = new Map<string, FeedGroup>();
  for (const m of matches) {
    if (!m.date) continue;
    let dg = dateIdx.get(m.date);
    if (!dg) { dg = { date: m.date, groups: [] }; dateIdx.set(m.date, dg); dates.push(dg); }
    // One group per (sub-competition, round) so the feed groups a day's matches
    // by round. Legacy matches with no sub-competition link fall back to their
    // mother competition.
    const key = `${m.date}:${m.competition_age_id ?? `c${m.competition_id}`}:${m.round ?? ''}`;
    let g = groupIdx.get(key);
    if (!g) {
      g = {
        key,
        cageId: m.competition_age_id ?? null,
        competitionId: m.competition_id,
        competitionName: m.competition_name,
        subName: m.sub_competition_name,
        ageCategory: m.age_category,
        round: m.round ?? null,
        matches: [],
      };
      groupIdx.set(key, g);
      dg.groups.push(g);
    }
    g.matches.push(m);
  }
  return dates;
}

export default function MatchesFeed({ ads = [] }: { ads?: TAd[] }) {
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

  // Live auto-refresh: while a today fixture is still unfinished, quietly
  // re-fetch every 45s (no spinner, no scroll jump) so scores stay current
  // without a manual reload; also refresh whenever the tab regains focus.
  // Mirrors the youthscores home feed.
  const hasLiveToday = useMemo(
    () => !!today && future.some(m => m.date === today && m.status !== 'completed' && m.status !== 'finished'),
    [future, today],
  );
  useEffect(() => {
    if (!today) return;
    const refetch = () => Promise.all([
      tMatches({ from: today, order: 'asc', limit: futureLimit }),
      tMatches({ to: shiftDay(today, -1), limit: pastLimit }),
    ]).then(([f, p]) => { setFuture(f); setPast(p); }).catch(() => {});
    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', onVisible);
    const id = hasLiveToday ? setInterval(refetch, 45000) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (id) clearInterval(id);
    };
  }, [today, futureLimit, pastLimit, hasLiveToday]);

  // Ascending: oldest → today → newest.
  const ascending = useMemo(() => [...past].reverse().concat(future), [past, future]);
  const dateGroups = useMemo(() => groupByDateThenSubCompetition(ascending), [ascending]);

  const anchorDate = future.length ? future[0].date : (past.length ? past[0].date : null);

  // Land on the date nearest today after the first load, and keep it centred for
  // a brief settle window: content above the feed renders late (the news section
  // and its images, team logos, ad strips), each shift nudging the anchor — a
  // single scroll would leave the view parked on older matches. Stop the instant
  // the user takes over, and never re-centre on later refreshes.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const scrollLocked = useRef(false);
  useEffect(() => {
    if (scrollLocked.current || loading || !anchorDate) return;
    const lock = () => { scrollLocked.current = true; };
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('wheel', lock, opts);
    window.addEventListener('touchmove', lock, opts);
    window.addEventListener('keydown', lock);
    let frame = 0;
    let raf = 0;
    const tick = () => {
      if (scrollLocked.current) return;
      anchorRef.current?.scrollIntoView({ block: 'start' });
      // ~0.75s at 60fps — long enough for the news block and images to settle.
      if (++frame < 45) raf = requestAnimationFrame(tick);
      else scrollLocked.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('wheel', lock, opts);
      window.removeEventListener('touchmove', lock, opts);
      window.removeEventListener('keydown', lock);
    };
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
      {hasMoreOlder && (
        <button onClick={loadOlder} disabled={loading}
          className="w-full bg-cardBg border border-aqua/30 text-aqua font-bold text-sm py-3 rounded-xl active:bg-aqua/10 disabled:opacity-50">
          {loading ? tt('جاري التحميل...', 'Loading...') : tt('↑ مباريات أقدم', '↑ Older matches')}
        </button>
      )}

      {dateGroups.map(dg => {
        const dayCount = dg.groups.reduce((s, g) => s + g.matches.length, 0);
        // After how many of this day's matches the strip appears: a few in, or
        // the middle of a short day, but never after the last match.
        const adAfter = ads.length ? Math.min(AD_AFTER_MATCHES, Math.ceil(dayCount / 2)) : -1;
        let seen = 0;
        return (
          <div key={dg.date} ref={dg.date === anchorDate ? anchorRef : undefined} className="space-y-3 scroll-mt-20">
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-aqua">📅</span>
              <h3 className={`font-bold text-sm ${dg.date === today ? 'text-aqua' : 'text-text'}`}>
                {formatMatchDate(dg.date, locale)}
              </h3>
              <span className="flex-1 h-px bg-bdr" />
            </div>
            {dg.groups.map(g => {
              // Second line: the sub-competition's own name (falling back to the
              // age so two unnamed brackets stay distinguishable), then the round.
              const subtitle = [g.subName || g.ageCategory, g.round].filter(Boolean).join(' · ');
              const href = `/competitions?comp=${g.competitionId}${g.cageId ? `&cage=${g.cageId}` : ''}&tab=matches`;
              return (
                <div key={g.key} className="space-y-2">
                  <Link href={href}
                    className="w-full flex items-center gap-2 bg-cardBg border border-aqua/30 rounded-xl px-3 py-2.5 active:bg-aqua/10 transition-colors">
                    <span className="text-base">🏆</span>
                    <span className="flex-1 min-w-0 leading-tight">
                      <span className="block text-aqua font-bold text-xs truncate">{g.competitionName}</span>
                      {subtitle && <span className="block text-teal text-[11px] truncate">{subtitle}</span>}
                    </span>
                    <span className="text-aqua text-sm shrink-0">{locale === 'ar' ? '‹' : '›'}</span>
                  </Link>
                  {g.matches.map(m => {
                    seen += 1;
                    const showAd = seen === adAfter;
                    return (
                      <Fragment key={m.id}>
                        <MatchRow m={m} hideRound />
                        {showAd && <AdStrip ads={ads} className="py-1" />}
                      </Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}

      {hasMoreNewer && (
        <button onClick={() => setFutureLimit(l => l + STEP)} disabled={loading}
          className="w-full bg-cardBg border border-aqua/30 text-aqua font-bold text-sm py-3 rounded-xl active:bg-aqua/10 disabled:opacity-50">
          {loading ? tt('جاري التحميل...', 'Loading...') : tt('↓ مباريات أحدث', '↓ Newer matches')}
        </button>
      )}
    </div>
  );
}
