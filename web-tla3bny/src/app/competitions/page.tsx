'use client';
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  tSeasons, tCompetitions, tCompetition, tStandings, tMatches, tAnalysis, tBracket, tNews,
  mediaUrl,
  type TSeason, type TCompetition, type TStandingGroup,
  type TMatch, type TAnalysis, type TBracketStage, type TNews, type TBoardRow,
} from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { useApp } from '@/context/AppContext';
import { formatMatchDate, sortAges, subCompLabel, todayStr } from '@/lib/utils';
import MatchRow from '@/components/tla3bny/MatchRow';
import StandingsTable from '@/components/tla3bny/StandingsTable';
import CompetitionInfo from '@/components/tla3bny/CompetitionInfo';
import NewsList from '@/components/tla3bny/NewsList';
import { AdStrip } from '@/components/tla3bny/AdCard';
import { tCompetitionAds, type TAd } from '@/lib/tla3bnyApi';
import { Card, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

type Tab = 'standings' | 'matches' | 'stats' | 'bracket' | 'news' | 'info';

function CompetitionsContent() {
  const tt = useTT();
  const params = useSearchParams();
  const [seasons, setSeasons] = useState<TSeason[]>([]);
  const [comp, setComp] = useState<TCompetition | null>(null);
  const [cageId, setCageId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('standings');
  const [loading, setLoading] = useState(true);

  // Accordion state — which seasons / competitions are expanded.
  const [openSeasons, setOpenSeasons] = useState<Set<number>>(new Set());
  const [openComps,   setOpenComps]   = useState<Set<number>>(new Set());
  // Lazily-loaded competitions keyed by season id.
  const [seasonComps, setSeasonComps] = useState<Record<number, TCompetition[]>>({});

  const loadSeasonComps = useCallback((sid: number) => {
    if (seasonComps[sid]) return;
    tCompetitions(sid).then(cs => setSeasonComps(prev => ({ ...prev, [sid]: cs }))).catch(() => {});
  }, [seasonComps]);

  const toggleSeason = useCallback((sid: number) => {
    setOpenSeasons(prev => {
      const next = new Set(prev);
      if (next.has(sid)) { next.delete(sid); }
      else { next.add(sid); loadSeasonComps(sid); }
      return next;
    });
  }, [loadSeasonComps]);

  const toggleComp = useCallback((cid: number) =>
    setOpenComps(prev => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; }), []);

  useEffect(() => {
    tSeasons().then(ss => {
      setSeasons(ss);
      // Open the active (or newest) season by default and load its competitions.
      const first = ss.find(s => s.is_active) ?? ss[0];
      if (first) {
        setOpenSeasons(new Set([first.id]));
        tCompetitions(first.id).then(cs => setSeasonComps({ [first.id]: cs })).catch(() => {});
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openComp = useCallback((id: number, initialCageId?: number) => {
    tCompetition(id).then(c => {
      setComp(c);
      setCageId(initialCageId ?? sortAges(c.ages ?? [])[0]?.id ?? null);
      setTab('standings');
    });
  }, []);

  useEffect(() => {
    const q = Number(params.get('comp'));
    const cage = Number(params.get('cage')) || undefined;
    if (q) openComp(q, cage);
  }, [params, openComp]);

  if (loading) return <Spinner />;

  // ── competition open: drill-down view ──
  if (comp) {
    return (
      <div className="space-y-4">
        <button onClick={() => setComp(null)} className="text-sm text-hint hover:text-aqua">← {tt('كل البطولات', 'All competitions')}</button>
        {(() => {
          const selectedAge = cageId ? sortAges(comp.ages ?? []).find(a => a.id === cageId) : null;
          return (
            <Card className="p-4 flex items-center gap-3">
              <LogoAvatar src={comp.logo_path} name={comp.name} size={52} />
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-black text-text">{comp.name}</h1>
                <p className="text-[11px] text-hint">
                  {[comp.season_name, selectedAge ? subCompLabel(selectedAge) : null, comp.location].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button onClick={() => setTab(tab === 'info' ? 'standings' : 'info')}
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border transition-colors ${
                  tab === 'info' ? 'bg-aqua text-on-accent border-aqua' : 'bg-cardBg2 border-bdr text-teal hover:border-aqua/50'
                }`}
                title={tt('عن البطولة', 'About')}>
                ℹ️
              </button>
            </Card>
          );
        })()}

        <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
          {(['standings', 'matches', 'stats', 'bracket', 'news'] as Exclude<Tab, 'info'>[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t ? 'border-aqua text-aqua' : 'border-transparent text-teal hover:text-text'}`}>
              {tt(
                { standings: 'الترتيب', matches: 'المباريات', stats: 'الإحصائيات', bracket: 'الأدوار', news: 'الأخبار' }[t],
                { standings: 'Table', matches: 'Matches', stats: 'Stats', bracket: 'Bracket', news: 'News' }[t],
              )}
            </button>
          ))}
        </div>

        {tab === 'info' ? <CompetitionInfo comp={comp} />
          : tab === 'news' ? <NewsList compId={comp.id} />
          : cageId == null
            ? <EmptyState icon="⚽" text={tt('لا فئات في هذه البطولة', 'No ages in this competition')} />
            : <TabBody comp={comp} cageId={cageId} tab={tab} />}
      </div>
    );
  }

  // ── competition list — accordion: Season → Competition → Sub-competitions ──
  return (
    <div className="space-y-3 pb-6">
      <h1 className="text-xl font-black text-text">{tt('البطولات', 'Competitions')}</h1>

      {seasons.length === 0 && (
        <EmptyState icon="🏆" text={tt('لا مواسم بعد', 'No seasons yet')} />
      )}

      {seasons.map((season, i) => {
        const seasonOpen = openSeasons.has(season.id);
        const comps = seasonComps[season.id] ?? [];
        return (
          <div key={season.id} className="rounded-2xl overflow-hidden border border-bdr">
            {/* Season header */}
            <button onClick={() => toggleSeason(season.id)}
              className="w-full flex items-center gap-3 bg-gradient-to-l from-aqua/[0.06] to-transparent px-4 py-4 hover:from-aqua/10 transition-colors">
              <div className="flex-1 text-start">
                <p className="text-aqua font-extrabold text-sm tnum">{season.name_ar || season.name}</p>
                <p className="text-hint text-xs mt-0.5">
                  {seasonComps[season.id]
                    ? `${comps.length} ${tt('بطولة', 'competitions')}`
                    : tt('اضغط للتحميل', 'tap to load')}
                </p>
              </div>
              {(i === 0 || season.is_active) && (
                <span className="text-[10px] text-win bg-win/10 border border-win/30 rounded-full px-2 py-0.5 font-bold flex-shrink-0">
                  {tt('● جارية', '● Live')}
                </span>
              )}
              <span className="text-aqua text-base flex-shrink-0">{seasonOpen ? '▲' : '▼'}</span>
            </button>

            {/* Competitions within this season */}
            {seasonOpen && (
              <div className="bg-darkBg divide-y divide-bdr/60">
                {comps.length === 0 && (
                  <p className="text-hint text-sm text-center py-6">
                    {tt('لا بطولات في هذا الموسم', 'No competitions this season')}
                  </p>
                )}
                {comps.map(c => {
                  const compOpen = openComps.has(c.id);
                  const ages = sortAges(c.ages ?? []);
                  return (
                    <div key={c.id}>
                      {/* Competition row */}
                      <button onClick={() => toggleComp(c.id)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-aqua/[0.04] transition-colors">
                        <LogoAvatar src={c.logo_path} name={c.name} size={32} />
                        <div className="flex-1 text-start min-w-0">
                          <p className="text-text font-semibold text-sm truncate">{c.name}</p>
                          <p className="text-hint text-xs mt-0.5">
                            {ages.length} {tt('فئة', 'age groups')}
                          </p>
                        </div>
                        <span className="text-hint text-sm flex-shrink-0">{compOpen ? '▲' : '▼'}</span>
                      </button>

                      {/* Sub-competitions (ages) */}
                      {compOpen && (
                        <div className="bg-cardBg/60 border-t border-bdr/40">
                          {ages.length === 0 && (
                            <p className="text-hint text-xs text-center py-4">
                              {tt('لا فئات', 'No age groups')}
                            </p>
                          )}
                          {ages.map(a => (
                            <button key={a.id} onClick={() => openComp(c.id, a.id)}
                              className="w-full flex items-center gap-3 px-5 py-3 border-b border-bdr/30 last:border-0 active:bg-aqua/5 hover:bg-aqua/[0.04] transition-colors text-start">
                              <span className="text-aqua text-xs flex-shrink-0">›</span>
                              <span className="flex-1 text-teal text-sm font-medium">{subCompLabel(a)}</span>
                              <span className="text-bdr text-xs flex-shrink-0">↗</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabBody({ comp, cageId, tab }: { comp: TCompetition; cageId: number; tab: Tab }) {
  const cage = (comp.ages ?? []).find(a => a.id === cageId);
  const ageId = cage?.age_category_id ?? 0;
  if (tab === 'standings') return <StandingsTab compId={comp.id} ageId={ageId} cageId={cageId} />;
  if (tab === 'matches') return <MatchesTab compId={comp.id} cageId={cageId} />;
  if (tab === 'stats') return <StatsTab compId={comp.id} ageId={ageId} cageId={cageId} />;
  return <BracketTab compId={comp.id} ageId={ageId} />;
}

function StandingsTab({ compId, ageId, cageId }: { compId: number; ageId: number; cageId?: number }) {
  const tt = useTT();
  const [groups, setGroups] = useState<TStandingGroup[] | null>(null);
  useEffect(() => { setGroups(null); tStandings(compId, ageId, cageId).then(setGroups).catch(() => setGroups([])); }, [compId, ageId, cageId]);
  if (!groups) return <Spinner />;
  if (groups.length === 0 || groups.every(g => g.standings.length === 0))
    return <EmptyState icon="📊" text={tt('لا ترتيب بعد', 'No standings yet')} />;
  return (
    <div className="space-y-4">
      {groups.map((g, i) => (
        <div key={g.group?.id ?? i} className="space-y-1">
          {g.group?.name && <h3 className="font-black text-text">{g.group.name}</h3>}
          <StandingsTable rows={g.standings} />
        </div>
      ))}
    </div>
  );
}

/** Matches grouped by date, oldest first, scrolled to the day nearest today —
 *  the same "land on the current matches" behaviour as the home feed. */
function MatchesTab({ compId, cageId }: { compId: number; cageId: number }) {
  const tt = useTT();
  const { locale } = useApp();
  const [matches, setMatches] = useState<TMatch[] | null>(null);
  const [ads, setAds] = useState<TAd[]>([]);
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => { setToday(todayStr()); }, []);

  const didScroll = useRef(false);
  useEffect(() => {
    didScroll.current = false;   // re-scroll when the competition/age changes
    setMatches(null);
    tMatches({ competition_id: compId, competition_age_id: cageId, order: 'asc' })
      .then(setMatches).catch(() => setMatches([]));
  }, [compId, cageId]);
  useEffect(() => { tCompetitionAds(compId).then(setAds).catch(() => setAds([])); }, [compId]);

  const days = useMemo(() => {
    const out: { date: string | null; matches: TMatch[] }[] = [];
    for (const m of matches ?? []) {
      const last = out[out.length - 1];
      if (last && last.date === m.date) last.matches.push(m);
      else out.push({ date: m.date, matches: [m] });
    }
    return out;
  }, [matches]);

  // The day to land on: the first one today or later, else the most recent.
  const anchorDate = useMemo(() => {
    if (!today || days.length === 0) return null;
    const upcoming = days.find(d => d.date && d.date >= today);
    return upcoming ? upcoming.date : days[days.length - 1].date;
  }, [today, days]);

  // Scroll that day into view once, after the matches land.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (didScroll.current || !anchorDate || !anchorRef.current) return;
    didScroll.current = true;
    const el = anchorRef.current;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, [anchorDate]);

  if (!matches) return <Spinner />;
  if (matches.length === 0) return (
    <div className="space-y-4">
      <AdStrip ads={ads} />
      <EmptyState icon="📅" text={tt('لا مباريات', 'No matches')} />
    </div>
  );

  return (
    <div className="space-y-5">
      {days.map((d, di) => {
        // Drop the sponsor strip a few matches into each day so it is on-screen
        // when the page lands on that day, sitting between matches.
        const adAfter = ads.length ? Math.min(3, Math.ceil(d.matches.length / 2)) : -1;
        return (
          <div key={d.date ?? `tbd-${di}`}
            ref={d.date === anchorDate ? anchorRef : undefined}
            className="space-y-2 scroll-mt-20">
            <div className="flex items-center gap-2 py-1">
              <span className="text-aqua">📅</span>
              <h3 className={`font-bold text-sm ${d.date === today ? 'text-aqua' : 'text-text'}`}>
                {d.date ? formatMatchDate(d.date, locale) : tt('لم تحدد', 'Date TBD')}
              </h3>
              <span className="flex-1 h-px bg-bdr" />
            </div>
            {d.matches.map((m, mi) => (
              <Fragment key={m.id}>
                <MatchRow m={m} />
                {mi + 1 === adAfter && <AdStrip ads={ads} className="py-1" />}
              </Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** A leaderboard: top three get a medal, the rest a plain rank. */
function Board({ title, icon, rows, unitClass = 'text-aqua' }: {
  title: string; icon: string; rows: TBoardRow[]; unitClass?: string;
}) {
  const tt = useTT();
  if (rows.length === 0) return null;
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <div>
      <h3 className="font-black text-text mb-2 flex items-center gap-2">
        <span>{icon}</span>{title}
      </h3>
      <div className="space-y-1.5">
        {rows.slice(0, 10).map((r, i) => (
          <Link key={r.player_id} href={`/player?id=${r.player_id}`} className="block">
            <Card className={`p-2 flex items-center gap-3 hover:border-aqua/40 transition-colors ${
              i === 0 ? 'border-gold/40' : ''}`}>
              <span className="w-6 text-center tnum text-sm">
                {i < 3 ? medal[i] : <span className="text-hint">{i + 1}</span>}
              </span>
              <LogoAvatar src={r.photo_path} name={r.player_name} size={32} />
              <div className="min-w-0 flex-1">
                <div className={`font-bold text-sm truncate ${i === 0 ? 'text-gold' : 'text-text'}`}>{r.player_name}</div>
                <div className="text-[11px] text-hint truncate">{r.team_name}</div>
              </div>
              <span className={`font-black tnum text-lg ${unitClass}`}>{r.count}</span>
            </Card>
          </Link>
        ))}
      </div>
      {rows.length > 10 && (
        <p className="text-hint text-[11px] mt-1.5 text-center">
          {tt(`و${rows.length - 10} لاعبين آخرين`, `and ${rows.length - 10} more`)}
        </p>
      )}
    </div>
  );
}

/** Same layout as Board but for team-level stats (no player profile link). */
function TeamBoard({ title, icon, rows, unit, unitClass = 'text-aqua' }: {
  title: string; icon: string;
  rows: { id: number; name: string; logo: string | null; count: number }[];
  unit: string; unitClass?: string;
}) {
  const tt = useTT();
  if (rows.length === 0) return null;
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <div>
      {title && <h3 className="font-black text-text mb-2 flex items-center gap-2"><span>{icon}</span>{title}</h3>}
      <div className="space-y-1.5">
        {rows.slice(0, 10).map((r, i) => (
          <Card key={r.id} className={`p-2 flex items-center gap-3 ${i === 0 ? 'border-gold/40' : ''}`}>
            <span className="w-6 text-center tnum text-sm">
              {i < 3 ? medal[i] : <span className="text-hint">{i + 1}</span>}
            </span>
            <LogoAvatar src={r.logo} name={r.name} size={32} />
            <div className="min-w-0 flex-1">
              <div className={`font-bold text-sm truncate ${i === 0 ? 'text-gold' : 'text-text'}`}>{r.name}</div>
            </div>
            <span className={`font-black tnum text-lg ${unitClass}`}>{r.count}
              <span className="text-xs font-normal text-hint ms-1">{unit}</span>
            </span>
          </Card>
        ))}
      </div>
      {rows.length > 10 && (
        <p className="text-hint text-[11px] mt-1.5 text-center">
          {tt(`و${rows.length - 10} فريق آخر`, `and ${rows.length - 10} more`)}
        </p>
      )}
    </div>
  );
}

function DonutChart({ decisive, draws, total }: { decisive: number; draws: number; total: number }) {
  const tt = useTT();
  const cx = 65, cy = 65, R = 60, r = R * 0.55, gap = 0.04;
  const segments = [{ count: decisive, fill: '#22c55e' }, { count: draws, fill: '#facc15' }];
  const arcPath = (start: number, sweep: number) => {
    const end = start + sweep;
    const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end);
    const x3 = cx + r * Math.cos(end),   y3 = cy + r * Math.sin(end);
    const x4 = cx + r * Math.cos(start), y4 = cy + r * Math.sin(start);
    return `M${x1} ${y1} A${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 0 ${x4} ${y4}Z`;
  };
  let start = -Math.PI / 2;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" className="flex-shrink-0">
      {total === 0
        ? <circle cx={cx} cy={cy} r={R} style={{ fill: 'rgb(var(--bdr-rgb))' }} />
        : segments.map(({ count, fill }, i) => {
            if (!count) return null;
            const sweep = (count / total) * 2 * Math.PI - gap;
            const d = arcPath(start, sweep);
            start += (count / total) * 2 * Math.PI;
            return <path key={i} d={d} fill={fill} />;
          })}
      <circle cx={cx} cy={cy} r={r} style={{ fill: 'rgb(var(--surface-rgb))' }} />
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fill: 'rgb(var(--text-rgb))' }} fontSize="22" fontWeight="bold">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" style={{ fill: 'rgb(var(--hint-rgb))' }} fontSize="10">{tt('مباراة', 'matches')}</text>
    </svg>
  );
}

function StatsTab({ compId, ageId, cageId }: { compId: number; ageId: number; cageId?: number }) {
  const tt = useTT();
  const [sub, setSub] = useState(0);
  const [a, setA] = useState<TAnalysis | null>(null);
  const [matches, setMatches] = useState<TMatch[] | null>(null);

  useEffect(() => {
    setA(null); setMatches(null);
    tAnalysis(compId, ageId).then(setA).catch(() => setA(null));
    tMatches({ competition_id: compId, ...(cageId ? { competition_age_id: cageId } : { age_category_id: ageId }), order: 'asc' })
      .then(setMatches).catch(() => setMatches([]));
  }, [compId, ageId, cageId]);

  const played = useMemo(() => (matches ?? []).filter(m => m.status === 'completed' || m.status === 'finished'), [matches]);
  const goals      = useMemo(() => played.reduce((s, m) => s + (m.home_score ?? 0) + (m.away_score ?? 0), 0), [played]);
  const decisive   = useMemo(() => played.filter(m => m.home_score !== m.away_score).length, [played]);
  const draws      = useMemo(() => played.filter(m => m.home_score === m.away_score && m.home_score != null).length, [played]);
  const goalRate   = played.length ? (goals / played.length).toFixed(1) : '0.0';

  type TeamStat = { id: number; name: string; goalsFor: number; goalsAgainst: number };
  const teamStats = useMemo<TeamStat[]>(() => {
    const map = new Map<number, TeamStat>();
    for (const m of played) {
      if (m.home_score == null || m.away_score == null) continue;
      const h = map.get(m.home_team_id) ?? { id: m.home_team_id, name: m.home_team_name ?? '', goalsFor: 0, goalsAgainst: 0 };
      h.goalsFor += m.home_score; h.goalsAgainst += m.away_score; map.set(m.home_team_id, h);
      const aw = map.get(m.away_team_id) ?? { id: m.away_team_id, name: m.away_team_name ?? '', goalsFor: 0, goalsAgainst: 0 };
      aw.goalsFor += m.away_score; aw.goalsAgainst += m.home_score; map.set(m.away_team_id, aw);
    }
    return [...map.values()];
  }, [played]);

  const bestAttack   = useMemo(() => { const s = [...teamStats].sort((a, b) => b.goalsFor - a.goalsFor);      return s.length ? s.filter(t => t.goalsFor      === s[0].goalsFor)      : []; }, [teamStats]);
  const worstAttack  = useMemo(() => { const s = [...teamStats].sort((a, b) => a.goalsFor - b.goalsFor);      return s.length ? s.filter(t => t.goalsFor      === s[0].goalsFor)      : []; }, [teamStats]);
  const bestDefense  = useMemo(() => { const s = [...teamStats].sort((a, b) => a.goalsAgainst - b.goalsAgainst); return s.length ? s.filter(t => t.goalsAgainst === s[0].goalsAgainst) : []; }, [teamStats]);
  const worstDefense = useMemo(() => { const s = [...teamStats].sort((a, b) => b.goalsAgainst - a.goalsAgainst); return s.length ? s.filter(t => t.goalsAgainst === s[0].goalsAgainst) : []; }, [teamStats]);

  const cleanSheets = useMemo(() => {
    const map = new Map<number, { id: number; name: string; logo: string | null; count: number }>();
    for (const m of played) {
      if (m.home_score == null || m.away_score == null) continue;
      if (m.away_score === 0) {
        const t = map.get(m.home_team_id) ?? { id: m.home_team_id, name: m.home_team_name ?? '', logo: m.home_logo, count: 0 };
        t.count++; map.set(m.home_team_id, t);
      }
      if (m.home_score === 0) {
        const t = map.get(m.away_team_id) ?? { id: m.away_team_id, name: m.away_team_name ?? '', logo: m.away_logo, count: 0 };
        t.count++; map.set(m.away_team_id, t);
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [played]);

  if (!a || !matches) return <Spinner />;
  if (played.length === 0 && a.top_scorers.length === 0)
    return <EmptyState icon="⚽" text={tt('لا إحصائيات بعد', 'No stats yet')} />;

  const subTabs = [
    { label: tt('عام', 'Overview'),    icon: '📊' },
    { label: tt('الهدافون', 'Scorers'), icon: '⚽' },
    { label: tt('صناعة', 'Assists'),   icon: '🎯' },
    { label: tt('نظيفة', 'Clean'),     icon: '🛡️' },
    { label: tt('بطاقات', 'Cards'),    icon: '🟨' },
  ];

  return (
    <div>
      {/* Sub-tab strip */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-bdr mb-4">
        {subTabs.map((t, i) => (
          <button key={i} onClick={() => setSub(i)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              sub === i ? 'border-aqua text-aqua' : 'border-transparent text-teal hover:text-text'}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {sub === 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { icon: '⚽', v: matches.length, l: tt('المباريات', 'Matches'), c: 'text-aqua' },
              { icon: '✅', v: played.length,  l: tt('منتهية', 'Completed'),  c: 'text-aqua' },
              { icon: '🎯', v: goals,           l: tt('أهداف', 'Goals'),       c: 'text-gold' },
            ].map(({ icon, v, l, c }) => (
              <Card key={l} className="p-4 flex flex-col items-center gap-1">
                <span className="text-xl">{icon}</span>
                <span className={`font-extrabold text-2xl tnum ${c}`}>{v}</span>
                <span className="text-hint text-[11px]">{l}</span>
              </Card>
            ))}
          </div>

          {played.length > 0 && <>
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-aqua font-bold text-sm">{tt('نتائج المباريات', 'Match Results')}</span>
                <span className="bg-darkBg border border-bdr rounded-full px-3 py-0.5 text-teal text-xs">
                  {tt(`المباريات: ${played.length}`, `Matches: ${played.length}`)}
                </span>
              </div>
              <div className="flex items-center gap-6">
                <DonutChart decisive={decisive} draws={draws} total={played.length} />
                <div className="flex-1 space-y-3">
                  {[
                    { label: tt('حسم', 'Decisive'), count: decisive, hex: '#22c55e' },
                    { label: tt('تعادل', 'Draw'),   count: draws,    hex: '#facc15' },
                  ].map(({ label, count, hex }) => {
                    const pct = played.length ? `${Math.round(count / played.length * 100)}%` : '0%';
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
                        <span className="flex-1 text-text text-sm">{label}</span>
                        <span className="font-bold text-sm" style={{ color: hex }}>{count}</span>
                        <span className="text-hint text-xs w-8 text-end">{pct}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <span className="text-teal text-sm">{tt('معدل الأهداف', 'Goals / Match')}</span>
              <span className="text-aqua font-bold text-2xl tnum">{goalRate} ⚽</span>
            </Card>

            {bestAttack.length > 0 && (
              <Card className="p-4 space-y-3">
                <p className="text-aqua font-bold text-sm">⚔️ {tt('الهجوم', 'Attack')}</p>
                {[
                  { label: tt('أقوى هجوم', 'Best Attack'),   teams: bestAttack,  val: bestAttack[0].goalsFor,      hex: '#22c55e', unit: tt('هدف', 'Goals') },
                  ...(worstAttack[0]?.goalsFor !== bestAttack[0]?.goalsFor
                    ? [{ label: tt('أضعف هجوم', 'Worst Attack'), teams: worstAttack, val: worstAttack[0].goalsFor, hex: '#ef4444', unit: tt('هدف', 'Goals') }]
                    : []),
                ].map(({ label, teams, val, hex, unit }, i) => (
                  <div key={i} className={`flex items-start gap-2 ${i > 0 ? 'pt-1 border-t border-bdr' : ''}`}>
                    <span className="text-xs text-hint w-20 pt-0.5 flex-shrink-0">{label}</span>
                    <div className="flex-1 space-y-0.5">{teams.map(t => <p key={t.id} className="text-text text-sm">{t.name}</p>)}</div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0" style={{ background: `${hex}1a`, color: hex }}>{val} {unit}</span>
                  </div>
                ))}
              </Card>
            )}

            {bestDefense.length > 0 && (
              <Card className="p-4 space-y-3">
                <p className="text-aqua font-bold text-sm">🛡️ {tt('الدفاع', 'Defense')}</p>
                {[
                  { label: tt('أقوى دفاع', 'Best Defense'),   teams: bestDefense,  val: bestDefense[0].goalsAgainst,  hex: '#22c55e', unit: tt('استقبل', 'conceded') },
                  ...(worstDefense[0]?.goalsAgainst !== bestDefense[0]?.goalsAgainst
                    ? [{ label: tt('أضعف دفاع', 'Worst Defense'), teams: worstDefense, val: worstDefense[0].goalsAgainst, hex: '#ef4444', unit: tt('استقبل', 'conceded') }]
                    : []),
                ].map(({ label, teams, val, hex, unit }, i) => (
                  <div key={i} className={`flex items-start gap-2 ${i > 0 ? 'pt-1 border-t border-bdr' : ''}`}>
                    <span className="text-xs text-hint w-20 pt-0.5 flex-shrink-0">{label}</span>
                    <div className="flex-1 space-y-0.5">{teams.map(t => <p key={t.id} className="text-text text-sm">{t.name}</p>)}</div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0" style={{ background: `${hex}1a`, color: hex }}>{val} {unit}</span>
                  </div>
                ))}
              </Card>
            )}
          </>}
        </div>
      )}

      {/* Scorers */}
      {sub === 1 && (
        a.top_scorers.length === 0
          ? <EmptyState icon="⚽" text={tt('لا هدافون بعد', 'No scorers yet')} />
          : <Board icon="⚽" title={tt('الهدافون', 'Top scorers')} rows={a.top_scorers} unitClass="text-gold" />
      )}

      {/* Assists */}
      {sub === 2 && (
        a.top_assisters.length === 0
          ? <EmptyState icon="🎯" text={tt('لا صناع أهداف بعد', 'No assisters yet')} />
          : <Board icon="🎯" title={tt('صناع الأهداف', 'Top assists')} rows={a.top_assisters} />
      )}

      {/* Clean sheets */}
      {sub === 3 && (
        cleanSheets.length === 0
          ? <EmptyState icon="🛡️" text={tt('لا شباك نظيفة بعد', 'No clean sheets yet')} />
          : <TeamBoard icon="🛡️" title={tt('شباك نظيفة', 'Clean Sheets')}
              rows={cleanSheets} unit={tt('نظيفة', 'CS')} unitClass="text-teal" />
      )}

      {/* Cards */}
      {sub === 4 && (
        <div className="space-y-5">
          {a.yellow_cards.length > 0 && (
            <div className="space-y-2">
              <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl px-4 py-2.5">
                <span className="text-yellow-400 font-bold text-sm">🟨 {tt('بطاقات صفراء', 'Yellow Cards')}</span>
              </div>
              <Board icon="🟨" title="" rows={a.yellow_cards} unitClass="text-yellow-400" />
            </div>
          )}
          {a.red_cards.length > 0 && (
            <div className="space-y-2">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
                <span className="text-red-400 font-bold text-sm">🟥 {tt('بطاقات حمراء', 'Red Cards')}</span>
              </div>
              <Board icon="🟥" title="" rows={a.red_cards} unitClass="text-loss" />
            </div>
          )}
          {a.yellow_cards.length === 0 && a.red_cards.length === 0 && (
            <EmptyState icon="🟨" text={tt('لا بطاقات بعد', 'No cards yet')} />
          )}
        </div>
      )}
    </div>
  );
}

/** A compact two-row match card used inside knockout bracket rounds. */
function BracketCard({ m }: { m: TMatch }) {
  const finished = m.status === 'completed' || m.status === 'finished';
  const homeWon = finished && m.home_score != null && m.away_score != null
    && (m.home_score_pen ?? m.home_score) > (m.away_score_pen ?? m.away_score);
  const awayWon = finished && m.home_score != null && m.away_score != null
    && (m.away_score_pen ?? m.away_score) > (m.home_score_pen ?? m.home_score);

  const scoreFor = (pen: number | null, reg: number | null) =>
    pen != null ? pen : reg != null ? reg : '–';

  const row = (
    name: string | null, logo: string | null,
    score: number | null, scorePen: number | null,
    won: boolean, lost: boolean,
  ) => (
    <div className={`flex items-center justify-between gap-2 px-3 py-2
      ${won ? 'bg-win/10' : ''}`}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <LogoAvatar src={logo} name={name} size={22} />
        <span className={`text-sm font-bold truncate
          ${won ? 'text-win' : lost ? 'text-hint' : 'text-text'}`}>
          {name}
        </span>
      </div>
      <span className={`text-sm font-black tnum shrink-0
        ${won ? 'text-win' : lost ? 'text-hint' : 'text-text'}`}>
        {scoreFor(scorePen, score)}
      </span>
    </div>
  );

  return (
    <Link href={`/match?id=${m.id}`} className="block">
      <div className="bg-cardBg border border-bdr rounded-xl overflow-hidden hover:border-aqua/40 transition-colors">
        {row(m.home_team_name, m.home_logo, m.home_score, m.home_score_pen, homeWon, awayWon)}
        <div className="h-px bg-bdr/50" />
        {row(m.away_team_name, m.away_logo, m.away_score, m.away_score_pen, awayWon, homeWon)}
        {m.home_score_pen != null && (
          <div className="px-3 pb-1.5 text-[10px] text-gold tabular-nums">
            {m.home_score_et}–{m.away_score_et} {m.home_score_pen != null ? `· ركلات ${m.home_score_pen}–${m.away_score_pen}` : ''}
          </div>
        )}
      </div>
    </Link>
  );
}

function BracketTab({ compId, ageId }: { compId: number; ageId: number }) {
  const tt = useTT();
  const [stages, setStages] = useState<TBracketStage[] | null>(null);
  useEffect(() => { setStages(null); tBracket(compId, ageId).then(setStages).catch(() => setStages([])); }, [compId, ageId]);
  if (!stages) return <Spinner />;
  if (stages.length === 0) return <EmptyState icon="🏆" text={tt('لا أدوار إقصائية', 'No knockout stages')} />;
  return (
    <div className="space-y-6">
      {stages.map(s => (
        <div key={s.stage_id} className="space-y-4">
          {s.stage_name && (
            <h3 className="font-black text-text text-sm">{s.stage_name}</h3>
          )}
          {s.rounds.map((r, i) => (
            <div key={i}>
              {r.round && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-bold text-teal bg-teal/10 border border-teal/20 rounded-full px-3 py-0.5 whitespace-nowrap">
                    {r.round}
                  </span>
                  <span className="flex-1 h-px bg-bdr" />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {r.matches.map(m => <BracketCard key={m.id} m={m} />)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function CompetitionsPage() {
  return <Suspense fallback={<Spinner />}><CompetitionsContent /></Suspense>;
}
