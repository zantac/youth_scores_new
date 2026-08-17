'use client';
import { useState, useEffect, useMemo, useRef, useLayoutEffect, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAllMatches } from '@/lib/api';
import { formatMatchDate, todayStr, localize } from '@/lib/utils';
import MatchCard from '@/components/competition/MatchCard';
import FeedAdCard from '@/components/ui/FeedAdCard';
import { useApp } from '@/context/AppContext';
import type { HomeMatch, Match, Team, AdItem } from '@/lib/types';

// Adapt the compact home match into the shapes MatchCard already renders.
function toMatch(m: HomeMatch): Match {
  return {
    id: m.id, group: m.group, week: '', date: m.date, time: m.time,
    homeTeamId: m.homeTeam?.id ?? '', awayTeamId: m.awayTeam?.id ?? '',
    venue: m.venue, status: m.status, note: m.note,
    homeScore: m.homeScore, awayScore: m.awayScore,
    homePenalty: m.homePenalty, awayPenalty: m.awayPenalty,
    homeScorers: [], awayScorers: [], homeYc: [], awayYc: [], homeRc: [], awayRc: [],
    homeSub: [], awaySub: [], subs: [], homeSquad: [], awaySquad: [], stage: '',
  };
}
function toTeam(t?: HomeMatch['homeTeam']): Team | undefined {
  return t ? { id: t.id, name: t.name, logo: t.logo, pointDeduction: 0 } : undefined;
}

interface DateGroup {
  date: string;
  competitions: { competition: HomeMatch['competition']; matches: HomeMatch[] }[];
}

function groupByDateThenCompetition(matches: HomeMatch[]): DateGroup[] {
  const dates: DateGroup[] = [];
  const dateIdx = new Map<string, DateGroup>();
  const compIdx = new Map<string, { competition: HomeMatch['competition']; matches: HomeMatch[] }>();
  for (const m of matches) {
    let dg = dateIdx.get(m.date);
    if (!dg) { dg = { date: m.date, competitions: [] }; dateIdx.set(m.date, dg); dates.push(dg); }
    const key = `${m.date}:${m.competition.id}`;
    let cg = compIdx.get(key);
    if (!cg) { cg = { competition: m.competition, matches: [] }; compIdx.set(key, cg); dg.competitions.push(cg); }
    cg.matches.push(m);
  }
  return dates;
}

function shiftDay(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STEP = 300; // matches pulled per direction per "load more"

export default function MatchesFeed({ locale }: { locale: string }) {
  const router = useRouter();
  const isAr = locale === 'ar';
  const { config } = useApp();

  // One native sponsored card, picked once per config load by weighted random
  // from the feed-eligible ads. Shown right below the anchor date's block.
  const feedAd = useMemo<AdItem | null>(() => {
    const ads = config?.ads ?? [];
    const now = new Date();
    const pool = ads.filter(a => {
      const p = a.placement ?? 'interstitial';
      return (!a.expire_date || new Date(a.expire_date) > now) && (p === 'feed' || p === 'both');
    });
    if (!pool.length) return null;
    const w = (a: AdItem) => Math.max(1, a.weight ?? 1);
    let r = Math.random() * pool.reduce((s, a) => s + w(a), 0);
    return pool.find(a => (r -= w(a)) < 0) ?? pool[pool.length - 1];
  }, [config]);

  const [today, setToday] = useState<string | null>(null);
  useEffect(() => { setToday(todayStr()); }, []);

  // Ascending window straddling the nearest date to today: older above, newer below.
  const [past, setPast]       = useState<HomeMatch[]>([]);   // strictly before today, desc from server
  const [future, setFuture]   = useState<HomeMatch[]>([]);   // today and later, asc from server
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [pastLimit, setPastLimit]     = useState(STEP);
  const [futureLimit, setFutureLimit] = useState(STEP);

  useEffect(() => {
    if (!today) return;
    let alive = true;
    setLoading(true); setError(false);
    Promise.all([
      fetchAllMatches({ from: today, order: 'asc', limit: futureLimit }),                 // today + upcoming
      fetchAllMatches({ to: shiftDay(today, -1), order: 'desc', limit: pastLimit }),       // older
    ])
      .then(([f, p]) => { if (alive) { setFuture(f); setPast(p); } })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [today, pastLimit, futureLimit]);

  // Ascending: oldest → nearest(today) → newest.
  const ascending = useMemo(() => [...past].reverse().concat(future), [past, future]);
  const dateGroups = useMemo(() => groupByDateThenCompetition(ascending), [ascending]);

  // The date to land on: today/nearest-upcoming if any, otherwise nearest past.
  const anchorDate = future.length ? future[0].date : (past.length ? past[0].date : null);

  // Native card slots: the ids of matches to render the sponsored card after.
  // Counted from the anchor date (where the feed lands) downward, so cards sit
  // in the natural forward-scroll path rather than up among older matches. The
  // first card lands after match N (feed_position); if feed_repeat is set, it
  // repeats every R matches after that. Falls back to the last match when there
  // are fewer than N matches from the anchor.
  const adAfterMatchIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    if (!feedAd || !anchorDate) return ids;
    const n = Math.max(1, feedAd.feed_position ?? 3);
    const r = feedAd.feed_repeat && feedAd.feed_repeat > 0 ? feedAd.feed_repeat : 0;
    let count = 0;
    let lastId: string | null = null;
    for (const dg of dateGroups) {
      if (dg.date < anchorDate) continue;   // skip older matches above the anchor
      for (const cg of dg.competitions) {
        for (const m of cg.matches) {
          lastId = m.id;
          count++;
          if (count === n || (r && count > n && (count - n) % r === 0)) ids.add(m.id);
        }
      }
    }
    if (ids.size === 0 && lastId) ids.add(lastId);  // fewer than N: still show once
    return ids;
  }, [feedAd, anchorDate, dateGroups]);

  const anchorRef = useRef<HTMLDivElement | null>(null);

  // Land on the date nearest to today once, after the first load. `scroll-mt`
  // on the anchor keeps it clear of the pinned controls + CTA bars. Only the
  // first render scrolls, so loading older/newer matches never yanks the view.
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
    const delta = document.body.scrollHeight - pendingOlder.current;
    window.scrollBy(0, delta);
    pendingOlder.current = null;
  }, [past]);

  const openCompetition = (comp: HomeMatch['competition']) => {
    router.push(`/competition?id=${comp.id}`);
  };

  const loadOlder = () => { pendingOlder.current = document.body.scrollHeight; setPastLimit(l => l + STEP); };
  const loadNewer = () => setFutureLimit(l => l + STEP);

  const hasMoreOlder = past.length >= pastLimit;
  const hasMoreNewer = future.length >= futureLimit;

  if (loading && ascending.length === 0) {
    return (
      <div className="bg-cardBg border border-bdr rounded-2xl p-6 text-center">
        <div className="w-6 h-6 border-2 border-bdr border-t-aqua rounded-full animate-spin mx-auto mb-2" />
        <p className="text-hint text-sm">{isAr ? 'جاري تحميل المباريات...' : 'Loading matches...'}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-cardBg border border-bdr rounded-2xl p-6 text-center space-y-3">
        <p className="text-red-400 text-sm">{isAr ? 'تعذر تحميل المباريات' : 'Could not load matches'}</p>
        <button onClick={() => { setPastLimit(l => l); setFutureLimit(l => l); }} className="bg-aqua text-on-accent font-bold px-6 py-2 rounded-xl text-sm">
          {isAr ? 'إعادة المحاولة' : 'Retry'}
        </button>
      </div>
    );
  }
  if (dateGroups.length === 0) {
    return (
      <div className="bg-cardBg border border-bdr rounded-2xl p-6 text-center">
        <p className="text-teal text-sm">{isAr ? 'لا توجد مباريات' : 'No matches'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {hasMoreOlder && (
        <button onClick={loadOlder} disabled={loading}
          className="w-full bg-cardBg border border-aqua/30 text-aqua font-bold text-sm py-3 rounded-xl active:bg-aqua/10 disabled:opacity-50">
          {loading ? (isAr ? 'جاري التحميل...' : 'Loading...') : (isAr ? '↑ مباريات أقدم' : '↑ Older matches')}
        </button>
      )}

      {dateGroups.map(dg => {
        const isAnchor = dg.date === anchorDate;
        const isToday = today != null && dg.date === today;
        return (
          <Fragment key={dg.date}>
          <div ref={isAnchor ? anchorRef : undefined}
            className="space-y-3 scroll-mt-[calc(var(--header-h,9rem)_+_0.5rem)]">
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-aqua">📅</span>
              <h3 className={`font-bold text-sm ${isToday || isAnchor ? 'text-aqua' : 'text-text'}`}>
                {formatMatchDate(dg.date, locale)}
              </h3>
              <span className="flex-1 h-px bg-bdr" />
            </div>

            {dg.competitions.map(cg => (
              <div key={cg.competition.id} className="space-y-2">
                <button onClick={() => openCompetition(cg.competition)}
                  className="w-full flex items-center gap-2 bg-cardBg border border-aqua/30 rounded-xl px-3 py-2.5 text-start active:bg-aqua/10 transition-colors">
                  <span className="text-base">🏆</span>
                  <span className="flex-1 text-aqua font-bold text-xs leading-tight">{localize(cg.competition.title, locale)}</span>
                  <span className="text-aqua text-sm">{isAr ? '‹' : '›'}</span>
                </button>
                {cg.matches.map(m => (
                  <Fragment key={m.id}>
                    <MatchCard match={toMatch(m)} homeTeam={toTeam(m.homeTeam)} awayTeam={toTeam(m.awayTeam)} locale={locale} onClick={() => router.push(`/match?id=${m.id}`)} />
                    {feedAd && adAfterMatchIds.has(m.id) && <FeedAdCard ad={feedAd} />}
                  </Fragment>
                ))}
              </div>
            ))}
          </div>
          </Fragment>
        );
      })}

      {hasMoreNewer && (
        <button onClick={loadNewer} disabled={loading}
          className="w-full bg-cardBg border border-aqua/30 text-aqua font-bold text-sm py-3 rounded-xl active:bg-aqua/10 disabled:opacity-50">
          {loading ? (isAr ? 'جاري التحميل...' : 'Loading...') : (isAr ? '↓ مباريات أحدث' : '↓ Newer matches')}
        </button>
      )}
    </div>
  );
}
