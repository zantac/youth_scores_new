'use client';
import { Suspense, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';
import { useAdminAuth } from '@/context/AdminAuthContext';
import {
  apiCompetition, apiStages, apiCreateStage, apiUpdateStage, apiDeleteStage,
  apiCreateGroup, apiDeleteGroup,
  apiGroupTeams, apiAddGroupTeam, apiRemoveGroupTeam, apiCompTeamsManage,
  STAGE_TYPE_LABEL,
  type MComp, type MStage, type MGroup, type MGroupTeam, type MTeam, type StageType,
} from '@/lib/adminApi';

const inputCls = "w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua";
const btn = "bg-aqua text-on-accent font-extrabold py-2.5 rounded-xl disabled:opacity-50";
const card = "bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4";

const TYPES: StageType[] = ['league', 'group', 'knockout'];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-teal text-[11px] font-bold mb-1">{label}</label>{children}</div>;
}
function Err({ e }: { e: string | null }) { return e ? <p className="text-loss text-xs">{e}</p> : null; }

// ── Stage form ────────────────────────────────────────────────────────────────
function StageForm({ token, cid, stage, onDone, onCancel }: {
  token: string; cid: number; stage: MStage | null; onDone: () => void; onCancel: () => void;
}) {
  const [f, setF] = useState({
    name_ar: stage?.name_ar ?? '', name_en: stage?.name_en ?? '',
    type: (stage?.type ?? 'league') as StageType,
    carries_points: stage ? stage.carries_points : true,
  });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      // stage_order is deliberately absent: new stages append, and ▲▼ on the
      // card is what moves them. Sending a number here could only collide.
      const body = {
        name_ar: f.name_ar, name_en: f.name_en, type: f.type,
        carries_points: f.carries_points,
      };
      if (stage) await apiUpdateStage(token, stage.id, body);
      else await apiCreateStage(token, cid, body);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };
  return (
    <div className={card + ' space-y-3 border-aqua/40'}>
      <p className="text-aqua font-bold text-sm">{stage ? '✏️ تعديل المرحلة' : '➕ مرحلة جديدة'}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الاسم (عربي) *"><input value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} placeholder="الدوري" className={inputCls} /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
        <Field label="النوع *">
          <select value={f.type} onChange={e => setF({ ...f, type: e.target.value as StageType })} className={inputCls}>
            {TYPES.map(t => <option key={t} value={t}>{STAGE_TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
      </div>
      {f.type !== 'knockout' && (
        <label className="flex items-start gap-2 text-teal text-xs bg-darkBg/60 border border-bdr rounded-lg p-3">
          <input type="checkbox" className="mt-0.5" checked={f.carries_points}
            onChange={e => setF({ ...f, carries_points: e.target.checked })} />
          <span>
            <b>ترحيل النقاط والأهداف</b> من المراحل السابقة
            <br />
            <span className="text-hint">مُفعّل = الفرق تكمل بنقاطها · غير مُفعّل = الجدول يبدأ من الصفر</span>
          </span>
        </label>
      )}
      <Err e={err} />
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !f.name_ar.trim()} className={btn + ' flex-1'}>{busy ? '…' : 'حفظ'}</button>
        <button onClick={onCancel} disabled={busy} className="flex-1 text-hint border border-bdr rounded-lg text-xs font-bold py-2">إلغاء</button>
      </div>
    </div>
  );
}

// ── Group teams ───────────────────────────────────────────────────────────────
function GroupTeams({ token, group, compTeams, onChanged }: {
  token: string; group: MGroup; compTeams: MTeam[]; onChanged: () => void;
}) {
  const [items, setItems] = useState<MGroupTeam[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const reload = useCallback(() => {
    apiGroupTeams(token, group.id).then(setItems).catch(() => {});
  }, [token, group.id]);
  useEffect(() => { reload(); }, [reload]);

  const add = async () => {
    if (!pick) return;
    setErr(null);
    try { await apiAddGroupTeam(token, group.id, Number(pick)); setPick(''); reload(); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };
  const remove = async (gt: MGroupTeam) => { await apiRemoveGroupTeam(token, gt.group_team_id); reload(); onChanged(); };

  const taken = new Set(items.map(i => i.id));
  const available = compTeams.filter(t => !taken.has(t.id));

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <select value={pick} onChange={e => setPick(e.target.value)} className={inputCls}>
          <option value="">— أضف فريقًا —</option>
          {available.map(t => <option key={t.id} value={t.id}>{t.name_ar || t.club_name}</option>)}
        </select>
        <button onClick={add} disabled={!pick} className="bg-aqua text-on-accent font-bold text-xs px-4 rounded-lg disabled:opacity-40 whitespace-nowrap">+ إضافة</button>
      </div>
      <Err e={err} />
      {items.length === 0 ? (
        <p className="text-hint text-[11px] text-center py-2">لا توجد فرق في المجموعة</p>
      ) : (
        <div className="space-y-1">
          {items.map(t => (
            <div key={t.group_team_id} className="flex items-center gap-2 bg-darkBg border border-bdr rounded-lg px-3 py-1.5">
              {t.logo && <img src={t.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />}
              <span className="flex-1 text-text text-xs truncate">{t.name_ar || t.club_name}</span>
              <button onClick={() => remove(t)} className="text-loss text-[11px] font-bold">إزالة</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stage card ────────────────────────────────────────────────────────────────
function StageCard({ token, stage, compTeams, onChanged }: {
  token: string; stage: MStage; compTeams: MTeam[]; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [gname, setGname] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const addGroup = async () => {
    if (!gname.trim()) return;
    setErr(null);
    try { await apiCreateGroup(token, stage.id, { name_ar: gname }); setGname(''); setAddingGroup(false); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };
  const removeGroup = async (g: MGroup) => {
    if (!confirm(`حذف مجموعة «${g.name_ar}» و${g.team_count} فريق منها؟`)) return;
    setErr(null);
    try { await apiDeleteGroup(token, g.id); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };
  const removeStage = async () => {
    if (!confirm(`حذف مرحلة «${stage.name_ar}»؟`)) return;
    setErr(null);
    try { await apiDeleteStage(token, stage.id); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };

  if (editing) {
    return <StageForm token={token} cid={stage.competition_id} stage={stage}
      onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className={card + ' space-y-3'}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-darkBg grid place-items-center text-aqua font-bold text-xs flex-shrink-0">{stage.stage_order}</span>
        <div className="flex-1 min-w-0">
          <p className="text-text font-bold text-sm truncate">{stage.name_ar || stage.name_en}</p>
          <p className="text-hint text-[11px]">
            {STAGE_TYPE_LABEL[stage.type]} · {stage.match_count} مباراة
            {stage.type !== 'knockout' && (
              stage.carries_points
                ? <span className="text-teal"> · بترحيل النقاط</span>
                : <span className="text-gold"> · يبدأ من الصفر</span>
            )}
          </p>
        </div>
        <button onClick={() => setEditing(true)} className="text-aqua text-[11px] font-bold flex-shrink-0">تعديل</button>
        <button onClick={removeStage} className="text-loss text-[11px] font-bold flex-shrink-0">حذف</button>
      </div>
      <Err e={err} />

      {stage.type !== 'knockout' && (
        <div className="space-y-2 pt-2 border-t border-bdr/50">
          <div className="flex items-center justify-between">
            <p className="text-teal text-[11px] font-bold">المجموعات</p>
            {!addingGroup && <button onClick={() => setAddingGroup(true)} className="text-aqua text-[11px] font-bold">+ مجموعة</button>}
          </div>
          {addingGroup && (
            <div className="flex gap-2">
              <input value={gname} onChange={e => setGname(e.target.value)} placeholder="اسم المجموعة (مثال: 2A)" className={inputCls} />
              <button onClick={addGroup} className="bg-aqua text-on-accent font-bold text-xs px-4 rounded-lg whitespace-nowrap">حفظ</button>
              <button onClick={() => { setAddingGroup(false); setGname(''); }} className="text-hint text-xs px-2">إلغاء</button>
            </div>
          )}
          {stage.groups.length === 0 && !addingGroup && (
            <p className="text-hint text-[11px]">بدون مجموعات — جدول واحد لكل فرق المرحلة</p>
          )}
          {stage.groups.map(g => (
            <div key={g.id} className="bg-darkBg/50 border border-bdr rounded-xl p-2.5">
              <div className="flex items-center gap-2">
                <button onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)} className="flex-1 flex items-center gap-2 text-start">
                  <span className="text-aqua text-xs">{openGroup === g.id ? '▾' : '▸'}</span>
                  <span className="text-text text-xs font-bold">{g.name_ar || g.name_en}</span>
                  <span className="text-hint text-[10px]">({g.team_count} فريق)</span>
                </button>
                <button onClick={() => removeGroup(g)} className="text-loss text-[10px] font-bold">حذف</button>
              </div>
              {openGroup === g.id && <GroupTeams token={token} group={g} compTeams={compTeams} onChanged={onChanged} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function CompetitionPageInner() {
  const { token, canEdit } = useAdminAuth();
  const params = useSearchParams();
  const id = Number(params.get('id') || 0);
  const [comp, setComp] = useState<MComp | null>(null);
  const [stages, setStages] = useState<MStage[]>([]);
  const [teams, setTeams] = useState<MTeam[]>([]);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!token || !id) return;
    apiStages(token, id).then(setStages).catch(e => setErr(e instanceof Error ? e.message : 'خطأ'));
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    apiCompetition(token, id).then(setComp).catch(e => setErr(e instanceof Error ? e.message : 'خطأ'));
    apiCompTeamsManage(token, id).then(setTeams).catch(() => {});
    reload();
  }, [token, id, reload]);

  return (
    <AdminShell title="البطولة">
      <Link href="/admin/structure?tab=comps" className="inline-block text-aqua text-xs font-bold mb-3">→ رجوع</Link>
      {!canEdit ? (
        <div className="bg-cardBg border border-bdr rounded-2xl p-8 text-center">
          <p className="text-3xl mb-3">🔒</p><p className="text-text text-sm font-bold">تحتاج صلاحية «محرّر» أو أعلى</p>
        </div>
      ) : !comp ? (
        err ? <p className="text-loss text-sm text-center py-8">{err}</p>
            : <p className="text-hint text-sm text-center py-8">…</p>
      ) : (
        <div className="space-y-5">
          <div className={card}>
            <p className="text-text font-extrabold text-base">{comp.name_ar || comp.name_en}</p>
            <p className="text-hint text-xs mt-0.5">
              {comp.season}{comp.age ? ` · ${comp.age}` : ''}{comp.sector_ar ? ` · ${comp.sector_ar}` : ''}
              {` · ${teams.length} فريق`}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-aqua font-bold text-sm">🗂️ المراحل</p>
              {!adding && <button onClick={() => setAdding(true)} className="bg-aqua text-on-accent font-bold text-xs px-4 py-1.5 rounded-lg">+ مرحلة</button>}
            </div>
            {adding && <StageForm token={token!} cid={id} stage={null}
              onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}
            <Err e={err} />
            {stages.length === 0 && !adding ? (
              <p className="text-hint text-sm text-center py-4">لا توجد مراحل — أضف المرحلة الأولى</p>
            ) : (
              stages.map(s => (
                <StageCard key={s.id} token={token!} stage={s} compTeams={teams} onChanged={reload} />
              ))
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default function CompetitionPage() {
  return (
    <Suspense fallback={null}>
      <CompetitionPageInner />
    </Suspense>
  );
}
