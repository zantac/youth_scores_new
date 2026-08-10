'use client';
import { Suspense, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';
import DeleteBtn from '@/components/admin/DeleteBtn';
import { useAdminAuth } from '@/context/AdminAuthContext';
import {
  apiClub, apiUpdateClub, apiUploadImage,
  apiClubStaff, apiAddClubStaff, apiUpdateClubStaff, apiDeleteClubStaff, apiReorderClubStaff,
  apiClubTeams, apiCreateClubTeam, apiAgeGroups, apiSeasons,
  type MClub, type MClubStaff, type MTeamFull, type MAge, type MSeason,
} from '@/lib/adminApi';

const inputCls = "w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua";
const btn = "bg-aqua text-on-accent font-extrabold py-2.5 rounded-xl disabled:opacity-50";
const card = "bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4";

// Youth-sector posts offered as suggestions, most senior first — mirrors the
// backend CLUB_STAFF_ROLE_ORDER so entries stay unified and sort consistently.
// The field stays free text; picking a known post fills its English counterpart.
const CLUB_STAFF_ROLES = [
  { ar: 'عضو مجلس الإدارة',                  en: 'Board Member' },
  { ar: 'رئيس قطاع الناشئين',                en: 'Head of Youth Sector' },
  { ar: 'نائب رئيس القطاع',                  en: 'Vice President of the Sector' },
  { ar: 'مشرف القطاع',                       en: 'Sector Supervisor' },
  { ar: 'المدير الفني للقطاع',               en: 'Technical Director of the Sector' },
  { ar: 'المشرف الفني للقطاع',               en: 'Technical Supervisor of the Sector' },
  { ar: 'المدير الاداري للقطاع',             en: 'Administrative Director of the Sector' },
  { ar: 'مدير الكرة',                        en: 'Football Director' },
  { ar: 'نائب رئيس جهاز الكرة',              en: 'Deputy Head of Football Staff' },
  { ar: 'مشرف الكرة',                        en: 'Football Supervisor' },
  { ar: 'مدير حراس المرمى بالقطاع',          en: 'Goalkeeping Director' },
  { ar: 'مشرف حراس المرمى',                  en: 'Goalkeeping Supervisor' },
  { ar: 'رئيس الجهاز الطبي',                 en: 'Head of Medical Staff' },
  { ar: 'طبيب القطاع',                       en: 'Sector Doctor' },
  { ar: 'مشرف العلاج الطبيعي',               en: 'Physiotherapy Supervisor' },
  { ar: 'اخصائي الفريق',                     en: 'Team Specialist' },
  { ar: 'مخطط أحمال',                        en: 'Fitness Load Planner' },
  { ar: 'محلل أداء',                         en: 'Performance Analyst' },
  { ar: 'مسؤول شئون اللاعبين',               en: 'Player Affairs Officer' },
  { ar: 'المدير المالي',                     en: 'Financial Director' },
  { ar: 'مدير عام النادي',                   en: 'Club General Manager' },
  { ar: 'مدير رياضي',                        en: 'Sporting Director' },
  { ar: 'مشرف النشاط الرياضي',               en: 'Sports Activity Supervisor' },
  { ar: 'مدير التسويق بالقطاع',              en: 'Sector Marketing Manager' },
  { ar: 'المشرف العام علي الالعاب الجماعية', en: 'General Supervisor of Team Sports' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-teal text-[11px] font-bold mb-1">{label}</label>{children}</div>;
}
function Err({ e }: { e: string | null }) { return e ? <p className="text-loss text-xs">{e}</p> : null; }

// Up/down reorder controls for a row.
function Arrows({ onUp, onDown, first, last }: { onUp: () => void; onDown: () => void; first: boolean; last: boolean }) {
  return (
    <div className="flex flex-col flex-shrink-0 -my-1">
      <button onClick={onUp} disabled={first} className="text-aqua disabled:text-bdr text-xs leading-none px-1 py-0.5" aria-label="up">▲</button>
      <button onClick={onDown} disabled={last} className="text-aqua disabled:text-bdr text-xs leading-none px-1 py-0.5" aria-label="down">▼</button>
    </div>
  );
}

// ── Logo input (URL + upload) ─────────────────────────────────────────────────
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

// ── Club basic info ───────────────────────────────────────────────────────────
function ClubInfo({ token, club, onSaved }: { token: string; club: MClub; onSaved: (c: MClub) => void }) {
  const [f, setF] = useState({
    name_ar: club.name_ar ?? '', name_en: club.name_en ?? '',
    city_ar: club.city_ar ?? '', city_en: club.city_en ?? '', logo_url: club.logo_url ?? '',
  });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const set = (k: string, v: string) => { setF({ ...f, [k]: v }); setDone(false); };
  const save = async () => {
    setErr(null); setBusy(true);
    try { onSaved(await apiUpdateClub(token, club.id, f)); setDone(true); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };
  return (
    <div className={card + ' space-y-3'}>
      <p className="text-aqua font-bold text-sm">🛡️ بيانات النادي</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الاسم (عربي) *"><input value={f.name_ar} onChange={e => set('name_ar', e.target.value)} className={inputCls} /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={e => set('name_en', e.target.value)} dir="ltr" className={inputCls} /></Field>
        <Field label="المدينة (عربي)"><input value={f.city_ar} onChange={e => set('city_ar', e.target.value)} className={inputCls} /></Field>
        <Field label="المدينة (إنجليزي)"><input value={f.city_en} onChange={e => set('city_en', e.target.value)} dir="ltr" className={inputCls} /></Field>
      </div>
      <Field label="الشعار"><LogoInput token={token} value={f.logo_url} onChange={v => set('logo_url', v)} /></Field>
      <Err e={err} />
      <button onClick={save} disabled={busy || !f.name_ar.trim()} className={btn + ' w-full'}>{busy ? '…' : done ? '✓ تم الحفظ' : 'حفظ البيانات'}</button>
    </div>
  );
}

// ── Staff form (add / edit) ───────────────────────────────────────────────────
function StaffForm({ token, cid, staff, onDone, onCancel }: {
  token: string; cid: number; staff: MClubStaff | null; onDone: () => void; onCancel: () => void;
}) {
  const [f, setF] = useState({
    name_ar: staff?.name_ar ?? '', name_en: staff?.name_en ?? '',
    role_ar: staff?.role_ar ?? '', role_en: staff?.role_en ?? '',
    photo: staff?.photo ?? '',
    start_date: staff?.start_date ?? '', end_date: staff?.end_date ?? '',
  });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  // Choosing (or typing) a known post fills the English side automatically.
  const setRole = (v: string) => {
    const hit = CLUB_STAFF_ROLES.find(r => r.ar === v.trim());
    setF(prev => ({ ...prev, role_ar: v, ...(hit ? { role_en: hit.en } : {}) }));
  };
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      if (staff) await apiUpdateClubStaff(token, staff.id, f);
      else await apiAddClubStaff(token, cid, f);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };
  return (
    <div className={card + ' space-y-3 border-aqua/40'}>
      <p className="text-aqua font-bold text-sm">{staff ? '✏️ تعديل المسؤول' : '➕ مسؤول جديد'}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الاسم (عربي) *"><input value={f.name_ar} onChange={e => set('name_ar', e.target.value)} className={inputCls} /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={e => set('name_en', e.target.value)} dir="ltr" className={inputCls} /></Field>
        <Field label="المنصب (عربي)">
          <input list="staff-roles" value={f.role_ar} onChange={e => setRole(e.target.value)} placeholder="اختر من القائمة أو اكتب" className={inputCls} />
          <datalist id="staff-roles">
            {CLUB_STAFF_ROLES.map(r => <option key={r.ar} value={r.ar} />)}
          </datalist>
        </Field>
        <Field label="المنصب (إنجليزي)"><input value={f.role_en} onChange={e => set('role_en', e.target.value)} dir="ltr" placeholder="Youth Sector Manager" className={inputCls} /></Field>
        <Field label="تاريخ البداية"><input type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} className={inputCls} /></Field>
        <Field label="تاريخ النهاية"><input type="date" value={f.end_date} onChange={e => set('end_date', e.target.value)} className={inputCls} /></Field>
      </div>
      <Field label="الصورة"><LogoInput token={token} value={f.photo} onChange={v => set('photo', v)} /></Field>
      <Err e={err} />
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !f.name_ar.trim()} className={btn + ' flex-1'}>{busy ? '…' : 'حفظ'}</button>
        <button onClick={onCancel} disabled={busy} className="flex-1 text-hint border border-bdr rounded-lg text-xs font-bold py-2">إلغاء</button>
      </div>
    </div>
  );
}

// ── Staff section ─────────────────────────────────────────────────────────────
function StaffSection({ token, cid }: { token: string; cid: number }) {
  const [items, setItems] = useState<MClubStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MClubStaff | null>(null);
  const [showFormer, setShowFormer] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => {
    setLoading(true); setErr(null);
    apiClubStaff(token, cid).then(setItems).catch(e => setErr(e instanceof Error ? e.message : 'خطأ')).finally(() => setLoading(false));
  }, [token, cid]);
  useEffect(() => { reload(); }, [reload]);

  const remove = async (s: MClubStaff) => {
    if (!confirm('حذف هذا المسؤول؟')) return;
    await apiDeleteClubStaff(token, s.id); reload();
  };
  // Current staff (end_date NULL) lead the list and can be reordered; anyone
  // with an end date drops into a separate "former" section below.
  const current = items.filter(s => !s.end_date);
  const former = items.filter(s => s.end_date);
  const move = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= current.length) return;
    const next = [...current];
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems([...next, ...former]);
    try { await apiReorderClubStaff(token, cid, next.map(x => x.id)); } catch { reload(); }
  };

  const renderRow = (s: MClubStaff, idx: number, isFormer: boolean) => editing?.id === s.id ? (
    <StaffForm key={s.id} token={token} cid={cid} staff={s} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
  ) : (
    <div key={s.id} className={card + ' flex items-center gap-3' + (isFormer ? ' opacity-60' : '')}>
      {!isFormer && current.length > 1 && <Arrows onUp={() => move(idx, -1)} onDown={() => move(idx, 1)} first={idx === 0} last={idx === current.length - 1} />}
      {s.photo ? <img src={s.photo} alt="" className="w-10 h-10 rounded-full object-cover bg-darkBg flex-shrink-0" /> : <div className="w-10 h-10 rounded-full bg-darkBg grid place-items-center flex-shrink-0">👤</div>}
      <div className="flex-1 min-w-0">
        <p className="text-text font-bold text-sm truncate">{s.name_ar || s.name_en}</p>
        <p className="text-teal text-[11px] truncate">{s.role_ar || s.role_en || '—'}</p>
        {(s.start_date || s.end_date) && (
          <p className="text-hint text-[10px] tnum">{s.start_date ?? '…'} {s.end_date ? `← ${s.end_date}` : ''}</p>
        )}
      </div>
      {isFormer
        ? <span className="text-gold text-[10px] border border-gold/40 rounded px-2 py-0.5 flex-shrink-0">سابق</span>
        : <span className="text-win text-[10px] font-bold border border-win/40 bg-win/10 rounded px-2 py-0.5 flex-shrink-0">حالي</span>}
      <button onClick={() => setEditing(s)} className="text-aqua text-[11px] font-bold flex-shrink-0">تعديل</button>
      <button onClick={() => remove(s)} className="text-loss text-[11px] font-bold flex-shrink-0">حذف</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-aqua font-bold text-sm">👔 مسؤولو قطاع الناشئين {current.length > 0 && <span className="text-hint text-xs font-normal">({current.length})</span>}</p>
        {!adding && !editing && (
          <button onClick={() => setAdding(true)} className="bg-aqua text-on-accent font-bold text-xs px-4 py-1.5 rounded-lg">+ مسؤول</button>
        )}
      </div>

      {adding && <StaffForm token={token} cid={cid} staff={null} onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}
      <Err e={err} />

      {loading ? (
        <p className="text-hint text-sm text-center py-4">…</p>
      ) : items.length === 0 && !adding ? (
        <p className="text-hint text-sm text-center py-4">لا يوجد مسؤولون بعد</p>
      ) : (
        <div className="space-y-2">
          {current.map((s, idx) => renderRow(s, idx, false))}
          {former.length > 0 && (
            <>
              <button onClick={() => setShowFormer(v => !v)} className="w-full flex items-center gap-1.5 pt-3 text-hint text-[11px] font-bold">
                <span className={`transition-transform ${showFormer ? 'rotate-90' : ''}`}>›</span>
                مسؤولون سابقون ({former.length})
              </button>
              {showFormer && former.map(s => renderRow(s, -1, true))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── New-team form ─────────────────────────────────────────────────────────────
function TeamForm({ token, cid, onDone, onCancel }: { token: string; cid: number; onDone: () => void; onCancel: () => void }) {
  const [ages, setAges] = useState<MAge[]>([]);
  // No season: a team is the club's squad for an age group and carries across
  // seasons. Which ones it played come from the competitions it is entered in.
  const [ageId, setAgeId] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiAgeGroups(token).then(setAges).catch(() => {});
  }, [token]);

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      await apiCreateClubTeam(token, cid, { age_group_id: Number(ageId) });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };

  return (
    <div className={card + ' space-y-3 border-aqua/40'}>
      <p className="text-aqua font-bold text-sm">➕ فريق جديد</p>
      <Field label="المرحلة السنية *"><select value={ageId} onChange={e => setAgeId(e.target.value)} className={inputCls}><option value="">—</option>{ages.map(a => <option key={a.id} value={a.id}>{a.name_ar || a.name_en}</option>)}</select></Field>
      <p className="text-hint text-[11px]">الاسم البديل (اسم الأكاديمية أو الراعي) يُضاف لكل بطولة على حدة من صفحة هيكل البطولة.</p>
      <Err e={err} />
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !ageId} className={btn + ' flex-1'}>{busy ? '…' : 'إنشاء الفريق'}</button>
        <button onClick={onCancel} disabled={busy} className="flex-1 text-hint border border-bdr rounded-lg text-xs font-bold py-2">إلغاء</button>
      </div>
    </div>
  );
}

// ── Teams section (one squad per age group / season) ──────────────────────────
function TeamsSection({ token, cid }: { token: string; cid: number }) {
  const router = useRouter();
  const [items, setItems] = useState<MTeamFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const reload = useCallback(() => {
    setLoading(true);
    apiClubTeams(token, cid).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [token, cid]);
  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-aqua font-bold text-sm">⚽ فرق النادي (حسب المرحلة والموسم)</p>
        {!adding && <button onClick={() => setAdding(true)} className="bg-aqua text-on-accent font-bold text-xs px-4 py-1.5 rounded-lg">+ فريق</button>}
      </div>
      {adding && <TeamForm token={token} cid={cid} onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}
      {loading ? (
        <p className="text-hint text-sm text-center py-4">…</p>
      ) : items.length === 0 && !adding ? (
        <p className="text-hint text-sm text-center py-4">لا توجد فرق بعد — أنشئ فريقًا أو سجّل النادي في بطولة</p>
      ) : (
        <div className="space-y-2">
          {items.map(t => (
            <div key={t.id} className={card + ' flex flex-wrap items-center gap-3 hover:border-aqua/40 transition-colors'}>
              <button onClick={() => router.push(`/admin/team?id=${t.id}`)}
                className="flex-1 min-w-0 flex items-center gap-3 text-start">
                <div className="w-9 h-9 rounded-lg bg-darkBg grid place-items-center flex-shrink-0 text-aqua font-bold text-xs">{t.age ?? '—'}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-text text-sm font-bold truncate">{t.club_name || t.name_ar || t.name_en}</p>
                  {(t.name_ar || t.name_en) && (
                    <p className="text-hint text-[11px] truncate">{t.name_ar || t.name_en}</p>
                  )}
                  <p className="text-hint text-[11px] truncate">
                    {t.age ?? ''}
                    {t.seasons.length > 0 && ` · ${t.seasons.join('، ')}`}
                  </p>
                </div>
                <span className="text-aqua text-xs flex-shrink-0">إدارة ›</span>
              </button>
              <DeleteBtn token={token} kind="team" id={t.id}
                label={`فريق «${t.club_name || t.name_ar || t.name_en}»${t.age ? ` (${t.age})` : ''}`}
                onDone={reload} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function ClubPageInner() {
  const { token, canEdit } = useAdminAuth();
  const params = useSearchParams();
  const id = Number(params.get('id') || 0);
  const [club, setClub] = useState<MClub | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    apiClub(token, id).then(setClub).catch(e => setErr(e instanceof Error ? e.message : 'خطأ'));
  }, [token, id]);

  return (
    <AdminShell title="النادي">
      <Link href="/admin/structure?tab=clubs" className="inline-block text-aqua text-xs font-bold mb-3">→ رجوع</Link>
      {!canEdit ? (
        <div className="bg-cardBg border border-bdr rounded-2xl p-8 text-center">
          <p className="text-3xl mb-3">🔒</p><p className="text-text text-sm font-bold">تحتاج صلاحية «محرّر» أو أعلى</p>
        </div>
      ) : err ? (
        <p className="text-loss text-sm text-center py-8">{err}</p>
      ) : !club ? (
        <p className="text-hint text-sm text-center py-8">…</p>
      ) : (
        <div className="space-y-5">
          <ClubInfo token={token!} club={club} onSaved={setClub} />
          <StaffSection token={token!} cid={club.id} />
          <TeamsSection token={token!} cid={club.id} />
        </div>
      )}
    </AdminShell>
  );
}

export default function ClubPage() {
  return (
    <Suspense fallback={null}>
      <ClubPageInner />
    </Suspense>
  );
}
