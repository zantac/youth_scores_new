'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  tCompetition, tCategories, tAcademies, tAcademyTeams,
  tAddCompAge, tUpdateCompAge, tDeleteCompAge,
  tCompTeams, tRegisterTeam, tUnregisterTeam, tRoster,
  tApproveRosterPlayer, tRejectRosterPlayer,
  tMatches, tCreateMatch, tDeleteMatch, tEnterResult,
  tAddStage, tDeleteStage, tAddGroup, tAddGroupTeam,
  tNews, tCreateNews, tDeleteNews,
  type TCompetition, type TCompAge, type TCategory, type TAcademy, type TTeam,
  type TCompTeam, type TCompPlayer, type TMatch, type TNews,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import Spinner from '@/components/ui/Spinner';
import { Card, Field, inputCls, PrimaryButton, StatusBadge, EmptyState, useTT } from '@/components/tla3bny/kit';

type Tab = 'ages' | 'teams' | 'approvals' | 'matches' | 'stages' | 'news';

function ManageContent() {
  const tt = useTT();
  const params = useSearchParams();
  const router = useRouter();
  const compId = Number(params.get('comp'));
  const { user, token, loading, canAdminCompetition } = useTla3bnyAuth();
  const [comp, setComp] = useState<TCompetition | null>(null);
  const [tab, setTab] = useState<Tab>('ages');

  const reload = useCallback(() => { if (compId) tCompetition(compId).then(setComp).catch(() => setComp(null)); }, [compId]);
  useEffect(reload, [reload]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  if (loading || !user || !token) return <Spinner />;
  if (!compId || !canAdminCompetition(compId)) return <EmptyState icon="🔒" text={tt('غير مصرح', 'Not authorized')} />;
  if (!comp) return <Spinner />;

  const tabs: Tab[] = ['ages', 'teams', 'approvals', 'matches', 'stages', 'news'];
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-hint hover:text-aqua">← {tt('الإدارة', 'Admin')}</Link>
      <h1 className="text-xl font-black text-text">{comp.name}</h1>
      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt({ ages: 'الفئات', teams: 'الفرق', approvals: 'الاعتمادات', matches: 'المباريات', stages: 'الأدوار', news: 'الأخبار' }[t],
              { ages: 'Ages', teams: 'Teams', approvals: 'Approvals', matches: 'Matches', stages: 'Stages', news: 'News' }[t])}
          </button>
        ))}
      </div>
      {tab === 'ages' && <AgesTab token={token} comp={comp} reload={reload} />}
      {tab === 'teams' && <TeamsTab token={token} comp={comp} />}
      {tab === 'approvals' && <ApprovalsTab token={token} comp={comp} />}
      {tab === 'matches' && <MatchesTab token={token} comp={comp} />}
      {tab === 'stages' && <StagesTab token={token} comp={comp} reload={reload} />}
      {tab === 'news' && <NewsTab token={token} comp={comp} />}
    </div>
  );
}

const RULE_FIELDS: [keyof TCompAge, string, string][] = [
  ['max_players_per_team', 'قائمة الفريق', 'Squad list'],
  ['lineup_size', 'التشكيلة', 'Lineup'],
  ['players_on_pitch', 'الأساسيون', 'On pitch'],
  ['max_substitutes', 'البدلاء', 'Subs'],
  ['num_periods', 'الأشواط', 'Periods'],
  ['period_minutes', 'دقائق الشوط', 'Period min'],
  ['lineup_deadline_minutes', 'مهلة التشكيلة (د)', 'Lineup deadline'],
];

function AgesTab({ token, comp, reload }: { token: string; comp: TCompetition; reload: () => void }) {
  const tt = useTT();
  const [cats, setCats] = useState<TCategory[]>([]);
  const [ageId, setAgeId] = useState('');
  useEffect(() => { tCategories().then(setCats); }, []);
  const used = new Set((comp.ages ?? []).map(a => a.age_category_id));
  return (
    <div className="space-y-3">
      {(comp.ages ?? []).map(a => <AgeRuleCard key={a.id} token={token} age={a} reload={reload} />)}
      <Card className="p-3 flex items-end gap-2">
        <Field label={tt('إضافة فئة', 'Add age')}>
          <select value={ageId} onChange={e => setAgeId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {cats.filter(c => !used.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <PrimaryButton onClick={async () => { if (ageId) { await tAddCompAge(token, comp.id, { age_category_id: Number(ageId) }); setAgeId(''); reload(); } }} disabled={!ageId}>{tt('إضافة', 'Add')}</PrimaryButton>
      </Card>
    </div>
  );
}

function AgeRuleCard({ token, age, reload }: { token: string; age: TCompAge; reload: () => void }) {
  const tt = useTT();
  const [f, setF] = useState<Record<string, number>>(() =>
    Object.fromEntries(RULE_FIELDS.map(([k]) => [k, age[k] as number])));
  const [ok, setOk] = useState(false);
  const save = async () => { await tUpdateCompAge(token, age.id, f); setOk(true); setTimeout(() => setOk(false), 1500); reload(); };
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-black text-text">{age.age_category}</span>
        <button onClick={async () => { if (confirm(tt('حذف الفئة من البطولة؟', 'Remove age?'))) { await tDeleteCompAge(token, age.id); reload(); } }} className="text-hint hover:text-loss text-sm">🗑</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {RULE_FIELDS.map(([k, ar, en]) => (
          <label key={k} className="block">
            <span className="block text-teal text-[10px] font-bold mb-1">{tt(ar, en)}</span>
            <input value={f[k]} onChange={e => setF({ ...f, [k]: Number(e.target.value) || 0 })} inputMode="numeric"
              className="w-full bg-darkBg border border-bdr rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-aqua tnum" />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <PrimaryButton onClick={save} className="text-sm">{tt('حفظ القواعد', 'Save rules')}</PrimaryButton>
        {ok && <span className="text-win text-sm">✓</span>}
      </div>
    </Card>
  );
}

function TeamsTab({ token, comp }: { token: string; comp: TCompetition }) {
  const tt = useTT();
  const [entries, setEntries] = useState<TCompTeam[]>([]);
  const [academies, setAcademies] = useState<TAcademy[]>([]);
  const [acadId, setAcadId] = useState('');
  const [teams, setTeams] = useState<TTeam[]>([]);
  const [teamId, setTeamId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => { tCompTeams(comp.id).then(setEntries).catch(() => setEntries([])); }, [comp.id]);
  useEffect(() => { reload(); tAcademies().then(setAcademies); }, [reload]);
  useEffect(() => { if (acadId) tAcademyTeams(Number(acadId)).then(setTeams); else setTeams([]); setTeamId(''); }, [acadId]);
  const ageIds = new Set((comp.ages ?? []).map(a => a.age_category_id));
  const register = async () => {
    setErr(null);
    try { await tRegisterTeam(token, comp.id, Number(teamId)); setTeamId(''); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="space-y-3">
      {entries.length === 0 && <EmptyState icon="⚽" text={tt('لا فرق مسجلة', 'No teams registered')} />}
      {entries.map(e => (
        <Card key={e.id} className="p-3 flex items-center justify-between">
          <div><div className="font-bold text-text text-sm">{e.team_name}</div><div className="text-[11px] text-hint">{e.academy_name}</div></div>
          <button onClick={async () => { if (confirm(tt('إلغاء التسجيل؟', 'Unregister?'))) { await tUnregisterTeam(token, e.id); reload(); } }} className="text-hint hover:text-loss">🗑</button>
        </Card>
      ))}
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label={tt('الأكاديمية', 'Academy')}>
            <select value={acadId} onChange={e => setAcadId(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {academies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label={tt('الفريق', 'Team')}>
            <select value={teamId} onChange={e => setTeamId(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {teams.filter(t => ageIds.has(t.age_category_id)).map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}
            </select>
          </Field>
        </div>
        {err && <p className="text-loss text-xs">{err}</p>}
        <PrimaryButton onClick={register} disabled={!teamId}>{tt('تسجيل الفريق', 'Register team')}</PrimaryButton>
      </Card>
    </div>
  );
}

function ApprovalsTab({ token, comp }: { token: string; comp: TCompetition }) {
  const tt = useTT();
  const [entries, setEntries] = useState<TCompTeam[]>([]);
  const reload = useCallback(() => { tCompTeams(comp.id, undefined, true).then(setEntries).catch(() => setEntries([])); }, [comp.id]);
  useEffect(reload, [reload]);
  const act = async (fn: Promise<unknown>) => { await fn; reload(); };
  return (
    <div className="space-y-3">
      {entries.length === 0 && <EmptyState icon="✅" text={tt('لا فرق', 'No teams')} />}
      {entries.map(e => (
        <Card key={e.id} className="p-3">
          <div className="font-bold text-text text-sm mb-2">{e.team_name} <span className="text-[11px] text-hint">· {e.academy_name}</span></div>
          {(e.roster ?? []).length === 0 ? <p className="text-xs text-hint">{tt('لا لاعبين في القائمة', 'No roster players')}</p> : (
            <div className="space-y-1.5">
              {(e.roster ?? []).map((p: TCompPlayer) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="text-text text-sm">{p.player_name} <span className="text-[11px] text-hint">{p.position}</span></span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={p.status} />
                    {p.status !== 'approved' && <button onClick={() => act(tApproveRosterPlayer(token, p.id))} className="text-xs font-bold text-win hover:underline">{tt('اعتماد', 'Approve')}</button>}
                    {p.status !== 'rejected' && <button onClick={() => act(tRejectRosterPlayer(token, p.id, prompt(tt('السبب', 'Reason')) || undefined))} className="text-xs font-bold text-loss hover:underline">{tt('رفض', 'Reject')}</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function MatchesTab({ token, comp }: { token: string; comp: TCompetition }) {
  const tt = useTT();
  const [ageId, setAgeId] = useState<number | null>(comp.ages?.[0]?.age_category_id ?? null);
  const [entries, setEntries] = useState<TCompTeam[]>([]);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [f, setF] = useState({ home: '', away: '', date: '', time: '', venue: '' });
  const [resultFor, setResultFor] = useState<TMatch | null>(null);
  const reloadMatches = useCallback(() => { if (ageId) tMatches({ competition_id: comp.id, age_category_id: ageId }).then(setMatches); }, [comp.id, ageId]);
  useEffect(() => { if (ageId) tCompTeams(comp.id, ageId).then(setEntries); reloadMatches(); }, [ageId, comp.id, reloadMatches]);
  const create = async () => {
    if (!ageId || !f.home || !f.away) return;
    await tCreateMatch(token, { competition_id: comp.id, age_category_id: ageId, home_team_id: Number(f.home), away_team_id: Number(f.away), date: f.date || undefined, time: f.time || undefined, venue: f.venue || undefined });
    setF({ home: '', away: '', date: '', time: '', venue: '' }); reloadMatches();
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {(comp.ages ?? []).map(a => (
          <button key={a.id} onClick={() => setAgeId(a.age_category_id)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap border ${ageId === a.age_category_id ? 'bg-aqua text-on-accent border-aqua' : 'bg-cardBg2 text-teal border-bdr'}`}>{a.age_category}</button>
        ))}
      </div>
      {matches.map(m => (
        <Card key={m.id} className="p-2 flex items-center justify-between">
          <span className="text-sm text-text truncate">{m.home_team_name} {m.home_score ?? '–'}-{m.away_score ?? '–'} {m.away_team_name}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setResultFor(m)} className="text-xs text-aqua font-bold hover:underline">{tt('نتيجة', 'Result')}</button>
            <button onClick={async () => { if (confirm(tt('حذف؟', 'Delete?'))) { await tDeleteMatch(token, m.id); reloadMatches(); } }} className="text-hint hover:text-loss">🗑</button>
          </div>
        </Card>
      ))}
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label={tt('المضيف', 'Home')}>
            <select value={f.home} onChange={e => setF({ ...f, home: e.target.value })} className={inputCls}>
              <option value="">—</option>{entries.map(e => <option key={e.id} value={e.team_id}>{e.team_name}</option>)}
            </select>
          </Field>
          <Field label={tt('الضيف', 'Away')}>
            <select value={f.away} onChange={e => setF({ ...f, away: e.target.value })} className={inputCls}>
              <option value="">—</option>{entries.map(e => <option key={e.id} value={e.team_id}>{e.team_name}</option>)}
            </select>
          </Field>
          <Field label={tt('التاريخ', 'Date')}><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className={inputCls} /></Field>
          <Field label={tt('الوقت', 'Time')}><input value={f.time} onChange={e => setF({ ...f, time: e.target.value })} placeholder="18:00" className={inputCls} /></Field>
        </div>
        <Field label={tt('الملعب', 'Venue')}><input value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} className={inputCls} /></Field>
        <PrimaryButton onClick={create} disabled={!f.home || !f.away || f.home === f.away}>{tt('إضافة مباراة', 'Add match')}</PrimaryButton>
      </Card>
      {resultFor && <ResultModal token={token} match={resultFor} entries={entries} onClose={() => { setResultFor(null); reloadMatches(); }} />}
    </div>
  );
}

interface EvRow { event_type: string; team_id: number; player_id: string; minute: string }

function ResultModal({ token, match, entries, onClose }: { token: string; match: TMatch; entries: TCompTeam[]; onClose: () => void }) {
  const tt = useTT();
  const [home, setHome] = useState(String(match.home_score ?? ''));
  const [away, setAway] = useState(String(match.away_score ?? ''));
  const [rosters, setRosters] = useState<Record<number, TCompPlayer[]>>({});
  const [events, setEvents] = useState<EvRow[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    [match.home_team_id, match.away_team_id].forEach(tid => {
      const entry = entries.find(e => e.team_id === tid);
      if (entry) tRoster(entry.id).then(r => setRosters(prev => ({ ...prev, [tid]: (r.roster ?? []).filter(p => p.status === 'approved') })));
    });
  }, [match, entries]);
  const addEv = () => setEvents(e => [...e, { event_type: 'goal', team_id: match.home_team_id, player_id: '', minute: '' }]);
  const save = async () => {
    setBusy(true);
    try {
      await tEnterResult(token, match.id, {
        home_score: Number(home), away_score: Number(away),
        events: events.filter(e => e.player_id).map(e => ({ event_type: e.event_type, team_id: e.team_id, player_id: Number(e.player_id), minute: e.minute ? Number(e.minute) : undefined })),
      });
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <h2 className="font-black text-text">{tt('إدخال النتيجة', 'Enter result')}</h2>
        <div className="flex items-center justify-center gap-3">
          <span className="text-sm text-text">{match.home_team_name}</span>
          <input value={home} onChange={e => setHome(e.target.value)} className={`${inputCls} w-14 text-center tnum`} inputMode="numeric" />
          <span className="text-hint">-</span>
          <input value={away} onChange={e => setAway(e.target.value)} className={`${inputCls} w-14 text-center tnum`} inputMode="numeric" />
          <span className="text-sm text-text">{match.away_team_name}</span>
        </div>
        <div className="space-y-2">
          {events.map((ev, i) => {
            const roster = rosters[ev.team_id] ?? [];
            return (
              <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-1.5 items-center">
                <select value={ev.event_type} onChange={e => setEvents(a => a.map((x, j) => j === i ? { ...x, event_type: e.target.value } : x))} className={`${inputCls} !px-2 !py-1.5 text-xs`}>
                  <option value="goal">⚽</option><option value="assist">🅰️</option><option value="yellow">🟨</option><option value="red">🟥</option>
                </select>
                <select value={ev.team_id} onChange={e => setEvents(a => a.map((x, j) => j === i ? { ...x, team_id: Number(e.target.value), player_id: '' } : x))} className={`${inputCls} !px-2 !py-1.5 text-xs`}>
                  <option value={match.home_team_id}>{match.home_team_name}</option>
                  <option value={match.away_team_id}>{match.away_team_name}</option>
                </select>
                <select value={ev.player_id} onChange={e => setEvents(a => a.map((x, j) => j === i ? { ...x, player_id: e.target.value } : x))} className={`${inputCls} !px-2 !py-1.5 text-xs`}>
                  <option value="">—</option>{roster.map(p => <option key={p.player_id} value={p.player_id}>{p.player_name}</option>)}
                </select>
                <input value={ev.minute} onChange={e => setEvents(a => a.map((x, j) => j === i ? { ...x, minute: e.target.value } : x))} placeholder="'" className={`${inputCls} !px-2 !py-1.5 w-12 text-xs tnum`} inputMode="numeric" />
                <button onClick={() => setEvents(a => a.filter((_, j) => j !== i))} className="text-hint hover:text-loss text-sm">×</button>
              </div>
            );
          })}
          <button onClick={addEv} className="text-xs font-bold text-aqua hover:underline">+ {tt('إضافة حدث', 'Add event')}</button>
        </div>
        <div className="flex items-center gap-2">
          <PrimaryButton onClick={save} disabled={busy || home === '' || away === ''}>{busy ? tt('…', '…') : tt('حفظ النتيجة', 'Save result')}</PrimaryButton>
          <button onClick={onClose} className="text-sm text-hint">{tt('إلغاء', 'Cancel')}</button>
        </div>
      </div>
    </div>
  );
}

function StagesTab({ token, comp, reload }: { token: string; comp: TCompetition; reload: () => void }) {
  const tt = useTT();
  const [ageId, setAgeId] = useState<number | null>(comp.ages?.[0]?.id ?? null);
  const cage = (comp.ages ?? []).find(a => a.id === ageId);
  const [sf, setSf] = useState({ name: '', type: 'league' });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {(comp.ages ?? []).map(a => (
          <button key={a.id} onClick={() => setAgeId(a.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap border ${ageId === a.id ? 'bg-aqua text-on-accent border-aqua' : 'bg-cardBg2 text-teal border-bdr'}`}>{a.age_category}</button>
        ))}
      </div>
      {cage && (cage.stages ?? []).map(s => (
        <Card key={s.id} className="p-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-text text-sm">{s.name || s.type} <span className="text-[11px] text-hint">· {s.type}</span></span>
            <button onClick={async () => { await tDeleteStage(token, s.id); reload(); }} className="text-hint hover:text-loss">🗑</button>
          </div>
          <GroupsEditor token={token} stageId={s.id} groups={s.groups ?? []} comp={comp} reload={reload} />
        </Card>
      ))}
      {cage && (
        <Card className="p-3 flex items-end gap-2">
          <Field label={tt('اسم الدور', 'Stage name')}><input value={sf.name} onChange={e => setSf({ ...sf, name: e.target.value })} className={inputCls} /></Field>
          <Field label={tt('النوع', 'Type')}>
            <select value={sf.type} onChange={e => setSf({ ...sf, type: e.target.value })} className={inputCls}>
              <option value="league">{tt('دوري', 'League')}</option><option value="group">{tt('مجموعات', 'Group')}</option><option value="knockout">{tt('خروج المغلوب', 'Knockout')}</option>
            </select>
          </Field>
          <PrimaryButton onClick={async () => { await tAddStage(token, cage.id, sf); setSf({ name: '', type: 'league' }); reload(); }}>{tt('إضافة', 'Add')}</PrimaryButton>
        </Card>
      )}
    </div>
  );
}

function GroupsEditor({ token, stageId, groups, comp, reload }: {
  token: string; stageId: number; groups: NonNullable<TCompAge['stages']>[number]['groups'];
  comp: TCompetition; reload: () => void;
}) {
  const tt = useTT();
  const [name, setName] = useState('');
  const [entries, setEntries] = useState<TCompTeam[]>([]);
  useEffect(() => { tCompTeams(comp.id).then(setEntries); }, [comp.id]);
  return (
    <div className="mt-2 space-y-2">
      {(groups ?? []).map(g => (
        <div key={g.id} className="border-t border-bdr pt-2">
          <div className="text-sm font-bold text-text">{g.name}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {g.team_ids.map(id => <span key={id} className="text-[11px] bg-cardBg2 border border-bdr rounded px-1.5 py-0.5">{entries.find(e => e.team_id === id)?.team_name ?? id}</span>)}
          </div>
          <select onChange={async e => { if (e.target.value) { await tAddGroupTeam(token, g.id, Number(e.target.value)); reload(); } }} className={`${inputCls} mt-1 text-xs`} value="">
            <option value="">+ {tt('أضف فريقًا', 'Add team')}</option>
            {entries.map(en => <option key={en.id} value={en.team_id}>{en.team_name}</option>)}
          </select>
        </div>
      ))}
      <div className="flex items-end gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder={tt('مجموعة أ', 'Group A')} className={`${inputCls} text-sm`} />
        <PrimaryButton onClick={async () => { if (name) { await tAddGroup(token, stageId, { name }); setName(''); reload(); } }} className="text-sm">{tt('مجموعة', 'Group')}</PrimaryButton>
      </div>
    </div>
  );
}

function NewsTab({ token, comp }: { token: string; comp: TCompetition }) {
  const tt = useTT();
  const [items, setItems] = useState<TNews[]>([]);
  const [f, setF] = useState({ title: '', body: '' });
  const [img, setImg] = useState<File | null>(null);
  const reload = useCallback(() => { tNews(comp.id, 100).then(setItems).catch(() => setItems([])); }, [comp.id]);
  useEffect(reload, [reload]);
  const create = async () => { if (!f.title) return; await tCreateNews(token, comp.id, f, img); setF({ title: '', body: '' }); setImg(null); reload(); };
  return (
    <div className="space-y-3">
      {items.map(n => (
        <Card key={n.id} className="p-3 flex items-start justify-between gap-2">
          <div><div className="font-bold text-text text-sm">{n.title}</div>{n.body && <p className="text-xs text-hint line-clamp-2">{n.body}</p>}</div>
          <button onClick={async () => { await tDeleteNews(token, n.id); reload(); }} className="text-hint hover:text-loss shrink-0">🗑</button>
        </Card>
      ))}
      <Card className="p-3 space-y-2">
        <Field label={tt('العنوان', 'Title')}><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} className={inputCls} /></Field>
        <Field label={tt('النص', 'Body')}><textarea value={f.body} onChange={e => setF({ ...f, body: e.target.value })} rows={3} className={inputCls} /></Field>
        <div className="flex items-center gap-3">
          <input type="file" accept="image/*" onChange={e => setImg(e.target.files?.[0] ?? null)} className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
          <PrimaryButton onClick={create} disabled={!f.title}>{tt('نشر', 'Publish')}</PrimaryButton>
        </div>
      </Card>
    </div>
  );
}

export default function ManagePage() {
  return <Suspense fallback={<Spinner />}><ManageContent /></Suspense>;
}
