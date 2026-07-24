'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  tCategories, tCreateTeam, tDeleteTeam, tSetTeamAccount, tUpdateAcademy, tAddManager, tDeleteManager,
  type TCategory, type TTeam,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import TeamManage from '@/components/tla3bny/TeamManage';
import Spinner from '@/components/ui/Spinner';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, StatusBadge, LogoAvatar, useTT } from '@/components/tla3bny/kit';

export default function DashboardPage() {
  const tt = useTT();
  const router = useRouter();
  const { user, academy, team, token, loading, isAcademy, isTeam, refresh } = useTla3bnyAuth();

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  if (loading || !user || !token) return <Spinner />;

  if (isTeam && team) {
    return (
      <div className="space-y-4">
        <Card className="p-4 flex items-center gap-3">
          <LogoAvatar src={team.academy_logo} name={team.display_name} size={48} />
          <div><h1 className="text-lg font-black text-text">{team.display_name}</h1><p className="text-xs text-teal">{team.age_category}</p></div>
        </Card>
        <TeamManage token={token} teamId={team.id} />
      </div>
    );
  }

  if (isAcademy && academy) {
    if (academy.status !== 'approved') {
      return (
        <Card className="p-6 text-center">
          <div className="text-4xl mb-2">⏳</div>
          <h1 className="font-black text-text">{academy.name}</h1>
          <div className="mt-2"><StatusBadge status={academy.status} label={tt('بانتظار الموافقة', 'Awaiting approval')} /></div>
          {academy.rejection_reason && <p className="text-loss text-sm mt-3">{academy.rejection_reason}</p>}
        </Card>
      );
    }
    return <AcademyDashboard token={token} refresh={refresh} />;
  }

  return <Spinner />;
}

function AcademyDashboard({ token, refresh }: { token: string; refresh: () => Promise<void> }) {
  const tt = useTT();
  const { academy } = useTla3bnyAuth();
  const [cats, setCats] = useState<TCategory[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { tCategories().then(setCats).catch(() => setCats([])); }, []);
  if (!academy) return <Spinner />;
  const teams = academy.teams ?? [];

  return (
    <div className="space-y-5">
      <ProfileEditor token={token} refresh={refresh} />
      <ManagersEditor token={token} refresh={refresh} />

      <section>
        <h2 className="font-black text-text mb-2">{tt('الفرق', 'Teams')}</h2>
        <ErrorNote>{err}</ErrorNote>
        <div className="space-y-2 mb-3">
          {teams.map(t => (
            <TeamCard key={t.id} team={t} token={token} refresh={refresh}
              open={selected === t.id} onToggle={() => setSelected(selected === t.id ? null : t.id)} />
          ))}
        </div>
        <AddTeam token={token} cats={cats} refresh={refresh} onErr={setErr} />
      </section>
    </div>
  );
}

function ProfileEditor({ token, refresh }: { token: string; refresh: () => Promise<void> }) {
  const tt = useTT();
  const { academy } = useTla3bnyAuth();
  const [f, setF] = useState({
    name: academy?.name ?? '', phone: academy?.phone ?? '', facebook_url: academy?.facebook_url ?? '',
    training_place: academy?.training_place ?? '', address: academy?.address ?? '', description: academy?.description ?? '',
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const save = async () => {
    setBusy(true); setOk(false);
    try { await tUpdateAcademy(token, f, logo); await refresh(); setOk(true); } finally { setBusy(false); }
  };
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <LogoAvatar src={academy?.logo_path} name={f.name} size={48} />
        <h2 className="font-black text-text">{tt('ملف الأكاديمية', 'Academy profile')}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tt('الاسم', 'Name')}><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label={tt('الهاتف', 'Phone')}><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} className={inputCls} /></Field>
        <Field label={tt('مكان التدريب', 'Training place')}><input value={f.training_place} onChange={e => setF({ ...f, training_place: e.target.value })} className={inputCls} /></Field>
        <Field label={tt('فيسبوك', 'Facebook')}><input value={f.facebook_url} onChange={e => setF({ ...f, facebook_url: e.target.value })} className={inputCls} /></Field>
      </div>
      <Field label={tt('نبذة', 'Description')}><textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} rows={2} /></Field>
      <div className="flex items-center gap-3">
        <input type="file" accept="image/*" onChange={e => setLogo(e.target.files?.[0] ?? null)} className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
        <PrimaryButton onClick={save} disabled={busy}>{busy ? tt('…', '…') : tt('حفظ', 'Save')}</PrimaryButton>
        {ok && <span className="text-win text-sm font-bold">✓</span>}
      </div>
    </Card>
  );
}

function ManagersEditor({ token, refresh }: { token: string; refresh: () => Promise<void> }) {
  const tt = useTT();
  const { academy } = useTla3bnyAuth();
  const [f, setF] = useState({ name: '', role: '', phone: '' });
  const add = async () => { if (!academy || !f.name) return; await tAddManager(token, academy.id, f); setF({ name: '', role: '', phone: '' }); await refresh(); };
  if (!academy) return null;
  return (
    <Card className="p-4 space-y-2">
      <h2 className="font-black text-text">{tt('المسؤولون', 'Managers')}</h2>
      {academy.managers.map(m => (
        <div key={m.id} className="flex items-center justify-between text-sm">
          <span className="text-text font-bold">{m.name} <span className="text-hint font-normal">{m.role}</span></span>
          <button onClick={async () => { await tDeleteManager(token, academy.id, m.id); refresh(); }} className="text-hint hover:text-loss">🗑</button>
        </div>
      ))}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={tt('الاسم', 'Name')} className={inputCls} />
        <input value={f.role} onChange={e => setF({ ...f, role: e.target.value })} placeholder={tt('الوظيفة', 'Role')} className={inputCls} />
        <input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder={tt('الهاتف', 'Phone')} className={inputCls} />
      </div>
      <PrimaryButton onClick={add} disabled={!f.name} className="text-sm">{tt('إضافة مسؤول', 'Add manager')}</PrimaryButton>
    </Card>
  );
}

function AddTeam({ token, cats, refresh, onErr }: { token: string; cats: TCategory[]; refresh: () => Promise<void>; onErr: (s: string) => void }) {
  const tt = useTT();
  const { academy } = useTla3bnyAuth();
  const [ageId, setAgeId] = useState('');
  const [cls, setCls] = useState('');
  const add = async () => {
    if (!academy || !ageId) return;
    try { await tCreateTeam(token, academy.id, { age_category_id: Number(ageId), class_label: cls || undefined }); setAgeId(''); setCls(''); await refresh(); }
    catch (e) { onErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <Card className="p-3 flex flex-wrap items-end gap-2">
      <Field label={tt('الفئة', 'Age')}>
        <select value={ageId} onChange={e => setAgeId(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <Field label={tt('المجموعة/الفئة', 'Class')}><input value={cls} onChange={e => setCls(e.target.value)} placeholder="A / B …" className={inputCls} /></Field>
      <PrimaryButton onClick={add} disabled={!ageId}>{tt('إضافة فريق', 'Add team')}</PrimaryButton>
    </Card>
  );
}

function TeamCard({ team, token, refresh, open, onToggle }: {
  team: TTeam; token: string; refresh: () => Promise<void>; open: boolean; onToggle: () => void;
}) {
  const tt = useTT();
  const [acc, setAcc] = useState({ email: '', password: '' });
  const [accOpen, setAccOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const saveAcc = async () => {
    try { await tSetTeamAccount(token, team.id, acc); setMsg(tt('تم حفظ حساب الفريق', 'Team login saved')); setAcc({ email: '', password: '' }); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <button onClick={onToggle} className="font-bold text-text text-sm">{open ? '▾' : '▸'} {team.display_name}</button>
        <div className="flex items-center gap-2">
          <button onClick={() => setAccOpen(o => !o)} className="text-xs text-teal font-bold hover:underline">{tt('حساب المدرب', 'Coach login')}</button>
          <button onClick={async () => { if (confirm(tt('حذف الفريق؟', 'Delete team?'))) { await tDeleteTeam(token, team.id); refresh(); } }} className="text-hint hover:text-loss text-sm">🗑</button>
        </div>
      </div>
      {accOpen && (
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <input value={acc.email} onChange={e => setAcc({ ...acc, email: e.target.value })} placeholder={tt('بريد الفريق', 'Team email')} className={inputCls} />
          <input value={acc.password} type="password" onChange={e => setAcc({ ...acc, password: e.target.value })} placeholder={tt('كلمة المرور', 'Password')} className={inputCls} />
          <PrimaryButton onClick={saveAcc} disabled={!acc.email || !acc.password} className="text-sm">{tt('حفظ', 'Save')}</PrimaryButton>
          {msg && <p className="col-span-3 text-[11px] text-hint">{msg}</p>}
        </div>
      )}
      {open && <div className="mt-3 border-t border-bdr pt-3"><TeamManage token={token} teamId={team.id} /></div>}
    </Card>
  );
}
