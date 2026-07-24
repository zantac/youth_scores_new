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
import MatchRow from '@/components/tla3bny/MatchRow';
import { Card, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

type Tab = 'standings' | 'matches' | 'stats' | 'bracket' | 'news';

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
          <div>
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

        {ageId == null ? (
          <EmptyState icon="⚽" text={tt('لا فئات في هذه البطولة', 'No ages in this competition')} />
        ) : (
          <>
            <div className="flex items-center gap-1 border-b border-bdr">
              {(['standings', 'matches', 'stats', 'bracket', 'news'] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${
                    tab === t ? 'border-aqua text-aqua' : 'border-transparent text-teal hover:text-text'}`}>
                  {tt(
                    { standings: 'الترتيب', matches: 'المباريات', stats: 'الهدافون', bracket: 'الأدوار', news: 'الأخبار' }[t],
                    { standings: 'Table', matches: 'Matches', stats: 'Stats', bracket: 'Bracket', news: 'News' }[t],
                  )}
                </button>
              ))}
            </div>
            <TabBody comp={comp} ageId={ageId} tab={tab} />
          </>
        )}
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
  if (tab === 'bracket') return <BracketTab compId={comp.id} ageId={ageId} />;
  return <NewsTab compId={comp.id} />;
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
        <div key={g.group?.id ?? i}>
          {g.group?.name && <h3 className="font-black text-text mb-1">{g.group.name}</h3>}
          <Card className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-[11px] text-hint border-b border-bdr">
                  <th className="text-start p-2">#</th>
                  <th className="text-start p-2">{tt('الفريق', 'Team')}</th>
                  <th className="p-2 tnum">{tt('لعب', 'P')}</th>
                  <th className="p-2 tnum">{tt('ف', 'W')}</th>
                  <th className="p-2 tnum">{tt('ت', 'D')}</th>
                  <th className="p-2 tnum">{tt('خ', 'L')}</th>
                  <th className="p-2 tnum">{tt('+/-', 'GD')}</th>
                  <th className="p-2 tnum font-black">{tt('نقاط', 'Pts')}</th>
                </tr>
              </thead>
              <tbody>
                {g.standings.map(r => (
                  <tr key={r.team_id} className="border-b border-bdr/50">
                    <td className="p-2 text-hint tnum">{r.rank}</td>
                    <td className="p-2">
                      <Link href={`/team?id=${r.team_id}`} className="flex items-center gap-2 hover:text-aqua">
                        <LogoAvatar src={r.academy_logo} name={r.team_name} size={22} />
                        <span className="font-bold text-text truncate">{r.team_name}</span>
                      </Link>
                    </td>
                    <td className="p-2 text-center tnum">{r.P}</td>
                    <td className="p-2 text-center tnum">{r.W}</td>
                    <td className="p-2 text-center tnum">{r.D}</td>
                    <td className="p-2 text-center tnum">{r.L}</td>
                    <td className="p-2 text-center tnum">{r.GD}</td>
                    <td className="p-2 text-center tnum font-black text-text">{r.Pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ))}
    </div>
  );
}

function MatchesTab({ compId, ageId }: { compId: number; ageId: number }) {
  const tt = useTT();
  const [matches, setMatches] = useState<TMatch[] | null>(null);
  useEffect(() => { setMatches(null); tMatches({ competition_id: compId, age_category_id: ageId }).then(setMatches).catch(() => setMatches([])); }, [compId, ageId]);
  if (!matches) return <Spinner />;
  if (matches.length === 0) return <EmptyState icon="📅" text={tt('لا مباريات', 'No matches')} />;
  return <div className="space-y-2">{matches.map(m => <MatchRow key={m.id} m={m} />)}</div>;
}

function Board({ title, rows }: { title: string; rows: TBoardRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="font-black text-text mb-2">{title}</h3>
      <div className="space-y-1.5">
        {rows.slice(0, 10).map((r, i) => (
          <Card key={r.player_id} className="p-2 flex items-center gap-3">
            <span className="w-5 text-center text-hint tnum text-sm">{i + 1}</span>
            <LogoAvatar src={r.photo_path} name={r.player_name} size={32} />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-text text-sm truncate">{r.player_name}</div>
              <div className="text-[11px] text-hint truncate">{r.team_name}</div>
            </div>
            <span className="font-black text-teal tnum">{r.count}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatsTab({ compId, ageId }: { compId: number; ageId: number }) {
  const tt = useTT();
  const [a, setA] = useState<TAnalysis | null>(null);
  useEffect(() => { setA(null); tAnalysis(compId, ageId).then(setA).catch(() => setA(null)); }, [compId, ageId]);
  if (!a) return <Spinner />;
  const empty = a.top_scorers.length === 0 && a.top_assisters.length === 0;
  if (empty) return <EmptyState icon="⚽" text={tt('لا إحصائيات بعد', 'No stats yet')} />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Board title={tt('الهدافون', 'Top scorers')} rows={a.top_scorers} />
      <Board title={tt('صناع الأهداف', 'Top assists')} rows={a.top_assisters} />
      <Board title={tt('البطاقات الصفراء', 'Yellow cards')} rows={a.yellow_cards} />
      <Board title={tt('البطاقات الحمراء', 'Red cards')} rows={a.red_cards} />
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

function NewsTab({ compId }: { compId: number }) {
  const tt = useTT();
  const [news, setNews] = useState<TNews[] | null>(null);
  useEffect(() => { setNews(null); tNews(compId).then(setNews).catch(() => setNews([])); }, [compId]);
  if (!news) return <Spinner />;
  if (news.length === 0) return <EmptyState icon="📰" text={tt('لا أخبار', 'No news')} />;
  return (
    <div className="space-y-2">
      {news.map(n => (
        <Card key={n.id} className="p-3">
          {mediaUrl(n.image_path) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(n.image_path)!} alt="" className="w-full h-40 object-cover rounded-xl border border-bdr mb-2" />
          )}
          <div className="font-bold text-text">{n.title}</div>
          {n.body && <p className="text-sm text-hint mt-1 whitespace-pre-line">{n.body}</p>}
        </Card>
      ))}
    </div>
  );
}

export default function CompetitionsPage() {
  return <Suspense fallback={<Spinner />}><CompetitionsContent /></Suspense>;
}
