'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
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
import { formatMatchDate } from '@/lib/utils';
import MatchRow from '@/components/tla3bny/MatchRow';
import StandingsTable from '@/components/tla3bny/StandingsTable';
import CompetitionInfo from '@/components/tla3bny/CompetitionInfo';
import NewsList from '@/components/tla3bny/NewsList';
import { Card, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

type Tab = 'standings' | 'matches' | 'stats' | 'bracket' | 'news' | 'info';

function CompetitionsContent() {
  const tt = useTT();
  const params = useSearchParams();
  const [seasons, setSeasons] = useState<TSeason[]>([]);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [comps, setComps] = useState<TCompetition[]>([]);
  const [comp, setComp] = useState<TCompetition | null>(null);
  const [ageId, setAgeId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('standings');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tSeasons().then(ss => {
      setSeasons(ss);
      const initial = Number(params.get('season')) || ss.find(s => s.is_active)?.id || ss[0]?.id || null;
      setSeasonId(initial);
    }).catch(() => setSeasons([])).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (seasonId == null) { setComps([]); return; }
    tCompetitions(seasonId).then(setComps).catch(() => setComps([]));
  }, [seasonId]);

  const openComp = useCallback((id: number) => {
    tCompetition(id).then(c => {
      setComp(c);
      setAgeId(c.ages?.[0]?.age_category_id ?? null);
      setTab('standings');
    });
  }, []);

  useEffect(() => {
    const q = Number(params.get('comp'));
    if (q) openComp(q);
  }, [params, openComp]);

  if (loading) return <Spinner />;

  // ── competition open: drill-down view ──
  if (comp) {
    return (
      <div className="space-y-4">
        <button onClick={() => setComp(null)} className="text-sm text-hint hover:text-aqua">← {tt('كل البطولات', 'All competitions')}</button>
        <Card className="p-4 flex items-center gap-3">
          <LogoAvatar src={comp.logo_path} name={comp.name} size={52} />
          <div className="min-w-0">
            <h1 className="text-lg font-black text-text">{comp.name}</h1>
            <p className="text-[11px] text-hint">{[comp.season_name, comp.location].filter(Boolean).join(' · ')}</p>
          </div>
        </Card>

        {/* age tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {(comp.ages ?? []).map(a => (
            <button key={a.id} onClick={() => setAgeId(a.age_category_id)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap border transition-colors ${
                ageId === a.age_category_id ? 'bg-aqua text-on-accent border-aqua' : 'bg-cardBg2 text-teal border-bdr'}`}>
              {a.age_category}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
          {(['standings', 'matches', 'stats', 'bracket', 'news', 'info'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t ? 'border-aqua text-aqua' : 'border-transparent text-teal hover:text-text'}`}>
              {tt(
                { standings: 'الترتيب', matches: 'المباريات', stats: 'الإحصائيات', bracket: 'الأدوار', news: 'الأخبار', info: 'عن البطولة' }[t],
                { standings: 'Table', matches: 'Matches', stats: 'Stats', bracket: 'Bracket', news: 'News', info: 'About' }[t],
              )}
            </button>
          ))}
        </div>

        {/* The info page and the news feed are about the whole competition, so
            they do not wait on an age being picked. */}
        {tab === 'info' ? <CompetitionInfo comp={comp} />
          : tab === 'news' ? <NewsList compId={comp.id} />
          : ageId == null
            ? <EmptyState icon="⚽" text={tt('لا فئات في هذه البطولة', 'No ages in this competition')} />
            : <TabBody comp={comp} ageId={ageId} tab={tab} />}
      </div>
    );
  }

  // ── competition list ──
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-text">{tt('البطولات', 'Competitions')}</h1>
      {seasons.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {seasons.map(s => (
            <button key={s.id} onClick={() => setSeasonId(s.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap border ${
                seasonId === s.id ? 'bg-aqua text-on-accent border-aqua' : 'bg-cardBg2 text-teal border-bdr'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {comps.length === 0 ? (
        <EmptyState icon="🏆" text={tt('لا بطولات في هذا الموسم', 'No competitions this season')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {comps.map(c => (
            <button key={c.id} onClick={() => openComp(c.id)} className="text-start">
              <Card className="p-3 flex items-center gap-3 hover:border-aqua/50 transition-colors">
                <LogoAvatar src={c.logo_path} name={c.name} size={44} />
                <div className="min-w-0">
                  <div className="font-bold text-text truncate">{c.name}</div>
                  <div className="text-[11px] text-hint">{(c.ages ?? []).map(a => a.age_category).join(' · ')}</div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TabBody({ comp, ageId, tab }: { comp: TCompetition; ageId: number; tab: Tab }) {
  if (tab === 'standings') return <StandingsTab compId={comp.id} ageId={ageId} />;
  if (tab === 'matches') return <MatchesTab compId={comp.id} ageId={ageId} />;
  if (tab === 'stats') return <StatsTab compId={comp.id} ageId={ageId} />;
  return <BracketTab compId={comp.id} ageId={ageId} />;
}

function StandingsTab({ compId, ageId }: { compId: number; ageId: number }) {
  const tt = useTT();
  const [groups, setGroups] = useState<TStandingGroup[] | null>(null);
  useEffect(() => { setGroups(null); tStandings(compId, ageId).then(setGroups).catch(() => setGroups([])); }, [compId, ageId]);
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

/** Matches grouped by date, newest block first — the youthscores match list. */
function MatchesTab({ compId, ageId }: { compId: number; ageId: number }) {
  const tt = useTT();
  const { locale } = useApp();
  const [matches, setMatches] = useState<TMatch[] | null>(null);
  useEffect(() => { setMatches(null); tMatches({ competition_id: compId, age_category_id: ageId }).then(setMatches).catch(() => setMatches([])); }, [compId, ageId]);
  if (!matches) return <Spinner />;
  if (matches.length === 0) return <EmptyState icon="📅" text={tt('لا مباريات', 'No matches')} />;

  const days: { date: string | null; matches: TMatch[] }[] = [];
  for (const m of matches) {
    const last = days[days.length - 1];
    if (last && last.date === m.date) last.matches.push(m);
    else days.push({ date: m.date, matches: [m] });
  }

  return (
    <div className="space-y-5">
      {days.map((d, i) => (
        <div key={d.date ?? `tbd-${i}`} className="space-y-2">
          <div className="flex items-center gap-2 py-1">
            <span className="text-aqua">📅</span>
            <h3 className="font-bold text-sm text-text">
              {d.date ? formatMatchDate(d.date, locale) : tt('لم تحدد', 'Date TBD')}
            </h3>
            <span className="flex-1 h-px bg-bdr" />
          </div>
          {d.matches.map(m => <MatchRow key={m.id} m={m} />)}
        </div>
      ))}
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

/** One headline number, in the youthscores stat-tile style. */
function StatTile({ label, value, tone = 'text-aqua' }: { label: string; value: number | string; tone?: string }) {
  return (
    <Card className="p-3 text-center">
      <div className={`text-2xl font-black tnum ${tone}`}>{value}</div>
      <div className="text-[11px] text-hint mt-0.5">{label}</div>
    </Card>
  );
}

function StatsTab({ compId, ageId }: { compId: number; ageId: number }) {
  const tt = useTT();
  const [a, setA] = useState<TAnalysis | null>(null);
  const [matches, setMatches] = useState<TMatch[] | null>(null);
  useEffect(() => {
    setA(null); setMatches(null);
    tAnalysis(compId, ageId).then(setA).catch(() => setA(null));
    tMatches({ competition_id: compId, age_category_id: ageId }).then(setMatches).catch(() => setMatches([]));
  }, [compId, ageId]);
  if (!a || !matches) return <Spinner />;

  const played = matches.filter(m => m.status === 'finished');
  const goals = played.reduce((sum, m) => sum + (m.home_score ?? 0) + (m.away_score ?? 0), 0);
  const avg = played.length ? (goals / played.length).toFixed(1) : '0.0';
  const cards = a.yellow_cards.reduce((s, r) => s + r.count, 0) + a.red_cards.reduce((s, r) => s + r.count, 0);
  const empty = played.length === 0 && a.top_scorers.length === 0;
  if (empty) return <EmptyState icon="⚽" text={tt('لا إحصائيات بعد', 'No stats yet')} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label={tt('مباريات لعبت', 'Matches played')} value={played.length} />
        <StatTile label={tt('أهداف', 'Goals')} value={goals} tone="text-gold" />
        <StatTile label={tt('معدل الأهداف', 'Goals per match')} value={avg} />
        <StatTile label={tt('بطاقات', 'Cards')} value={cards} tone="text-loss" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Board icon="⚽" title={tt('الهدافون', 'Top scorers')} rows={a.top_scorers} unitClass="text-gold" />
        <Board icon="🅰️" title={tt('صناع الأهداف', 'Top assists')} rows={a.top_assisters} />
        <Board icon="🟨" title={tt('البطاقات الصفراء', 'Yellow cards')} rows={a.yellow_cards} unitClass="text-gold" />
        <Board icon="🟥" title={tt('البطاقات الحمراء', 'Red cards')} rows={a.red_cards} unitClass="text-loss" />
      </div>
    </div>
  );
}

function BracketTab({ compId, ageId }: { compId: number; ageId: number }) {
  const tt = useTT();
  const [stages, setStages] = useState<TBracketStage[] | null>(null);
  useEffect(() => { setStages(null); tBracket(compId, ageId).then(setStages).catch(() => setStages([])); }, [compId, ageId]);
  if (!stages) return <Spinner />;
  if (stages.length === 0) return <EmptyState icon="🏆" text={tt('لا أدوار إقصائية', 'No knockout stages')} />;
  return (
    <div className="space-y-5">
      {stages.map(s => (
        <div key={s.stage_id}>
          {s.stage_name && <h3 className="font-black text-text mb-2">{s.stage_name}</h3>}
          {s.rounds.map((r, i) => (
            <div key={i} className="mb-3">
              {r.round && <div className="text-[11px] font-bold text-teal mb-1">{r.round}</div>}
              <div className="space-y-2">{r.matches.map(m => <MatchRow key={m.id} m={m} />)}</div>
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
