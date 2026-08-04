'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  tStats, tSeasons, tCreateSeason, tUpdateSeason, tDeleteSeason,
  tCategories, tCreateCategory, tUpdateCategory, tDeleteCategory,
  tManageAcademies, tRestoreAcademy, tSuspendAcademy, tSetAcademyAccount,
  tCompetitions, tCompetition, tCreateCompetition, tUpdateCompetition, tDeleteCompetition, tCloneCompetition, tAddCompAdmin, tRemoveCompAdmin,
  tMatches,
  type TStats, type TSeason, type TCategory, type TAcademy, type TCompetition, type TMatch,
} from '@/lib/tla3bnyApi';
import MatchRow from '@/components/tla3bny/MatchRow';
import { subCompLabel } from '@/lib/utils';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import Spinner from '@/components/ui/Spinner';
import CompDocsEditor from '@/components/tla3bny/CompDocsEditor';
import NewsAdmin from '@/components/tla3bny/NewsAdmin';
import AdsManager from '@/components/tla3bny/AdsManager';
import { Card, Field, inputCls, PrimaryButton, StatusBadge, EmptyState, LogoAvatar, useTT, useName } from '@/components/tla3bny/kit';

type Tab = 'dashboard' | 'matches' | 'competitions' | 'news' | 'ads' | 'academies' | 'seasons' | 'ages';

export default function AdminPage() {
  const tt = useTT();
  const nm = useName();
  const router = useRouter();
  const { user, token, loading, isSuperAdmin, isCompetitionAdmin, competitions } = useTla3bnyAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  useEffect(() => {
    if (loading) return;
    if (!user || !(isSuperAdmin || isCompetitionAdmin)) router.replace('/');
  }, [loading, user, isSuperAdmin, isCompetitionAdmin, router]);

  if (loading || !user || !token) return <Spinner />;

  // competition admin: just their competitions
  if (isCompetitionAdmin && !isSuperAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-black text-text">{tt('بطولاتي', 'My Competitions')}</h1>
        {competitions.length === 0 ? <EmptyState icon="🏆" text={tt('لا بطولات مسندة إليك', 'No competitions assigned')} /> : (
          <div className="space-y-2">
            {competitions.map(c => (
              <Link key={c.id} href={`/manage?comp=${c.id}`}>
                <Card className="p-3 flex items-center justify-between hover:border-aqua/50">
                  <span className="font-bold text-text">{nm(c.name, c.name_en)}</span>
                  <span className="text-xs text-aqua font-bold">{tt('إدارة ←', 'Manage →')}</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const tabs: Tab[] = ['dashboard', 'matches', 'competitions', 'news', 'ads', 'academies', 'seasons', 'ages'];
  const tabLabel: Record<Tab, [string, string]> = {
    dashboard: ['الرئيسية', 'Dashboard'],
    matches: ['المباريات', 'Matches'],
    seasons: ['المواسم', 'Seasons'],
    ages: ['الفئات', 'Ages'],
    academies: ['الأكاديميات', 'Academies'],
    competitions: ['البطولات', 'Competitions'],
    news: ['📰 الأخبار', '📰 News'],
    ads: ['📣 إعلانات الرئيسية', '📣 Home ads'],
  };
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-text">{tt('الإدارة', 'Admin')}</h1>
      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt(tabLabel[t][0], tabLabel[t][1])}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <Dashboard token={token} user={user} />}
      {tab === 'matches' && <MatchesAdmin token={token} />}
      {tab === 'seasons' && <Seasons token={token} />}
      {tab === 'ages' && <Ages token={token} />}
      {tab === 'academies' && <Academies token={token} />}
      {tab === 'competitions' && <Competitions token={token} />}
      {tab === 'news' && <NewsAdmin token={token} compId={null} />}
      {tab === 'ads' && <AdsManager token={token} />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, tone = 'text-text' }: {
  icon: string; label: string; value: number | string; tone?: string;
}) {
  return (
    <Card className="p-3">
      <p className="text-hint text-[11px]">{icon} {label}</p>
      <p className={`${tone} font-extrabold text-xl tabular-nums mt-0.5`}>{value}</p>
    </Card>
  );
}

function Dashboard({ token, user }: { token: string; user: import('@/lib/tla3bnyApi').TUser }) {
  const tt = useTT();
  const nm = useName();
  const [s, setS] = useState<TStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    tStats(token).then(setS).catch(e => setErr(e instanceof Error ? e.message : tt('خطأ', 'Error')));
  }, [token]);

  const pct = s && s.matches.total ? Math.round((s.matches.played / s.matches.total) * 100) : 0;
  const pending = (s?.competitions ?? []).filter(c => c.total_matches > c.played_matches)
    .sort((a, b) => (b.total_matches - b.played_matches) - (a.total_matches - a.played_matches));

  return (
    <div className="space-y-4">
      {/* Welcome */}
      <div className="bg-gradient-to-l from-aqua/[0.08] to-transparent border border-bdr rounded-2xl p-4">
        <p className="text-text text-sm">
          {tt('أهلاً،', 'Welcome,')} <span className="text-aqua font-bold">{user.name || user.username}</span> 👋
        </p>
        {s?.active_season && (
          <p className="text-hint text-xs mt-1">{tt('الموسم الحالي:', 'Active season:')} {s.active_season}</p>
        )}
      </div>

      {err && <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">{err}</p>}
      {!s && !err && <p className="text-hint text-sm text-center py-6">…</p>}

      {s && (<>
        {/* Pending approvals banner */}
        {s.pending_approvals > 0 && (
          <div className="flex items-center gap-3 bg-gold/10 border border-gold/40 rounded-2xl px-4 py-3">
            <span className="text-2xl">⏳</span>
            <div>
              <p className="text-gold font-bold text-sm">
                {s.pending_approvals} {tt('لاعب بانتظار الاعتماد', 'players awaiting approval')}
              </p>
              <p className="text-hint text-[11px]">
                {tt('افتح تبويب الاعتمادات في البطولة المناسبة.', 'Open the Approvals tab in the relevant competition.')}
              </p>
            </div>
          </div>
        )}

        {/* Count grid */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard icon="🗓️" label={tt('المواسم', 'Seasons')} value={s.counts.seasons} />
          <StatCard icon="🏆" label={tt('البطولات', 'Competitions')} value={s.counts.competitions} />
          <StatCard icon="🎯" label={tt('الفئات', 'Age categories')} value={s.counts.age_categories} />
          <StatCard icon="🏫" label={tt('الأكاديميات', 'Academies')} value={s.counts.academies} />
          <StatCard icon="⚽" label={tt('الفرق', 'Teams')} value={s.counts.teams} />
          <StatCard icon="👤" label={tt('اللاعبون', 'Players')} value={s.counts.players} />
          <StatCard icon="🥅" label={tt('الأهداف', 'Goals')} value={s.counts.goals} tone="text-gold" />
          <StatCard icon="🧑‍🏫" label={tt('المدربون', 'Coaches')} value={s.counts.coaches} />
          <StatCard icon="📰" label={tt('الأخبار', 'News')} value={s.counts.news} />
        </div>

        {/* Match completion */}
        {s.matches.total > 0 && (
          <Card className="p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-text font-bold text-sm">📋 {tt('إدخال النتائج', 'Result entry')}</p>
              <p className="text-aqua font-extrabold tabular-nums">{pct}%</p>
            </div>
            <div className="h-2 bg-darkBg rounded-full overflow-hidden">
              <div className="h-full bg-aqua rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-hint text-[11px] tabular-nums">
              {s.matches.played} {tt('مكتملة', 'done')} · {s.matches.remaining} {tt('متبقية', 'remaining')} · {s.matches.total} {tt('إجمالاً', 'total')}
            </p>
          </Card>
        )}

        {/* Averages */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon="📈" label={tt('هدف / مباراة', 'Goals / match')} value={s.averages.goals_per_match} tone="text-gold" />
          <StatCard icon="👥" label={tt('لاعب / فريق', 'Players / team')} value={s.averages.players_per_team} />
        </div>

        {/* Per-competition table */}
        <Card className="p-4 space-y-3">
          <p className="text-text font-bold text-sm">🏆 {tt('البطولات', 'Competitions')}</p>
          {s.competitions.length === 0
            ? <p className="text-hint text-xs">{tt('لا بطولات بعد', 'No competitions yet')}</p>
            : s.competitions.map(c => {
              const compPct = c.total_matches ? Math.round((c.played_matches / c.total_matches) * 100) : null;
              return (
                <div key={c.id} className="border-t border-bdr/50 pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <span className="font-bold text-text text-sm truncate block">{nm(c.name, c.name_en)}</span>
                      <span className="text-[11px] text-hint">{c.season_name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-[11px]">
                      {c.pending_players > 0 && (
                        <span className="text-gold font-bold">⏳ {c.pending_players}</span>
                      )}
                      <span className={`font-bold px-2 py-0.5 rounded-full ${
                        c.status === 'active' ? 'bg-win/15 text-win' :
                        c.status === 'finished' ? 'bg-hint/15 text-hint' : 'bg-aqua/10 text-teal'
                      }`}>
                        {tt(
                          { active: 'نشطة', finished: 'منتهية', draft: 'مسودة' }[c.status],
                          { active: 'Active', finished: 'Finished', draft: 'Draft' }[c.status],
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-hint tabular-nums">
                    <span>⚽ {c.teams} {tt('فريق', 'teams')}</span>
                    <span>📋 {c.played_matches}/{c.total_matches} {tt('مباراة', 'matches')}</span>
                    {compPct !== null && (
                      <div className="flex-1 h-1.5 bg-darkBg rounded-full overflow-hidden">
                        <div className="h-full bg-aqua/60 rounded-full" style={{ width: `${compPct}%` }} />
                      </div>
                    )}
                  </div>
                  {/* Priced participating-player cap: approved players vs limit. */}
                  {c.max_players != null && (() => {
                    const used = c.approved_players;
                    const cap = c.max_players!;
                    const capPct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
                    const full = used >= cap;
                    const near = !full && cap > 0 && used / cap >= 0.8;
                    const barColor = full ? 'bg-loss' : near ? 'bg-gold' : 'bg-win';
                    const numColor = full ? 'text-loss' : near ? 'text-gold' : 'text-win';
                    return (
                      <div className="flex items-center gap-2 text-[11px] text-hint tabular-nums mt-1">
                        <span className={`${numColor} font-bold shrink-0`}>🎟️ {used}/{cap} {tt('لاعب', 'players')}</span>
                        <div className="flex-1 h-1.5 bg-darkBg rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${capPct}%` }} />
                        </div>
                        {full && <span className="text-loss font-bold shrink-0">{tt('مكتمل', 'Full')}</span>}
                      </div>
                    );
                  })()}
                </div>
              );
            })
          }
        </Card>
      </>)}
    </div>
  );
}

// ── Global Matches Admin ──────────────────────────────────────────────────────
function MatchesAdmin({ token }: { token: string }) {
  const tt = useTT();
  const [seasons, setSeasons] = useState<TSeason[]>([]);
  const [comps, setComps] = useState<TCompetition[]>([]);
  const [selComp, setSelComp] = useState<TCompetition | null>(null);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [compId, setCompId] = useState('');
  const [ageId, setAgeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { tSeasons().then(setSeasons).catch(() => {}); }, []);

  useEffect(() => {
    if (!seasonId) { setComps([]); setCompId(''); setSelComp(null); setMatches([]); return; }
    tCompetitions(Number(seasonId), token).then(setComps).catch(() => setComps([]));
    setCompId(''); setSelComp(null); setAgeId(null); setMatches([]);
  }, [seasonId, token]);

  useEffect(() => {
    if (!compId) { setSelComp(null); setAgeId(null); setMatches([]); return; }
    tCompetition(Number(compId)).then(c => {
      setSelComp(c);
      setAgeId(c.ages?.[0]?.age_category_id ?? null);
    });
  }, [compId]);

  useEffect(() => {
    if (!compId) { setMatches([]); return; }
    setLoading(true);
    const params: Parameters<typeof tMatches>[0] = { competition_id: Number(compId) };
    if (ageId) params.age_category_id = ageId;
    if (statusFilter) params.status = statusFilter;
    tMatches({ ...params, order: 'asc' }).then(setMatches).catch(() => setMatches([])).finally(() => setLoading(false));
  }, [compId, ageId, statusFilter]);

  const ages = selComp?.ages ?? [];
  const shown = matches;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 gap-2">
        <Field label={tt('الموسم', 'Season')}>
          <select value={seasonId} onChange={e => setSeasonId(e.target.value)} className={inputCls}>
            <option value="">— {tt('اختر موسمًا', 'Choose season')}</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name}</option>)}
          </select>
        </Field>
        <Field label={tt('البطولة', 'Competition')}>
          <select value={compId} onChange={e => setCompId(e.target.value)} className={inputCls} disabled={!seasonId}>
            <option value="">—</option>
            {comps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      {compId && (
        <div className="grid grid-cols-2 gap-2">
          {ages.length > 1 && (
            <select value={ageId ?? ''} onChange={e => setAgeId(Number(e.target.value) || null)} className={inputCls + ' text-sm'}>
              <option value="">{tt('كل الفئات', 'All ages')}</option>
              {ages.map(a => <option key={a.id} value={a.age_category_id}>{subCompLabel(a)}</option>)}
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
          <span className="col-span-2 text-hint text-xs tabular-nums text-end">{shown.length} {tt('مباراة', 'matches')}</span>
        </div>
      )}

      {loading && <Spinner />}
      {!loading && !compId && (
        <p className="text-hint text-sm text-center py-8">{tt('اختر موسمًا وبطولة', 'Select a season and competition')}</p>
      )}
      {!loading && compId && shown.length === 0 && (
        <EmptyState icon="📋" text={tt('لا مباريات', 'No matches')} />
      )}
      <div>{shown.map(m => <MatchRow key={m.id} m={m} showComp />)}</div>
    </div>
  );
}

const BLANK_SEASON = { name_ar: '', name_en: '', start_date: '', end_date: '', is_active: true };

function Seasons({ token }: { token: string }) {
  const tt = useTT();
  const [items, setItems] = useState<TSeason[]>([]);
  const [f, setF] = useState(BLANK_SEASON);
  const [editing, setEditing] = useState<TSeason | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => { tSeasons().then(setItems).catch(() => setItems([])); }, []);
  useEffect(reload, [reload]);

  const create = async () => {
    if (!f.name_ar.trim() && !f.name_en.trim()) return;
    setBusy(true);
    try { await tCreateSeason(token, f); setF(BLANK_SEASON); reload(); }
    finally { setBusy(false); }
  };

  const toggleActive = async (s: TSeason) => {
    await tUpdateSeason(token, s.id, { is_active: !s.is_active }); reload();
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-3">
        <p className="text-teal text-xs font-bold">➕ {tt('موسم جديد', 'New season')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tt('الاسم (عربي)', 'Name (Arabic)')}>
            <input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} placeholder="2025-2026" className={inputCls} />
          </Field>
          <Field label={tt('الاسم (إنجليزي)', 'Name (English)')}>
            <input value={f.name_en} dir="ltr" onChange={e => setF({ ...f, name_en: e.target.value })} placeholder="2025-2026" className={inputCls} />
          </Field>
          <Field label={tt('تاريخ البداية', 'Start date')}>
            <input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} className={inputCls} />
          </Field>
          <Field label={tt('تاريخ النهاية', 'End date')}>
            <input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-teal text-xs cursor-pointer">
          <input type="checkbox" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} />
          {tt('الموسم الحالي (النشط)', 'Current (active) season')}
        </label>
        <PrimaryButton onClick={create} disabled={busy || (!f.name_ar.trim() && !f.name_en.trim())}>
          {tt('إضافة الموسم', 'Add season')}
        </PrimaryButton>
      </Card>

      <div className="space-y-2">
        {items.map(s => editing?.id === s.id ? (
          <SeasonEditRow key={s.id} token={token} season={s}
            onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
        ) : (
          <Card key={s.id} className="p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-text text-sm">{s.name_ar || s.name}</p>
              {s.name_en && <p className="text-hint text-[11px]" dir="ltr">{s.name_en}</p>}
              {(s.start_date || s.end_date) && (
                <p className="text-hint text-[11px] tabular-nums">{s.start_date} ← {s.end_date}</p>
              )}
            </div>
            <button onClick={() => setEditing(s)}
              className="text-[11px] font-bold rounded-lg px-3 py-1.5 border text-aqua border-aqua/40 hover:bg-aqua/10">
              {tt('تعديل', 'Edit')}
            </button>
            <button onClick={() => toggleActive(s)}
              className={`text-[11px] font-bold rounded-lg px-3 py-1.5 border transition-colors ${s.is_active ? 'text-win border-win/40 bg-win/10' : 'text-hint border-bdr hover:border-teal'}`}>
              {s.is_active ? tt('● نشط', '● Active') : tt('تفعيل', 'Activate')}
            </button>
            <button onClick={async () => { if (confirm(tt('حذف الموسم؟', 'Delete season?'))) { await tDeleteSeason(token, s.id); reload(); } }}
              className="text-hint hover:text-loss">🗑</button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SeasonEditRow({ token, season, onDone, onCancel }: {
  token: string; season: TSeason; onDone: () => void; onCancel: () => void;
}) {
  const tt = useTT();
  const [f, setF] = useState({
    name_ar: season.name_ar ?? '',
    name_en: season.name_en ?? '',
    start_date: season.start_date ?? '',
    end_date: season.end_date ?? '',
    is_active: season.is_active,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try { await tUpdateSeason(token, season.id, f); onDone(); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-3 space-y-3 border-aqua/40">
      <p className="text-teal text-xs font-bold">✏️ {tt('تعديل الموسم', 'Edit season')}</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label={tt('الاسم (عربي)', 'Name (Arabic)')}>
          <input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} placeholder="2025-2026" className={inputCls} />
        </Field>
        <Field label={tt('الاسم (إنجليزي)', 'Name (English)')}>
          <input value={f.name_en} dir="ltr" onChange={e => setF({ ...f, name_en: e.target.value })} placeholder="2025-2026" className={inputCls} />
        </Field>
        <Field label={tt('تاريخ البداية', 'Start date')}>
          <input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} className={inputCls} />
        </Field>
        <Field label={tt('تاريخ النهاية', 'End date')}>
          <input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} className={inputCls} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-teal text-xs cursor-pointer">
        <input type="checkbox" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} />
        {tt('الموسم الحالي (النشط)', 'Current (active) season')}
      </label>
      <div className="flex items-center gap-2">
        <PrimaryButton onClick={save} disabled={busy} className="text-sm">
          {busy ? tt('…', '…') : tt('حفظ', 'Save')}
        </PrimaryButton>
        <button onClick={onCancel} className="text-xs text-hint hover:text-text">{tt('إلغاء', 'Cancel')}</button>
      </div>
    </Card>
  );
}

/** Mirrors codes.TLA3BNY_DEFAULT_PLAYER_DOCS — the starting point an organiser
 *  edits; they can add as many papers as they need. */
const DEFAULT_DOCS = 'شهادة الميلاد\nخطاب من المدرسة\nالرقم القومي للاعب\nالشهادة الصحية';

const toLines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);

const BLANK_AGE = { label_ar: '', label_en: '', oldest_birth_year: '', docs: DEFAULT_DOCS };

function Ages({ token }: { token: string }) {
  const tt = useTT();
  const [items, setItems] = useState<TCategory[]>([]);
  const [f, setF] = useState(BLANK_AGE);
  const [editing, setEditing] = useState<TCategory | null>(null);
  const reload = useCallback(() => { tCategories().then(setItems).catch(() => setItems([])); }, []);
  useEffect(reload, [reload]);

  const create = async () => {
    const labelEn = f.label_en.trim();
    const labelAr = f.label_ar.trim();
    if (!labelEn && !labelAr) return;
    const label = labelEn || labelAr;
    await tCreateCategory(token, {
      label, label_ar: labelAr || undefined, label_en: labelEn || undefined,
      oldest_birth_year: f.oldest_birth_year ? Number(f.oldest_birth_year) : undefined,
      required_documents: toLines(f.docs),
    });
    setF(BLANK_AGE); reload();
  };

  return (
    <div className="space-y-2">
      {items.map(c => editing?.id === c.id
        ? <AgeEditRow key={c.id} token={token} cat={c} reload={reload} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
        : <AgeRow key={c.id} token={token} cat={c} reload={reload} onEdit={() => setEditing(c)} />
      )}
      <Card className="p-3 space-y-2">
        <p className="text-teal text-xs font-bold">➕ {tt('فئة عمرية جديدة', 'New age category')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tt('الاسم (عربي)', 'Name (Arabic)')}>
            <input value={f.label_ar} onChange={e => setF({ ...f, label_ar: e.target.value })} placeholder="تحت 10" className={inputCls} />
          </Field>
          <Field label={tt('الاسم (إنجليزي)', 'Name (English)')}>
            <input value={f.label_en} dir="ltr" onChange={e => setF({ ...f, label_en: e.target.value })} placeholder="U10" className={inputCls} />
          </Field>
        </div>
        <Field label={tt('أقدم سنة ميلاد (اللاعب مؤهّل إذا وُلد في هذه السنة أو بعدها)', 'Oldest birth year (player must be born this year or later)')}>
          <input value={f.oldest_birth_year} onChange={e => setF({ ...f, oldest_birth_year: e.target.value })}
            type="number" placeholder="2015" inputMode="numeric" className={inputCls} />
        </Field>
        <Field label={tt('أوراق افتراضية للفئة (سطر لكل ورقة)', 'Default papers (one per line)')}>
          <textarea value={f.docs} onChange={e => setF({ ...f, docs: e.target.value })} rows={3} className={inputCls} />
        </Field>
        <PrimaryButton onClick={create} disabled={!f.label_ar.trim() && !f.label_en.trim()}>
          {tt('إضافة فئة', 'Add age')}
        </PrimaryButton>
      </Card>
    </div>
  );
}

function AgeRow({ token, cat, reload, onEdit }: { token: string; cat: TCategory; reload: () => void; onEdit: () => void }) {
  const tt = useTT();
  return (
    <Card className="p-3 flex items-center justify-between">
      <button onClick={onEdit} className="text-start min-w-0 flex-1">
        <div className="font-black text-text text-sm">
          {cat.label_ar || cat.label}
          {cat.label_en && cat.label_ar && <span className="text-hint font-normal" dir="ltr"> · {cat.label_en}</span>}
        </div>
        {cat.oldest_birth_year && (
          <div className="text-[11px] text-teal font-bold tabular-nums">
            {tt(`≥ ${cat.oldest_birth_year}`, `≥ ${cat.oldest_birth_year}`)}
          </div>
        )}
      </button>
      <button onClick={async () => { try { await tDeleteCategory(token, cat.id); reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } }} className="text-hint hover:text-loss ms-3">🗑</button>
    </Card>
  );
}

function AgeEditRow({ token, cat, reload, onCancel, onDone }: {
  token: string; cat: TCategory; reload: () => void; onCancel: () => void; onDone: () => void;
}) {
  const tt = useTT();
  const [f, setF] = useState({
    label_ar: cat.label_ar ?? '',
    label_en: cat.label_en ?? (cat.label ?? ''),
    oldest_birth_year: cat.oldest_birth_year ? String(cat.oldest_birth_year) : '',
    docs: (cat.required_documents ?? []).join('\n'),
  });
  const [ok, setOk] = useState(false);
  const save = async () => {
    const labelEn = f.label_en.trim();
    const labelAr = f.label_ar.trim();
    await tUpdateCategory(token, cat.id, {
      label: labelEn || labelAr || cat.label,
      label_ar: labelAr || undefined,
      label_en: labelEn || undefined,
      oldest_birth_year: f.oldest_birth_year ? Number(f.oldest_birth_year) : undefined,
      required_documents: toLines(f.docs),
    });
    setOk(true); setTimeout(() => { setOk(false); onDone(); }, 800);
  };
  return (
    <Card className="p-3 space-y-2 border-aqua/40">
      <div className="grid grid-cols-2 gap-2">
        <Field label={tt('الاسم (عربي)', 'Name (Arabic)')}>
          <input value={f.label_ar} onChange={e => setF({ ...f, label_ar: e.target.value })} placeholder="تحت 10" className={inputCls} />
        </Field>
        <Field label={tt('الاسم (إنجليزي)', 'Name (English)')}>
          <input value={f.label_en} dir="ltr" onChange={e => setF({ ...f, label_en: e.target.value })} placeholder="U10" className={inputCls} />
        </Field>
      </div>
      <Field label={tt('أقدم سنة ميلاد', 'Oldest birth year')}>
        <input value={f.oldest_birth_year} onChange={e => setF({ ...f, oldest_birth_year: e.target.value })}
          type="number" placeholder="2015" inputMode="numeric" className={inputCls} />
      </Field>
      <Field label={tt('الأوراق الافتراضية (سطر لكل ورقة)', 'Default papers (one per line)')}>
        <textarea value={f.docs} onChange={e => setF({ ...f, docs: e.target.value })} rows={3} className={inputCls} />
      </Field>
      <div className="flex items-center gap-2">
        <PrimaryButton onClick={save} className="text-sm">{ok ? '✓' : tt('حفظ', 'Save')}</PrimaryButton>
        <button onClick={onCancel} className="text-xs text-hint hover:text-text">{tt('إلغاء', 'Cancel')}</button>
      </div>
    </Card>
  );
}

/**
 * Registration is open, so there is no approval queue here — this lists every
 * academy on the site, and the actions are the ones that remain: take a
 * misbehaving one off the site, and reset an owner's forgotten login.
 */
function Academies({ token }: { token: string }) {
  const tt = useTT();
  const [items, setItems] = useState<TAcademy[]>([]);
  const [q, setQ] = useState('');
  const reload = useCallback(() => { tManageAcademies(token).then(setItems).catch(() => setItems([])); }, [token]);
  useEffect(reload, [reload]);

  const shown = items.filter(a => !q || a.name.toLowerCase().includes(q.toLowerCase()));
  const suspended = items.filter(a => a.status === 'suspended' || a.status === 'rejected').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={tt('بحث بالاسم…', 'Search by name…')} className={inputCls} />
      </div>
      <p className="text-hint text-[11px]">
        {tt(`${items.length} أكاديمية${suspended ? ` · ${suspended} موقوفة` : ''} — التسجيل مفتوح للجميع.`,
            `${items.length} academies${suspended ? ` · ${suspended} suspended` : ''} — registration is open to all.`)}
      </p>
      {shown.length === 0 && <EmptyState icon="🏫" text={tt('لا أكاديميات', 'No academies')} />}
      {shown.map(a => <AcademyRow key={a.id} a={a} token={token} reload={reload} />)}
    </div>
  );
}

function AcademyRow({ a, token, reload }: { a: TAcademy; token: string; reload: () => void }) {
  const tt = useTT();
  const [accOpen, setAccOpen] = useState(false);
  const [acc, setAcc] = useState({ username: '', password: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const isOff = a.status === 'suspended' || a.status === 'rejected';

  const saveAcc = async () => {
    try {
      await tSetAcademyAccount(token, a.id, acc);
      setMsg(tt('تم حفظ بيانات الدخول', 'Login saved'));
      setAcc({ username: '', password: '' });
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Card className={`p-3 ${isOff ? 'border-loss/40' : ''}`}>
      <div className="flex items-center gap-3">
        <LogoAvatar src={a.logo_path} name={a.name} size={40} />
        <div className="min-w-0 flex-1">
          <Link href={`/academy?id=${a.id}`} className="font-bold text-text truncate hover:text-aqua">{a.name}</Link>
          <div className="text-[11px] text-hint" dir="ltr">{a.phone}</div>
        </div>
        <StatusBadge status={isOff ? 'rejected' : 'approved'}
          label={isOff ? tt('موقوفة', 'Suspended') : tt('نشطة', 'Active')} />
      </div>
      {a.rejection_reason && isOff && <p className="text-loss text-[11px] mt-1">{a.rejection_reason}</p>}
      <div className="flex items-center gap-3 mt-2">
        {isOff
          ? <button onClick={async () => { await tRestoreAcademy(token, a.id); reload(); }}
              className="text-xs font-bold text-win hover:underline">{tt('إعادة تفعيل', 'Restore')}</button>
          : <button onClick={async () => {
              if (!confirm(tt('إيقاف الأكاديمية؟ لن تستطيع الدخول أو التسجيل.', 'Suspend this academy? It will not be able to sign in or enter teams.'))) return;
              await tSuspendAcademy(token, a.id, prompt(tt('السبب (اختياري)', 'Reason (optional)')) || undefined);
              reload();
            }} className="text-xs font-bold text-loss hover:underline">{tt('إيقاف', 'Suspend')}</button>}
        <button onClick={() => setAccOpen(o => !o)} className="text-xs font-bold text-teal hover:underline">
          {tt('بيانات الدخول', 'Reset login')}
        </button>
      </div>
      {accOpen && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <input value={acc.username} dir="ltr" onChange={e => setAcc({ ...acc, username: e.target.value })}
              placeholder={tt('اسم المستخدم', 'Username')} className={inputCls} />
            <input value={acc.password} type="password" onChange={e => setAcc({ ...acc, password: e.target.value })}
              placeholder={tt('كلمة المرور', 'Password')} className={inputCls} />
            <PrimaryButton onClick={saveAcc} disabled={!acc.username.trim() || !acc.password} className="text-sm">
              {tt('حفظ', 'Save')}
            </PrimaryButton>
          </div>
          {msg && <p className="text-[11px] text-hint">{msg}</p>}
        </div>
      )}
    </Card>
  );
}

function Competitions({ token }: { token: string }) {
  const tt = useTT();
  const [seasons, setSeasons] = useState<TSeason[]>([]);
  const [items, setItems] = useState<TCompetition[]>([]);
  const [filterSeason, setFilterSeason] = useState('');
  const [q, setQ] = useState('');
  const [f, setF] = useState({ season_id: '', name: '', name_en: '', location: '', max_players: '', docs: DEFAULT_DOCS });
  const reload = useCallback(() => { tCompetitions(undefined, token).then(setItems).catch(() => setItems([])); }, [token]);
  useEffect(() => {
    tSeasons().then(ss => {
      setSeasons(ss);
      // Default filter to the active season.
      const active = ss.find(s => s.is_active);
      if (active) setFilterSeason(String(active.id));
    });
    reload();
  }, [reload]);
  const create = async () => {
    if (!f.season_id || !f.name) return;
    await tCreateCompetition(
      token,
      {
        season_id: Number(f.season_id), name: f.name, name_en: f.name_en || undefined, location: f.location || undefined,
        max_players: f.max_players ? Number(f.max_players) : undefined,
      },
      null, toLines(f.docs),
    );
    setF({ season_id: '', name: '', name_en: '', location: '', max_players: '', docs: DEFAULT_DOCS }); reload();
  };
  const visible = items.filter(c =>
    (!filterSeason || String(c.season_id) === filterSeason) &&
    (!q || c.name.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div className="space-y-2">
      {/* Season + name filters */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-bold text-teal shrink-0">{tt('الموسم', 'Season')}</label>
        <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} className={inputCls + ' text-sm flex-1'}>
          <option value="">{tt('كل المواسم', 'All seasons')}</option>
          {seasons.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.is_active ? tt(' (الحالي)', ' (active)') : ''}
            </option>
          ))}
        </select>
      </div>
      <input
        value={q} onChange={e => setQ(e.target.value)}
        placeholder={tt('بحث باسم البطولة…', 'Search competitions…')}
        className={inputCls + ' text-sm'}
      />
      {visible.length === 0 && items.length > 0 && (
        <p className="text-hint text-sm text-center py-2">
          {q ? tt('لا نتائج', 'No results') : tt('لا بطولات في هذا الموسم', 'No competitions in this season')}
        </p>
      )}
      {visible.map(c => <CompRow key={c.id} c={c} token={token} seasons={seasons} reload={reload} />)}
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label={tt('الموسم', 'Season')}>
            <select value={f.season_id} onChange={e => setF({ ...f, season_id: e.target.value })} className={inputCls}>
              <option value="">—</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label={tt('الاسم', 'Name')}><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        </div>
        <Field label={tt('الاسم بالإنجليزية (اختياري)', 'Name in English (optional)')}><input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
        <Field label={tt('المكان', 'Location')}><input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} className={inputCls} /></Field>
        <Field label={tt('الحد الأقصى لعدد اللاعبين المشاركين', 'Max participating players')}>
          <input
            type="number" min={1} inputMode="numeric" value={f.max_players}
            onChange={e => setF({ ...f, max_players: e.target.value })}
            placeholder={tt('بدون حد', 'No limit')} className={inputCls}
          />
        </Field>
        <p className="text-[10px] text-hint -mt-1">
          {tt('يحدد سعر استخدام تلاعبني حسب عدد اللاعبين المشاركين في البطولة. اتركه فارغًا لعدم وضع حد.',
              'Sets the tla3bny price by the number of players taking part in the competition. Leave empty for no limit.')}
        </p>
        <Field label={tt('أوراق اللاعبين المطلوبة (سطر لكل ورقة)', 'Required player papers (one per line)')}>
          <textarea value={f.docs} onChange={e => setF({ ...f, docs: e.target.value })} rows={4} className={inputCls} />
        </Field>
        <p className="text-[10px] text-hint -mt-1">
          {tt('أضف ما تشاء من الأوراق. ترفعها الأكاديمية لكل لاعب، وتظهر في لوحة الإدارة فقط.',
              'Add as many papers as you need. Academies upload them per player, and they show in the admin panel only.')}
        </p>
        <PrimaryButton onClick={create} disabled={!f.season_id || !f.name}>{tt('إنشاء بطولة', 'Create competition')}</PrimaryButton>
      </Card>
    </div>
  );
}

function CompRow({ c, token, seasons, reload }: { c: TCompetition; token: string; seasons: TSeason[]; reload: () => void }) {
  const tt = useTT();
  const nm = useName();
  const [adminOpen, setAdminOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneSeason, setCloneSeason] = useState('');
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneMsg, setCloneMsg] = useState<string | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [limitVal, setLimitVal] = useState(c.max_players == null ? '' : String(c.max_players));
  const [limitBusy, setLimitBusy] = useState(false);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [adsOpen, setAdsOpen] = useState(false);
  const [adsEnabled, setAdsEnabled] = useState(c.ads_enabled);
  const [maxAds, setMaxAds] = useState(String(c.max_ads));
  const [adsBusy, setAdsBusy] = useState(false);
  const [adsMsg, setAdsMsg] = useState<string | null>(null);
  const [af, setAf] = useState({ username: '', password: '', name: '' });
  const [msg, setMsg] = useState<string | null>(null);

  const otherSeasons = seasons.filter(s => s.id !== c.season_id);

  const saveAds = async () => {
    setAdsBusy(true); setAdsMsg(null);
    try {
      await tUpdateCompetition(token, c.id, { ads_enabled: adsEnabled ? 'true' : 'false', max_ads: Number(maxAds) || 0 });
      setAdsMsg(tt('✓ تم الحفظ', '✓ Saved'));
      reload();
    } catch (e) { setAdsMsg(e instanceof Error ? e.message : String(e)); }
    finally { setAdsBusy(false); }
  };
  const saveLimit = async () => {
    setLimitBusy(true); setLimitMsg(null);
    try {
      // '' clears the cap (unlimited); a number sets it.
      await tUpdateCompetition(token, c.id, { max_players: limitVal === '' ? '' : Number(limitVal) });
      setLimitMsg(tt('✓ تم الحفظ', '✓ Saved'));
      reload();
    } catch (e) { setLimitMsg(e instanceof Error ? e.message : String(e)); }
    finally { setLimitBusy(false); }
  };

  const addAdmin = async () => {
    try {
      await tAddCompAdmin(token, c.id, af);
      setMsg(tt('تم إسناد المنظم', 'Organizer assigned'));
      setAf({ username: '', password: '', name: '' });
      reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const clone = async () => {
    if (!cloneSeason) return;
    setCloneBusy(true); setCloneMsg(null);
    try {
      await tCloneCompetition(token, c.id, Number(cloneSeason));
      setCloneMsg(tt('✓ تم النسخ بنجاح', '✓ Cloned successfully'));
      reload();
    } catch (e) { setCloneMsg(e instanceof Error ? e.message : String(e)); }
    finally { setCloneBusy(false); }
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-text">{nm(c.name, c.name_en)} <span className="text-[11px] text-hint">· {c.season_name}</span></span>
        <div className="flex items-center gap-2">
          <button onClick={() => setDocsOpen(o => !o)} className="text-xs text-teal font-bold hover:underline">{tt('الأوراق', 'Papers')}</button>
          <button onClick={() => { setLimitOpen(o => !o); setLimitMsg(null); }} className="text-xs text-teal font-bold hover:underline">
            {tt('حد اللاعبين', 'Player limit')}{c.max_players != null && <span className="text-hint font-normal"> · {c.max_players}</span>}
          </button>
          <button onClick={() => { setAdsOpen(o => !o); setAdsMsg(null); }} className="text-xs text-teal font-bold hover:underline">
            {tt('الإعلانات', 'Ads')}<span className="text-hint font-normal"> · {c.ads_enabled ? c.max_ads : tt('موقوف', 'off')}</span>
          </button>
          <button onClick={() => setAdminOpen(o => !o)} className="text-xs text-teal font-bold hover:underline">{tt('المنظمون', 'Organizers')}</button>
          <button onClick={() => { setCloneOpen(o => !o); setCloneMsg(null); }} className="text-xs text-gold font-bold hover:underline">{tt('نسخ لموسم', 'Clone')}</button>
          <Link href={`/manage?comp=${c.id}`} className="text-xs text-aqua font-bold hover:underline">{tt('إدارة', 'Manage')}</Link>
          <button onClick={async () => { if (confirm(tt('حذف البطولة؟', 'Delete competition?'))) { await tDeleteCompetition(token, c.id); reload(); } }} className="text-hint hover:text-loss">🗑</button>
        </div>
      </div>

      {limitOpen && (
        <div className="mt-2 pt-2 border-t border-bdr/50 space-y-2">
          <p className="text-[11px] text-hint">
            {tt('الحد الأقصى لعدد اللاعبين المشاركين في البطولة كلها — يُحدد سعر تلاعبني. اتركه فارغًا لعدم وضع حد.',
                'Max players taking part across the whole competition — sets the tla3bny price. Leave empty for no limit.')}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} inputMode="numeric" value={limitVal}
              onChange={e => setLimitVal(e.target.value)}
              placeholder={tt('بدون حد', 'No limit')} className={inputCls + ' flex-1 text-sm'}
            />
            <PrimaryButton onClick={saveLimit} disabled={limitBusy} className="text-sm shrink-0">
              {limitBusy ? tt('…', '…') : tt('حفظ', 'Save')}
            </PrimaryButton>
          </div>
          {limitMsg && <p className={`text-[11px] ${limitMsg.startsWith('✓') ? 'text-win' : 'text-loss'}`}>{limitMsg}</p>}
        </div>
      )}

      {adsOpen && (
        <div className="mt-2 pt-2 border-t border-bdr/50 space-y-2">
          <p className="text-[11px] text-hint">
            {tt('تحكّم في إعلانات هذه البطولة: عدد الإعلانات المسموح به للمنظّم، ومفتاح إظهار/إخفاء الكل (استخدمه لو لم تُدفع رسوم الإعلانات).',
                "Control this competition's ads: how many the organiser may run, and a master show/hide switch (use it if ad fees are unpaid).")}
          </p>
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={adsEnabled} onChange={e => setAdsEnabled(e.target.checked)} />
            {tt('الإعلانات ظاهرة للجمهور', 'Ads visible to the public')}
          </label>
          <div className="flex items-center gap-2">
            <label className="text-xs text-hint shrink-0">{tt('عدد الإعلانات المسموح', 'Ads allowed')}</label>
            <input
              type="number" min={0} inputMode="numeric" value={maxAds}
              onChange={e => setMaxAds(e.target.value)}
              className={inputCls + ' flex-1 text-sm'}
            />
            <PrimaryButton onClick={saveAds} disabled={adsBusy} className="text-sm shrink-0">
              {adsBusy ? tt('…', '…') : tt('حفظ', 'Save')}
            </PrimaryButton>
          </div>
          {adsMsg && <p className={`text-[11px] ${adsMsg.startsWith('✓') ? 'text-win' : 'text-loss'}`}>{adsMsg}</p>}
        </div>
      )}
      {cloneOpen && (
        <div className="mt-2 pt-2 border-t border-bdr/50 space-y-2">
          <p className="text-[11px] text-hint">
            {tt('ينسخ البطولة (الفئات والقواعد والأدوار) إلى موسم جديد. الفرق والمباريات والنتائج لا تُنسخ.',
                'Copies the competition structure (sub-competitions, rules, stages) to a new season. Teams, matches and results are not copied.')}
          </p>
          <div className="flex items-center gap-2">
            <select value={cloneSeason} onChange={e => setCloneSeason(e.target.value)} className={inputCls + ' flex-1 text-sm'}>
              <option value="">{tt('اختر الموسم الجديد', 'Select target season')}</option>
              {otherSeasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <PrimaryButton onClick={clone} disabled={!cloneSeason || cloneBusy} className="text-sm shrink-0">
              {cloneBusy ? tt('…', '…') : tt('نسخ', 'Clone')}
            </PrimaryButton>
          </div>
          {otherSeasons.length === 0 && (
            <p className="text-[11px] text-loss">{tt('لا يوجد موسم آخر. أنشئ موسمًا جديدًا أولاً.', 'No other season exists. Create a new season first.')}</p>
          )}
          {cloneMsg && <p className={`text-[11px] ${cloneMsg.startsWith('✓') ? 'text-win' : 'text-loss'}`}>{cloneMsg}</p>}
        </div>
      )}

      {docsOpen && <div className="mt-2"><CompDocsEditor token={token} comp={c} reload={reload} /></div>}
      {adminOpen && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-hint">
            {tt('اعمل اسم مستخدم وكلمة مرور للمنظم. لو الاسم موجود بالفعل، هيتسند للبطولة دي كمان (وكلمة المرور بتغيّرها).',
                'Give the organizer a username and password. An existing username is assigned to this competition too (and the password resets it).')}
          </p>
          <div className="grid grid-cols-3 gap-2 items-end">
            <input value={af.username} dir="ltr" onChange={e => setAf({ ...af, username: e.target.value })} placeholder={tt('اسم المستخدم', 'Username')} className={inputCls} />
            <input value={af.name} onChange={e => setAf({ ...af, name: e.target.value })} placeholder={tt('الاسم', 'Display name')} className={inputCls} />
            <input value={af.password} type="password" onChange={e => setAf({ ...af, password: e.target.value })} placeholder={tt('كلمة المرور', 'Password')} className={inputCls} />
          </div>
          <div className="flex items-center gap-2">
            <PrimaryButton onClick={addAdmin} disabled={!af.username.trim()} className="text-sm">{tt('إسناد منظم', 'Assign organizer')}</PrimaryButton>
            {msg && <span className="text-[11px] text-hint">{msg}</span>}
          </div>
          {(c.admins ?? []).map(a => (
            <div key={a.id} className="flex items-center justify-between text-xs border-t border-bdr/50 pt-1.5">
              <span className="text-text">
                {a.user_name || a.user_login}
                {a.user_name && a.user_login && <span className="text-hint" dir="ltr"> · {a.user_login}</span>}
              </span>
              <button onClick={async () => { await tRemoveCompAdmin(token, c.id, a.user_id); reload(); }} className="text-hint hover:text-loss">✕</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
