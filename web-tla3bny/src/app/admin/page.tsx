'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  tSeasons, tCreateSeason, tDeleteSeason,
  tCategories, tCreateCategory, tDeleteCategory,
  tManageAcademies, tApproveAcademy, tRejectAcademy, tSuspendAcademy,
  tCompetitions, tCreateCompetition, tDeleteCompetition, tAddCompAdmin, tRemoveCompAdmin,
  type TSeason, type TCategory, type TAcademy, type TCompetition,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import Spinner from '@/components/ui/Spinner';
import { Card, Field, inputCls, PrimaryButton, StatusBadge, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

type Tab = 'seasons' | 'ages' | 'academies' | 'competitions';

export default function AdminPage() {
  const tt = useTT();
  const router = useRouter();
  const { user, token, loading, isSuperAdmin, isCompetitionAdmin, competitions } = useTla3bnyAuth();
  const [tab, setTab] = useState<Tab>('academies');

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
                  <span className="font-bold text-text">{c.name}</span>
                  <span className="text-xs text-aqua font-bold">{tt('إدارة ←', 'Manage →')}</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const tabs: Tab[] = ['academies', 'competitions', 'seasons', 'ages'];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-text">{tt('الإدارة', 'Admin')}</h1>
      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt({ seasons: 'المواسم', ages: 'الفئات', academies: 'الأكاديميات', competitions: 'البطولات' }[t],
              { seasons: 'Seasons', ages: 'Ages', academies: 'Academies', competitions: 'Competitions' }[t])}
          </button>
        ))}
      </div>
      {tab === 'seasons' && <Seasons token={token} />}
      {tab === 'ages' && <Ages token={token} />}
      {tab === 'academies' && <Academies token={token} />}
      {tab === 'competitions' && <Competitions token={token} />}
    </div>
  );
}

function Seasons({ token }: { token: string }) {
  const tt = useTT();
  const [items, setItems] = useState<TSeason[]>([]);
  const [name, setName] = useState('');
  const reload = useCallback(() => { tSeasons().then(setItems).catch(() => setItems([])); }, []);
  useEffect(reload, [reload]);
  return (
    <div className="space-y-2">
      {items.map(s => (
        <Card key={s.id} className="p-3 flex items-center justify-between">
          <span className="font-bold text-text">{s.name}</span>
          <button onClick={async () => { if (confirm(tt('حذف؟', 'Delete?'))) { await tDeleteSeason(token, s.id); reload(); } }} className="text-hint hover:text-loss">🗑</button>
        </Card>
      ))}
      <Card className="p-3 flex items-end gap-2">
        <Field label={tt('اسم الموسم', 'Season name')}><input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="2025/26" /></Field>
        <PrimaryButton onClick={async () => { if (name) { await tCreateSeason(token, { name }); setName(''); reload(); } }} disabled={!name}>{tt('إضافة', 'Add')}</PrimaryButton>
      </Card>
    </div>
  );
}

function Ages({ token }: { token: string }) {
  const tt = useTT();
  const [items, setItems] = useState<TCategory[]>([]);
  const [f, setF] = useState({ label: '', required_files: '1' });
  const reload = useCallback(() => { tCategories().then(setItems).catch(() => setItems([])); }, []);
  useEffect(reload, [reload]);
  return (
    <div className="space-y-2">
      {items.map(c => (
        <Card key={c.id} className="p-3 flex items-center justify-between">
          <span className="font-bold text-text">{c.label} <span className="text-[11px] text-hint">· {c.required_files} {tt('مستند', 'docs')}</span></span>
          <button onClick={async () => { try { await tDeleteCategory(token, c.id); reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } }} className="text-hint hover:text-loss">🗑</button>
        </Card>
      ))}
      <Card className="p-3 flex items-end gap-2">
        <Field label={tt('الفئة', 'Label')}><input value={f.label} onChange={e => setF({ ...f, label: e.target.value })} className={inputCls} placeholder="U10" /></Field>
        <Field label={tt('عدد المستندات', 'Docs')}><input value={f.required_files} onChange={e => setF({ ...f, required_files: e.target.value })} className={inputCls} inputMode="numeric" /></Field>
        <PrimaryButton onClick={async () => { if (f.label) { await tCreateCategory(token, { label: f.label, required_files: Number(f.required_files) || 1 }); setF({ label: '', required_files: '1' }); reload(); } }} disabled={!f.label}>{tt('إضافة', 'Add')}</PrimaryButton>
      </Card>
    </div>
  );
}

function Academies({ token }: { token: string }) {
  const tt = useTT();
  const [items, setItems] = useState<TAcademy[]>([]);
  const reload = useCallback(() => { tManageAcademies(token).then(setItems).catch(() => setItems([])); }, [token]);
  useEffect(reload, [reload]);
  const act = async (fn: Promise<unknown>) => { await fn; reload(); };
  return (
    <div className="space-y-2">
      {items.length === 0 && <EmptyState icon="🏫" text={tt('لا أكاديميات', 'No academies')} />}
      {items.map(a => (
        <Card key={a.id} className="p-3">
          <div className="flex items-center gap-3">
            <LogoAvatar src={a.logo_path} name={a.name} size={40} />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-text truncate">{a.name}</div>
              <div className="text-[11px] text-hint">{a.phone}</div>
            </div>
            <StatusBadge status={a.status} />
          </div>
          <div className="flex items-center gap-2 mt-2">
            {a.status !== 'approved' && <button onClick={() => act(tApproveAcademy(token, a.id))} className="text-xs font-bold text-win hover:underline">{tt('موافقة', 'Approve')}</button>}
            {a.status !== 'rejected' && <button onClick={() => act(tRejectAcademy(token, a.id, prompt(tt('السبب', 'Reason')) || undefined))} className="text-xs font-bold text-loss hover:underline">{tt('رفض', 'Reject')}</button>}
            {a.status === 'approved' && <button onClick={() => act(tSuspendAcademy(token, a.id))} className="text-xs font-bold text-gold hover:underline">{tt('تعليق', 'Suspend')}</button>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Competitions({ token }: { token: string }) {
  const tt = useTT();
  const [seasons, setSeasons] = useState<TSeason[]>([]);
  const [items, setItems] = useState<TCompetition[]>([]);
  const [f, setF] = useState({ season_id: '', name: '', location: '' });
  const reload = useCallback(() => { tCompetitions().then(setItems).catch(() => setItems([])); }, []);
  useEffect(() => { tSeasons().then(setSeasons); reload(); }, [reload]);
  const create = async () => {
    if (!f.season_id || !f.name) return;
    await tCreateCompetition(token, { season_id: Number(f.season_id), name: f.name, location: f.location || undefined });
    setF({ season_id: '', name: '', location: '' }); reload();
  };
  return (
    <div className="space-y-2">
      {items.map(c => <CompRow key={c.id} c={c} token={token} reload={reload} />)}
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
        <Field label={tt('المكان', 'Location')}><input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} className={inputCls} /></Field>
        <PrimaryButton onClick={create} disabled={!f.season_id || !f.name}>{tt('إنشاء بطولة', 'Create competition')}</PrimaryButton>
      </Card>
    </div>
  );
}

function CompRow({ c, token, reload }: { c: TCompetition; token: string; reload: () => void }) {
  const tt = useTT();
  const [adminOpen, setAdminOpen] = useState(false);
  const [af, setAf] = useState({ email: '', password: '', name: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const addAdmin = async () => {
    try { await tAddCompAdmin(token, c.id, af); setMsg(tt('تمت الإضافة', 'Added')); setAf({ email: '', password: '', name: '' }); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-text">{c.name} <span className="text-[11px] text-hint">· {c.season_name}</span></span>
        <div className="flex items-center gap-2">
          <button onClick={() => setAdminOpen(o => !o)} className="text-xs text-teal font-bold hover:underline">{tt('مسؤولون', 'Admins')}</button>
          <Link href={`/manage?comp=${c.id}`} className="text-xs text-aqua font-bold hover:underline">{tt('إدارة', 'Manage')}</Link>
          <button onClick={async () => { if (confirm(tt('حذف البطولة؟', 'Delete competition?'))) { await tDeleteCompetition(token, c.id); reload(); } }} className="text-hint hover:text-loss">🗑</button>
        </div>
      </div>
      {adminOpen && (
        <div className="mt-2 grid grid-cols-3 gap-2 items-end">
          <input value={af.email} onChange={e => setAf({ ...af, email: e.target.value })} placeholder={tt('البريد', 'Email')} className={inputCls} />
          <input value={af.name} onChange={e => setAf({ ...af, name: e.target.value })} placeholder={tt('الاسم', 'Name')} className={inputCls} />
          <input value={af.password} type="password" onChange={e => setAf({ ...af, password: e.target.value })} placeholder={tt('كلمة مرور (جديد)', 'Password (if new)')} className={inputCls} />
          <div className="col-span-3 flex items-center gap-2">
            <PrimaryButton onClick={addAdmin} disabled={!af.email} className="text-sm">{tt('إسناد مسؤول', 'Assign admin')}</PrimaryButton>
            {msg && <span className="text-[11px] text-hint">{msg}</span>}
          </div>
          {(c.admins ?? []).map(a => (
            <div key={a.id} className="col-span-3 flex items-center justify-between text-xs">
              <span className="text-text">{a.user_name || a.user_email}</span>
              <button onClick={async () => { await tRemoveCompAdmin(token, c.id, a.user_id); reload(); }} className="text-hint hover:text-loss">✕</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
