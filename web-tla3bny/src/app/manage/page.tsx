'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  tCompetition, tCompDashboard, tCategories, tAcademies, tAcademyTeams,
  tAddCompAge, tUpdateCompAge, tDeleteCompAge,
  tCompTeams, tRegisterTeam, tUnregisterTeam, tRoster,
  tApproveRosterPlayer, tRejectRosterPlayer,
  tMatches, tCreateMatch, tDeleteMatch, tEnterResult,
  tAddStage, tDeleteStage, tAddGroup, tAddGroupTeam, tRemoveGroupTeam,
  tUpdateCompetition, whatsappLink, mediaUrl,
  type TCompetition, type TCompAge, type TCompDashboard, type TCategory, type TAcademy, type TTeam,
  type TCompTeam, type TCompPlayer, type TMatch,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import Spinner from '@/components/ui/Spinner';
import CompDocsEditor from '@/components/tla3bny/CompDocsEditor';
import NewsAdmin from '@/components/tla3bny/NewsAdmin';
import { PapersReview } from '@/components/tla3bny/PlayerPapers';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, StatusBadge, EmptyState, useTT } from '@/components/tla3bny/kit';

type Tab = 'dashboard' | 'info' | 'ages' | 'teams' | 'approvals' | 'matches' | 'stages' | 'news';

function ManageContent() {
  const tt = useTT();
  const params = useSearchParams();
  const router = useRouter();
  const compId = Number(params.get('comp'));
  const { user, token, loading, canAdminCompetition } = useTla3bnyAuth();
  const [comp, setComp] = useState<TCompetition | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');

  const reload = useCallback(() => { if (compId) tCompetition(compId).then(setComp).catch(() => setComp(null)); }, [compId]);
  useEffect(reload, [reload]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  if (loading || !user || !token) return <Spinner />;
  if (!compId || !canAdminCompetition(compId)) return <EmptyState icon="🔒" text={tt('غير مصرح', 'Not authorized')} />;
  if (!comp) return <Spinner />;

  const tabs: Tab[] = ['dashboard', 'info', 'ages', 'teams', 'approvals', 'stages', 'matches', 'news'];
  const tabLabel: Record<Tab, [string, string]> = {
    dashboard: ['الرئيسية', 'Overview'],
    info: ['صفحة البطولة', 'Page'],
    ages: ['القواعد', 'Rules'],
    teams: ['الفرق', 'Teams'],
    approvals: ['الاعتمادات', 'Approvals'],
    matches: ['المباريات', 'Matches'],
    stages: ['الأدوار', 'Stages'],
    news: ['📰 الأخبار', '📰 News'],
  };
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-hint hover:text-aqua">← {tt('الإدارة', 'Admin')}</Link>
      <h1 className="text-xl font-black text-text">{comp.name}</h1>
      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt(tabLabel[t][0], tabLabel[t][1])}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <DashboardTab token={token} comp={comp} onNavigate={setTab} />}
      {tab === 'info' && <InfoTab token={token} comp={comp} reload={reload} />}
      {tab === 'ages' && <AgesTab token={token} comp={comp} reload={reload} />}
      {tab === 'teams' && <TeamsTab token={token} comp={comp} />}
      {tab === 'approvals' && <ApprovalsTab token={token} comp={comp} />}
      {tab === 'matches' && <MatchesTab token={token} comp={comp} />}
      {tab === 'stages' && <StagesTab token={token} comp={comp} reload={reload} />}
      {tab === 'news' && <NewsAdmin token={token} compId={comp.id} />}
    </div>
  );
}

// ── Competition Dashboard ─────────────────────────────────────────────────────
function DashboardTab({ token, comp, onNavigate }: {
  token: string; comp: TCompetition; onNavigate: (tab: Tab) => void;
}) {
  const tt = useTT();
  const [d, setD] = useState<TCompDashboard | null>(null);

  useEffect(() => {
    tCompDashboard(token, comp.id).then(setD).catch(() => setD(null));
  }, [token, comp.id]);

  if (!d) return <Spinner />;

  const { counts } = d;
  const matchPct = counts.matches_total
    ? Math.round((counts.matches_played / counts.matches_total) * 100) : 0;
  const totalPlayers = counts.players_approved + counts.players_pending + counts.players_rejected;

  return (
    <div className="space-y-4">
      {/* Pending approvals alert */}
      {counts.players_pending > 0 && (
        <button onClick={() => onNavigate('approvals')}
          className="w-full flex items-center gap-3 bg-gold/10 border border-gold/40 rounded-2xl px-4 py-3 text-start hover:bg-gold/15 transition-colors">
          <span className="text-2xl">⏳</span>
          <div className="flex-1 min-w-0">
            <p className="text-gold font-bold text-sm">
              {counts.players_pending} {tt('لاعب بانتظار الاعتماد', 'players awaiting approval')}
            </p>
            <p className="text-hint text-[11px]">{tt('اضغط للانتقال لتبويب الاعتمادات', 'Tap to go to Approvals')}</p>
          </div>
          <span className="text-gold text-lg">‹</span>
        </button>
      )}

      {/* Key stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <p className="text-hint text-[11px]">⚽ {tt('الفرق', 'Teams')}</p>
          <p className="text-text font-extrabold text-xl tabular-nums">{counts.teams}</p>
        </Card>
        <Card className="p-3">
          <p className="text-hint text-[11px]">✅ {tt('لاعبون معتمدون', 'Approved players')}</p>
          <p className="text-win font-extrabold text-xl tabular-nums">{counts.players_approved}</p>
        </Card>
        <Card className="p-3">
          <p className="text-hint text-[11px]">⏳ {tt('قيد المراجعة', 'Pending')}</p>
          <p className={`${counts.players_pending > 0 ? 'text-gold' : 'text-hint'} font-extrabold text-xl tabular-nums`}>
            {counts.players_pending}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-hint text-[11px]">📋 {tt('المباريات', 'Matches')}</p>
          <p className="text-text font-extrabold text-xl tabular-nums">{counts.matches_total}</p>
        </Card>
        <Card className="p-3">
          <p className="text-hint text-[11px]">✔ {tt('منتهية', 'Played')}</p>
          <p className="text-text font-extrabold text-xl tabular-nums">{counts.matches_played}</p>
        </Card>
        <Card className="p-3">
          <p className="text-hint text-[11px]">🥅 {tt('الأهداف', 'Goals')}</p>
          <p className="text-gold font-extrabold text-xl tabular-nums">{counts.goals}</p>
        </Card>
      </div>

      {/* Match progress */}
      {counts.matches_total > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-text font-bold text-sm">📋 {tt('إدخال النتائج', 'Result entry')}</p>
            <p className="text-aqua font-extrabold tabular-nums">{matchPct}%</p>
          </div>
          <div className="h-2 bg-darkBg rounded-full overflow-hidden">
            <div className="h-full bg-aqua rounded-full transition-all" style={{ width: `${matchPct}%` }} />
          </div>
          <p className="text-hint text-[11px] tabular-nums">
            {counts.matches_played} {tt('مكتملة', 'done')} · {counts.matches_total - counts.matches_played} {tt('متبقية', 'remaining')}
          </p>
        </Card>
      )}

      {/* Player approval breakdown */}
      {totalPlayers > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-text font-bold text-sm">👤 {tt('اللاعبون', 'Players')} ({totalPlayers})</p>
          <div className="h-2.5 bg-darkBg rounded-full overflow-hidden flex">
            {counts.players_approved > 0 && (
              <div className="h-full bg-win" style={{ width: `${(counts.players_approved / totalPlayers) * 100}%` }} />
            )}
            {counts.players_pending > 0 && (
              <div className="h-full bg-gold" style={{ width: `${(counts.players_pending / totalPlayers) * 100}%` }} />
            )}
            {counts.players_rejected > 0 && (
              <div className="h-full bg-loss" style={{ width: `${(counts.players_rejected / totalPlayers) * 100}%` }} />
            )}
          </div>
          <div className="flex items-center gap-4 text-[11px] tabular-nums">
            <span className="text-win font-bold">✅ {counts.players_approved} {tt('معتمد', 'approved')}</span>
            <span className="text-gold font-bold">⏳ {counts.players_pending} {tt('قيد المراجعة', 'pending')}</span>
            <span className="text-loss font-bold">✕ {counts.players_rejected} {tt('مرفوض', 'rejected')}</span>
          </div>
        </Card>
      )}

      {/* Per-age breakdown */}
      {d.ages.length > 1 && (
        <Card className="p-4 space-y-3">
          <p className="text-text font-bold text-sm">🎯 {tt('حسب الفئة', 'By age category')}</p>
          {d.ages.map(a => {
            const agePct = a.matches_total ? Math.round((a.matches_played / a.matches_total) * 100) : null;
            return (
              <div key={a.age_category} className="border-t border-bdr/50 pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-text text-sm">{a.age_category}</span>
                  <div className="flex items-center gap-3 text-[11px] tabular-nums">
                    {a.players_pending > 0 && <span className="text-gold font-bold">⏳ {a.players_pending}</span>}
                    <span className="text-hint">⚽ {a.teams} {tt('فريق', 'teams')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-hint tabular-nums">
                  <span>✅ {a.players_approved} {tt('لاعب', 'players')}</span>
                  <span>📋 {a.matches_played}/{a.matches_total} {tt('مباراة', 'matches')}</span>
                  {agePct !== null && (
                    <div className="flex-1 h-1.5 bg-darkBg rounded-full overflow-hidden">
                      <div className="h-full bg-aqua/60 rounded-full" style={{ width: `${agePct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Teams with pending players */}
      {d.pending_teams.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-text font-bold text-sm">⏳ {tt('أكاديميات لديها لاعبون قيد المراجعة', 'Academies with pending players')}</p>
          {d.pending_teams.map(t => (
            <div key={t.team_id} className="flex items-center justify-between bg-darkBg/60 border border-bdr rounded-lg px-3 py-2">
              <div className="min-w-0">
                <span className="text-text text-xs font-bold truncate block">{t.team_name}</span>
                <span className="text-hint text-[11px]">{t.academy_name}</span>
              </div>
              <span className="text-gold font-extrabold text-sm tabular-nums ms-3">{t.pending}</span>
            </div>
          ))}
          <button onClick={() => onNavigate('approvals')}
            className="text-xs font-bold text-aqua hover:underline w-full text-center pt-1">
            {tt('فتح الاعتمادات ←', 'Open Approvals →')}
          </button>
        </Card>
      )}
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
  const [newDocs, setNewDocs] = useState('');
  useEffect(() => { tCategories().then(setCats); }, []);
  const used = new Set((comp.ages ?? []).map(a => a.age_category_id));

  // Pre-fill documents when the organizer picks an age category.
  const handleAgeSelect = (id: string) => {
    setAgeId(id);
    const cat = cats.find(c => String(c.id) === id);
    setNewDocs(cat ? (cat.required_documents ?? []).join('\n') : '');
  };

  const addAge = async () => {
    if (!ageId) return;
    const docs = newDocs.split('\n').map(x => x.trim()).filter(Boolean);
    await tAddCompAge(token, comp.id, {
      age_category_id: Number(ageId),
      ...(docs.length ? { required_documents: docs } : {}),
    });
    setAgeId(''); setNewDocs(''); reload();
  };

  return (
    <div className="space-y-3">
      {(comp.ages ?? []).map(a => <AgeRuleCard key={a.id} token={token} age={a} reload={reload} />)}
      <Card className="p-3 space-y-2">
        <Field label={tt('إضافة فئة عمرية', 'Add age category')}>
          <select value={ageId} onChange={e => handleAgeSelect(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {cats.filter(c => !used.has(c.id)).map(c => (
              <option key={c.id} value={c.id}>{c.label_ar || c.label}{c.label_en && c.label_ar ? ` · ${c.label_en}` : ''}</option>
            ))}
          </select>
        </Field>
        {ageId && (
          <Field label={tt('أوراق اللاعبين لهذه الفئة (سطر لكل ورقة)', 'Player papers for this age (one per line)')}>
            <textarea value={newDocs} onChange={e => setNewDocs(e.target.value)} rows={4} className={inputCls}
              placeholder={tt('شهادة الميلاد\nبطاقة الرقم القومي', 'Birth certificate\nNational ID')} />
          </Field>
        )}
        <PrimaryButton onClick={addAge} disabled={!ageId}>{tt('إضافة', 'Add')}</PrimaryButton>
      </Card>
    </div>
  );
}

function AgeRuleCard({ token, age, reload }: { token: string; age: TCompAge; reload: () => void }) {
  const tt = useTT();
  const [f, setF] = useState<Record<string, number>>(() =>
    Object.fromEntries(RULE_FIELDS.map(([k]) => [k, age[k] as number])));
  const [docs, setDocs] = useState((age.required_documents ?? []).join('\n'));
  const [ok, setOk] = useState(false);
  const save = async () => {
    const docList = docs.split('\n').map(x => x.trim()).filter(Boolean);
    await tUpdateCompAge(token, age.id, { ...f, required_documents: docList });
    setOk(true); setTimeout(() => setOk(false), 1500); reload();
  };
  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-black text-text">{age.age_category}</span>
        <button onClick={async () => { if (confirm(tt('حذف الفئة من البطولة؟', 'Remove age?'))) { await tDeleteCompAge(token, age.id); reload(); } }} className="text-hint hover:text-loss text-sm">🗑</button>
      </div>

      {/* Match rules */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {RULE_FIELDS.map(([k, ar, en]) => (
          <label key={k} className="block">
            <span className="block text-teal text-[10px] font-bold mb-1">{tt(ar, en)}</span>
            <input value={f[k]} onChange={e => setF({ ...f, [k]: Number(e.target.value) || 0 })} inputMode="numeric"
              className="w-full bg-darkBg border border-bdr rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-aqua tnum" />
          </label>
        ))}
      </div>

      {/* Per-age player papers */}
      <div>
        <span className="block text-teal text-[10px] font-bold mb-1">
          {tt('أوراق اللاعبين لهذه الفئة (سطر لكل ورقة)', 'Player papers for this age (one per line)')}
        </span>
        <textarea value={docs} onChange={e => setDocs(e.target.value)} rows={3} className={inputCls}
          placeholder={tt('شهادة الميلاد\nبطاقة الرقم القومي', 'Birth certificate\nNational ID')} />
      </div>

      <div className="flex items-center gap-2">
        <PrimaryButton onClick={save} className="text-sm">{tt('حفظ', 'Save')}</PrimaryButton>
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

  const ages = comp.ages ?? [];
  const ageIds = new Set(ages.map(a => a.age_category_id));
  // Quick lookup: age_category_id → label
  const ageLabel = Object.fromEntries(ages.map(a => [a.age_category_id, a.age_category]));

  const register = async () => {
    setErr(null);
    try { await tRegisterTeam(token, comp.id, Number(teamId)); setTeamId(''); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  // Which age the currently selected team belongs to
  const selectedTeam = teams.find(t => String(t.id) === teamId);
  const selectedAge = selectedTeam ? ageLabel[selectedTeam.age_category_id] : null;

  // Teams eligible for this competition (age must be configured in Rules)
  const eligibleTeams = teams.filter(t => ageIds.has(t.age_category_id));

  return (
    <div className="space-y-3">
      {entries.length === 0 && <EmptyState icon="⚽" text={tt('لا فرق مسجلة', 'No teams registered')} />}
      {entries.map(e => (
        <Card key={e.id} className="p-3 flex items-center justify-between">
          <Link href={`/team?id=${e.team_id}`} className="min-w-0">
            <div className="font-bold text-text text-sm hover:text-aqua transition-colors">{e.team_name}</div>
            <div className="text-[11px] text-hint">
              {e.academy_name}
              {ageLabel[e.age_category_id] && (
                <span className="ms-1 text-teal font-bold">· {ageLabel[e.age_category_id]}</span>
              )}
            </div>
          </Link>
          <button onClick={async () => { if (confirm(tt('إلغاء التسجيل؟', 'Unregister?'))) { await tUnregisterTeam(token, e.id); reload(); } }} className="text-hint hover:text-loss">🗑</button>
        </Card>
      ))}

      <Card className="p-3 space-y-2">
        {ages.length === 0 ? (
          <p className="text-hint text-xs text-center py-1">
            {tt('أضف فئات عمرية في تبويب «القواعد» أولاً قبل إضافة الفرق.',
                'Add age categories in the Rules tab first before adding teams.')}
          </p>
        ) : (<>
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
                {eligibleTeams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.display_name} · {ageLabel[t.age_category_id] ?? t.age_category}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {selectedAge && (
            <p className="text-[11px] text-teal">
              {tt(`سيُسجَّل الفريق في فئة: ${selectedAge}`, `Team will be placed in age: ${selectedAge}`)}
            </p>
          )}
          {acadId && eligibleTeams.length === 0 && (
            <p className="text-[11px] text-hint">
              {tt('لا فرق في هذه الأكاديمية تنتمي لفئات البطولة.',
                  'No teams in this academy match the competition\'s age categories.')}
            </p>
          )}
          {err && <p className="text-loss text-xs">{err}</p>}
          <PrimaryButton onClick={register} disabled={!teamId}>{tt('تسجيل الفريق', 'Register team')}</PrimaryButton>
        </>)}
      </Card>
    </div>
  );
}

function ApprovalsTab({ token, comp }: { token: string; comp: TCompetition }) {
  const tt = useTT();
  const [entries, setEntries] = useState<TCompTeam[]>([]);
  // The token is what makes the API hand over the players' papers — they are
  // withheld from unauthenticated (public) roster reads.
  const reload = useCallback(() => { tCompTeams(comp.id, undefined, true, token).then(setEntries).catch(() => setEntries([])); }, [comp.id, token]);
  useEffect(reload, [reload]);
  return (
    <div className="space-y-3">
      {entries.length === 0 && <EmptyState icon="✅" text={tt('لا فرق', 'No teams')} />}
      {entries.map(e => (
        <Card key={e.id} className="p-3">
          <div className="font-bold text-text text-sm mb-2">{e.team_name} <span className="text-[11px] text-hint">· {e.academy_name}</span></div>
          {(e.roster ?? []).length === 0 ? <p className="text-xs text-hint">{tt('لا لاعبين في القائمة', 'No roster players')}</p> : (
            <div className="space-y-2">
              {(e.roster ?? []).map((p: TCompPlayer) => (
                <RosterPlayerRow key={p.id} token={token} p={p} onDone={reload} />
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/**
 * One player awaiting a decision: their papers open in a new tab for checking,
 * then approve — or reject with a written reason the academy will read on the
 * player's profile, so they know exactly what to fix.
 */
function RosterPlayerRow({ token, p, onDone }: { token: string; p: TCompPlayer; onDone: () => void }) {
  const tt = useTT();
  const [reason, setReason] = useState(p.rejection_reason ?? '');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: Promise<unknown>) => {
    setErr(null); setBusy(true);
    try { await fn; setRejecting(false); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const missing = p.missing_documents ?? [];

  return (
    <div className="border-t border-bdr pt-2 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/player?id=${p.player_id}`} className="text-text text-sm font-bold hover:text-aqua truncate">
          {p.player_name} <span className="text-[11px] text-hint font-normal">{p.position}</span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={p.status} label={{
            pending: tt('قيد المراجعة', 'Under review'),
            approved: tt('مقبول', 'Approved'),
            rejected: tt('مرفوض', 'Rejected'),
          }[p.status]} />
          {p.status !== 'approved' && (
            <button onClick={() => run(tApproveRosterPlayer(token, p.id))} disabled={busy}
              className="text-xs font-bold text-win hover:underline disabled:opacity-50">{tt('اعتماد', 'Approve')}</button>
          )}
          {p.status !== 'rejected' && (
            <button onClick={() => setRejecting(r => !r)} disabled={busy}
              className="text-xs font-bold text-loss hover:underline disabled:opacity-50">{tt('رفض', 'Reject')}</button>
          )}
        </div>
      </div>

      <div className="mt-1">
        <PapersReview files={p.files} required={p.required_documents} missing={missing} />
      </div>

      {p.status === 'rejected' && p.rejection_reason && !rejecting && (
        <p className="text-loss text-[11px] mt-1">{tt('سبب الرفض', 'Reason')}: {p.rejection_reason}</p>
      )}

      {rejecting && (
        <div className="mt-2 space-y-1.5">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className={inputCls}
            placeholder={tt('اكتب سبب الرفض — مثال: شهادة الميلاد غير واضحة، أعد رفعها',
                            'Write why — e.g. the birth certificate is unreadable, please re-upload')} />
          {missing.length > 0 && (
            <button onClick={() => setReason(tt(`أوراق ناقصة: ${missing.join('، ')}`, `Missing papers: ${missing.join(', ')}`))}
              className="text-[11px] font-bold text-aqua hover:underline">
              + {tt('استخدم قائمة الأوراق الناقصة', 'Use the missing-papers list')}
            </button>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => run(tRejectRosterPlayer(token, p.id, reason.trim() || undefined))}
              disabled={busy || !reason.trim()}
              className="text-xs font-bold text-on-accent bg-loss rounded-lg px-3 py-1.5 disabled:opacity-50">
              {tt('تأكيد الرفض', 'Confirm rejection')}
            </button>
            <button onClick={() => setRejecting(false)} className="text-xs text-hint">{tt('إلغاء', 'Cancel')}</button>
          </div>
        </div>
      )}
      {err && <p className="text-loss text-[11px] mt-1">{err}</p>}
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
          <GroupsEditor token={token} stageId={s.id} groups={s.groups ?? []} comp={comp} ageCategoryId={cage.age_category_id} reload={reload} />
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

function GroupsEditor({ token, stageId, groups, comp, ageCategoryId, reload }: {
  token: string; stageId: number; groups: NonNullable<TCompAge['stages']>[number]['groups'];
  comp: TCompetition; ageCategoryId: number; reload: () => void;
}) {
  const tt = useTT();
  const [name, setName] = useState('');
  const [entries, setEntries] = useState<TCompTeam[]>([]);
  useEffect(() => { tCompTeams(comp.id, ageCategoryId).then(setEntries); }, [comp.id, ageCategoryId]);
  return (
    <div className="mt-2 space-y-2">
      {(groups ?? []).map(g => (
        <div key={g.id} className="border-t border-bdr pt-2">
          <div className="text-sm font-bold text-text">{g.name}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {g.team_ids.map(id => (
              <span key={id} className="inline-flex items-center gap-1 text-[11px] bg-cardBg2 border border-bdr rounded px-1.5 py-0.5">
                {entries.find(e => e.team_id === id)?.team_name ?? id}
                <button onClick={async () => { await tRemoveGroupTeam(token, g.id, id); reload(); }}
                  className="text-hint hover:text-loss leading-none">✕</button>
              </span>
            ))}
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

/**
 * The public info page's content, edited by the competition's own organizer:
 * the long "about" text, who to contact, and the WhatsApp number the chat
 * button on that page dials.
 */
function InfoTab({ token, comp, reload }: { token: string; comp: TCompetition; reload: () => void }) {
  const tt = useTT();
  const [f, setF] = useState({
    name: comp.name,
    description: comp.description ?? '',
    info: comp.info ?? '',
    location: comp.location ?? '',
    location_url: comp.location_url ?? '',
    organizer_name: comp.organizer_name ?? '',
    contact_phone: comp.contact_phone ?? '',
    whatsapp_number: comp.whatsapp_number ?? '',
    whatsapp_group_url: comp.whatsapp_group_url ?? '',
    facebook_url: comp.facebook_url ?? '',
    start_date: comp.start_date ?? '',
    end_date: comp.end_date ?? '',
  });
  const [registrationOpen, setRegistrationOpen] = useState(comp.registration_open);
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true); setOk(false); setErr(null);
    try {
      await tUpdateCompetition(
        token, comp.id,
        { ...f, registration_open: registrationOpen ? 'true' : 'false' },
        logo,
      );
      setOk(true); setLogo(null); reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const waPreview = whatsappLink(f.whatsapp_number);

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <h2 className="font-black text-text">{tt('صفحة البطولة', 'Competition page')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tt('الاسم', 'Name')}><input value={f.name} onChange={set('name')} className={inputCls} /></Field>
          <Field label={tt('المنظم', 'Organizer')}><input value={f.organizer_name} onChange={set('organizer_name')} className={inputCls} /></Field>
        </div>
        <Field label={tt('وصف مختصر (يظهر على الكارت)', 'Short blurb (shown on cards)')}>
          <input value={f.description} onChange={set('description')} className={inputCls} />
        </Field>
        <Field label={tt('التفاصيل الكاملة (النظام، اللوائح، الاشتراك…)', 'Full details (format, rules, fees…)')}>
          <textarea value={f.info} onChange={set('info')} rows={6} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tt('البداية', 'Starts')}><input type="date" value={f.start_date} onChange={set('start_date')} className={inputCls} /></Field>
          <Field label={tt('النهاية', 'Ends')}><input type="date" value={f.end_date} onChange={set('end_date')} className={inputCls} /></Field>
          <Field label={tt('المكان', 'Location')}><input value={f.location} onChange={set('location')} className={inputCls} /></Field>
          <Field label={tt('رابط الخريطة', 'Map link')}><input value={f.location_url} dir="ltr" onChange={set('location_url')} className={inputCls} /></Field>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-black text-text">{tt('التواصل', 'Contact')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tt('💬 رقم واتساب (دولي)', '💬 WhatsApp number (international)')}>
            <input value={f.whatsapp_number} dir="ltr" placeholder="201001234567" onChange={set('whatsapp_number')} className={inputCls} />
          </Field>
          <Field label={tt('📞 رقم للتواصل', '📞 Phone')}>
            <input value={f.contact_phone} dir="ltr" onChange={set('contact_phone')} className={inputCls} />
          </Field>
          <Field label={tt('👥 رابط جروب واتساب', '👥 WhatsApp group link')}>
            <input value={f.whatsapp_group_url} dir="ltr" placeholder="https://chat.whatsapp.com/…" onChange={set('whatsapp_group_url')} className={inputCls} />
          </Field>
          <Field label={tt('📘 صفحة فيسبوك', '📘 Facebook page')}>
            <input value={f.facebook_url} dir="ltr" onChange={set('facebook_url')} className={inputCls} />
          </Field>
        </div>
        <p className="text-hint text-[11px]">
          {waPreview
            ? tt(`زر المحادثة هيفتح: ${waPreview.split('?')[0]}`, `The chat button will open: ${waPreview.split('?')[0]}`)
            : tt('من غير رقم واتساب مش هيظهر زر المحادثة في صفحة البطولة.',
                 'Without a WhatsApp number the chat button does not appear on the competition page.')}
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <label className="flex items-center gap-2 text-teal text-sm font-bold">
          <input type="checkbox" checked={registrationOpen} onChange={e => setRegistrationOpen(e.target.checked)} />
          {tt('التسجيل مفتوح', 'Registration is open')}
        </label>
        <Field label={tt('الشعار', 'Logo')}>
          <input type="file" accept="image/*" onChange={e => setLogo(e.target.files?.[0] ?? null)}
            className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
        </Field>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex items-center gap-3">
          <PrimaryButton onClick={save} disabled={busy || !f.name.trim()}>
            {busy ? tt('جارٍ الحفظ…', 'Saving…') : tt('حفظ', 'Save')}
          </PrimaryButton>
          {ok && <span className="text-win text-sm font-bold">✓ {tt('تم الحفظ', 'Saved')}</span>}
          <Link href={`/competitions?comp=${comp.id}`} className="text-xs text-aqua font-bold hover:underline">
            {tt('معاينة الصفحة →', 'Preview page →')}
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function ManagePage() {
  return <Suspense fallback={<Spinner />}><ManageContent /></Suspense>;
}
