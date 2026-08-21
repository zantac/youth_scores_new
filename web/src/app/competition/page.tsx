'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';
import FollowButton from '@/components/ui/FollowButton';
import TabStrip from '@/components/ui/TabStrip';
import Spinner from '@/components/ui/Spinner';
import JerseyNumber from '@/components/ui/JerseyNumber';
import MatchCard from '@/components/competition/MatchCard';
import StandingsTable from '@/components/competition/StandingsTable';
import type { Match, MatchSub, Team, StandingsBlock } from '@/lib/types';
import {
  standingsByGroup, topScorers, topAssisters, cleanSheets,
  yellowCards, redCards, teamGoalStats, splitScorers,
  formatMatchDate, todayStr, localize, groupKey, teamNameLines, groupRosterByPosition, safeUrl,
} from '@/lib/utils';
import { competitionDataUrl } from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function GroupFilter({ groups, selected, onChange, locale, stickyTop }: { groups: string[]; selected: string | null; onChange: (g: string | null) => void; locale: string; stickyTop?: number }) {
  if (groups.length <= 1) return null;
  const all = locale === 'ar' ? 'الكل' : 'All';
  return (
    <div className={`flex gap-2 px-3 py-2 overflow-x-auto bg-darkBg border-b border-bdr no-scrollbar ${stickyTop != null ? 'sticky z-30' : ''}`}
      style={stickyTop != null ? { top: `calc(var(--header-h, 0px) + ${stickyTop}px)` } : undefined}>
      {[null, ...groups].map(g => (
        <button key={g ?? '__all'} onClick={() => onChange(g)}
          className={`flex-shrink-0 text-xs px-3.5 py-1.5 rounded-full border transition-all ${selected === g ? 'bg-gradient-to-l from-aqua to-aqua/80 text-on-accent border-transparent font-bold shadow-[0_6px_16px_-8px_rgb(var(--accent-rgb))]' : 'border-bdr text-teal hover:border-aqua/40'}`}>
          {g ?? all}
        </button>
      ))}
    </div>
  );
}

// ── Matches Tab ───────────────────────────────────────────────────────────────

function MatchesTab({ matches, teams, locale, onMatchClick, stickyTop }: { matches: Match[]; teams: Team[]; locale: string; onMatchClick: (id: string) => void; stickyTop?: number }) {
  const [selectedGroup, setGroup] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const didScroll = useRef(false);
  const initSig   = useRef('');
  const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);

  const allGroups = useMemo(() => [...new Set(matches.map(m => m.group).filter(Boolean))].sort(), [matches]);
  const filtered  = useMemo(() => selectedGroup ? matches.filter(m => m.group === selectedGroup) : matches, [matches, selectedGroup]);
  // Undated (TBD) fixtures collect at the very end, after every dated round.
  const sorted    = useMemo(() => [...filtered].sort((a, b) =>
    (!a.date === !b.date)
      ? (a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      : (a.date ? -1 : 1)), [filtered]);

  const byRound = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of sorted) { const k = `${m.week}||${m.date}`; (map.get(k) ?? map.set(k, []).get(k)!).push(m); }
    return map;
  }, [sorted]);

  // Pick the round closest to today and expand only it. Re-runs when the set of
  // rounds changes (a different competition or group filter), not on the silent
  // refresh, so a manual expand/collapse is preserved.
  useEffect(() => {
    const sig = [...byRound.keys()].join('|');
    if (!byRound.size || initSig.current === sig) return;
    initSig.current = sig;
    didScroll.current = false;

    const today = todayStr();
    let target: string | undefined;
    for (const [k, v] of byRound) { if (v[0].date === today) { target = k; break; } }
    if (!target) for (const [k, v] of byRound) { if (v[0].date > today) { target = k; break; } }
    if (!target) target = [...byRound.keys()].at(-1);

    const init: Record<string, boolean> = {};
    for (const k of byRound.keys()) init[k] = k === target;
    setExpanded(init);
    setAnchorKey(target ?? null);
  }, [byRound]);

  // Scroll to the expanded round once, after it renders.
  useEffect(() => {
    if (didScroll.current || !anchorKey) return;
    const el = anchorRef.current;
    if (!el) return;
    didScroll.current = true;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, [anchorKey]);

  const isAr = locale === 'ar';

  return (
    <div>
      <GroupFilter groups={allGroups} selected={selectedGroup} onChange={setGroup} locale={locale} stickyTop={stickyTop} />
      <div className="p-3 space-y-2">
        {[...byRound.entries()].map(([key, ms]) => {
          const week = ms[0].week, date = ms[0].date;
          const isOpen = expanded[key] ?? false;
          const label = week ? `${isAr ? 'الجولة' : 'Round'} ${week}` : (isAr ? 'مباريات' : 'Matches');
          const isAnchor = key === anchorKey;
          return (
            <div key={key} ref={isAnchor ? anchorRef : undefined}
              className={`rounded-xl overflow-hidden border scroll-mt-16 transition-colors ${isAnchor ? 'border-aqua/30 shadow-[0_0_0_1px_rgba(30,224,255,0.08)]' : 'border-bdr'}`}>
              <button onClick={() => setExpanded(p => ({ ...p, [key]: !p[key] }))}
                className="w-full flex items-center gap-2 bg-gradient-to-l from-aqua/[0.06] to-transparent px-4 py-3 text-start">
                <span className="text-aqua text-xs w-3">{isOpen ? '▾' : '▸'}</span>
                <span className="flex-1 text-aqua font-extrabold text-sm">{label}</span>
                <span className="text-hint text-xs">{date ? formatMatchDate(date, locale) : (isAr ? 'غير محدد' : 'TBD')}</span>
                <span className="bg-aqua/10 text-aqua text-[11px] font-bold rounded-full px-2.5 py-0.5 tnum">{ms.length}</span>
              </button>
              {isOpen && (
                <div className="bg-darkBg/60 p-3 space-y-2 border-t border-bdr">
                  {ms.map(m => (
                    <MatchCard key={m.id} match={m}
                      homeTeam={teamMap.get(m.homeTeamId)} awayTeam={teamMap.get(m.awayTeamId)}
                      locale={locale} onClick={() => onMatchClick(m.id)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!sorted.length && <p className="text-center text-hint py-8">{isAr ? 'لا توجد مباريات' : 'No matches'}</p>}
      </div>
    </div>
  );
}

// ── Standings Tab ─────────────────────────────────────────────────────────────

function StandingsTab({ matches, teams, locale, onTeamClick, serverStandings }: {
  matches: Match[]; teams: Team[]; locale: string; onTeamClick: (id: string) => void;
  serverStandings?: StandingsBlock[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // The server accounts for stages that restart from zero; only fall back to
  // computing locally when an older feed sends no tables.
  const grouped = useMemo(() => {
    if (serverStandings?.length) {
      return new Map(serverStandings.map(b => [groupKey(b.group ?? undefined), b.rows]));
    }
    return standingsByGroup(matches, teams);
  }, [serverStandings, matches, teams]);

  useEffect(() => {
    const init: Record<string, boolean> = {};
    for (const k of grouped.keys()) if (!(k in expanded)) init[k] = true;
    if (Object.keys(init).length) setExpanded(p => ({ ...p, ...init }));
  }, [grouped]);

  const displayName = (g: string) => g.length <= 2 ? `${locale === 'ar' ? 'المجموعة' : 'Group'} ${g}` : g;

  return (
    <div className="p-3 space-y-3">
      {[...grouped.entries()].map(([g, rows]) => {
        if (!g) return <StandingsTable key="__" standings={rows} teams={teams} matches={matches} locale={locale} onTeamClick={onTeamClick} />;
        const isOpen = expanded[g] ?? true;
        return (
          <div key={g} className="rounded-xl overflow-hidden border border-bdr">
            <button onClick={() => setExpanded(p => ({ ...p, [g]: !p[g] }))}
              className="w-full flex items-center gap-2 bg-cardBg px-4 py-3">
              <span className="text-aqua">{isOpen ? '▲' : '▼'}</span>
              <span className="flex-1 text-aqua font-bold text-sm text-start">{displayName(g)}</span>
            </button>
            {isOpen && (
              <div className="p-2">
                <StandingsTable standings={rows} teams={teams} matches={matches} locale={locale} onTeamClick={onTeamClick} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Teams Tab ─────────────────────────────────────────────────────────────────

function TeamsTab({ teams, locale, onTeamClick }: { teams: Team[]; locale: string; onTeamClick: (id: string) => void }) {
  const [q, setQ]   = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const filtered = useMemo(() => {
    if (!q) return teams;
    const needle = q.toLowerCase();
    return teams.filter(t =>
      localize(t.name, locale).toLowerCase().includes(needle) ||
      localize(t.clubName, locale, '').toLowerCase().includes(needle));
  }, [teams, q, locale]);

  const grouped = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const t of filtered) { const g = groupKey(t.group).trim(); (map.get(g) ?? map.set(g, []).get(g)!).push(t); }
    const sorted = new Map([...map.entries()].sort(([a], [b]) => a ? (b ? a.localeCompare(b) : -1) : 1));
    return sorted;
  }, [filtered]);

  const multipleGroups = [...grouped.keys()].filter(Boolean).length > 1;
  const isAr = locale === 'ar';

  return (
    <div>
      <div className="p-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={isAr ? 'بحث...' : 'Search...'}
          className="w-full bg-cardBg border border-bdr rounded-xl px-4 py-2.5 text-text text-sm placeholder-hint outline-none focus:border-aqua" />
      </div>
      <div className="px-3 space-y-3 pb-4">
        {[...grouped.entries()].map(([g, ts]) => {
          if (!multipleGroups || !g) {
            return ts.map(t => (
              <button key={t.id} onClick={() => onTeamClick(t.id)} className="w-full flex items-center gap-3 bg-cardBg border border-bdr rounded-xl px-4 py-3 text-start">
                {t.logo && <img src={t.logo} alt={localize(t.name, locale)} className="w-8 h-8 object-contain rounded" />}
                {(() => { const { primary, alias } = teamNameLines(t, locale); return (
                  <span className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span className="text-text text-sm truncate">{primary}</span>
                    {alias && <span className="text-hint text-[11px] truncate">{alias}</span>}
                  </span>
                ); })()}
                <span className="text-aqua">›</span>
              </button>
            ));
          }
          const isOpen = expanded[g] ?? true;
          return (
            <div key={g} className="rounded-xl overflow-hidden border border-bdr">
              <button onClick={() => setExpanded(p => ({ ...p, [g]: !p[g] }))}
                className="w-full flex items-center gap-2 bg-cardBg px-4 py-3">
                <span className="text-aqua">{isOpen ? '▲' : '▼'}</span>
                <span className="flex-1 text-aqua font-bold text-sm text-start">{localize(teams.find(t => groupKey(t.group) === g)?.group, locale) || g}</span>
                <span className="bg-aqua/10 text-aqua text-xs rounded-full px-2 py-0.5">{ts.length}</span>
              </button>
              {isOpen && (
                <div className="bg-darkBg divide-y divide-bdr">
                  {ts.map(t => (
                    <button key={t.id} onClick={() => onTeamClick(t.id)} className="w-full flex items-center gap-3 px-4 py-3 text-start active:bg-aqua/5">
                      {t.logo && <img src={t.logo} alt={localize(t.name, locale)} className="w-7 h-7 object-contain rounded" />}
                      {(() => { const { primary, alias } = teamNameLines(t, locale); return (
                        <span className="flex-1 min-w-0 flex flex-col leading-tight">
                          <span className="text-text text-sm truncate">{primary}</span>
                          {alias && <span className="text-hint text-[11px] truncate">{alias}</span>}
                        </span>
                      ); })()}
                      <span className="text-aqua">›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

type StatType = 'scorers' | 'assists' | 'cleansheets';

function getPlayerScoredMatches(playerName: string, teamId: string, matches: Match[]): { match: Match; value: number }[] {
  const DELIMITERS = ['صناعة الاهداف', 'assists'];
  const result: { match: Match; value: number }[] = [];
  for (const m of matches) {
    if (m.status.toLowerCase() !== 'completed') continue;
    const isHome = m.homeTeamId === teamId;
    if (!isHome && m.awayTeamId !== teamId) continue;
    const events = isHome ? m.homeScorers : m.awayScorers;
    let inAssists = false, goals = 0;
    for (const entry of events) {
      const lower = entry.toLowerCase().trim();
      if (DELIMITERS.some(d => lower === d.toLowerCase())) { inAssists = true; continue; }
      if (inAssists) continue;
      const parts = entry.trim().split(/\s+/);
      let name = entry.trim(), count = 1;
      if (parts.length > 1) {
        const last = parseInt(parts[parts.length - 1].replace(/[()x×]/g, ''), 10);
        if (!isNaN(last)) { count = last; name = parts.slice(0, -1).join(' '); }
      }
      if (name === playerName) goals += count;
    }
    if (goals > 0) result.push({ match: m, value: goals });
  }
  return result.sort((a, b) => b.match.date.localeCompare(a.match.date));
}

function getPlayerAssistedMatches(playerName: string, teamId: string, matches: Match[]): { match: Match; value: number }[] {
  const DELIMITERS = ['صناعة الاهداف', 'assists'];
  const result: { match: Match; value: number }[] = [];
  for (const m of matches) {
    if (m.status.toLowerCase() !== 'completed') continue;
    const isHome = m.homeTeamId === teamId;
    if (!isHome && m.awayTeamId !== teamId) continue;
    const events = isHome ? m.homeScorers : m.awayScorers;
    let inAssists = false, count = 0;
    for (const entry of events) {
      const lower = entry.toLowerCase().trim();
      if (DELIMITERS.some(d => lower === d.toLowerCase())) { inAssists = true; continue; }
      if (!inAssists) continue;
      const parts = entry.trim().split(/\s+/);
      let name = entry.trim(), n = 1;
      if (parts.length > 1) {
        const last = parseInt(parts[parts.length - 1].replace(/[()x×]/g, ''), 10);
        if (!isNaN(last)) { n = last; name = parts.slice(0, -1).join(' '); }
      }
      if (name === playerName) count += n;
    }
    if (count > 0) result.push({ match: m, value: count });
  }
  return result.sort((a, b) => b.match.date.localeCompare(a.match.date));
}

function getPlayerCleanSheetMatches(teamId: string, matches: Match[]): { match: Match; value: number }[] {
  return matches
    .filter(m => {
      if (m.status.toLowerCase() !== 'completed' || m.homeScore == null || m.awayScore == null) return false;
      const isHome = m.homeTeamId === teamId;
      if (!isHome && m.awayTeamId !== teamId) return false;
      return (isHome ? m.awayScore : m.homeScore) === 0;
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(match => ({ match, value: 1 }));
}

const STAT_META: Record<StatType, { icon: string; color: string; bg: string }> = {
  scorers:     { icon: '⚽', color: '#22c55e', bg: '#22c55e1a' },
  assists:     { icon: '🎯', color: '#15D8FF', bg: '#15D8FF1a' },
  cleansheets: { icon: '🛡️', color: '#a78bfa', bg: '#a78bfa1a' },
};

function PlayerMatchesModal({ playerName, teamId, teamName, totalCount, matches, teams, locale, unit, statType, onClose }: {
  playerName: string; teamId: string; teamName: string; totalCount: number;
  matches: Match[]; teams: Team[]; locale: string; unit: string; statType: StatType; onClose: () => void;
}) {
  const isAr = locale === 'ar';
  const meta = STAT_META[statType];
  const entries = useMemo(() => {
    if (statType === 'assists')     return getPlayerAssistedMatches(playerName, teamId, matches);
    if (statType === 'cleansheets') return getPlayerCleanSheetMatches(teamId, matches);
    return getPlayerScoredMatches(playerName, teamId, matches);
  }, [playerName, teamId, matches, statType]);

  return (
    <div className="fixed inset-0 z-[400] bg-darkBg flex flex-col">
      <div className="flex items-center bg-cardBg border-b border-bdr px-4 py-3 gap-3">
        <button onClick={onClose} className="text-aqua text-xl font-bold">✕</button>
        <div className="flex-1 min-w-0">
          <p className="text-aqua font-bold text-sm truncate">{playerName}</p>
          <p className="text-teal text-xs truncate">{teamName}</p>
        </div>
        <span className="text-sm font-bold px-3 py-1 rounded-lg flex-shrink-0" style={{ background: meta.bg, color: meta.color }}>
          {totalCount} {unit}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {entries.length === 0
          ? <p className="text-center text-hint py-8">{isAr ? 'لا توجد بيانات' : 'No data'}</p>
          : entries.map(({ match, value }, i) => {
              const isHome = match.homeTeamId === teamId;
              const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
              const opponent = teams.find(t => t.id === opponentId);
              return (
                <div key={i} className="bg-cardBg border border-bdr rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-text text-sm truncate">{isAr ? 'ضد' : 'vs'} {localize(opponent?.name, locale, opponentId)}</p>
                    <p className="text-hint text-xs mt-0.5">{formatMatchDate(match.date, locale)}</p>
                  </div>
                  <div className="text-center flex-shrink-0">
                    <p className="text-aqua font-bold text-sm">{match.homeScore} - {match.awayScore}</p>
                    <p className="text-hint text-[10px]">{isHome ? (isAr ? 'ديار' : 'Home') : (isAr ? 'ضيف' : 'Away')}</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0" style={{ background: meta.bg, color: meta.color }}>
                    {meta.icon}{statType !== 'cleansheets' ? ` ${value}` : ''}
                  </span>
                </div>
              );
            })}
      </div>
    </div>
  );
}

function PlayerList({ stats, unit, locale, matches, teams, statType = 'scorers' }: {
  stats: { name: string; teamName?: string | { ar: string; en: string }; count: number; teamId?: string }[];
  unit: string; locale: string;
  matches?: Match[]; teams?: Team[];
  statType?: StatType;
}) {
  const [selected, setSelected] = useState<{ name: string; teamId: string; teamName: string; count: number } | null>(null);
  if (!stats.length) return <p className="text-center text-hint py-8">{locale === 'ar' ? 'لا توجد إحصائيات' : 'No stats yet'}</p>;
  const medals = ['🥇', '🥈', '🥉'];
  const clickable = !!(matches && teams);
  return (
    <>
      {selected && matches && teams && (
        <PlayerMatchesModal
          playerName={selected.name} teamId={selected.teamId} teamName={selected.teamName}
          totalCount={selected.count} matches={matches} teams={teams}
          locale={locale} unit={unit} statType={statType} onClose={() => setSelected(null)}
        />
      )}
      <div className="p-3 space-y-2">
        {stats.slice(0, 30).map((s, i) => (
          <div key={i}
            onClick={() => clickable && s.teamId ? setSelected({ name: s.name, teamId: s.teamId, teamName: localize(s.teamName, locale), count: s.count }) : undefined}
            className={`bg-gradient-to-b from-cardBg to-cardBg2 border rounded-xl px-3 py-2.5 flex items-center gap-3 transition-all ${clickable && s.teamId ? 'cursor-pointer hover:border-aqua/30 active:opacity-80' : ''} ${i === 0 ? 'border-gold/40' : i === 1 ? 'border-gray-400/30' : i === 2 ? 'border-amber-700/30' : 'border-bdr'}`}>
            <span className={`w-7 text-center font-extrabold tnum ${i < 3 ? 'text-lg' : 'text-hint text-sm'}`}>{i < 3 ? medals[i] : i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${i === 0 ? 'text-gold font-bold' : 'text-text font-medium'}`}>{s.name}</p>
              {s.teamName && <p className="text-teal text-xs truncate">{localize(s.teamName, locale)}</p>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="bg-gold/10 text-gold text-sm font-extrabold px-3 py-1 rounded-lg tnum">{s.count} <span className="font-medium text-xs">{unit}</span></span>
              {clickable && s.teamId && <span className="text-hint text-xs">›</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function StatsTab({ matches, teams, locale, stickyTop }: { matches: Match[]; teams: Team[]; locale: string; stickyTop?: number }) {
  const [sub, setSub] = useState(0);
  const [group, setGroup] = useState<string | null>(null);
  const isAr = locale === 'ar';

  const matchGroups = useMemo(() => [...new Set(matches.map(m => m.group).filter(Boolean))].sort(), [matches]);
  const teamGroups  = useMemo(() => [...new Set(teams.map(t => groupKey(t.group)).filter(Boolean))].sort(), [teams]);
  const activeGroups = sub === 0 ? matchGroups : teamGroups;

  const filteredMatches = useMemo(() => group && sub === 0 ? matches.filter(m => m.group === group) : matches, [matches, group, sub]);

  const groupTeamIds = useMemo(() => {
    if (!group || sub === 0) return null;
    return new Set(teams.filter(t => groupKey(t.group) === group).map(t => t.id));
  }, [teams, group, sub]);

  const byGroup = <T extends { teamId: string }>(list: T[]) =>
    groupTeamIds ? list.filter(s => groupTeamIds.has(s.teamId)) : list;

  const scorers   = useMemo(() => byGroup(topScorers(matches, teams)), [matches, teams, groupTeamIds]);
  const assisters = useMemo(() => byGroup(topAssisters(matches, teams)), [matches, teams, groupTeamIds]);
  const sheets    = useMemo(() => byGroup(cleanSheets(matches, teams)), [matches, teams, groupTeamIds]);
  const yc        = useMemo(() => byGroup(yellowCards(matches, teams)), [matches, teams, groupTeamIds]);
  const rc        = useMemo(() => byGroup(redCards(matches, teams)), [matches, teams, groupTeamIds]);

  // Overview stats
  const completed     = useMemo(() => filteredMatches.filter(m => m.status.toLowerCase() === 'completed'), [filteredMatches]);
  const totalGoals    = useMemo(() => completed.reduce((s, m) => s + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0), [completed]);
  const homeWins      = useMemo(() => completed.filter(m => m.homeScore != null && m.homeScore  > m.awayScore!).length, [completed]);
  const awayWins      = useMemo(() => completed.filter(m => m.awayScore != null && m.awayScore  > m.homeScore!).length, [completed]);
  const draws         = useMemo(() => completed.filter(m => m.homeScore === m.awayScore).length, [completed]);
  const goalRate      = completed.length ? (totalGoals / completed.length).toFixed(1) : '0.0';
  const goalStats     = useMemo(() => teamGoalStats(completed, teams), [completed, teams]);
  const bestAttackTeams   = useMemo(() => { const s = [...goalStats].sort((a, b) => b.goalsFor      - a.goalsFor);      if (!s.length) return []; return s.filter(t => t.goalsFor      === s[0].goalsFor);      }, [goalStats]);
  const worstAttackTeams  = useMemo(() => { const s = [...goalStats].sort((a, b) => a.goalsFor      - b.goalsFor);      if (!s.length) return []; return s.filter(t => t.goalsFor      === s[0].goalsFor);      }, [goalStats]);
  const bestDefenseTeams  = useMemo(() => { const s = [...goalStats].sort((a, b) => a.goalsAgainst  - b.goalsAgainst);  if (!s.length) return []; return s.filter(t => t.goalsAgainst  === s[0].goalsAgainst);  }, [goalStats]);
  const worstDefenseTeams = useMemo(() => { const s = [...goalStats].sort((a, b) => b.goalsAgainst  - a.goalsAgainst);  if (!s.length) return []; return s.filter(t => t.goalsAgainst  === s[0].goalsAgainst);  }, [goalStats]);

  const subTabs = [
    { label: isAr ? 'إحصائيات' : 'Overview', icon: '📊' },
    { label: isAr ? 'الهدافون' : 'Scorers',   icon: '🥅' },
    { label: isAr ? 'صناعة'   : 'Assists',    icon: '🎯' },
    { label: isAr ? 'نظيفة'   : 'Clean',      icon: '🛡️' },
    { label: isAr ? 'بطاقات'  : 'Cards',      icon: '🟨' },
  ];

  return (
    <div>
      {/* Sub-tabs and the group filter ride together as one bar, pinned right
          below the main header so they stay reachable through a long list. */}
      <div className={stickyTop != null ? 'sticky z-30' : ''} style={stickyTop != null ? { top: `calc(var(--header-h, 0px) + ${stickyTop}px)` } : undefined}>
        <TabStrip tabs={subTabs} current={sub} onChange={i => { setSub(i); setGroup(null); }} />
        <GroupFilter groups={activeGroups} selected={group} onChange={setGroup} locale={locale} />
      </div>

      {sub === 0 && (
        <div className="p-3 space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { icon: '⚽', v: filteredMatches.length, l: isAr ? 'المباريات' : 'Matches', c: 'text-aqua' },
              { icon: '✅', v: completed.length,       l: isAr ? 'منتهية' : 'Completed', c: 'text-aqua' },
              { icon: '🥅', v: totalGoals,              l: isAr ? 'أهداف' : 'Goals',      c: 'text-gold' },
            ].map(({ icon, v, l, c }) => (
              <div key={l} className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 flex flex-col items-center gap-1">
                <span className="text-xl">{icon}</span>
                <span className={`font-extrabold text-2xl tnum ${c}`}>{v}</span>
                <span className="text-hint text-[11px]">{l}</span>
              </div>
            ))}
          </div>
          {completed.length > 0 && <>
            {/* Match results donut */}
            <div className="bg-cardBg border border-bdr rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-aqua font-bold text-sm">{isAr ? 'نتائج المباريات' : 'Match Results'}</span>
                <span className="bg-darkBg border border-bdr rounded-full px-3 py-0.5 text-teal text-xs">{isAr ? `المباريات: ${completed.length}` : `Matches: ${completed.length}`}</span>
              </div>
              <div className="flex items-center gap-6">
                <DonutChart won={homeWins + awayWins} drawn={draws} lost={0} label={isAr ? 'مباراة' : 'matches'} />
                <div className="flex-1 space-y-3">
                  {[
                    { label: isAr ? 'حسم' : 'Decisive', count: homeWins + awayWins, hex: '#22c55e' as string },
                    { label: isAr ? 'تعادل' : 'Draw',   count: draws,               hex: '#facc15' as string },
                  ].map(({ label, count, hex }) => {
                    const pct = completed.length ? `${Math.round(count / completed.length * 100)}%` : '0%';
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
            </div>

            <div className="bg-cardBg border border-bdr rounded-xl p-4">
              <div className="flex justify-between items-center">
                <span className="text-teal text-sm">{isAr ? 'معدل الأهداف' : 'Goals/Match'}</span>
                <span className="text-aqua font-bold text-2xl">{goalRate} ⚽</span>
              </div>
            </div>
            {bestAttackTeams.length > 0 && (
              <div className="bg-cardBg border border-bdr rounded-xl p-4 space-y-3">
                <p className="text-aqua font-bold text-sm">⚔️ {isAr ? 'الهجوم' : 'Attack'}</p>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-hint w-20 pt-0.5 flex-shrink-0">{isAr ? 'أقوى هجوم' : 'Best Attack'}</span>
                  <div className="flex-1 space-y-1">
                    {bestAttackTeams.map(t => (
                      <p key={t.teamId} className="text-text text-sm">{localize(t.teamName, locale)}</p>
                    ))}
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0" style={{ background: '#22c55e1a', color: '#22c55e' }}>{bestAttackTeams[0].goalsFor} {isAr ? 'هدف' : 'Goals'}</span>
                </div>
                {worstAttackTeams.length > 0 && worstAttackTeams[0].goalsFor !== bestAttackTeams[0].goalsFor && (
                  <div className="flex items-start gap-2 pt-1 border-t border-bdr">
                    <span className="text-xs text-hint w-20 pt-0.5 flex-shrink-0">{isAr ? 'أضعف هجوم' : 'Worst Attack'}</span>
                    <div className="flex-1 space-y-1">
                      {worstAttackTeams.map(t => (
                        <p key={t.teamId} className="text-text text-sm">{localize(t.teamName, locale)}</p>
                      ))}
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0" style={{ background: '#ef44441a', color: '#ef4444' }}>{worstAttackTeams[0].goalsFor} {isAr ? 'هدف' : 'Goals'}</span>
                  </div>
                )}
              </div>
            )}
            {bestDefenseTeams.length > 0 && (
              <div className="bg-cardBg border border-bdr rounded-xl p-4 space-y-3">
                <p className="text-aqua font-bold text-sm">🛡️ {isAr ? 'الدفاع' : 'Defense'}</p>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-hint w-20 pt-0.5 flex-shrink-0">{isAr ? 'أقوى دفاع' : 'Best Defense'}</span>
                  <div className="flex-1 space-y-1">
                    {bestDefenseTeams.map(t => (
                      <p key={t.teamId} className="text-text text-sm">{localize(t.teamName, locale)}</p>
                    ))}
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0" style={{ background: '#22c55e1a', color: '#22c55e' }}>{bestDefenseTeams[0].goalsAgainst} {isAr ? 'استقبل' : 'conceded'}</span>
                </div>
                {worstDefenseTeams.length > 0 && worstDefenseTeams[0].goalsAgainst !== bestDefenseTeams[0].goalsAgainst && (
                  <div className="flex items-start gap-2 pt-1 border-t border-bdr">
                    <span className="text-xs text-hint w-20 pt-0.5 flex-shrink-0">{isAr ? 'أضعف دفاع' : 'Worst Defense'}</span>
                    <div className="flex-1 space-y-1">
                      {worstDefenseTeams.map(t => (
                        <p key={t.teamId} className="text-text text-sm">{localize(t.teamName, locale)}</p>
                      ))}
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0" style={{ background: '#ef44441a', color: '#ef4444' }}>{worstDefenseTeams[0].goalsAgainst} {isAr ? 'استقبل' : 'conceded'}</span>
                  </div>
                )}
              </div>
            )}
          </>}
        </div>
      )}
      {sub === 1 && <PlayerList stats={scorers}   unit={isAr ? 'هدف'         : 'Goal'}  locale={locale} matches={matches} teams={teams} />}
      {sub === 2 && <PlayerList stats={assisters}  unit={isAr ? 'صناعة'       : 'Assist'} locale={locale} matches={matches} teams={teams} statType="assists" />}
      {sub === 3 && <PlayerList stats={sheets}     unit={isAr ? 'شباك نظيفة'  : 'CS'}     locale={locale} matches={matches} teams={teams} statType="cleansheets" />}
      {sub === 4 && (
        <div className="p-3 space-y-4">
          {yc.length > 0 && <>
            <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl px-4 py-2.5">
              <span className="text-yellow-400 font-bold text-sm">🟨 {isAr ? 'بطاقات صفراء' : 'Yellow Cards'}</span>
            </div>
            <PlayerList stats={yc.slice(0, 30)} unit={isAr ? 'ص' : 'YC'} locale={locale} />
          </>}
          {rc.length > 0 && <>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
              <span className="text-red-400 font-bold text-sm">🟥 {isAr ? 'بطاقات حمراء' : 'Red Cards'}</span>
            </div>
            <PlayerList stats={rc.slice(0, 20)} unit={isAr ? 'ح' : 'RC'} locale={locale} />
          </>}
        </div>
      )}
    </div>
  );
}

// ── Match Detail Modal ────────────────────────────────────────────────────────

function MatchDetail({ match, teams, locale, onClose, onTeamClick }: { match: Match; teams: Team[]; locale: string; onClose: () => void; onTeamClick: (id: string) => void }) {
  const [tab, setTab] = useState(0);
  const homeTeam = teams.find(t => t.id === match.homeTeamId);
  const awayTeam = teams.find(t => t.id === match.awayTeamId);
  const isCompleted = match.status.toLowerCase() === 'completed';
  const bothScores = match.homeScore != null && match.awayScore != null;
  const homeWon = isCompleted && bothScores && (match.homeScore! > match.awayScore! ||
    (match.homeScore === match.awayScore && (match.homePenalty ?? 0) > (match.awayPenalty ?? 0)));
  const awayWon = isCompleted && bothScores && (match.awayScore! > match.homeScore! ||
    (match.homeScore === match.awayScore && (match.awayPenalty ?? 0) > (match.homePenalty ?? 0)));
  const { goals: hGoals, assists: hAssists } = splitScorers(match.homeScorers);
  const { goals: aGoals, assists: aAssists } = splitScorers(match.awayScorers);
  const isAr = locale === 'ar';

  const tabDefs = [
    { label: isAr ? 'التشكيلة' : 'Lineup',   count: match.homeSquad.length + match.awaySquad.length },
    { label: isAr ? 'الأهداف'  : 'Scorers',  count: hGoals.length + aGoals.length },
    { label: isAr ? 'التبديل'  : 'Subs',     count: match.homeSub.length + match.awaySub.length },
    { label: isAr ? 'صفراء'    : 'Yellow',   count: match.homeYc.length + match.awayYc.length },
    { label: isAr ? 'حمراء'    : 'Red',      count: match.homeRc.length + match.awayRc.length },
  ];

  const homeName = localize(homeTeam?.name, locale);
  const awayName = localize(awayTeam?.name, locale);

  const TwoCol = ({ home, away }: { home: string[]; away: string[] }) => (
    <div className="m-3 bg-cardBg border border-bdr rounded-xl overflow-hidden">
      <div className="flex border-b border-bdr px-3 py-2">
        <span className="flex-1 text-aqua text-xs font-bold">{homeName}</span>
        <span className="flex-1 text-aqua text-xs font-bold text-end">{awayName}</span>
      </div>
      {Array.from({ length: Math.max(home.length, away.length) }).map((_, i) => (
        <div key={i} className={`flex px-3 py-1.5 ${i % 2 === 0 ? 'bg-darkBg/40' : ''}`}>
          <span className="flex-1 text-teal text-xs">{home[i] ?? ''}</span>
          <span className="flex-1 text-teal text-xs text-end">{away[i] ?? ''}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[300] bg-darkBg flex flex-col">
      <div className="flex items-center bg-cardBg border-b border-bdr px-4 py-3 gap-3">
        <button onClick={onClose} className="text-aqua text-xl font-bold">✕</button>
        <span className="flex-1 text-aqua font-bold text-sm truncate">{homeName} vs {awayName}</span>
      </div>

      {/* Score header */}
      <div className="relative bg-gradient-to-b from-cardBg to-cardBg2 border-b border-bdr p-4 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(60%_100%_at_50%_0,rgb(var(--accent-rgb)/0.14),transparent_70%)] pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <button className="flex-1 flex flex-col items-center gap-2 active:opacity-70" onClick={() => homeTeam && onTeamClick(homeTeam.id)}>
            {homeTeam?.logo && <img src={homeTeam.logo} alt={homeName} className="w-14 h-14 object-contain drop-shadow-lg" />}
            <p className={`text-xs text-center font-bold ${homeWon ? 'text-gold' : 'text-text'}`}>{homeName}</p>
            <span className="text-hint text-[10px]">{isAr ? 'ديار' : 'Home'}</span>
          </button>
          <div className="flex flex-col items-center">
            {isCompleted && match.homeScore != null ? (
              <>
                <div className="bg-darkBg border border-aqua/40 rounded-xl px-5 py-2 shadow-[0_0_30px_-8px_rgb(var(--accent-rgb)/0.4)]">
                  <span className="text-aqua font-extrabold text-3xl tnum tracking-tight">{match.homeScore} - {match.awayScore}</span>
                </div>
                <span className="text-win text-xs mt-1.5 border border-win/40 bg-win/10 rounded-md px-2 py-0.5 font-bold">{isAr ? 'انتهت' : 'FT'}</span>
                {match.homePenalty != null && match.awayPenalty != null && (
                  <div className="mt-1 flex items-center gap-1 bg-orange-500/10 border border-orange-500/40 rounded-lg px-3 py-1">
                    <span className="text-hint text-[11px]">{isAr ? 'ر.ت' : 'Pens'}</span>
                    <span className={`text-sm font-bold ${match.homePenalty > match.awayPenalty ? 'text-aqua' : 'text-hint'}`}>{match.homePenalty}</span>
                    <span className="text-hint text-sm">-</span>
                    <span className={`text-sm font-bold ${match.awayPenalty > match.homePenalty ? 'text-aqua' : 'text-hint'}`}>{match.awayPenalty}</span>
                  </div>
                )}
              </>
            ) : (
              <span className="text-aqua font-bold text-xl">{match.time || '--:--'}</span>
            )}
            <span className="text-hint text-[10px] mt-1">{match.date}</span>
          </div>
          <button className="flex-1 flex flex-col items-center gap-2 active:opacity-70" onClick={() => awayTeam && onTeamClick(awayTeam.id)}>
            {awayTeam?.logo && <img src={awayTeam.logo} alt={awayName} className="w-14 h-14 object-contain drop-shadow-lg" />}
            <p className={`text-xs text-center font-bold ${awayWon ? 'text-gold' : 'text-text'}`}>{awayName}</p>
            <span className="text-hint text-[10px]">{isAr ? 'ضيف' : 'Away'}</span>
          </button>
        </div>
        {/* Meta info */}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {match.week && (
            <span className="flex items-center gap-1 bg-darkBg border border-bdr rounded-lg px-3 py-1 text-xs text-teal">
              <span>🔢</span>{isAr ? `الجولة ${match.week}` : `Round ${match.week}`}
            </span>
          )}
          {match.group && (
            <span className="flex items-center gap-1 bg-darkBg border border-bdr rounded-lg px-3 py-1 text-xs text-teal">
              <span>🏷️</span>{isAr ? `المجموعة ${match.group}` : `Group ${match.group}`}
            </span>
          )}
          {match.venue && (
            <span className="flex items-center gap-1 bg-darkBg border border-bdr rounded-lg px-3 py-1 text-xs text-teal">
              <span>🏟️</span>{match.venue}
            </span>
          )}
          {match.stage && match.stage.toLowerCase() !== 'league' && (
            <span className="flex items-center gap-1 bg-darkBg border border-bdr rounded-lg px-3 py-1 text-xs text-teal">
              <span>🏆</span>{match.stage}
            </span>
          )}
        </div>
        {match.note && <p className="mt-2 text-center text-teal text-xs bg-darkBg rounded-lg px-3 py-2">{match.note}</p>}
      </div>

      {/* Tab strip */}
      <div className="bg-cardBg border-b border-bdr flex overflow-x-auto no-scrollbar">
        {tabDefs.map((t, i) => {
          const active = i === tab;
          const hasData = t.count > 0;
          return (
            <button key={i} onClick={() => setTab(i)}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] border-b-2 transition-colors relative ${active ? 'border-aqua text-aqua font-bold' : hasData ? 'border-transparent text-hint' : 'border-transparent text-hint/40'}`}>
              {!active && hasData && (
                <span className="absolute top-1 right-2 bg-aqua text-on-accent text-[7px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">{t.count}</span>
              )}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 0 && <TwoCol home={match.homeSquad} away={match.awaySquad} />}
        {tab === 1 && (
          <div className="m-3 space-y-3">
            {(hGoals.length > 0 || aGoals.length > 0) && <>
              <p className="text-aqua font-bold text-sm">⚽ {isAr ? 'الأهداف' : 'Goals'}</p>
              <TwoCol home={hGoals} away={aGoals} />
            </>}
            {(hAssists.length > 0 || aAssists.length > 0) && <>
              <p className="text-aqua font-bold text-sm">🎯 {isAr ? 'صناعة' : 'Assists'}</p>
              <TwoCol home={hAssists} away={aAssists} />
            </>}
          </div>
        )}
        {tab === 2 && (match.subs.length > 0
          ? <SubsTable subs={match.subs} homeName={homeName} awayName={awayName} />
          // Older data carries only the pre-formatted strings, which cannot be
          // coloured because the two players are already joined into one line.
          : <TwoCol home={match.homeSub} away={match.awaySub} />)}
        {tab === 3 && <TwoCol home={match.homeYc} away={match.awayYc} />}
        {tab === 4 && <TwoCol home={match.homeRc} away={match.awayRc} />}
      </div>
    </div>
  );
}

// ── Substitutions ─────────────────────────────────────────────────────────────
// One row per change, grouped by side. The player coming on is green and the one
// going off is red, with the arrows repeating the same thing for anyone who does
// not distinguish the two colours.
function SubsTable({ subs, homeName, awayName }: {
  subs: MatchSub[]; homeName: string; awayName: string;
}) {
  const sides: { key: 'home' | 'away'; name: string }[] = [
    { key: 'home', name: homeName },
    { key: 'away', name: awayName },
  ];
  return (
    <div className="m-3 space-y-3">
      {sides.map(({ key, name }) => {
        const rows = subs.filter(s => s.side === key);
        if (rows.length === 0) return null;
        return (
          <div key={key} className="bg-cardBg border border-bdr rounded-xl overflow-hidden">
            <div className="border-b border-bdr px-3 py-2">
              <span className="text-aqua text-xs font-bold">{name}</span>
            </div>
            {rows.map((s, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 ${i % 2 === 0 ? 'bg-darkBg/40' : ''}`}>
                <span className="text-hint text-[11px] tnum w-8 flex-shrink-0">
                  {s.minute != null ? `${s.minute}'` : ''}
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-win text-xs truncate">▲ {s.in}</span>
                  <span className="text-loss text-xs truncate">▼ {s.out}</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Team Detail helpers ───────────────────────────────────────────────────────

const _ASSIST_DELIMITERS = ['صناعة الاهداف', 'assists'];

function aggregateTeamPlayers(matches: Match[], teamId: string, forScorers: boolean): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const m of matches) {
    if (m.status.toLowerCase() !== 'completed') continue;
    const events = m.homeTeamId === teamId ? m.homeScorers : m.awayScorers;
    let inAssists = false;
    for (const entry of events) {
      const lower = entry.toLowerCase().trim();
      if (_ASSIST_DELIMITERS.some(d => lower === d.toLowerCase())) { inAssists = true; continue; }
      if (forScorers && inAssists) continue;
      if (!forScorers && !inAssists) continue;
      const parts = entry.trim().split(/\s+/);
      let name = entry.trim(), count = 1;
      if (parts.length > 1) {
        const last = parseInt(parts[parts.length - 1].replace(/[()x×]/g, ''), 10);
        if (!isNaN(last)) { count = last; name = parts.slice(0, -1).join(' '); }
      }
      if (!name) continue;
      map.set(name, (map.get(name) ?? 0) + count);
    }
  }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function DonutChart({ won, drawn, lost, label }: { won: number; drawn: number; lost: number; label: string }) {
  const total = won + drawn + lost;
  const cx = 65, cy = 65, R = 60, r = R * 0.55, gap = 0.04;
  const segments = [
    { count: won,   fill: '#22c55e' },
    { count: drawn, fill: '#facc15' },
    { count: lost,  fill: '#ef4444' },
  ];

  const arcPath = (startAngle: number, sweep: number): string => {
    const endAngle = startAngle + sweep;
    const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle),   y2 = cy + R * Math.sin(endAngle);
    const x3 = cx + r * Math.cos(endAngle),   y3 = cy + r * Math.sin(endAngle);
    const x4 = cx + r * Math.cos(startAngle), y4 = cy + r * Math.sin(startAngle);
    const lg = sweep > Math.PI ? 1 : 0;
    return `M${x1} ${y1} A${R} ${R} 0 ${lg} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${lg} 0 ${x4} ${y4}Z`;
  };

  let start = -Math.PI / 2;
  const paths = total === 0 ? null : segments.map(({ count, fill }, i) => {
    if (count <= 0) { start += 0; return null; }
    const ratio = count / total;
    const sweep = ratio * 2 * Math.PI - gap;
    const d = arcPath(start, sweep);
    start += ratio * 2 * Math.PI;
    return <path key={i} d={d} fill={fill} />;
  });

  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      {total === 0
        ? <circle cx={cx} cy={cy} r={R} style={{ fill: 'rgb(var(--bdr-rgb))' }} />
        : paths}
      <circle cx={cx} cy={cy} r={r} style={{ fill: 'rgb(var(--surface-rgb))' }} />
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fill: 'rgb(var(--text-rgb))' }} fontSize="22" fontWeight="bold">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" style={{ fill: 'rgb(var(--hint-rgb))' }} fontSize="10">{label}</text>
    </svg>
  );
}

function calcTeamMatchStats(matches: Match[], teamId: string, homeOnly?: boolean) {
  let played = 0, won = 0, drawn = 0, lost = 0, goalsFor = 0, goalsAgainst = 0;
  for (const m of matches) {
    if (m.status.toLowerCase() !== 'completed' || m.homeScore == null || m.awayScore == null) continue;
    const isHome = m.homeTeamId === teamId;
    if (homeOnly === true && !isHome) continue;
    if (homeOnly === false && isHome) continue;
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    played++; goalsFor += gf; goalsAgainst += ga;
    if (gf > ga) won++; else if (gf === ga) drawn++; else lost++;
  }
  return { played, won, drawn, lost, goalsFor, goalsAgainst, points: won * 3 + drawn };
}

// ── Team Detail Modal ─────────────────────────────────────────────────────────

function TeamDetail({ teamId, matches, teams, locale, onClose, onTeamClick, compTitle }: { teamId: string; matches: Match[]; teams: Team[]; locale: string; onClose: () => void; onTeamClick?: (id: string) => void; compTitle?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [statsSub, setStatsSub] = useState(0);
  const team = teams.find(t => t.id === teamId);
  const isAr = locale === 'ar';
  const teamMatches = useMemo(() => matches.filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId), [matches, teamId]);
  const [playerModal, setPlayerModal] = useState<{ name: string; count: number; statType: StatType } | null>(null);

  const scorers  = useMemo(() => aggregateTeamPlayers(teamMatches, teamId, true),  [teamMatches, teamId]);
  const assists  = useMemo(() => aggregateTeamPlayers(teamMatches, teamId, false), [teamMatches, teamId]);
  const allStats  = useMemo(() => calcTeamMatchStats(teamMatches, teamId),          [teamMatches, teamId]);
  const homeStats = useMemo(() => calcTeamMatchStats(teamMatches, teamId, true),    [teamMatches, teamId]);
  const awayStats = useMemo(() => calcTeamMatchStats(teamMatches, teamId, false),   [teamMatches, teamId]);

  if (!team) return null;

  const tabs = [
    { label: isAr ? 'معلومات' : 'Info',      icon: 'ℹ️' },
    { label: isAr ? 'لاعبون'  : 'Squad',     icon: '👥' },
    { label: isAr ? 'مباريات' : 'Matches',   icon: '⚽' },
    { label: isAr ? 'الهدافون': 'Scorers',   icon: '🥅' },
    { label: isAr ? 'صناعة'   : 'Assists',   icon: '🎯' },
    { label: isAr ? 'إحصائيات': 'Stats',     icon: '📊' },
  ];

  const PositionSection = ({ emoji, label, names }: { emoji: string; label: string; names: string[] }) => (
    <div className="bg-cardBg border border-bdr rounded-xl overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-bdr">
        <span className="text-aqua font-bold text-sm">{emoji} {label}</span>
      </div>
      {names.map((n, i) => (
        <div key={i} className={`px-4 py-2.5 flex items-center gap-2 ${i < names.length - 1 ? 'border-b border-bdr/40' : ''}`}>
          <span className="text-aqua text-xs">›</span>
          <span className="text-text text-sm">{n}</span>
        </div>
      ))}
    </div>
  );

  // Club is the identity; the team's second name sits beneath it.
  const { primary, alias } = teamNameLines(team, locale);

  return (
    <div className="fixed inset-0 z-[200] bg-darkBg flex flex-col">
      <div className="flex items-center bg-cardBg border-b border-bdr px-4 py-3 gap-3">
        <button onClick={onClose} className="text-aqua text-xl font-bold">✕</button>
        <div className="flex-1 min-w-0">
          <span className="block text-aqua font-bold text-sm truncate">{primary}</span>
          {compTitle && <span className="block text-hint text-[11px] truncate">{compTitle}</span>}
        </div>
      </div>

      <div className="relative bg-gradient-to-b from-cardBg to-cardBg2 border-b border-bdr p-4 overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-[radial-gradient(circle,rgb(var(--accent-rgb)/0.12),transparent_65%)] pointer-events-none" />
        <button disabled={!team.clubId} onClick={() => team.clubId && router.push(`/club?id=${team.clubId}`)}
          className="relative w-full flex items-center gap-4 text-start disabled:cursor-default">
          {team.logo && <img src={team.logo} alt={primary} className="w-16 h-16 object-contain rounded-xl drop-shadow-lg" />}
          <div>
            <p className="text-aqua font-extrabold text-lg">{primary}</p>
            {alias && <p className="text-text text-sm">{alias}</p>}
            {team.group && <p className="text-teal text-sm">{localize(team.group, locale)}</p>}
            {team.city && <p className="text-hint text-xs flex items-center gap-1">📍 {localize(team.city, locale)}</p>}
            {team.clubId && <p className="text-aqua text-[11px] mt-1">{isAr ? 'صفحة النادي ›' : 'Club page ›'}</p>}
          </div>
        </button>
      </div>

      <TabStrip tabs={tabs} current={tab} onChange={setTab} />

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 0 && (
          <div className="space-y-2">
            {team.staff && team.staff.length > 0 && (
              <div className="bg-cardBg border border-bdr rounded-xl p-4 space-y-2">
                <p className="text-aqua font-bold text-xs">👔 {isAr ? 'الجهاز الفني' : 'Coaching Staff'}</p>
                {team.staff.map(s => (
                  <button key={s.id} onClick={() => router.push(`/coach?id=${s.id}`)}
                    className="w-full flex items-center gap-2 text-start active:opacity-70">
                    <span className="text-aqua text-xs">›</span>
                    <span className="flex-1 text-text text-sm truncate">{localize(s.name, locale)}</span>
                    {localize(s.role, locale) && <span className="text-hint text-[11px] flex-shrink-0">{localize(s.role, locale)}</span>}
                  </button>
                ))}
              </div>
            )}
            {team.information && (
              <div className="bg-cardBg border border-bdr rounded-xl p-4">
                <p className="text-text text-sm leading-relaxed">{team.information}</p>
              </div>
            )}
            {team.field && (
              <div className="bg-cardBg border border-bdr rounded-xl p-4 flex items-center gap-3">
                <span className="text-2xl">🏟️</span>
                <div className="flex-1">
                  <p className="text-hint text-xs mb-0.5">{isAr ? 'الملعب' : 'Field'}</p>
                  {safeUrl(team.fieldurl) ? (
                    <a href={safeUrl(team.fieldurl)} target="_blank" rel="noopener noreferrer" className="text-aqua text-sm underline">{team.field}</a>
                  ) : (
                    <p className="text-text text-sm">{team.field}</p>
                  )}
                </div>
              </div>
            )}
            {team.pointDeduction > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-hint text-xs mb-0.5">{isAr ? 'خصم النقاط' : 'Point Deduction'}</p>
                  <p className="text-red-400 text-sm font-bold">-{team.pointDeduction}</p>
                </div>
              </div>
            )}
            {!team.information && !team.field && team.pointDeduction === 0 && (!team.staff || team.staff.length === 0) && <p className="text-center text-hint py-8">{isAr ? 'لا توجد بيانات' : 'No info'}</p>}
          </div>
        )}

        {tab === 1 && (
          (team.roster && team.roster.length > 0) ? (
            <div className="space-y-5">
              {groupRosterByPosition(team.roster, locale).map(sec => (
                <div key={sec.label}>
                  <p className="text-teal text-[11px] font-bold mb-2">
                    {sec.label} <span className="text-hint font-normal">({sec.players.length})</span>
                  </p>
                  <div className="space-y-2">
                    {sec.players.map(r => (
                      <button key={r.id} onClick={() => router.push(`/player?id=${r.id}`)}
                        className="w-full flex items-center gap-3 bg-cardBg border border-bdr rounded-xl px-3 py-2.5 text-start hover:border-aqua/40 transition-colors">
                        {r.photo
                          ? <img src={r.photo} alt="" className="w-10 h-10 rounded-full object-cover bg-darkBg flex-shrink-0" />
                          : <div className="w-10 h-10 rounded-full bg-darkBg grid place-items-center flex-shrink-0">👤</div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-text text-sm font-bold truncate">{localize(r.name, locale)}</p>
                          <p className="text-hint text-[11px] truncate">{[localize(r.position, locale), r.birthYear || ''].filter(Boolean).join(' · ')}</p>
                        </div>
                        <JerseyNumber shirt={r.shirt} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : team.players ? (
            <>
              {team.players.coach.length > 0 && <PositionSection emoji="🧑‍💼" label={isAr ? 'المدرب' : 'Coach'} names={team.players.coach} />}
              {team.players.goalkeepers.length > 0 && <PositionSection emoji="🧤" label={isAr ? 'الحراس' : 'GK'} names={team.players.goalkeepers} />}
              {team.players.defenders.length > 0 && <PositionSection emoji="🛡️" label={isAr ? 'المدافعون' : 'Defenders'} names={team.players.defenders} />}
              {team.players.midfielders.length > 0 && <PositionSection emoji="⚡" label={isAr ? 'الوسط' : 'Midfielders'} names={team.players.midfielders} />}
              {team.players.attackers.length > 0 && <PositionSection emoji="⚽" label={isAr ? 'المهاجمون' : 'Attackers'} names={team.players.attackers} />}
            </>
          ) : (
            <p className="text-center text-hint py-8">{isAr ? 'لا توجد قائمة' : 'No squad'}</p>
          )
        )}

        {tab === 2 && (
          <div className="space-y-2">
            {teamMatches.length === 0
              ? <p className="text-center text-hint py-8">{isAr ? 'لا توجد مباريات' : 'No matches'}</p>
              : [...teamMatches].sort((a, b) => a.date.localeCompare(b.date)).map(m => (
                  <MatchCard key={m.id} match={m}
                    homeTeam={teams.find(t => t.id === m.homeTeamId)}
                    awayTeam={teams.find(t => t.id === m.awayTeamId)}
                    locale={locale} onClick={() => router.push(`/match?id=${m.id}`)} />
                ))}
          </div>
        )}

        {/* Scorers */}
        {tab === 3 && (
          <>
            {playerModal && (
              <PlayerMatchesModal
                playerName={playerModal.name} teamId={teamId} teamName={localize(team?.name, locale)}
                totalCount={playerModal.count} matches={teamMatches} teams={teams}
                locale={locale} unit={isAr ? 'هدف' : 'Goal'} statType={playerModal.statType}
                onClose={() => setPlayerModal(null)}
              />
            )}
            <div className="space-y-2">
              {scorers.length === 0
                ? <p className="text-center text-hint py-8">{isAr ? 'لا توجد إحصائيات' : 'No stats yet'}</p>
                : scorers.map((s, i) => (
                  <div key={i} onClick={() => setPlayerModal({ name: s.name, count: s.count, statType: 'scorers' })}
                    className={`bg-cardBg border rounded-xl px-3 py-2.5 flex items-center gap-3 cursor-pointer active:opacity-70 ${i === 0 ? 'border-yellow-400/40' : i === 1 ? 'border-gray-400/30' : i === 2 ? 'border-amber-700/30' : 'border-bdr'}`}>
                    <span className={`w-7 text-center font-bold ${i < 3 ? 'text-lg' : 'text-hint text-sm'}`}>{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span>
                    <span className="text-hint">🥅</span>
                    <span className="flex-1 text-text text-sm">{s.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="bg-aqua/10 text-aqua text-sm font-bold px-3 py-1 rounded-lg">{s.count} {isAr ? 'هدف' : 'Goal'}</span>
                      <span className="text-hint text-xs">›</span>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}

        {/* Assists */}
        {tab === 4 && (
          <>
            {playerModal && (
              <PlayerMatchesModal
                playerName={playerModal.name} teamId={teamId} teamName={localize(team?.name, locale)}
                totalCount={playerModal.count} matches={teamMatches} teams={teams}
                locale={locale} unit={isAr ? 'صناعة' : 'Assist'} statType={playerModal.statType}
                onClose={() => setPlayerModal(null)}
              />
            )}
            <div className="space-y-2">
              {assists.length === 0
                ? <p className="text-center text-hint py-8">{isAr ? 'لا توجد إحصائيات' : 'No stats yet'}</p>
                : assists.map((s, i) => (
                  <div key={i} onClick={() => setPlayerModal({ name: s.name, count: s.count, statType: 'assists' })}
                    className={`bg-cardBg border rounded-xl px-3 py-2.5 flex items-center gap-3 cursor-pointer active:opacity-70 ${i === 0 ? 'border-yellow-400/40' : i === 1 ? 'border-gray-400/30' : i === 2 ? 'border-amber-700/30' : 'border-bdr'}`}>
                    <span className={`w-7 text-center font-bold ${i < 3 ? 'text-lg' : 'text-hint text-sm'}`}>{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span>
                    <span className="text-hint">🎯</span>
                    <span className="flex-1 text-text text-sm">{s.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="bg-aqua/10 text-aqua text-sm font-bold px-3 py-1 rounded-lg">{s.count} {isAr ? 'صناعة' : 'Assist'}</span>
                      <span className="text-hint text-xs">›</span>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}

        {/* Statistics */}
        {tab === 5 && (() => {
          const subLabels = [isAr ? 'الكل' : 'All', isAr ? 'ديار' : 'Home', isAr ? 'ضيف' : 'Away'];
          const s = [allStats, homeStats, awayStats][statsSub];
          const pct = (v: number) => s.played === 0 ? '0%' : `${Math.round(v / s.played * 100)}%`;
          const maxGoals = Math.max(s.goalsFor, s.goalsAgainst, 1);
          return (
            <div className="-mx-3 -mt-3">
              {/* Sub-tab strip */}
              <div className="flex gap-2 p-3 bg-darkBg">
                {subLabels.map((l, i) => (
                  <button key={i} onClick={() => setStatsSub(i)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${statsSub === i ? 'bg-aqua/15 border-aqua text-aqua font-bold' : 'border-bdr text-hint'}`}>
                    {l}
                  </button>
                ))}
              </div>

              {s.played === 0
                ? <p className="text-center text-hint py-8">{isAr ? 'لا توجد بيانات' : 'No data'}</p>
                : <div className="p-3 space-y-3">
                    {/* Match results card */}
                    <div className="bg-cardBg border border-bdr rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-aqua font-bold text-sm">{isAr ? 'نتائج المباريات' : 'Match Results'}</span>
                        <span className="bg-darkBg border border-bdr rounded-full px-3 py-0.5 text-teal text-xs">{isAr ? `المباريات: ${s.played}` : `Matches: ${s.played}`}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <DonutChart won={s.won} drawn={s.drawn} lost={s.lost} label={isAr ? 'مباراة' : 'matches'} />
                        <div className="flex-1 space-y-3">
                          {[
                            { label: isAr ? 'فوز'   : 'Won',  count: s.won,   dot: 'bg-green-500',  text: 'text-green-400' },
                            { label: isAr ? 'تعادل' : 'Draw', count: s.drawn, dot: 'bg-yellow-400', text: 'text-yellow-400' },
                            { label: isAr ? 'خسارة' : 'Lost', count: s.lost,  dot: 'bg-red-500',    text: 'text-red-400' },
                          ].map(({ label, count, dot, text }) => (
                            <div key={label} className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${dot}`} />
                              <span className="flex-1 text-text text-sm">{label}</span>
                              <span className={`font-bold text-sm ${text}`}>{count}</span>
                              <span className="text-hint text-xs w-8 text-end">{pct(count)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-bdr flex justify-center gap-6">
                        <div className="text-center">
                          <p className="text-aqua font-bold text-xl">{s.points}</p>
                          <p className="text-hint text-xs">{isAr ? 'نقاط' : 'Pts'}</p>
                        </div>
                        <div className="w-px bg-bdr" />
                        <div className="text-center">
                          <p className="text-text font-bold text-xl">{s.goalsFor - s.goalsAgainst > 0 ? '+' : ''}{s.goalsFor - s.goalsAgainst}</p>
                          <p className="text-hint text-xs">{isAr ? 'فارق' : 'GD'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Goals card */}
                    <div className="bg-cardBg border border-bdr rounded-xl p-4">
                      <p className="text-aqua font-bold text-sm mb-4">{isAr ? 'الأهداف' : 'Goals'}</p>
                      {[
                        { emoji: '⚽', label: isAr ? 'أهداف مسجلة' : 'Goals Scored',    count: s.goalsFor,      hex: '#22c55e', rate: s.played > 0 ? (s.goalsFor      / s.played).toFixed(1) : '0.0' },
                        { emoji: '🥅', label: isAr ? 'أهداف مستقبلة' : 'Goals Conceded', count: s.goalsAgainst, hex: '#ef4444', rate: s.played > 0 ? (s.goalsAgainst / s.played).toFixed(1) : '0.0' },
                      ].map(({ emoji, label, count, hex, rate }) => (
                        <div key={label} className="mb-4 last:mb-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span>{emoji}</span>
                            <span className="flex-1 text-text text-sm">{label}</span>
                            <span className="font-bold text-xl" style={{ color: hex }}>{count}</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ backgroundColor: 'rgb(var(--bg-rgb))' }}>
                            <div className="h-full rounded-full" style={{ width: `${(count / maxGoals) * 100}%`, backgroundColor: hex }} />
                          </div>
                          <p className="text-hint text-xs">{rate} {isAr ? 'لكل مباراة' : 'per match'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
              }
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

import { Suspense } from 'react';

// The main tabs, serialized to the URL by name (not array index) so a shared
// link says what it points at and survives the tabs being reordered. Legacy
// numeric links (?tab=1) are still accepted on read for backward compatibility.
const TAB_SLUGS = ['matches', 'standings', 'teams', 'stats'] as const;

function tabIndexFromParam(raw: string | null): number {
  if (!raw) return 0;
  const named = (TAB_SLUGS as readonly string[]).indexOf(raw.toLowerCase());
  if (named >= 0) return named;
  const n = Number(raw); // legacy ?tab=1|2|3
  return Number.isInteger(n) && n >= 0 && n < TAB_SLUGS.length ? n : 0;
}

function CompetitionPageInner() {
  const params = useSearchParams();
  const router  = useRouter();
  const { competition, compLoading, compError, compTitle, loadCompetition, refreshCompetition, locale } = useApp();
  // The tab and the open team live in the URL, so a competition view can be
  // shared and reopened exactly (e.g. ?url=...&tab=2&team=t001).
  const mainTab = tabIndexFromParam(params.get('tab'));
  const teamDetail = params.get('team');
  const setView = (patch: { tab?: number; team?: string | null }) => {
    const p = new URLSearchParams(params.toString());
    if ('tab' in patch && patch.tab != null) p.set('tab', TAB_SLUGS[patch.tab]);
    if ('team' in patch) { if (patch.team) p.set('team', patch.team); else p.delete('team'); }
    router.replace(`/competition?${p.toString()}`, { scroll: false });
  };

  // Keep the tab named in the URL: fill in the default (?id=29 → &tab=matches)
  // and upgrade any legacy numeric ?tab=1 to its slug, so every URL names its
  // tab. Only runs once there's a competition to show, and is idempotent.
  useEffect(() => {
    if (!params.get('id') && !params.get('url')) return;
    const raw = params.get('tab');
    const canonical = TAB_SLUGS[tabIndexFromParam(raw)];
    if (raw !== canonical) {
      const p = new URLSearchParams(params.toString());
      p.set('tab', canonical);
      router.replace(`/competition?${p.toString()}`, { scroll: false });
    }
  }, [params, router]);

  // The sticky header (title bar + main tabs) can grow with the safe-area inset
  // and font, so its height is measured rather than assumed — the per-tab second
  // row pins directly beneath it.
  const [headEl, setHeadEl] = useState<HTMLDivElement | null>(null);
  const [headH, setHeadH] = useState(0);
  useEffect(() => {
    if (!headEl) return;
    const measure = () => setHeadH(headEl.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(headEl);
    return () => ro.disconnect();
  }, [headEl]);

  // A competition is opened by id (?id=3) — the compact, shareable form. The
  // data URL is derived from it; the older ?url=&titleAr=&titleEn= links still
  // work for backward compatibility.
  const idParam  = params.get('id')      ?? '';
  const url      = idParam ? competitionDataUrl(idParam) : (params.get('url') ?? '');
  const rawTitle = params.get('title')   ?? '';
  const titleAr  = params.get('titleAr') ?? '';
  const titleEn  = params.get('titleEn') ?? '';

  // Localize the heading reactively so it follows the language toggle. Prefer a
  // title passed in the URL (legacy links); otherwise use the one the loaded
  // data blob carries, so an ?id= link needs no title in the URL.
  const metaTitle = competition?.competition ? localize(competition.competition.title, locale) : '';
  const title = (titleAr || titleEn)
    ? (localize({ ar: titleAr, en: titleEn }, locale) || rawTitle)
    : (rawTitle || metaTitle);

  useEffect(() => {
    if (url) loadCompetition(url, rawTitle);
  }, [url, rawTitle, loadCompetition]);

  const isAr = locale === 'ar';

  const mainTabs = [
    { label: isAr ? 'المباريات' : 'Matches',   icon: '⚽' },
    { label: isAr ? 'الترتيب'  : 'Standings',  icon: '📊' },
    { label: isAr ? 'الفرق'    : 'Teams',       icon: '👕' },
    { label: isAr ? 'إحصائيات' : 'Stats',       icon: '📈' },
  ];

  if (compLoading && !competition) return (
    <>
      <AppBar title={title || compTitle} back />
      <Spinner label={isAr ? 'جاري التحميل...' : 'Loading...'} />
    </>
  );

  if (compError) return (
    <>
      <AppBar title={title} back />
      <div className="p-6 text-center space-y-4">
        <p className="text-red-400 text-sm">{compError}</p>
        <button onClick={refreshCompetition} className="bg-aqua text-on-accent font-bold px-6 py-2 rounded-xl">
          {isAr ? 'إعادة المحاولة' : 'Retry'}
        </button>
      </div>
    </>
  );

  if (!competition) return null;

  const { matches, teams } = competition;

  return (
    <>
      <div ref={setHeadEl} className="sticky top-[var(--header-h,0px)] z-40">
        <AppBar title={title || compTitle} back embedded
          actions={idParam ? <FollowButton competitionId={idParam} /> : undefined} />
        <TabStrip tabs={mainTabs} current={mainTab} onChange={i => {
          // Switch the tab without letting the router jump (scroll:false), then
          // reset to the top ourselves — otherwise the new tab opens scrolled to
          // wherever the previous one was left.
          setView({ tab: i });
          if (i !== mainTab) window.scrollTo({ top: 0 });
        }} />
      </div>

      {mainTab === 0 && <MatchesTab matches={matches} teams={teams} locale={locale} onMatchClick={id => router.push(`/match?id=${id}`)} stickyTop={headH} />}
      {mainTab === 1 && <StandingsTab matches={matches} teams={teams} locale={locale} onTeamClick={t => setView({ team: t })} serverStandings={competition.standings} />}
      {mainTab === 2 && <TeamsTab teams={teams} locale={locale} onTeamClick={t => setView({ team: t })} />}
      {mainTab === 3 && <StatsTab matches={matches} teams={teams} locale={locale} stickyTop={headH} />}

      {teamDetail && (
        <TeamDetail teamId={teamDetail} matches={matches} teams={teams} locale={locale} compTitle={title} onClose={() => setView({ team: null })} onTeamClick={t => setView({ team: t })} />
      )}
    </>
  );
}

export default function CompetitionPage() {
  return (
    <Suspense fallback={<Spinner label="Loading..." />}>
      <CompetitionPageInner />
    </Suspense>
  );
}
