'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  tCompetition, tCompDashboard, tCategories,
  tAddCompAge, tUpdateCompAge, tDeleteCompAge, tSetCompAgeOrganizerPhoto,
  tCompTeams, tUnregisterTeam, tApproveTeamJoin, tRejectTeamJoin, tRoster,
  tApproveRosterPlayer, tRejectRosterPlayer,
  tMatches, tCreateMatch, tDeleteMatch, tEnterResult,
  tAddStage, tDeleteStage, tAddGroup, tUpdateGroup, tDeleteGroup, tAddGroupTeam, tRemoveGroupTeam, tAddStageTeam, tRemoveStageTeam, tGenerateFixtures,
  type TGroupFixtureSetting, type TGroup,
  tUpdateCompetition, tAddCompAdmin, tRemoveCompAdmin, tSetCompAdminPerms, whatsappLink, mediaUrl,
  type TCompetition, type TCompAge, type TCompDashboard, type TCategory,
  type TCompTeam, type TCompPlayer, type TMatch, type TCompAdmin,
} from '@/lib/tla3bnyApi';
import MatchRow from '@/components/tla3bny/MatchRow';
import { sortAges, subCompLabel } from '@/lib/utils';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import Spinner from '@/components/ui/Spinner';
import CompDocsEditor from '@/components/tla3bny/CompDocsEditor';
import DocumentsManager from '@/components/tla3bny/DocumentsManager';
import NewsAdmin from '@/components/tla3bny/NewsAdmin';
import AdsManager from '@/components/tla3bny/AdsManager';
import AwardsManager from '@/components/tla3bny/AwardsManager';
import PunishmentsManager from '@/components/tla3bny/PunishmentsManager';
import MessagesManager from '@/components/tla3bny/MessagesManager';
import { PapersReview } from '@/components/tla3bny/PlayerPapers';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, StatusBadge, EmptyState, useTT, useName, useUnsavedGuard, UnsavedBadge } from '@/components/tla3bny/kit';

type Tab = 'dashboard' | 'info' | 'ages' | 'teams' | 'approvals' | 'matches' | 'stages' | 'awards' | 'punishments' | 'messages' | 'news' | 'ads' | 'organizers';

// Tab order in the bar; also the allow-list for the ?tab= URL param.
const MANAGE_TABS: Tab[] = ['dashboard', 'info', 'ages', 'teams', 'approvals', 'stages', 'matches', 'awards', 'punishments', 'messages', 'organizers', 'news', 'ads'];

function ManageContent() {
  const tt = useTT();
  const nm = useName();
  const params = useSearchParams();
  const router = useRouter();
  const compId = Number(params.get('comp'));
  const { user, token, loading, canAdminCompetition } = useTla3bnyAuth();
  const [comp, setComp] = useState<TCompetition | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get('tab') as Tab | null;
    return t && MANAGE_TABS.includes(t) ? t : 'dashboard';
  });

  // Keep the open tab in the address bar so a specific view can be shared/reopened.
  const selectTab = useCallback((t: Tab) => {
    setTab(t);
    const p = new URLSearchParams({ comp: String(compId) });
    if (t !== 'dashboard') p.set('tab', t);  // dashboard is the bare URL
    router.replace(`/manage/?${p.toString()}`, { scroll: false });
  }, [compId, router]);

  const reload = useCallback(() => { if (compId) tCompetition(compId, token).then(setComp).catch(() => setComp(null)); }, [compId, token]);
  useEffect(reload, [reload]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  if (loading || !user || !token) return <Spinner />;
  if (!compId || !canAdminCompetition(compId)) return <EmptyState icon="🔒" text={tt('غير مصرح', 'Not authorized')} />;
  if (!comp) return <Spinner />;

  const tabs = MANAGE_TABS;
  const tabLabel: Record<Tab, [string, string]> = {
    dashboard: ['الرئيسية', 'Overview'],
    info: ['صفحة البطولة', 'Page'],
    ages: ['البطولات الفرعية', 'Sub-competitions'],
    teams: ['الفرق', 'Teams'],
    approvals: ['الاعتمادات', 'Approvals'],
    matches: ['المباريات', 'Matches'],
    stages: ['الأدوار', 'Stages'],
    awards: ['🏆 الجوائز', '🏆 Awards'],
    punishments: ['⚖️ العقوبات', '⚖️ Punishments'],
    messages: ['💬 المحادثات', '💬 Messages'],
    organizers: ['المنظمون', 'Organizers'],
    news: ['📰 الأخبار', '📰 News'],
    ads: ['📣 الإعلانات', '📣 Ads'],
  };
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-hint hover:text-aqua">← {tt('الإدارة', 'Admin')}</Link>
      <h1 className="text-xl font-black text-text">{nm(comp.name, comp.name_en)}</h1>
      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t} onClick={() => selectTab(t)}
            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt(tabLabel[t][0], tabLabel[t][1])}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <DashboardTab token={token} comp={comp} onNavigate={selectTab} />}
      {tab === 'info' && <InfoTab token={token} comp={comp} reload={reload} />}
      {tab === 'ages' && <AgesTab token={token} comp={comp} reload={reload} />}
      {tab === 'teams' && <TeamsTab token={token} comp={comp} />}
      {tab === 'approvals' && <ApprovalsTab token={token} comp={comp} />}
      {tab === 'matches' && <MatchesTab token={token} comp={comp} />}
      {tab === 'stages' && <StagesTab token={token} comp={comp} reload={reload} />}
      {tab === 'awards' && <AwardsManager token={token} comp={comp} />}
      {tab === 'punishments' && <PunishmentsManager token={token} comp={comp} />}
      {tab === 'messages' && <MessagesManager token={token} comp={comp} />}
      {tab === 'organizers' && <OrganizersTab token={token} comp={comp} reload={reload} />}
      {tab === 'news' && <NewsAdmin token={token} compId={comp.id} />}
      {tab === 'ads' && <AdsManager token={token} competitionId={comp.id} />}
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
  const openReplacementAges = (comp.ages ?? []).filter(a => a.replacements_open);

  return (
    <div className="space-y-4">
      {/* Replacement window open banner */}
      {openReplacementAges.length > 0 && (
        <div className="flex items-center gap-3 bg-gold/10 border border-gold/40 rounded-2xl px-4 py-3">
          <span className="text-2xl">🔄</span>
          <div>
            <p className="text-gold font-bold text-sm">
              {tt('نافذة الاستبدال مفتوحة', 'Replacement window is open')}
            </p>
            <p className="text-hint text-[11px]">
              {openReplacementAges.map(a => a.name ? `${a.name} · ${a.age_category}` : a.age_category).join(' · ')}
            </p>
          </div>
        </div>
      )}

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

      {/* Participating-player limit — the priced cap the super admin set.
          Approved players count against it (see approval enforcement). */}
      {comp.max_players != null && (() => {
        const used = counts.players_approved;
        const cap = comp.max_players!;
        const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
        const full = used >= cap;
        const near = !full && cap > 0 && used / cap >= 0.8;
        const barColor = full ? 'bg-loss' : near ? 'bg-gold' : 'bg-win';
        const numColor = full ? 'text-loss' : near ? 'text-gold' : 'text-win';
        return (
          <Card className="p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-text font-bold text-sm">🎟️ {tt('حد اللاعبين المشاركين', 'Participating-player limit')}</p>
              <p className={`${numColor} font-extrabold tabular-nums`}>{used} / {cap}</p>
            </div>
            <div className="h-2 bg-darkBg rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <p className={`text-[11px] tabular-nums ${full ? 'text-loss' : 'text-hint'}`}>
              {full
                ? tt('اكتمل الحد — لا يمكن اعتماد لاعبين جدد حتى ترفع الحد أو تزيل لاعبًا معتمدًا',
                      'Limit reached — no more players can be approved until you raise the limit or remove an approved player')
                : tt(`متبقي ${cap - used} لاعب`, `${cap - used} player slots remaining`)}
            </p>
          </Card>
        );
      })()}

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
              <div key={a.competition_age_id} className="border-t border-bdr/50 pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-text text-sm">
                    {a.name ? `${a.name} · ${a.age_category}` : a.age_category}
                  </span>
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

// Seed values for a brand-new sub-competition (match the backend model defaults).
const DEFAULT_RULES: Record<string, number> = {
  max_players_per_team: 30, lineup_size: 12, players_on_pitch: 5, max_substitutes: 3,
  num_periods: 2, period_minutes: 20, lineup_deadline_minutes: 60, max_replacements: 5,
};

function AgesTab({ token, comp, reload }: { token: string; comp: TCompetition; reload: () => void }) {
  const tt = useTT();
  const { isSuperAdmin } = useTla3bnyAuth();
  const finished = comp.status === 'finished';
  const [cats, setCats] = useState<TCategory[]>([]);
  useEffect(() => { tCategories().then(setCats); }, []);

  const [filterAge, setFilterAge] = useState('');
  const allAges = sortAges(comp.ages ?? []);
  const visibleAges = filterAge ? allAges.filter(a => String(a.age_category_id) === filterAge) : allAges;
  const uniqueAgeCats = Array.from(new Map(allAges.map(a => [a.age_category_id, a.age_category])).entries());

  return (
    <div className="space-y-3">
      {allAges.length > 1 && (
        <div className="flex items-center gap-2 justify-end">
          <label className="text-xs font-bold text-teal shrink-0">{tt('الفئة', 'Age')}</label>
          <select value={filterAge} onChange={e => setFilterAge(e.target.value)} className={inputCls + ' text-sm'}>
            <option value="">{tt('الكل', 'All')}</option>
            {uniqueAgeCats.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
      )}

      {/* Add: a collapsed card on top; expand to fill the full sub-competition
          form (age, name, rules, papers…) and save — same fields as editing. */}
      <AgeRuleCard token={token} age={null} reload={reload} finished={false}
        canDelete={false} createCtx={{ compId: comp.id, cats }} />

      {visibleAges.map(a => (
        <AgeRuleCard key={a.id} token={token} age={a} reload={reload}
          finished={finished} canDelete={isSuperAdmin} />
      ))}
      {finished && (
        <Card className="p-3 space-y-2 border-aqua/30">
          <div>
            <p className="font-black text-text text-sm">{tt('أوراق البطولة كاملة', 'All competition documents')}</p>
            <p className="text-[11px] text-hint">
              {tt('تنزيل أوراق كل البطولات الفرعية دفعة واحدة، أو حذف المتبقي بعد التسليم (كنس نهائي).',
                  'Download every sub-competition’s papers at once, or delete what remains after handover (final sweep).')}
            </p>
          </div>
          <DocumentsManager token={token} scope={{ kind: 'comp', id: comp.id }}
            finished={finished} canDelete={isSuperAdmin} />
        </Card>
      )}
    </div>
  );
}

function AgeRuleCard({ token, age, reload, finished, canDelete, createCtx }: {
  token: string; age: TCompAge | null; reload: () => void; finished: boolean; canDelete: boolean;
  createCtx?: { compId: number; cats: TCategory[] };
}) {
  const tt = useTT();
  const creating = age === null;
  const [name, setName] = useState(age?.name ?? '');
  const [desc, setDesc] = useState(age?.description ?? '');
  const [organizerName, setOrganizerName] = useState(age?.organizer_name ?? '');
  const [fieldSize, setFieldSize] = useState(age?.field_size ?? '');
  // Organizer photo: the currently-stored path (for preview + clearing) and a
  // freshly-picked file to upload after the row itself is saved.
  const [organizerPhotoPath, setOrganizerPhotoPath] = useState(age?.organizer_photo_path ?? null);
  const [organizerPhoto, setOrganizerPhoto] = useState<File | null>(null);
  const [fee, setFee] = useState(age?.subscription_fee != null ? String(age.subscription_fee) : '');
  const [deadline, setDeadline] = useState(age?.player_registration_deadline ?? '');
  const [createAgeId, setCreateAgeId] = useState('');
  const [f, setF] = useState<Record<string, number>>(() => age
    ? {
        ...Object.fromEntries(RULE_FIELDS.map(([k]) => [k, age[k] as number])),
        // Edited via its own input below but not in RULE_FIELDS — seed it controlled.
        max_replacements: age.max_replacements ?? 5,
      }
    : { ...DEFAULT_RULES });
  const [docs, setDocs] = useState((age?.required_documents ?? []).join('\n'));
  const [replacementsOpen, setReplacementsOpen] = useState(age?.replacements_open ?? false);
  const [formationRequired, setFormationRequired] = useState(age?.formation_required ?? false);
  const [etPeriods, setEtPeriods] = useState(age?.et_num_periods != null ? String(age.et_num_periods) : '');
  const [etMinutes, setEtMinutes] = useState(age?.et_period_minutes != null ? String(age.et_period_minutes) : '');
  const [ok, setOk] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [open, setOpen] = useState(false);  // collapsed by default (both add + edit)
  useUnsavedGuard(isDirty && !creating);

  const mark = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setIsDirty(true); };

  // Create mode: picking the age pre-fills its default required papers.
  const pickCreateAge = (id: string) => {
    setCreateAgeId(id);
    const cat = createCtx?.cats.find(c => String(c.id) === id);
    setDocs(cat ? (cat.required_documents ?? []).join('\n') : '');
    setIsDirty(true);
  };

  const save = async () => {
    const docList = docs.split('\n').map(x => x.trim()).filter(Boolean);
    const rules = {
      ...f,
      et_num_periods: etPeriods.trim() === '' ? null : Number(etPeriods),
      et_period_minutes: etMinutes.trim() === '' ? null : Number(etMinutes),
      required_documents: docList,
      replacements_open: replacementsOpen,
      formation_required: formationRequired,
    };
    if (creating) {
      if (!createAgeId) return;
      const created = await tAddCompAge(token, createCtx!.compId, {
        age_category_id: Number(createAgeId),
        name: name.trim() || undefined,
        description: desc.trim() || undefined,
        organizer_name: organizerName.trim() || undefined,
        field_size: fieldSize.trim() || undefined,
        subscription_fee: fee.trim() === '' ? undefined : Number(fee),
        player_registration_deadline: deadline || undefined,
        ...rules,
      });
      // The photo needs the new row's id, so it uploads after create.
      if (organizerPhoto) await tSetCompAgeOrganizerPhoto(token, created.id, organizerPhoto);
      setName(''); setDesc(''); setOrganizerName(''); setFieldSize('');
      setOrganizerPhoto(null); setOrganizerPhotoPath(null);
      setFee(''); setDeadline(''); setDocs('');
      setF({ ...DEFAULT_RULES }); setEtPeriods(''); setEtMinutes('');
      setReplacementsOpen(false); setFormationRequired(false); setCreateAgeId('');
      setIsDirty(false); setOpen(false);
      reload();
      return;
    }
    await tUpdateCompAge(token, age!.id, {
      name: name.trim() || null,
      description: desc.trim() || null,
      organizer_name: organizerName.trim() || null,
      field_size: fieldSize.trim() || null,
      // Empty tells the API to clear a removed photo; a new file is uploaded below.
      organizer_photo_path: organizerPhotoPath ? undefined : '',
      subscription_fee: fee.trim() === '' ? null : Number(fee),
      player_registration_deadline: deadline || null,
      ...rules,
    });
    if (organizerPhoto) {
      const updated = await tSetCompAgeOrganizerPhoto(token, age!.id, organizerPhoto);
      setOrganizerPhotoPath(updated.organizer_photo_path);
      setOrganizerPhoto(null);
    }
    setOk(true); setIsDirty(false); setTimeout(() => setOk(false), 1500); reload();
  };

  return (
    <Card className={`p-3 space-y-3${creating ? ' border-aqua/40' : ''}`}>
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(o => !o)} className="flex-1 min-w-0 flex items-center gap-2 text-start">
          <span className="text-aqua text-xs w-3 shrink-0">{open ? '▾' : '▸'}</span>
          {creating ? (
            <span className="font-black text-aqua">＋ {tt('إضافة بطولة فرعية', 'Add sub-competition')}</span>
          ) : (
            <span className="min-w-0">
              <span className="block font-black text-text truncate">{name || age!.name || tt('بدون اسم', 'Unnamed')}</span>
              <span className="block text-[11px] text-teal">{age!.age_category}{isDirty ? tt(' · غير محفوظ', ' · unsaved') : ''}</span>
            </span>
          )}
        </button>
        {!creating && (
          <button onClick={async (e) => { e.stopPropagation(); if (confirm(tt('حذف البطولة الفرعية؟', 'Remove sub-competition?'))) { await tDeleteCompAge(token, age!.id); reload(); } }}
            className="text-hint hover:text-loss text-sm shrink-0">🗑</button>
        )}
      </div>

      {open && (<>
      {creating && (
        <Field label={tt('الفئة العمرية', 'Age category')}>
          <select value={createAgeId} onChange={e => pickCreateAge(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {createCtx!.cats.map(c => (
              <option key={c.id} value={c.id}>{c.label_ar || c.label}{c.label_en && c.label_ar ? ` · ${c.label_en}` : ''}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={tt('اسم البطولة الفرعية', 'Sub-competition name')}>
          <input value={name} onChange={e => mark(setName)(e.target.value)} className={inputCls}
            placeholder={tt('مثال: الفئة أ', 'e.g. Class A')} />
        </Field>
        <Field label={tt('آخر موعد لإضافة/تعديل اللاعبين', 'Player registration deadline')}>
          <input type="date" value={deadline} onChange={e => mark(setDeadline)(e.target.value)} className={inputCls} />
        </Field>
        <Field label={tt('رسوم الاشتراك للفريق (ج.م)', 'Subscription fee per team (EGP)')}>
          <input value={fee} onChange={e => mark(setFee)(e.target.value)} inputMode="numeric" className={inputCls}
            placeholder={tt('مثال: 500', 'e.g. 500')} />
        </Field>
      </div>

      <Field label={tt('وصف المنافسة (يظهر للجمهور)', 'Description (shown to the public)')}>
        <textarea value={desc} onChange={e => mark(setDesc)(e.target.value)} rows={2} className={inputCls}
          placeholder={tt('نبذة عن المنافسة الفرعية', 'A short blurb about this sub-competition')} />
      </Field>

      {/* Sub-competition organizer (name + photo) — this bracket's own organizer */}
      <div className="border-t border-bdr/50 pt-3 space-y-2">
        <p className="text-teal text-[10px] font-bold">{tt('منظّم البطولة الفرعية', 'Sub-competition organizer')}</p>
        <div className="flex items-start gap-3">
          {(organizerPhoto || organizerPhotoPath) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={organizerPhoto ? URL.createObjectURL(organizerPhoto) : mediaUrl(organizerPhotoPath)!}
              alt="" className="w-14 h-14 rounded-full object-cover border border-bdr shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-darkBg border border-bdr flex items-center justify-center text-hint text-lg shrink-0">👤</div>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <Field label={tt('اسم المنظّم', 'Organizer name')}>
              <input value={organizerName} onChange={e => mark(setOrganizerName)(e.target.value)} className={inputCls}
                placeholder={tt('المسؤول عن هذه الفئة', 'Who runs this bracket')} />
            </Field>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="file" accept="image/*"
                onChange={e => { setOrganizerPhoto(e.target.files?.[0] ?? null); setIsDirty(true); }}
                className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
              {(organizerPhoto || organizerPhotoPath) && (
                <button type="button"
                  onClick={() => { setOrganizerPhoto(null); setOrganizerPhotoPath(null); setIsDirty(true); }}
                  className="text-[11px] font-bold text-hint hover:text-loss">{tt('إزالة الصورة', 'Remove photo')}</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Match rules */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {RULE_FIELDS.map(([k, ar, en]) => (
          <label key={k} className="block">
            <span className="block text-teal text-[10px] font-bold mb-1">{tt(ar, en)}</span>
            <input value={f[k]} onChange={e => { setF({ ...f, [k]: Number(e.target.value) || 0 }); setIsDirty(true); }} inputMode="numeric"
              className="w-full bg-darkBg border border-bdr rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-aqua tnum" />
          </label>
        ))}
      </div>

      {/* Field/pitch size — free text, since each age plays on a different size */}
      <Field label={tt('مقاس الملعب', 'Field size')}>
        <input value={fieldSize} onChange={e => mark(setFieldSize)(e.target.value)} className={inputCls}
          placeholder={tt('مثال: ٤٠×٢٠ م · خماسي · نصف ملعب', 'e.g. 40×20 m · 5-a-side · half pitch')} />
      </Field>

      {/* Extra time (knockout ties) */}
      <div className="border-t border-bdr/50 pt-3 space-y-2">
        <p className="text-teal text-[10px] font-bold">{tt('الوقت الإضافي (للأدوار الإقصائية)', 'Extra time (knockout ties)')}</p>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-text">
            <span className="text-[11px] text-hint">{tt('عدد الأشواط', 'Periods')}</span>
            <input value={etPeriods} onChange={e => { setEtPeriods(e.target.value); setIsDirty(true); }}
              inputMode="numeric" placeholder="—"
              className="w-16 bg-darkBg border border-bdr rounded-lg px-2 py-1 text-text text-sm outline-none focus:border-aqua tnum" />
          </label>
          <label className="flex items-center gap-2 text-sm text-text">
            <span className="text-[11px] text-hint">{tt('دقائق الشوط', 'Minutes each')}</span>
            <input value={etMinutes} onChange={e => { setEtMinutes(e.target.value); setIsDirty(true); }}
              inputMode="numeric" placeholder="—"
              className="w-16 bg-darkBg border border-bdr rounded-lg px-2 py-1 text-text text-sm outline-none focus:border-aqua tnum" />
          </label>
        </div>
        <p className="text-[11px] text-hint">
          {tt('اتركها فارغة إذا كانت التعادلات في الإقصائيات تُحسم بركلات الترجيح مباشرة.',
              'Leave blank if knockout ties go straight to penalties.')}
        </p>
      </div>

      {/* Formation requirement */}
      <div className="border-t border-bdr/50 pt-3">
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={formationRequired}
            onChange={e => { setFormationRequired(e.target.checked); setIsDirty(true); }} />
          {tt('إلزام المدرب بإرسال التشكيلة (الخطة والمراكز)', 'Require coach to submit formation (positions)')}
        </label>
      </div>

      {/* Replacement window */}
      <div className="border-t border-bdr/50 pt-3 space-y-2">
        <p className="text-teal text-[10px] font-bold">{tt('نافذة الاستبدال', 'Replacement window')}</p>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={replacementsOpen}
              onChange={e => { setReplacementsOpen(e.target.checked); setIsDirty(true); }} />
            {tt('فتح نافذة الاستبدال', 'Open replacement window')}
          </label>
          <label className="flex items-center gap-2 text-sm text-text">
            <span className="text-[11px] text-hint">{tt('الحد الأقصى للاستبدالات', 'Max replacements')}</span>
            <input
              value={f['max_replacements']}
              onChange={e => { setF({ ...f, max_replacements: Number(e.target.value) || 0 }); setIsDirty(true); }}
              inputMode="numeric" className="w-16 bg-darkBg border border-bdr rounded-lg px-2 py-1 text-text text-sm outline-none focus:border-aqua tnum" />
          </label>
        </div>
        {replacementsOpen && (
          <p className="text-[11px] text-gold">
            {tt(
              'الأكاديميات تستطيع الآن استبدال لاعبين معتمدين بلاعبين جدد.',
              'Academies can now replace approved players with new ones.',
            )}
          </p>
        )}
      </div>

      {/* Per-sub-competition player papers */}
      <div>
        <span className="block text-teal text-[10px] font-bold mb-1">
          {tt('أوراق اللاعبين (سطر لكل ورقة)', 'Player papers (one per line)')}
        </span>
        <textarea value={docs} onChange={e => mark(setDocs)(e.target.value)} rows={3} className={inputCls}
          placeholder={tt('شهادة الميلاد\nبطاقة الرقم القومي', 'Birth certificate\nNational ID')} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <PrimaryButton onClick={save} disabled={creating && !createAgeId} className="text-sm">
          {creating ? tt('إضافة البطولة الفرعية', 'Add sub-competition') : tt('حفظ', 'Save')}
        </PrimaryButton>
        {ok && <span className="text-win text-sm">✓</span>}
        {!creating && <UnsavedBadge isDirty={isDirty} />}
      </div>

      {/* Uploaded registration papers — only for an existing sub-competition. */}
      {!creating && (
        <div className="border-t border-bdr/50 pt-3">
          <span className="block text-teal text-[10px] font-bold mb-2">
            {tt('أوراق التسجيل', 'Registration documents')}
          </span>
          <DocumentsManager token={token} scope={{ kind: 'sub', id: age!.id }}
            finished={finished} canDelete={canDelete} />
        </div>
      )}
      </>)}
    </Card>
  );
}

/** Organizers (competition admins) for this competition. An organizer can bring
 *  in co-organizers and remove them — no need to ask the super admin. Only the
 *  super admin can reset an existing organizer's password (it is shared across
 *  every competition they run), so that control shows for the super admin only. */
function OrganizersTab({ token, comp, reload }: { token: string; comp: TCompetition; reload: () => void }) {
  const tt = useTT();
  const { user, isSuperAdmin } = useTla3bnyAuth();
  const [f, setF] = useState({ username: '', name: '', password: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const admins = comp.admins ?? [];
  // Only a competition owner (super admin) manages the organizer roster and
  // permissions. Ownership itself is set by the site super admin only.
  const iAmOwner = isSuperAdmin || admins.some(a => a.user_id === user?.id && a.is_owner);
  const setPerm = async (a: TCompAdmin, body: { is_owner?: boolean; can_remove_punishments?: boolean; can_chat?: boolean }) => {
    setErr(null);
    try { await tSetCompAdminPerms(token, comp.id, a.user_id, body); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const resettingExisting =
    f.username.trim() !== '' &&
    admins.some(a => (a.user_login ?? '').trim().toLowerCase() === f.username.trim().toLowerCase());

  const assign = async () => {
    setBusy(true); setMsg(null); setErr(null);
    try {
      await tAddCompAdmin(token, comp.id, f);
      setMsg(resettingExisting ? tt('تم تغيير كلمة المرور', 'Password reset') : tt('تم إسناد المنظم', 'Organizer assigned'));
      setF({ username: '', name: '', password: '' });
      reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const remove = async (a: TCompAdmin) => {
    const self = a.user_id === user?.id;
    if (!confirm(self
      ? tt('إزالة نفسك من تنظيم هذه البطولة؟ ستفقد صلاحية الإدارة.', 'Remove yourself from organizing this competition? You will lose management access.')
      : tt('إزالة هذا المنظم؟', 'Remove this organizer?'))) return;
    setErr(null);
    try { await tRemoveCompAdmin(token, comp.id, a.user_id); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="space-y-3">
      {iAmOwner && (
      <Card className="p-3 space-y-2">
        <p className="font-black text-text text-sm">{tt('إضافة منظم', 'Add organizer')}</p>
        <p className="text-[11px] text-hint">
          {tt('اسم مستخدم جديد + كلمة مرور لمنظم جديد، أو زر 🔑 لتغيير كلمة مرور منظم حالي. (لا يمكن تغيير كلمة مرور منظم يدير بطولات أخرى إلا للسوبر أدمن.)',
              'A new username + password creates a new organizer, or use 🔑 to reset an existing one’s password. (An organizer who runs other competitions can only be reset by the super admin.)')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <Field label={tt('اسم المستخدم', 'Username')}>
            <input value={f.username} dir="ltr" onChange={e => setF({ ...f, username: e.target.value })} className={inputCls} placeholder="username" />
          </Field>
          <Field label={tt('الاسم', 'Display name')}>
            <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} placeholder={tt('اختياري', 'optional')} />
          </Field>
          <Field label={tt('كلمة المرور', 'Password')}>
            <input value={f.password} type="password" onChange={e => setF({ ...f, password: e.target.value })} className={inputCls} placeholder={tt('كلمة المرور', 'Password')} />
          </Field>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PrimaryButton onClick={assign} disabled={busy || !f.username.trim() || (resettingExisting && !f.password)} className="text-sm">
            {resettingExisting ? tt('تغيير كلمة المرور', 'Reset password') : tt('إسناد منظم', 'Assign organizer')}
          </PrimaryButton>
          {msg && <span className="text-[11px] text-win">{msg}</span>}
        </div>
        {err && <ErrorNote>{err}</ErrorNote>}
      </Card>
      )}

      <Card className="p-3 space-y-2">
        <p className="font-black text-text text-sm">{tt('المنظمون الحاليون', 'Current organizers')}</p>
        {!iAmOwner && <ErrorNote>{err}</ErrorNote>}
        {admins.length === 0 && (
          <p className="text-xs text-hint py-1">{tt('لا يوجد منظمون بعد', 'No organizers yet')}</p>
        )}
        {admins.map(a => {
          // A non-super owner can't remove another owner (only the site super admin can).
          const canRemoveThis = iAmOwner && (isSuperAdmin || !a.is_owner);
          return (
          <div key={a.id} className="border-t border-bdr/50 pt-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-text min-w-0 truncate">
                {a.is_owner && <span className="text-gold" title={tt('مشرف عام', 'Owner')}>👑 </span>}
                {a.user_name || a.user_login}
                {a.user_name && a.user_login && <span className="text-hint" dir="ltr"> · {a.user_login}</span>}
                {a.user_id === user?.id && <span className="text-aqua text-[11px]"> · {tt('أنت', 'you')}</span>}
              </span>
              {iAmOwner && (
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => { setF({ username: a.user_login ?? '', name: a.user_name ?? '', password: '' }); setMsg(tt('اكتب كلمة المرور الجديدة ثم اضغط تغيير كلمة المرور', 'Type a new password, then press Reset password')); }}
                    className="text-teal hover:text-aqua font-bold text-xs" title={tt('تغيير كلمة المرور', 'Reset password')}>
                    🔑 {tt('كلمة المرور', 'Password')}
                  </button>
                  {canRemoveThis && <button onClick={() => remove(a)} className="text-hint hover:text-loss" title={tt('إزالة', 'Remove')}>✕</button>}
                </div>
              )}
            </div>
            {iAmOwner && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                {/* Ownership: the site super admin promotes/demotes the competition super admin. */}
                {isSuperAdmin && (
                  <label className="flex items-center gap-2 text-[11px]">
                    <input type="checkbox" checked={a.is_owner} onChange={e => setPerm(a, { is_owner: e.target.checked })} />
                    <span className={a.is_owner ? 'text-gold font-bold' : 'text-hint'}>👑 {tt('مشرف عام', 'Owner')}</span>
                  </label>
                )}
                {a.is_owner ? (
                  <span className="text-[11px] text-gold font-bold">{tt('كل الصلاحيات', 'All permissions')}</span>
                ) : (<>
                  <label className="flex items-center gap-2 text-[11px]">
                    <input type="checkbox" checked={a.can_remove_punishments}
                      onChange={e => setPerm(a, { can_remove_punishments: e.target.checked })} />
                    <span className={a.can_remove_punishments ? 'text-teal font-bold' : 'text-hint'}>⚖️ {tt('حذف العقوبات', 'Remove punishments')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px]">
                    <input type="checkbox" checked={a.can_chat}
                      onChange={e => setPerm(a, { can_chat: e.target.checked })} />
                    <span className={a.can_chat ? 'text-teal font-bold' : 'text-hint'}>💬 {tt('المحادثات', 'Chat')}</span>
                  </label>
                </>)}
              </div>
            )}
          </div>
          );
        })}
        {!iAmOwner && (
          <p className="text-[10px] text-hint">{tt('إدارة المنظمين والصلاحيات للمشرف العام للبطولة فقط.', 'Only the competition owner (super admin) manages organizers and permissions.')}</p>
        )}
      </Card>
    </div>
  );
}

function TeamsTab({ token, comp }: { token: string; comp: TCompetition }) {
  const tt = useTT();
  const nm = useName();
  const [entries, setEntries] = useState<TCompTeam[]>([]);
  const reload = useCallback(() => { tCompTeams(comp.id, undefined, false, token).then(setEntries).catch(() => setEntries([])); }, [comp.id, token]);
  useEffect(() => { reload(); }, [reload]);

  const ages = comp.ages ?? [];
  const ageLabel = Object.fromEntries(ages.map(a => [a.age_category_id, a.age_category]));

  const [filterSubComp, setFilterSubComp] = useState('');
  const [filterTeamAcad, setFilterTeamAcad] = useState('');

  const pending = entries.filter(e => e.status === 'pending');
  const active  = entries.filter(e => e.status !== 'pending').filter(e =>
    (!filterSubComp || String(e.competition_age_id) === filterSubComp) &&
    (!filterTeamAcad || e.academy_name?.toLowerCase().includes(filterTeamAcad.toLowerCase()))
  );

  // Build sub-competition options for the filter (from active entries)
  const subCompOptions = Array.from(
    new Map(entries.filter(e => e.status !== 'pending' && e.competition_age_id != null)
      .map(e => [e.competition_age_id!, ages.find(a => a.id === e.competition_age_id)])).entries()
  ).filter(([, a]) => a != null);

  return (
    <div className="space-y-3">
      {/* Filters */}
      {entries.filter(e => e.status !== 'pending').length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterSubComp} onChange={e => setFilterSubComp(e.target.value)} className={inputCls + ' text-sm flex-1'}>
            <option value="">{tt('كل البطولات الفرعية', 'All sub-competitions')}</option>
            {subCompOptions.map(([id, a]) => (
              <option key={id} value={id}>{a ? (a.name ? `${a.name} · ${a.age_category}` : a.age_category) : id}</option>
            ))}
          </select>
          <input value={filterTeamAcad} onChange={e => setFilterTeamAcad(e.target.value)}
            placeholder={tt('اسم الأكاديمية…', 'Academy name…')} className={inputCls + ' text-sm flex-1'} />
        </div>
      )}

      {/* Pending join requests */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gold">{tt('طلبات الانضمام المعلّقة', 'Pending join requests')} · {pending.length}</p>
          {pending.map(e => (
            <Card key={e.id} className="p-3 border-gold/30">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-text text-sm">{nm(e.team_name, e.team_name_en)}</div>
                  <div className="text-[11px] text-hint">
                    {nm(e.academy_name, e.academy_name_en)}
                    {e.sub_competition_name && <span className="ms-1 text-teal font-bold">· {e.sub_competition_name}</span>}
                    {ageLabel[e.age_category_id] && <span className="ms-1 text-hint">· {ageLabel[e.age_category_id]}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={async () => { await tApproveTeamJoin(token, e.id); reload(); }}
                    className="text-xs font-bold text-win border border-win/40 rounded-lg px-3 py-1.5 hover:bg-win/10">
                    {tt('قبول', 'Approve')}
                  </button>
                  <button onClick={async () => { if (confirm(tt('رفض الطلب؟', 'Reject request?'))) { await tRejectTeamJoin(token, e.id); reload(); } }}
                    className="text-xs font-bold text-loss border border-loss/40 rounded-lg px-3 py-1.5 hover:bg-loss/10">
                    {tt('رفض', 'Reject')}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {active.length === 0 && pending.length === 0 && <EmptyState icon="⚽" text={tt('لا فرق مسجلة', 'No teams registered')} />}
      {active.map(e => (
        <Card key={e.id} className="p-3 flex items-center justify-between">
          <Link href={`/team?id=${e.team_id}`} className="min-w-0">
            <div className="font-bold text-text text-sm hover:text-aqua transition-colors">{nm(e.team_name, e.team_name_en)}</div>
            <div className="text-[11px] text-hint">
              {nm(e.academy_name, e.academy_name_en)}
              {e.sub_competition_name && <span className="ms-1 text-teal font-bold">· {e.sub_competition_name}</span>}
              {ageLabel[e.age_category_id] && (
                <span className="ms-1 text-teal">· {ageLabel[e.age_category_id]}</span>
              )}
            </div>
          </Link>
          <button onClick={async () => { if (confirm(tt('إلغاء التسجيل؟', 'Unregister?'))) { await tUnregisterTeam(token, e.id); reload(); } }} className="text-hint hover:text-loss">🗑</button>
        </Card>
      ))}
    </div>
  );
}

function ApprovalsTab({ token, comp }: { token: string; comp: TCompetition }) {
  const tt = useTT();
  const nm = useName();
  const [entries, setEntries] = useState<TCompTeam[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filterAge, setFilterAge] = useState('');
  const [filterAcad, setFilterAcad] = useState('');
  const reload = useCallback(() => { tCompTeams(comp.id, undefined, true, token).then(setEntries).catch(() => setEntries([])); }, [comp.id, token]);
  useEffect(reload, [reload]);

  const ages = comp.ages ?? [];
  const ageLabel = Object.fromEntries(ages.map(a => [a.age_category_id, a.age_category]));

  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const visible = entries.filter(e =>
    (!filterAge || String(e.age_category_id) === filterAge) &&
    (!filterAcad || e.academy_name?.toLowerCase().includes(filterAcad.toLowerCase()))
  );

  const uniqueAgeCats = Array.from(
    new Map(entries.map(e => [e.age_category_id, ageLabel[e.age_category_id] ?? String(e.age_category_id)])).entries()
  ).sort((a, b) => (parseInt(String(a[1] ?? '0')) || 0) - (parseInt(String(b[1] ?? '0')) || 0));

  return (
    <div className="space-y-3">
      {entries.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterAge} onChange={e => setFilterAge(e.target.value)} className={inputCls + ' text-sm flex-1'}>
            <option value="">{tt('كل الفئات', 'All ages')}</option>
            {uniqueAgeCats.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <input value={filterAcad} onChange={e => setFilterAcad(e.target.value)}
            placeholder={tt('اسم الأكاديمية…', 'Academy name…')} className={inputCls + ' text-sm flex-1'} />
        </div>
      )}
      {visible.length === 0 && <EmptyState icon="✅" text={tt('لا فرق', 'No teams')} />}
      {visible.map(e => {
        const roster = e.roster ?? [];
        const pending = roster.filter(p => p.status === 'pending').length;
        const open = expanded.has(e.id);
        return (
          <Card key={e.id} className="p-3">
            <button onClick={() => toggle(e.id)}
              className="w-full flex items-center justify-between gap-2 text-start">
              <div className="min-w-0">
                <span className="font-bold text-text text-sm">{nm(e.team_name, e.team_name_en)}</span>
                <span className="text-[11px] text-hint ms-1">· {nm(e.academy_name, e.academy_name_en)}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pending > 0 && (
                  <span className="text-[11px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-2 py-0.5 tabular-nums">
                    ⏳ {pending}
                  </span>
                )}
                <span className="text-hint text-xs tabular-nums">{roster.length} {tt('لاعب', 'players')}</span>
                <span className="text-hint text-sm">{open ? '▾' : '▸'}</span>
              </div>
            </button>

            {open && (
              <div className="mt-3 border-t border-bdr/50 pt-3">
                {roster.length === 0
                  ? <p className="text-xs text-hint">{tt('لا لاعبين في القائمة', 'No roster players')}</p>
                  : (
                    <div className="space-y-2">
                      {roster.map((p: TCompPlayer) => (
                        <RosterPlayerRow key={p.id} token={token} p={p} onDone={reload} />
                      ))}
                    </div>
                  )}
              </div>
            )}
          </Card>
        );
      })}
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
  const nm = useName();
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
          {nm(p.player_name, p.player_name_en)} <span className="text-[11px] text-hint font-normal">{p.position}</span>
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

      {p.status === 'rejected' && p.rejection_reason && !rejecting && !busy && (
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
  const sortedMatchAges = sortAges(comp.ages ?? []);
  const [cageId, setCageId] = useState<number | null>(sortedMatchAges[0]?.id ?? null);
  const [statusFilter, setStatusFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [roundFilter, setRoundFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const cage = sortedMatchAges.find(a => a.id === cageId);
  const [entries, setEntries] = useState<TCompTeam[]>([]);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [f, setF] = useState({ home: '', away: '', date: '', time: '', venue: '', round: '', stageId: '', groupId: '' });
  const reloadMatches = useCallback(() => {
    if (!cageId) return;
    tMatches({
      competition_id: comp.id,
      competition_age_id: cageId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(stageFilter ? { stage_id: Number(stageFilter) } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
      order: 'asc',
    }).then(setMatches);
  }, [comp.id, cageId, statusFilter, stageFilter, dateFilter]);

  // Reset UI state when the sub-competition changes.
  useEffect(() => {
    if (cageId) tCompTeams(comp.id, undefined, false, undefined, cageId).then(setEntries);
    setF({ home: '', away: '', date: '', time: '', venue: '', round: '', stageId: '', groupId: '' });
    setStageFilter('');
    setStatusFilter('');
    setTeamFilter('');
    setRoundFilter('');
    setDateFilter('');
    setShowNew(false);
  }, [cageId, comp.id]);

  // Reload matches whenever any filter (or the cage) changes.
  useEffect(() => { reloadMatches(); }, [reloadMatches]);

  const stages = cage?.stages ?? [];
  const selectedStage = stages.find(s => s.id === Number(f.stageId));
  const stageGroups = selectedStage?.groups ?? [];

  // All team IDs registered in the selected stage (across all its pool/groups).
  const stageTeamIds = selectedStage
    ? new Set((selectedStage.groups ?? []).flatMap(g => g.team_ids))
    : null;
  // For group stages: further narrow to the selected group's teams.
  const selectedGroupData = stageGroups.find(g => String(g.id) === f.groupId);
  const activeTeamIds = (selectedStage?.type === 'group' && selectedGroupData)
    ? new Set(selectedGroupData.team_ids)
    : stageTeamIds;
  const stageEntries = activeTeamIds
    ? entries.filter(e => activeTeamIds.has(e.team_id))
    : entries;

  const create = async () => {
    if (!cageId || !f.home || !f.away) return;
    await tCreateMatch(token, {
      competition_id: comp.id,
      competition_age_id: cageId,
      home_team_id: Number(f.home), away_team_id: Number(f.away),
      date: f.date || undefined, time: f.time || undefined,
      venue: f.venue || undefined, round: f.round || undefined,
      stage_id: f.stageId ? Number(f.stageId) : undefined,
      group_id: f.groupId ? Number(f.groupId) : undefined,
    });
    setF({ home: '', away: '', date: '', time: '', venue: '', round: '', stageId: '', groupId: '' });
    setShowNew(false); reloadMatches();
  };

  // Distinct round labels from loaded matches (preserving asc order).
  const roundOptions = Array.from(
    new Set(matches.map(m => m.round).filter(Boolean) as string[])
  );

  const q = teamFilter.trim().toLowerCase();
  const shownMatches = matches.filter(m => {
    if (roundFilter && m.round !== roundFilter) return false;
    if (q && !m.home_team_name?.toLowerCase().includes(q) && !m.away_team_name?.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="grid grid-cols-2 gap-2">
        {sortedMatchAges.length > 1 && (
          <select value={cageId ?? ''} onChange={e => setCageId(Number(e.target.value) || null)} className={inputCls + ' text-sm'}>
            {sortedMatchAges.map(a => <option key={a.id} value={a.id}>{subCompLabel(a)}</option>)}
          </select>
        )}
        {stages.length > 0 && (
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className={inputCls + ' text-sm'}>
            <option value="">{tt('كل الأدوار', 'All stages')}</option>
            {stages.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || tt(({ league: 'دوري', group: 'مجموعات', knockout: 'خروج المغلوب' } as Record<string,string>)[s.type] ?? s.type, s.type)}
              </option>
            ))}
          </select>
        )}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputCls + ' text-sm'}>
          <option value="">{tt('كل الحالات', 'All statuses')}</option>
          <option value="scheduled">{tt('مجدولة', 'Scheduled')}</option>
          <option value="live">{tt('مباشرة', 'Live')}</option>
          <option value="completed">{tt('انتهت', 'Completed')}</option>
          <option value="postponed">{tt('مؤجلة', 'Postponed')}</option>
          <option value="cancelled">{tt('ملغاة', 'Cancelled')}</option>
        </select>
        {roundOptions.length > 0 && (
          <select value={roundFilter} onChange={e => setRoundFilter(e.target.value)} className={inputCls + ' text-sm'}>
            <option value="">{tt('كل الجولات', 'All rounds')}</option>
            {roundOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <input
          type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className={inputCls + ' text-sm'} />
        <input
          value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
          placeholder={tt('ابحث باسم فريق…', 'Search by team…')}
          className={inputCls + ' text-sm'} />
      </div>

      {/* Count + Add match button */}
      <div className="flex items-center justify-between">
        <span className="text-hint text-xs tabular-nums">
          {q ? `${shownMatches.length} ${tt('من', 'of')} ` : ''}{matches.length} {tt('مباراة', 'matches')}
        </span>
        <button onClick={() => setShowNew(s => !s)}
          className={`font-bold text-xs px-4 py-2 rounded-xl border transition-colors ${
            showNew
              ? 'border-loss text-loss hover:bg-loss/10'
              : 'border-dashed border-bdr text-teal hover:border-aqua hover:text-aqua'
          }`}>
          {showNew ? tt('✕ إلغاء', '✕ Cancel') : `+ ${tt('إضافة مباراة', 'Add match')}`}
        </button>
      </div>

      {showNew && (
        <Card className="p-3 space-y-2">
          {entries.length === 0 ? (
            <p className="text-hint text-xs text-center py-2">
              {tt('لا فرق مسجلة في هذه البطولة الفرعية. أضف فرقًا أولاً من تبويب الفرق.',
                  'No teams in this sub-competition. Add teams first from the Teams tab.')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {/* Row 1: Stage + Group (group slot is always present to hold the column) */}
              {stages.length > 0 && <>
                <Field label={tt('الدور', 'Stage')}>
                  <select value={f.stageId} onChange={e => setF({ ...f, stageId: e.target.value, groupId: '', home: '', away: '' })} className={inputCls}>
                    <option value="">— {tt('بدون دور', 'No stage')}</option>
                    {stages.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name || tt(
                          ({ league: 'دوري', group: 'مجموعات', knockout: 'خروج المغلوب' } as Record<string,string>)[s.type] ?? s.type,
                          s.type,
                        )}
                      </option>
                    ))}
                  </select>
                </Field>
                {f.stageId && stageGroups.length > 0 && selectedStage?.type !== 'knockout' ? (
                  <Field label={tt('المجموعة', 'Group')}>
                    <select value={f.groupId} onChange={e => setF({ ...f, groupId: e.target.value, home: '', away: '' })} className={inputCls}>
                      <option value="">— {tt('بدون مجموعة', 'No group')}</option>
                      {stageGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.name || `Group ${g.id}`}</option>
                      ))}
                    </select>
                  </Field>
                ) : <div />}
              </>}
              {/* Row 2: Home + Away (filtered to the chosen stage/group) */}
              <Field label={tt('المضيف', 'Home')}>
                <select value={f.home} onChange={e => setF({ ...f, home: e.target.value })} className={inputCls}>
                  <option value="">—</option>
                  {stageEntries.map(e => <option key={e.id} value={e.team_id}>{e.team_name}</option>)}
                </select>
              </Field>
              <Field label={tt('الضيف', 'Away')}>
                <select value={f.away} onChange={e => setF({ ...f, away: e.target.value })} className={inputCls}>
                  <option value="">—</option>
                  {stageEntries.map(e => <option key={e.id} value={e.team_id}>{e.team_name}</option>)}
                </select>
              </Field>
              <Field label={tt('التاريخ', 'Date')}><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className={inputCls} /></Field>
              <Field label={tt('الوقت', 'Time')}><input type="time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} className={inputCls} /></Field>
              <Field label={tt('الجولة', 'Round')}><input value={f.round} onChange={e => setF({ ...f, round: e.target.value })} className={inputCls} /></Field>
              <Field label={tt('الملعب', 'Venue')}><input value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} className={inputCls} /></Field>
            </div>
          )}
          {entries.length > 0 && (
            <PrimaryButton
              onClick={create}
              disabled={!f.home || !f.away || f.home === f.away || (selectedStage?.type === 'group' && !f.groupId)}>
              {tt('إضافة مباراة', 'Add match')}
            </PrimaryButton>
          )}
        </Card>
      )}

      {/* Match list — MatchRow cards + quick delete */}
      {shownMatches.length === 0 && <EmptyState icon="📋" text={tt('لا مباريات بعد', 'No matches yet')} />}
      {shownMatches.map(m => (
        <div key={m.id} className="relative group">
          <MatchRow m={m} />
          <button
            onClick={async e => {
              e.preventDefault();
              if (confirm(tt('حذف المباراة؟', 'Delete match?'))) { await tDeleteMatch(token, m.id); reloadMatches(); }
            }}
            className="absolute top-2 end-2 opacity-0 group-hover:opacity-100 transition-opacity bg-darkBg border border-bdr rounded-lg p-1.5 text-hint hover:text-loss text-xs z-10">
            🗑
          </button>
        </div>
      ))}
    </div>
  );
}

function StagesTab({ token, comp, reload }: { token: string; comp: TCompetition; reload: () => void }) {
  const tt = useTT();
  const sortedStageAges = sortAges(comp.ages ?? []);
  const [ageId, setAgeId] = useState<number | null>(sortedStageAges[0]?.id ?? null);
  const cage = sortedStageAges.find(a => a.id === ageId);
  const [sf, setSf] = useState({ name: '', type: 'league' });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  return (
    <div className="space-y-3">
      {sortedStageAges.length > 1 && (
        <select value={ageId ?? ''} onChange={e => setAgeId(Number(e.target.value) || null)} className={inputCls + ' text-sm'}>
          {sortedStageAges.map(a => <option key={a.id} value={a.id}>{subCompLabel(a)}</option>)}
        </select>
      )}
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
      {cage && (cage.stages ?? []).map(s => {
        const open = expanded.has(s.id);
        return (
          <Card key={s.id} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => toggle(s.id)} className="flex items-center gap-2 text-start flex-1 min-w-0">
                <span className="text-hint text-sm">{open ? '▾' : '▸'}</span>
                <span className="font-bold text-text text-sm">
                  {s.name || tt({ league: 'دوري', group: 'مجموعات', knockout: 'خروج المغلوب' }[s.type as 'league'|'group'|'knockout'] ?? s.type, s.type)}
                  <span className="text-[11px] text-hint ms-1">· {s.type}</span>
                </span>
              </button>
              <button onClick={async () => { await tDeleteStage(token, s.id); reload(); }} className="text-hint hover:text-loss shrink-0">🗑</button>
            </div>
            {open && <GroupsEditor token={token} stageId={s.id} stageType={s.type} groups={s.groups ?? []} comp={comp} cageId={cage.id} reload={reload} />}
          </Card>
        );
      })}
    </div>
  );
}

const WEEKDAYS = [
  { v: 5, ar: 'الجمعة', en: 'Fri' },
  { v: 6, ar: 'السبت',  en: 'Sat' },
  { v: 7, ar: 'الأحد',  en: 'Sun' },
  { v: 1, ar: 'الاثنين', en: 'Mon' },
  { v: 2, ar: 'الثلاثاء', en: 'Tue' },
  { v: 3, ar: 'الأربعاء', en: 'Wed' },
  { v: 4, ar: 'الخميس',  en: 'Thu' },
];

type GrpSetting = { match_days: number[]; matches_per_day: string; time: string; venue: string; interval: string };
const DEFAULT_GRP_SETTING: GrpSetting = { match_days: [5, 6], matches_per_day: '2', time: '', venue: '', interval: '' };

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const tt = useTT();
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {WEEKDAYS.map(d => (
        <button key={d.v} type="button"
          onClick={() => onChange(value.includes(d.v) ? value.filter(x => x !== d.v) : [...value, d.v])}
          className={`px-2 py-0.5 text-xs rounded border font-bold transition-colors ${
            value.includes(d.v) ? 'bg-aqua text-darkBg border-aqua' : 'text-hint border-bdr hover:border-aqua/50'
          }`}>
          {tt(d.ar, d.en)}
        </button>
      ))}
    </div>
  );
}

function GenerateFixturesPanel({ token, stageId, stageType, teamCount, groups, onDone }: {
  token: string; stageId: number; stageType: string; teamCount: number;
  groups: TGroup[]; onDone: () => void;
}) {
  const tt = useTT();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'round_robin' | 'double_round_robin' | 'knockout'>('round_robin');
  const [startDate, setStartDate] = useState('');
  // Global (used for non-group stages, or as the single-group setting)
  const [globalSetting, setGlobalSetting] = useState<GrpSetting>(DEFAULT_GRP_SETTING);
  // Per-group settings keyed by group id (only used for multi-group stages)
  const [grpSettings, setGrpSettings] = useState<Record<number, GrpSetting>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needsForce, setNeedsForce] = useState(false);

  // Groups that have ≥ 2 teams (can actually play)
  const playableGroups = groups.filter(g => g.team_ids.length >= 2);
  const isMultiGroup = stageType === 'group' && playableGroups.length > 1;

  if (teamCount < 2) return null;

  const openPanel = () => {
    setOpen(true);
    setMode(stageType === 'knockout' ? 'knockout' : 'round_robin');
    setResult(null); setErr(null); setNeedsForce(false);
    // Initialise per-group settings from global defaults
    const init: Record<number, GrpSetting> = {};
    playableGroups.forEach(g => { init[g.id] = { ...DEFAULT_GRP_SETTING }; });
    setGrpSettings(init);
    setGlobalSetting({ ...DEFAULT_GRP_SETTING });
  };

  const setGrp = (id: number, patch: Partial<GrpSetting>) =>
    setGrpSettings(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const run = async (force = false) => {
    setBusy(true); setErr(null); setResult(null); setNeedsForce(false);
    try {
      const body: Parameters<typeof tGenerateFixtures>[2] = { mode, force };
      if (startDate) body.start_date = startDate;

      if (isMultiGroup) {
        // Send per-group settings; each group manages its own calendar
        const group_settings: TGroupFixtureSetting[] = playableGroups.map(g => {
          const gs = grpSettings[g.id] ?? DEFAULT_GRP_SETTING;
          const pd = parseInt(gs.matches_per_day);
          const iv = parseInt(gs.interval);
          return {
            group_id: g.id,
            match_days: gs.match_days.length ? gs.match_days : undefined,
            matches_per_day: !isNaN(pd) && pd > 0 ? pd : undefined,
            default_time: gs.time || undefined,
            default_venue: gs.venue || undefined,
            time_interval_minutes: !isNaN(iv) && iv > 0 ? iv : undefined,
          };
        });
        body.group_settings = group_settings;
      } else {
        // Single calendar for all teams
        if (globalSetting.match_days.length) body.match_days = globalSetting.match_days;
        const pd = parseInt(globalSetting.matches_per_day);
        if (!isNaN(pd) && pd > 0) body.matches_per_day = pd;
        if (globalSetting.time) body.default_time = globalSetting.time;
        if (globalSetting.venue) body.default_venue = globalSetting.venue;
        const iv = parseInt(globalSetting.interval);
        if (!isNaN(iv) && iv > 0) body.time_interval_minutes = iv;
      }

      const r = await tGenerateFixtures(token, stageId, body);
      setResult(tt(`تم إنشاء ${r.created} مباراة بنجاح`, `${r.created} matches created`));
      setOpen(false);
      onDone();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('already exist') || msg.includes('409') || msg.includes('fixture')) {
        setNeedsForce(true);
      } else {
        setErr(msg);
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 border-t border-bdr pt-3">
      {result && <p className="text-[12px] font-bold text-win mb-2">{result}</p>}
      {!open ? (
        <button onClick={openPanel}
          className="w-full text-sm font-bold text-aqua border border-aqua/40 rounded py-1.5 hover:bg-aqua/10 transition-colors">
          ⚡ {tt('توليد جدول المباريات', 'Generate Fixtures')}
        </button>
      ) : (
        <div className="space-y-3 bg-cardBg2 border border-bdr rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-text">⚡ {tt('توليد الجدول', 'Generate Fixtures')}</span>
            <button onClick={() => { setOpen(false); setErr(null); setNeedsForce(false); }}
              className="text-hint hover:text-text text-lg leading-none">✕</button>
          </div>

          {/* Mode + start date (always global) */}
          <Field label={tt('نظام البطولة', 'Format')}>
            <select value={mode} onChange={e => setMode(e.target.value as typeof mode)} className={inputCls + ' text-sm'}>
              <option value="round_robin">{tt('دوري (ذهاب فقط)', 'Round Robin (single leg)')}</option>
              <option value="double_round_robin">{tt('دوري (ذهاب وإياب)', 'Round Robin (home & away)')}</option>
              <option value="knockout">{tt('خروج المغلوب', 'Knockout')}</option>
            </select>
          </Field>
          <Field label={tt('تاريخ البداية', 'Start date')}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls + ' text-sm'} />
          </Field>

          {isMultiGroup ? (
            /* ── Per-group settings ── */
            <div className="space-y-3">
              <p className="text-[11px] text-teal font-bold">
                {tt('أيام وملاعب كل مجموعة على حدة — كل مجموعة لها تقويم مستقل', 'Each group has its own schedule — groups run on independent calendars')}
              </p>
              {playableGroups.map(g => {
                const gs = grpSettings[g.id] ?? DEFAULT_GRP_SETTING;
                return (
                  <div key={g.id} className="border border-bdr rounded-lg p-2.5 space-y-2">
                    <p className="text-xs font-black text-text">{g.name || tt('مجموعة', 'Group')}</p>
                    <Field label={tt('أيام اللعب', 'Match days')}>
                      <DayPicker value={gs.match_days} onChange={v => setGrp(g.id, { match_days: v })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={tt('مباريات/يوم', 'Per day')}>
                        <input type="number" min="1" max="20" value={gs.matches_per_day}
                          onChange={e => setGrp(g.id, { matches_per_day: e.target.value })}
                          className={inputCls + ' text-sm'} />
                      </Field>
                      <Field label={tt('الوقت الأول', 'First kickoff')}>
                        <input type="time" value={gs.time}
                          onChange={e => setGrp(g.id, { time: e.target.value })}
                          className={inputCls + ' text-sm'} />
                      </Field>
                      <Field label={tt('فاصل بين المباريات (دقيقة)', 'Interval between matches (min)')}>
                        <input type="number" min="0" max="300" value={gs.interval}
                          onChange={e => setGrp(g.id, { interval: e.target.value })}
                          placeholder="0"
                          className={inputCls + ' text-sm'} />
                      </Field>
                      <Field label={tt('الملعب', 'Venue')}>
                        <input value={gs.venue}
                          onChange={e => setGrp(g.id, { venue: e.target.value })}
                          placeholder={tt('اختياري', 'Optional')}
                          className={inputCls + ' text-sm'} />
                      </Field>
                    </div>
                    {gs.time && gs.interval && parseInt(gs.interval) > 0 && parseInt(gs.matches_per_day) > 1 && (
                      <p className="text-[11px] text-teal">
                        {tt(
                          `مثال: م١ ${gs.time} ← م٢ ${(() => { const h = parseInt(gs.time.split(':')[0]); const m = parseInt(gs.time.split(':')[1]) + parseInt(gs.interval); return `${String(Math.floor((h*60+parseInt(gs.time.split(':')[1])+parseInt(gs.interval))/60)%24).padStart(2,'0')}:${String((parseInt(gs.time.split(':')[1])+parseInt(gs.interval))%60).padStart(2,'0')}`; })()}`,
                          `E.g. match 1 at ${gs.time} → match 2 at ${(() => { const mins = parseInt(gs.time.split(':')[0])*60+parseInt(gs.time.split(':')[1])+parseInt(gs.interval); return `${String(Math.floor(mins/60)%24).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`; })()}`
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Single / global settings ── */
            <>
              <Field label={tt('أيام اللعب', 'Match days')}>
                <DayPicker value={globalSetting.match_days}
                  onChange={v => setGlobalSetting(s => ({ ...s, match_days: v }))} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={tt('مباريات/يوم', 'Per day')}>
                  <input type="number" min="1" max="20" value={globalSetting.matches_per_day}
                    onChange={e => setGlobalSetting(s => ({ ...s, matches_per_day: e.target.value }))}
                    className={inputCls + ' text-sm'} />
                </Field>
                <Field label={tt('الوقت الأول', 'First kickoff')}>
                  <input type="time" value={globalSetting.time}
                    onChange={e => setGlobalSetting(s => ({ ...s, time: e.target.value }))}
                    className={inputCls + ' text-sm'} />
                </Field>
                <Field label={tt('فاصل بين المباريات (دقيقة)', 'Interval between matches (min)')}>
                  <input type="number" min="0" max="300" value={globalSetting.interval}
                    onChange={e => setGlobalSetting(s => ({ ...s, interval: e.target.value }))}
                    placeholder="0"
                    className={inputCls + ' text-sm'} />
                </Field>
                <Field label={tt('الملعب', 'Venue')}>
                  <input value={globalSetting.venue}
                    onChange={e => setGlobalSetting(s => ({ ...s, venue: e.target.value }))}
                    placeholder={tt('اختياري', 'Optional')}
                    className={inputCls + ' text-sm'} />
                </Field>
              </div>
              {globalSetting.time && globalSetting.interval && parseInt(globalSetting.interval) > 0 && parseInt(globalSetting.matches_per_day) > 1 && (
                <p className="text-[11px] text-teal">
                  {tt(
                    `مثال: م١ ${globalSetting.time} ← م٢ ${(() => { const mins = parseInt(globalSetting.time.split(':')[0])*60+parseInt(globalSetting.time.split(':')[1])+parseInt(globalSetting.interval); return `${String(Math.floor(mins/60)%24).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`; })()}`,
                    `E.g. match 1 at ${globalSetting.time} → match 2 at ${(() => { const mins = parseInt(globalSetting.time.split(':')[0])*60+parseInt(globalSetting.time.split(':')[1])+parseInt(globalSetting.interval); return `${String(Math.floor(mins/60)%24).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`; })()}`
                  )}
                </p>
              )}
            </>
          )}

          {err && <ErrorNote>{err}</ErrorNote>}

          {needsForce ? (
            <div className="space-y-2">
              <p className="text-[12px] text-orange font-bold">
                {tt('يوجد جدول مباريات بالفعل. هل تريد حذفه وإعادة التوليد؟', 'Fixtures already exist. Delete and regenerate?')}
              </p>
              <div className="flex gap-2">
                <button onClick={() => run(true)} disabled={busy}
                  className="flex-1 py-1.5 text-sm font-bold bg-loss/20 text-loss border border-loss/40 rounded hover:bg-loss/30 disabled:opacity-50">
                  {busy ? tt('جارٍ…', 'Working…') : tt('نعم، أعد التوليد', 'Yes, regenerate')}
                </button>
                <button onClick={() => setNeedsForce(false)}
                  className="flex-1 py-1.5 text-sm font-bold text-hint border border-bdr rounded hover:text-text">
                  {tt('إلغاء', 'Cancel')}
                </button>
              </div>
            </div>
          ) : (
            <PrimaryButton onClick={() => run(false)} disabled={busy} className="w-full">
              {busy ? tt('جارٍ التوليد…', 'Generating…') : tt('توليد الجدول', 'Generate')}
            </PrimaryButton>
          )}
        </div>
      )}
    </div>
  );
}

function GroupsEditor({ token, stageId, stageType, groups, comp, cageId, reload }: {
  token: string; stageId: number; stageType: string;
  groups: NonNullable<TCompAge['stages']>[number]['groups'];
  comp: TCompetition; cageId: number; reload: () => void;
}) {
  const tt = useTT();
  const [entries, setEntries] = useState<TCompTeam[]>([]);
  const [groupName, setGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  useEffect(() => { tCompTeams(comp.id, undefined, false, undefined, cageId).then(setEntries); }, [comp.id, cageId]);

  if (stageType === 'league' || stageType === 'knockout') {
    const stageTeamIds = Array.from(new Set((groups ?? []).flatMap(g => g.team_ids)));
    const available = entries.filter(e => !stageTeamIds.includes(e.team_id));
    return (
      <div className="mt-2 space-y-2">
        {available.length > 0 && (
          <select
            onChange={async e => { if (e.target.value) { await tAddStageTeam(token, stageId, Number(e.target.value)); reload(); } }}
            className={`${inputCls} text-xs`} value="">
            <option value="">+ {tt('أضف فريقًا للدور', 'Add team to stage')}</option>
            {available.map(en => <option key={en.id} value={en.team_id}>{en.team_name}</option>)}
          </select>
        )}
        <p className="text-[11px] font-bold text-teal">{tt('فرق الدور', 'Teams in this stage')}</p>
        {stageTeamIds.length === 0 && (
          <p className="text-[11px] text-hint">{tt('لا فرق بعد.', 'No teams yet.')}</p>
        )}
        <div className="flex flex-col gap-1">
          {stageTeamIds.map(id => (
            <div key={id} className="flex items-center justify-between bg-cardBg2 border border-bdr rounded px-2 py-1.5">
              <span className="text-sm text-text">{entries.find(e => e.team_id === id)?.team_name ?? id}</span>
              <button onClick={async () => { await tRemoveStageTeam(token, stageId, id); reload(); }}
                className="text-hint hover:text-loss text-xs leading-none ms-2">✕</button>
            </div>
          ))}
        </div>
        {/* Knockout rounds are created by hand as results come in (no auto-draw),
            so the fixture generator is only offered for a league stage. */}
        {stageType !== 'knockout' && (
          <GenerateFixturesPanel token={token} stageId={stageId} stageType={stageType} teamCount={stageTeamIds.length} groups={groups ?? []} onDone={reload} />
        )}
      </div>
    );
  }

  // Group stage
  const assignedIds = new Set((groups ?? []).flatMap(g => g.team_ids));
  const unassigned = entries.filter(e => !assignedIds.has(e.team_id));

  const startEdit = (g: { id: number; name: string | null }) => {
    setEditingGroupId(g.id);
    setEditingName(g.name ?? '');
  };
  const saveEdit = async (id: number) => {
    await tUpdateGroup(token, id, { name: editingName });
    setEditingGroupId(null);
    reload();
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-end gap-2">
        <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder={tt('مجموعة أ', 'Group A')} className={`${inputCls} text-sm`} />
        <PrimaryButton onClick={async () => { if (groupName) { await tAddGroup(token, stageId, { name: groupName }); setGroupName(''); reload(); } }} className="text-sm">{tt('مجموعة', 'Group')}</PrimaryButton>
      </div>
      {(groups ?? []).map(g => (
        <div key={g.id} className="border-t border-bdr pt-2">
          {editingGroupId === g.id ? (
            <div className="flex items-center gap-2 mb-1">
              <input
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                className={`${inputCls} text-sm flex-1`}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(g.id); if (e.key === 'Escape') setEditingGroupId(null); }}
                autoFocus
              />
              <button onClick={() => saveEdit(g.id)} className="text-xs font-bold text-win hover:underline">{tt('حفظ', 'Save')}</button>
              <button onClick={() => setEditingGroupId(null)} className="text-xs text-hint hover:text-text">{tt('إلغاء', 'Cancel')}</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-text flex-1">{g.name}</span>
              <button onClick={() => startEdit(g)} className="text-[11px] text-teal hover:text-aqua font-bold">{tt('تعديل', 'Edit')}</button>
              <button
                onClick={async () => { if (confirm(tt('حذف المجموعة؟ ستُحذف فرقها أيضًا.', 'Delete this group? Its teams will be removed too.'))) { await tDeleteGroup(token, g.id); reload(); } }}
                className="text-hint hover:text-loss text-sm leading-none">🗑</button>
            </div>
          )}
          <select onChange={async e => { if (e.target.value) { await tAddGroupTeam(token, g.id, Number(e.target.value)); reload(); } }} className={`${inputCls} mt-1 text-xs`} value="">
            <option value="">+ {tt('أضف فريقًا', 'Add team')}</option>
            {unassigned.map(en => <option key={en.id} value={en.team_id}>{en.team_name}</option>)}
          </select>
          <div className="flex flex-col gap-1 mt-1">
            {g.team_ids.map(id => (
              <div key={id} className="flex items-center justify-between bg-cardBg2 border border-bdr rounded px-2 py-1.5">
                <span className="text-sm text-text">{entries.find(e => e.team_id === id)?.team_name ?? id}</span>
                <button onClick={async () => { await tRemoveGroupTeam(token, g.id, id); reload(); }}
                  className="text-hint hover:text-loss text-xs leading-none ms-2">✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <GenerateFixturesPanel
        token={token} stageId={stageId} stageType={stageType}
        teamCount={(groups ?? []).reduce((acc, g) => acc + g.team_ids.length, 0)}
        groups={groups ?? []}
        onDone={reload}
      />
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
    name_en: comp.name_en ?? '',
    description: comp.description ?? '',
    info: comp.info ?? '',
    location: comp.location ?? '',
    location_url: comp.location_url ?? '',
    organizer_name: comp.organizer_name ?? '',
    contact_phone: comp.contact_phone ?? '',
    whatsapp_number: comp.whatsapp_number ?? '',
    whatsapp_group_url: comp.whatsapp_group_url ?? '',
    facebook_url: comp.facebook_url ?? '',
    season_number: comp.season_number != null ? String(comp.season_number) : '',
    start_date: comp.start_date ?? '',
    end_date: comp.end_date ?? '',
  });
  const [registrationOpen, setRegistrationOpen] = useState(comp.registration_open);
  const [logo, setLogo] = useState<File | null>(null);
  const [organizerPhoto, setOrganizerPhoto] = useState<File | null>(null);
  const [organizerPhotoPath, setOrganizerPhotoPath] = useState(comp.organizer_photo_path ?? null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedGuard(isDirty);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF(prev => ({ ...prev, [k]: e.target.value }));
    setIsDirty(true);
  };

  const save = async () => {
    setBusy(true); setOk(false); setErr(null);
    try {
      const updated = await tUpdateCompetition(
        token, comp.id,
        {
          ...f,
          registration_open: registrationOpen ? 'true' : 'false',
          // Empty clears a removed photo; undefined leaves the stored one as-is.
          organizer_photo_path: organizerPhotoPath ? undefined : '',
        },
        logo, undefined, organizerPhoto,
      );
      setOrganizerPhotoPath(updated.organizer_photo_path); setOrganizerPhoto(null);
      setOk(true); setIsDirty(false); setLogo(null); reload();
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
          <Field label={tt('الاسم بالإنجليزية', 'Name (English)')}><input value={f.name_en} onChange={set('name_en')} dir="ltr" className={inputCls} /></Field>
          <Field label={tt('المنظم', 'Organizer')}><input value={f.organizer_name} onChange={set('organizer_name')} className={inputCls} /></Field>
          <Field label={tt('الموسم (رقم)', 'Season (number)')}>
            <input value={f.season_number} onChange={set('season_number')} inputMode="numeric" className={inputCls}
              placeholder={tt('مثال: 1', 'e.g. 1')} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          {(organizerPhoto || organizerPhotoPath) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={organizerPhoto ? URL.createObjectURL(organizerPhoto) : mediaUrl(organizerPhotoPath)!}
              alt="" className="w-14 h-14 rounded-full object-cover border border-bdr shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-darkBg border border-bdr flex items-center justify-center text-hint text-lg shrink-0">👤</div>
          )}
          <div className="flex-1 min-w-0">
            <span className="block text-teal text-[10px] font-bold mb-1">{tt('صورة المنظم', 'Organizer photo')}</span>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="file" accept="image/*"
                onChange={e => { setOrganizerPhoto(e.target.files?.[0] ?? null); setIsDirty(true); }}
                className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
              {(organizerPhoto || organizerPhotoPath) && (
                <button type="button"
                  onClick={() => { setOrganizerPhoto(null); setOrganizerPhotoPath(null); setIsDirty(true); }}
                  className="text-[11px] font-bold text-hint hover:text-loss">{tt('إزالة', 'Remove')}</button>
              )}
            </div>
          </div>
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
          <input type="checkbox" checked={registrationOpen} onChange={e => { setRegistrationOpen(e.target.checked); setIsDirty(true); }} />
          {tt('التسجيل مفتوح', 'Registration is open')}
        </label>
        <Field label={tt('الشعار', 'Logo')}>
          <input type="file" accept="image/*" onChange={e => setLogo(e.target.files?.[0] ?? null)}
            className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
        </Field>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex items-center gap-3 flex-wrap">
          <PrimaryButton onClick={save} disabled={busy || !f.name.trim()}>
            {busy ? tt('جارٍ الحفظ…', 'Saving…') : tt('حفظ', 'Save')}
          </PrimaryButton>
          {ok && <span className="text-win text-sm font-bold">✓ {tt('تم الحفظ', 'Saved')}</span>}
          <UnsavedBadge isDirty={isDirty} />
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
