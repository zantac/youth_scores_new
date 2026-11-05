'use client';
import { Fragment, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import Link from 'next/link';
import { tMatches, type TMatch, type TAd } from '@/lib/tla3bnyApi';
import { useApp } from '@/context/AppContext';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import { formatMatchDate, shiftDay, todayStr, isKickoffTbd } from '@/lib/utils';
import Spinner from '@/components/ui/Spinner';
import MatchRow from './MatchRow';
import { AdStrip } from './AdCard';
import { EmptyState, useTT } from './kit';

/**
 * The home matches feed, built the way youthscores builds it: a window of
 * fixtures straddling today — older above, newer below — grouped by date, with
 * each day a single flat list sorted by kickoff time. The nearest date is
 * scrolled to on first paint and "older / newer" buttons widen the window.
 */

const STEP = 200; // matches pulled per direction per "load more"

// One day of the feed: a flat list of its matches, ordered by kickoff time.
interface DateGroup {
  date: string;
  matches: TMatch[];
}

// How many of a day's matches to show before the sponsor strip. The feed opens
// scrolled to a day's header, so placing the strip a few matches in keeps it on
// that first screen — the user sees it without scrolling — while still sitting
// *between* matches rather than above them.
const AD_AFTER_MATCHES = 3;

// Group into one flat list per day, each day sorted by kickoff time ascending.
// Timeless (TBD) fixtures sort last. Array.sort is stable (ES2019+), so equal
// times — and the whole TBD cluster — keep the server order (date, id).
function groupByDateSortedByTime(matches: TMatch[]): DateGroup[] {
  const dates: DateGroup[] = [];
  const dateIdx = new Map<string, DateGroup>();
  for (const m of matches) {
    if (!m.date) continue;
    let dg = dateIdx.get(m.date);
    if (!dg) { dg = { date: m.date, matches: [] }; dateIdx.set(m.date, dg); dates.push(dg); }
    dg.matches.push(m);
  }
  for (const dg of dates) {
    dg.matches.sort((a, b) => {
      const aNo = isKickoffTbd(a.time), bNo = isKickoffTbd(b.time);
      if (aNo || bNo) return aNo === bNo ? 0 : aNo ? 1 : -1;  // TBD after timed
      return (a.time ?? '') < (b.time ?? '') ? -1 : (a.time ?? '') > (b.time ?? '') ? 1 : 0;
    });
  }
  return dates;
}

// The sub-competition a match belongs to, as a stable key: its sub-competition
// (cage) id, or the mother competition for legacy matches with no cage link.
function subCompKey(m: TMatch): string {
  return m.competition_age_id != null ? `cage${m.competition_age_id}` : `comp${m.competition_id}`;
}

export default function MatchesFeed({ ads = [] }: { ads?: TAd[] }) {
  const tt = useTT();
  const { locale } = useApp();
  // A logged-in organizer/academy reads with their token, which the API serves
  // no-store — so their own edits (a match going live, a result) show the
  // moment they come back to the feed, instead of the public 30s HTTP cache.
  const { token } = useTla3bnyAuth();

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
      tMatches({ from: today, order: 'asc', limit: futureLimit }, token),
      tMatches({ to: shiftDay(today, -1), limit: pastLimit }, token),
    ])
      .then(([f, p]) => { if (alive) { setFuture(f); setPast(p); } })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [today, pastLimit, futureLimit, token]);

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
      tMatches({ from: today, order: 'asc', limit: futureLimit }, token),
      tMatches({ to: shiftDay(today, -1), limit: pastLimit }, token),
    ]).then(([f, p]) => { setFuture(f); setPast(p); }).catch(() => {});
    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', onVisible);
    const id = hasLiveToday ? setInterval(refetch, 45000) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (id) clearInterval(id);
    };
  }, [today, futureLimit, pastLimit, hasLiveToday, token]);

  // Ascending: oldest → today → newest.
  const ascending = useMemo(() => [...past].reverse().concat(future), [past, future]);
  const dateGroups = useMemo(() => groupByDateSortedByTime(ascending), [ascending]);

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
        const dayCount = dg.matches.length;
        // After how many of this day's matches the strip appears: a few in, or
        // the middle of a short day, but never after the last match.
        const adAfter = ads.length ? Math.min(AD_AFTER_MATCHES, Math.ceil(dayCount / 2)) : -1;
        return (
          <div key={dg.date} ref={dg.date === anchorDate ? anchorRef : undefined} className="space-y-2 scroll-mt-20">
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-aqua">📅</span>
              <h3 className={`font-bold text-sm ${dg.date === today ? 'text-aqua' : 'text-text'}`}>
                {formatMatchDate(dg.date, locale)}
              </h3>
              <span className="flex-1 h-px bg-bdr" />
            </div>

            {/* Flat per-day list ordered by kickoff time. A sub-competition
                header (tap → its matches tab) and a round sub-header are
                re-printed only when they change from the preceding match, so a
                run of the same sub-competition isn't repeated needlessly. */}
            {dg.matches.map((m, i) => {
              const prev = i > 0 ? dg.matches[i - 1] : null;
              const compChanged  = !prev || subCompKey(prev) !== subCompKey(m);
              const roundChanged = compChanged || (prev!.round ?? '') !== (m.round ?? '');
              // Sub-competition's own name (falling back to the age so two
              // unnamed brackets stay distinguishable).
              const subName = m.sub_competition_name || m.age_category;
              const href = `/competitions?comp=${m.competition_id}${m.competition_age_id ? `&cage=${m.competition_age_id}` : ''}&tab=matches`;
              return (
                <Fragment key={m.id}>
                  {compChanged && (
                    <Link href={href}
                      className="w-full flex items-center gap-2 bg-cardBg border border-aqua/30 rounded-xl px-3 py-2.5 active:bg-aqua/10 transition-colors">
                      <span className="text-base">🏆</span>
                      <span className="flex-1 min-w-0 leading-tight">
                        <span className="block text-aqua font-bold text-xs truncate">{m.competition_name}</span>
                        {subName && <span className="block text-teal text-[11px] truncate">{subName}</span>}
                      </span>
                      <span className="text-aqua text-sm shrink-0">{locale === 'ar' ? '‹' : '›'}</span>
                    </Link>
                  )}
                  {roundChanged && m.round && (
                    <div className="flex items-center gap-2 px-0.5">
                      <span className="text-teal text-[11px] font-bold">{m.round}</span>
                      <span className="flex-1 h-px bg-bdr/60" />
                    </div>
                  )}
                  <MatchRow m={m} hideRound />
                  {i + 1 === adAfter && <AdStrip ads={ads} className="py-1" />}
                </Fragment>
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
