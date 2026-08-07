'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';
import DeleteBtn from '@/components/admin/DeleteBtn';
import MatchesEntry from '@/components/admin/MatchesEntry';
import CompetitionSelect from '@/components/admin/CompetitionSelect';
import { compareCompName } from '@/lib/compOrder';
import { useAdminAuth } from '@/context/AdminAuthContext';
import {
  apiSeasons, apiCreateSeason, apiUpdateSeason,
  apiAgeGroups, apiCreateAge, apiUpdateAge,
  apiClubs, apiCreateClub, apiUpdateClub,
  apiCompsManage, apiCreateComp, apiUpdateComp,
  apiCompTeamsManage, apiEnrollTeam, apiUnenrollTeam, apiUpdateTeam, apiUploadImage,
  type MSeason, type MAge, type MClub, type MComp, type MTeam,
} from '@/lib/adminApi';

const inputCls = "w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua";
const btn = "bg-aqua text-on-accent font-extrabold py-2.5 rounded-xl disabled:opacity-50";
const card = "bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-teal text-[11px] font-bold mb-1">{label}</label>{children}</div>;
}
function Err({ e }: { e: string | null }) { return e ? <p className="text-loss text-xs">{e}</p> : null; }

// `edit` marks a tab that changes the structure itself, which needs the editor
// role. Entering match results does not — a clerk is hired to do exactly that —
// so the matches tab stays open to any signed-in admin.
const TABS = [
  { v: 'seasons', l: 'المواسم', edit: true },
  { v: 'ages', l: 'المراحل السنية', edit: true },
  { v: 'clubs', l: 'الأندية', edit: true },
  { v: 'comps', l: 'البطولات', edit: true },
  { v: 'teams', l: 'الفرق', edit: true },
  { v: 'matches', l: '⚽ المباريات', edit: false },
] as const;

export default function StructurePage() {
  const { canEdit } = useAdminAuth();
  const [tab, setTab] = useState<typeof TABS[number]['v']>('matches');
  const shown = TABS.filter(t => canEdit || !t.edit);

  return (
    <AdminShell title="المسابقات">
      <div className="space-y-4">
        {/* Pinned below the admin top bar so the section tabs stay reachable
            while a long list scrolls. -mx-4 px-4 lets the opaque band cover the
            page padding edge to edge. */}
        <div className="sticky top-[var(--admin-head-h,0px)] z-10 -mx-4 px-4 py-2 bg-darkBg flex gap-1.5 overflow-x-auto no-scrollbar">
          {shown.map(t => (
            <button key={t.v} onClick={() => setTab(t.v)}
              className={`flex-shrink-0 text-xs font-bold px-3.5 py-2 rounded-xl border transition-colors ${tab === t.v ? 'bg-aqua text-on-accent border-transparent' : 'bg-cardBg border-bdr text-teal'}`}>
              {t.l}
            </button>
          ))}
        </div>
        {tab === 'matches' && <MatchesEntry />}
        {tab === 'seasons' && <Seasons />}
        {tab === 'ages' && <Ages />}
        {tab === 'clubs' && <Clubs />}
        {tab === 'comps' && <Competitions />}
        {tab === 'teams' && <Teams />}
        {!canEdit && tab !== 'matches' && (
          <div className="bg-cardBg border border-bdr rounded-2xl p-8 text-center">
            <p className="text-3xl mb-3">🔒</p>
            <p className="text-text text-sm font-bold">تحتاج صلاحية «محرّر» أو أعلى</p>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function useList<T>(loader: (t: string) => Promise<T[]>) {
  const { token } = useAdminAuth();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    if (!token) return;
    setLoading(true);
    loader(token).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);
  return { token: token!, items, loading, reload };
}

// ── Seasons ──────────────────────────────────────────────────────────────────
function Seasons() {
  const { token, items, reload } = useList<MSeason>(apiSeasons);
  const [f, setF] = useState({ name_ar: '', name_en: '', start_date: '', end_date: '', is_active: false });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MSeason | null>(null);

  const add = async () => {
    setErr(null); setBusy(true);
    try { await apiCreateSeason(token, f); setF({ name_ar: '', name_en: '', start_date: '', end_date: '', is_active: false }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };
  const toggleActive = (s: MSeason) => apiUpdateSeason(token, s.id, { is_active: !s.is_active }).then(reload);

  return (
    <div className="space-y-4">
      <div className={card + ' space-y-3'}>
        <p className="text-aqua font-bold text-sm">➕ موسم جديد</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم (عربي)"><input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} placeholder="2026-2027" className={inputCls} /></Field>
          <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
          <Field label="تاريخ البداية *"><input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} className={inputCls} /></Field>
          <Field label="تاريخ النهاية *"><input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} className={inputCls} /></Field>
        </div>
        <label className="flex items-center gap-2 text-teal text-xs"><input type="checkbox" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} /> الموسم الحالي (النشط)</label>
        <Err e={err} />
        <button onClick={add} disabled={busy} className={btn + ' w-full'}>{busy ? '…' : 'إضافة الموسم'}</button>
      </div>
      <div className="space-y-2">
        {items.map(s => editing?.id === s.id ? (
          <SeasonEdit key={s.id} token={token} season={s} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
        ) : (
          <div key={s.id} className={card + ' flex flex-wrap items-center gap-3'}>
            <div className="flex-1 min-w-0">
              <p className="text-text font-bold text-sm">{s.name_ar || s.name_en}</p>
              <p className="text-hint text-[11px] tnum">{s.start_date} ← {s.end_date}</p>
            </div>
            <button onClick={() => setEditing(s)}
              className="text-[11px] font-bold rounded-lg px-3 py-1.5 border text-aqua border-aqua/40">
              تعديل
            </button>
            <button onClick={() => toggleActive(s)}
              className={`text-[11px] font-bold rounded-lg px-3 py-1.5 border ${s.is_active ? 'text-win border-win/40 bg-win/10' : 'text-hint border-bdr'}`}>
              {s.is_active ? '● نشط' : 'تفعيل'}
            </button>
            <DeleteBtn token={token} kind="season" id={s.id}
              label={`موسم «${s.name_ar || s.name_en}»`} onDone={reload} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Season edit (inline) ─────────────────────────────────────────────────────
function SeasonEdit({ token, season, onDone, onCancel }: { token: string; season: MSeason; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name_ar: season.name_ar ?? '', name_en: season.name_en ?? '',
    start_date: season.start_date, end_date: season.end_date, is_active: season.is_active,
  });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr(null); setBusy(true);
    try { await apiUpdateSeason(token, season.id, f); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };

  return (
    <div className={card + ' space-y-3 border-aqua/40'}>
      <p className="text-aqua font-bold text-sm">✏️ تعديل الموسم</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الاسم (عربي)"><input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} placeholder="2026-2027" className={inputCls} /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
        <Field label="تاريخ البداية *"><input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} className={inputCls} /></Field>
        <Field label="تاريخ النهاية *"><input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} className={inputCls} /></Field>
      </div>
      <label className="flex items-center gap-2 text-teal text-xs"><input type="checkbox" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} /> الموسم الحالي (النشط)</label>
      <Err e={err} />
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className={btn + ' flex-1'}>{busy ? '…' : 'حفظ'}</button>
        <button onClick={onCancel} disabled={busy} className="flex-1 text-hint border border-bdr rounded-lg text-xs font-bold py-2">إلغاء</button>
      </div>
    </div>
  );
}

// ── Age groups ───────────────────────────────────────────────────────────────
function Ages() {
  const { token, items, reload } = useList<MAge>(apiAgeGroups);
  const [f, setF] = useState({ name_ar: '', name_en: '', oldest_birth_year: '' });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MAge | null>(null);
  const add = async () => {
    setErr(null); setBusy(true);
    try { await apiCreateAge(token, f); setF({ name_ar: '', name_en: '', oldest_birth_year: '' }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className={card + ' space-y-3'}>
        <p className="text-aqua font-bold text-sm">➕ مرحلة سنية</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="الاسم (عربي)"><input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} placeholder="تحت 17" className={inputCls} /></Field>
          <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
          <Field label="أقدم سنة ميلاد *"><input value={f.oldest_birth_year} onChange={e => setF({ ...f, oldest_birth_year: e.target.value })} type="number" placeholder="2009" className={inputCls} /></Field>
        </div>
        <p className="text-hint text-[10px]">اللاعب مؤهّل إذا كانت سنة ميلاده ≥ هذه السنة (يمكن للأصغر اللعب مع الأكبر).</p>
        <Err e={err} />
        <button onClick={add} disabled={busy} className={btn + ' w-full'}>{busy ? '…' : 'إضافة'}</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(a => editing?.id === a.id ? (
          <div key={a.id} className="col-span-2">
            <AgeEdit token={token} age={a} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <button key={a.id} onClick={() => setEditing(a)}
            className={card + ' flex items-center justify-between text-start hover:border-aqua/40 transition-colors'}>
            <span className="text-text text-sm font-bold">{a.name_ar || a.name_en}</span>
            <span className="text-hint text-xs tnum">≥ {a.oldest_birth_year}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Age group edit (inline) ──────────────────────────────────────────────────
function AgeEdit({ token, age, onDone, onCancel }: { token: string; age: MAge; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name_ar: age.name_ar ?? '', name_en: age.name_en ?? '',
    oldest_birth_year: String(age.oldest_birth_year),
  });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      await apiUpdateAge(token, age.id, { ...f, oldest_birth_year: Number(f.oldest_birth_year) });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };

  return (
    <div className={card + ' space-y-3 border-aqua/40'}>
      <p className="text-aqua font-bold text-sm">✏️ تعديل المرحلة السنية</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="الاسم (عربي)"><input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} placeholder="تحت 17" className={inputCls} /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
        <Field label="أقدم سنة ميلاد *"><input value={f.oldest_birth_year} onChange={e => setF({ ...f, oldest_birth_year: e.target.value })} type="number" placeholder="2009" className={inputCls} /></Field>
      </div>
      <Err e={err} />
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !f.oldest_birth_year.trim()} className={btn + ' flex-1'}>{busy ? '…' : 'حفظ'}</button>
        <button onClick={onCancel} disabled={busy} className="flex-1 text-hint border border-bdr rounded-lg text-xs font-bold py-2">إلغاء</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-bdr/50">
        <span className="flex-1 text-hint text-[11px]">حذف المرحلة السنية</span>
        <DeleteBtn token={token} kind="age-group" id={age.id}
          label={`مرحلة «${age.name_ar || age.name_en}»`} onDone={onDone} />
      </div>
    </div>
  );
}

// ── Logo input (URL + single upload) ─────────────────────────────────────────
function LogoInput({ token, value, onChange }: { token: string; value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {value && <img src={value} alt="" className="w-10 h-10 rounded-lg object-contain bg-darkBg border border-bdr flex-shrink-0" />}
      <input value={value} onChange={e => onChange(e.target.value)} dir="ltr" placeholder="رابط الشعار أو ارفع" className={inputCls} />
      <label className="flex-shrink-0 bg-cardBg border border-aqua/40 text-aqua text-xs font-bold px-3 py-2 rounded-lg cursor-pointer whitespace-nowrap">
        {busy ? '…' : '📤 رفع'}
        <input type="file" accept="image/*" hidden disabled={busy}
          onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); try { onChange(await apiUploadImage(token, file)); } finally { setBusy(false); e.target.value = ''; } }} />
      </label>
    </div>
  );
}

// ── Clubs ────────────────────────────────────────────────────────────────────
function Clubs() {
  const { token } = useAdminAuth();
  const router = useRouter();
  const [q, setQ] = useState(''); const [items, setItems] = useState<MClub[]>([]);
  const [adding, setAdding] = useState(false);
  const reload = useCallback(() => { if (token) apiClubs(token, q).then(setItems); }, [token, q]);
  useEffect(() => { const t = setTimeout(reload, 250); return () => clearTimeout(t); }, [reload]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث عن نادٍ…" className={inputCls} />
        <button onClick={() => setAdding(true)} className="bg-aqua text-on-accent font-bold text-xs px-4 rounded-lg whitespace-nowrap">+ نادٍ</button>
      </div>
      {adding && <ClubForm token={token!} club={null} onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}
      <div className="space-y-2">
        {items.map(c => (
          <div key={c.id} className={card + ' flex flex-wrap items-center gap-3 hover:border-aqua/40 transition-colors'}>
            <button onClick={() => router.push(`/admin/club?id=${c.id}`)} className="flex-1 min-w-0 flex items-center gap-3 text-start">
              {c.logo_url ? <img src={c.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-darkBg flex-shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-darkBg grid place-items-center flex-shrink-0">🛡️</div>}
              <div className="flex-1 min-w-0"><p className="text-text text-sm font-bold truncate">{c.name_ar || c.name_en}</p>{c.city_ar && <p className="text-hint text-[11px]">{c.city_ar}</p>}</div>
              <span className="text-aqua text-xs">إدارة ›</span>
            </button>
            <DeleteBtn token={token!} kind="club" id={c.id}
              label={`نادي «${c.name_ar || c.name_en}»`} onDone={reload} />
          </div>
        ))}
        {items.length === 0 && <p className="text-hint text-sm text-center py-4">لا نتائج</p>}
      </div>
    </div>
  );
}
function ClubForm({ token, club, onDone, onCancel }: { token: string; club: MClub | null; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name_ar: club?.name_ar ?? '', name_en: club?.name_en ?? '', city_ar: club?.city_ar ?? '', city_en: club?.city_en ?? '',
    logo_url: club?.logo_url ?? '', website_url: club?.website_url ?? '', facebook_url: club?.facebook_url ?? '', instagram_url: club?.instagram_url ?? '',
  });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const save = async () => {
    setErr(null); setBusy(true);
    try { if (club) await apiUpdateClub(token, club.id, f); else await apiCreateClub(token, f); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };
  return (
    <div className="bg-cardBg2 border border-aqua/30 rounded-2xl p-4 space-y-3">
      <p className="text-aqua font-bold text-sm">{club ? '✎ تعديل النادي' : '➕ نادٍ جديد'}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الاسم (عربي) *"><input value={f.name_ar} onChange={e => set('name_ar', e.target.value)} className={inputCls} /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={e => set('name_en', e.target.value)} dir="ltr" className={inputCls} /></Field>
        <Field label="المدينة (عربي)"><input value={f.city_ar} onChange={e => set('city_ar', e.target.value)} className={inputCls} /></Field>
        <Field label="المدينة (إنجليزي)"><input value={f.city_en} onChange={e => set('city_en', e.target.value)} dir="ltr" className={inputCls} /></Field>
      </div>
      <Field label="الشعار"><LogoInput token={token} value={f.logo_url} onChange={v => set('logo_url', v)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الموقع"><input value={f.website_url} onChange={e => set('website_url', e.target.value)} dir="ltr" className={inputCls} /></Field>
        <Field label="فيسبوك"><input value={f.facebook_url} onChange={e => set('facebook_url', e.target.value)} dir="ltr" className={inputCls} /></Field>
      </div>
      <Err e={err} />
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !f.name_ar.trim()} className={btn + ' flex-1'}>{busy ? '…' : 'حفظ'}</button>
        <button onClick={onCancel} className="text-hint text-sm font-bold px-4 border border-bdr rounded-xl">إلغاء</button>
      </div>
    </div>
  );
}

// ── Competitions ─────────────────────────────────────────────────────────────
function Competitions() {
  const router = useRouter();
  const { token, items, reload } = useList<MComp>(apiCompsManage);
  const [seasons, setSeasons] = useState<MSeason[]>([]); const [ages, setAges] = useState<MAge[]>([]);
  const [f, setF] = useState({ name_ar: '', name_en: '', code: '', season_id: '', age_group_id: '', sector_ar: '' });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<MComp | null>(null);
  const [seasonFilter, setSeasonFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  useEffect(() => { if (token) { apiSeasons(token).then(setSeasons); apiAgeGroups(token).then(setAges); } }, [token]);

  const compName = (c: MComp) => c.name_ar || c.name_en || '';

  // With several seasons the same competition name repeats, so the list narrows
  // by season (newest first) then by competition name — leaving its age variants.
  const seasonNames = useMemo(
    () => [...new Set(items.map(i => i.season).filter(Boolean))].sort().reverse(), [items]);
  useEffect(() => { if (!seasonFilter && seasonNames.length) setSeasonFilter(seasonNames[0]); }, [seasonNames, seasonFilter]);

  // Competition names available within the chosen season, in canonical order.
  const compNames = useMemo(
    () => [...new Set(items.filter(c => !seasonFilter || c.season === seasonFilter).map(compName))].sort(compareCompName),
    [items, seasonFilter]);
  // Drop a name filter that no longer exists in the newly-chosen season.
  useEffect(() => { if (nameFilter && !compNames.includes(nameFilter)) setNameFilter(''); }, [compNames, nameFilter]);

  const shown = useMemo(() => items
    .filter(c => (!seasonFilter || c.season === seasonFilter) && (!nameFilter || compName(c) === nameFilter))
    .sort((a, b) => compareCompName(compName(a), compName(b)) || (a.age || '').localeCompare(b.age || '')),
    [items, seasonFilter, nameFilter]);

  const add = async () => {
    setErr(null); setBusy(true);
    try { await apiCreateComp(token, { ...f, season_id: Number(f.season_id), age_group_id: f.age_group_id ? Number(f.age_group_id) : null }); setF({ name_ar: '', name_en: '', code: '', season_id: '', age_group_id: '', sector_ar: '' }); setShow(false); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <button onClick={() => setShow(s => !s)} className="bg-aqua text-on-accent font-bold text-xs px-4 py-2 rounded-xl">{show ? '✕ إلغاء' : '+ بطولة جديدة'}</button>
      {show && (
        <div className={card + ' space-y-3'}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الاسم (عربي) *"><input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} className={inputCls} /></Field>
            <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
            <Field label="الموسم *"><select value={f.season_id} onChange={e => setF({ ...f, season_id: e.target.value })} className={inputCls}><option value="">—</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en}</option>)}</select></Field>
            <Field label="المرحلة السنية"><select value={f.age_group_id} onChange={e => setF({ ...f, age_group_id: e.target.value })} className={inputCls}><option value="">مفتوحة</option>{ages.map(a => <option key={a.id} value={a.id}>{a.name_ar || a.name_en}</option>)}</select></Field>
            <Field label="القطاع (اختياري)"><input value={f.sector_ar} onChange={e => setF({ ...f, sector_ar: e.target.value })} placeholder="القاهرة" className={inputCls} /></Field>
            <Field label="الرمز (اختياري)"><input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} dir="ltr" placeholder="c001" className={inputCls} /></Field>
          </div>
          <Err e={err} />
          <button onClick={add} disabled={busy} className={btn + ' w-full'}>{busy ? '…' : 'إضافة البطولة'}</button>
        </div>
      )}
      {seasonNames.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="الموسم">
            <select value={seasonFilter} onChange={e => { setSeasonFilter(e.target.value); setNameFilter(''); }} className={inputCls}>
              <option value="">كل المواسم</option>
              {seasonNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="البطولة">
            <select value={nameFilter} onChange={e => setNameFilter(e.target.value)} className={inputCls}>
              <option value="">كل البطولات</option>
              {compNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
      )}
      <div className="space-y-2">
        {shown.map(c => editing?.id === c.id ? (
          <CompEdit key={c.id} token={token} comp={c} seasons={seasons} ages={ages}
            onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
        ) : (
          <div key={c.id} className={card + ' flex flex-wrap items-center gap-3'}>
            <div className="flex-1 min-w-0">
              <p className="text-text text-sm font-bold">{c.name_ar || c.name_en}</p>
              <p className="text-hint text-[11px] mt-0.5">{c.season}{c.age ? ` · ${c.age}` : ''}{c.sector_ar ? ` · ${c.sector_ar}` : ''}</p>
            </div>
            <button onClick={() => router.push(`/admin/competition?id=${c.id}`)}
              className="flex-shrink-0 text-[11px] font-bold rounded-lg px-3 py-1.5 border text-aqua border-aqua/40">
              المراحل ›
            </button>
            <button onClick={() => setEditing(c)}
              className="flex-shrink-0 text-[11px] font-bold rounded-lg px-3 py-1.5 border text-teal border-bdr">
              تعديل
            </button>
            <DeleteBtn token={token} kind="competition" id={c.id}
              label={`بطولة «${c.name_ar || c.name_en}»`} onDone={reload} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Competition edit (inline) ────────────────────────────────────────────────
function CompEdit({ token, comp, seasons, ages, onDone, onCancel }: {
  token: string; comp: MComp; seasons: MSeason[]; ages: MAge[];
  onDone: () => void; onCancel: () => void;
}) {
  const [f, setF] = useState({
    name_ar: comp.name_ar ?? '', name_en: comp.name_en ?? '', code: comp.code ?? '',
    season_id: String(comp.season_id),
    age_group_id: comp.age_group_id != null ? String(comp.age_group_id) : '',
    sector_ar: comp.sector_ar ?? '', sector_en: comp.sector_en ?? '',
  });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      await apiUpdateComp(token, comp.id, {
        ...f, season_id: Number(f.season_id),
        age_group_id: f.age_group_id ? Number(f.age_group_id) : null,
      });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };

  return (
    <div className={card + ' space-y-3 border-aqua/40'}>
      <p className="text-aqua font-bold text-sm">✏️ تعديل البطولة</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الاسم (عربي) *"><input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} className={inputCls} /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
        <Field label="الموسم *"><select value={f.season_id} onChange={e => setF({ ...f, season_id: e.target.value })} className={inputCls}><option value="">—</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en}</option>)}</select></Field>
        <Field label="المرحلة السنية"><select value={f.age_group_id} onChange={e => setF({ ...f, age_group_id: e.target.value })} className={inputCls}><option value="">مفتوحة</option>{ages.map(a => <option key={a.id} value={a.id}>{a.name_ar || a.name_en}</option>)}</select></Field>
        <Field label="القطاع (اختياري)"><input value={f.sector_ar} onChange={e => setF({ ...f, sector_ar: e.target.value })} placeholder="القاهرة" className={inputCls} /></Field>
        <Field label="الرمز (اختياري)"><input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} dir="ltr" placeholder="c001" className={inputCls} /></Field>
      </div>
      <Err e={err} />
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !f.name_ar.trim()} className={btn + ' flex-1'}>{busy ? '…' : 'حفظ'}</button>
        <button onClick={onCancel} disabled={busy} className="flex-1 text-hint border border-bdr rounded-lg text-xs font-bold py-2">إلغاء</button>
      </div>
    </div>
  );
}

// ── Teams (per competition) ──────────────────────────────────────────────────
function Teams() {
  const { token } = useAdminAuth();
  const [comps, setComps] = useState<MComp[]>([]); const [cid, setCid] = useState('');
  const [teams, setTeams] = useState<MTeam[]>([]);
  useEffect(() => { if (token) apiCompsManage(token).then(setComps); }, [token]);
  const reload = useCallback(() => { if (token && cid) apiCompTeamsManage(token, Number(cid)).then(setTeams); }, [token, cid]);
  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="space-y-4">
      <Field label="اختر البطولة">
        <CompetitionSelect
          className={inputCls}
          options={comps.map(c => ({ id: c.id, season: c.season, name: c.name_ar || c.name_en || '', age: c.age || '', sector: c.sector_ar || c.sector_en || '' }))}
          value={cid ? Number(cid) : null}
          onChange={id => setCid(id ? String(id) : '')}
        />
      </Field>
      {cid && <>
        <EnrollTeam token={token!} cid={Number(cid)} onDone={reload} />
        <div className="space-y-2">
          <p className="text-hint text-xs">{teams.length} فريق</p>
          {teams.map(t => <TeamRow key={t.id} token={token!} team={t} cid={Number(cid)} onDone={reload} />)}
        </div>
      </>}
    </div>
  );
}
function EnrollTeam({ token, cid, onDone }: { token: string; cid: number; onDone: () => void }) {
  const [q, setQ] = useState(''); const [results, setResults] = useState<MClub[]>([]);
  const [pd, setPd] = useState('0'); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!q.trim()) { setResults([]); return; } const t = setTimeout(() => apiClubs(token, q).then(setResults), 250); return () => clearTimeout(t); }, [q, token]);
  const enroll = async (club: MClub) => {
    setErr(null);
    try { await apiEnrollTeam(token, cid, { club_id: club.id, point_deduction: Number(pd) || 0 }); setQ(''); setResults([]); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };
  return (
    <div className="bg-cardBg2 border border-aqua/30 rounded-2xl p-4 space-y-2">
      <p className="text-aqua font-bold text-sm">➕ تسجيل نادٍ كفريق</p>
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث عن نادٍ لإضافته…" className={inputCls} />
        <input value={pd} onChange={e => setPd(e.target.value)} type="number" title="خصم نقاط" className={inputCls + ' w-20'} />
      </div>
      <Err e={err} />
      {results.map(c => (
        <button key={c.id} onClick={() => enroll(c)} className="w-full flex items-center gap-2 bg-darkBg border border-bdr rounded-lg px-3 py-2 text-start hover:border-aqua/40">
          {c.logo_url && <img src={c.logo_url} alt="" className="w-6 h-6 object-contain" />}
          <span className="flex-1 text-text text-sm">{c.name_ar || c.name_en}</span>
          <span className="text-aqua text-xs font-bold">+ إضافة</span>
        </button>
      ))}
    </div>
  );
}
function TeamRow({ token, team, cid, onDone }: {
  token: string; team: MTeam; cid: number; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pd, setPd] = useState(String(team.point_deduction));
  const [name, setName] = useState(team.name_ar ?? '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The deduction is a penalty in this competition, so the entry has to be named.
  const save = async () => {
    await apiUpdateTeam(token, team.id, {
      competition_id: cid, point_deduction: Number(pd) || 0, name_ar: name || null,
    });
    setOpen(false); onDone();
  };
  // Pull the club out of *this* competition. Undoes a wrong enrolment without
  // touching the squad's other competitions; the full-season delete stays under
  // «تعديل» for when the whole team should go.
  const remove = async () => {
    setErr(null); setBusy(true);
    try { await apiUnenrollTeam(token, cid, team.id); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); setBusy(false); setConfirmRemove(false); }
  };
  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        {team.logo ? <img src={team.logo} alt="" className="w-9 h-9 object-contain flex-shrink-0" /> : <div className="w-9 h-9 rounded bg-darkBg grid place-items-center flex-shrink-0">🛡️</div>}
        <div className="flex-1 min-w-0">
          <p className="text-text text-sm font-bold truncate">{team.club_name}</p>
          {team.name_ar && <p className="text-hint text-[11px] truncate">{team.name_ar}</p>}
          {team.point_deduction > 0 && <p className="text-loss text-[11px]">خصم {team.point_deduction} نقطة</p>}
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-aqua text-xs font-bold flex-shrink-0">{open ? 'إغلاق' : 'تعديل'}</button>
        <button onClick={() => { setConfirmRemove(true); setErr(null); }}
          className="text-loss text-xs font-bold border border-loss/40 rounded-lg px-2.5 py-1 flex-shrink-0">
          إزالة
        </button>
      </div>
      {confirmRemove && (
        <div className="mt-3 pt-3 border-t border-loss/30 flex flex-wrap items-center gap-2">
          <span className="flex-1 text-text text-xs">إزالة «{team.club_name}» من هذه البطولة؟</span>
          <button onClick={remove} disabled={busy}
            className="bg-loss text-white text-xs font-bold rounded-lg px-3 py-1.5 disabled:opacity-40">
            {busy ? '…' : 'تأكيد الإزالة'}
          </button>
          <button onClick={() => setConfirmRemove(false)} disabled={busy}
            className="text-hint text-xs font-bold border border-bdr rounded-lg px-3 py-1.5">إلغاء</button>
        </div>
      )}
      {err && <p className="text-loss text-xs mt-2">{err}</p>}
      {open && (
        <div className="mt-3 pt-3 border-t border-bdr/50 grid grid-cols-2 gap-2 items-end">
          <Field label="اسم بديل (اختياري)"><input value={name} onChange={e => setName(e.target.value)} placeholder={team.club_name} className={inputCls} /></Field>
          <Field label="خصم نقاط"><input value={pd} onChange={e => setPd(e.target.value)} type="number" className={inputCls} /></Field>
          <button onClick={save} className={btn + ' col-span-2'}>حفظ</button>
        </div>
      )}
    </div>
  );
}
