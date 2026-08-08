'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  tCategories, tCreateTeam, tUpdateTeam, tDeleteTeam, tSetTeamAccount, tTeamAccount, tUpdateAcademy,
  tAddManager, tUpdateManager, tDeleteManager, tAddBranch, tUpdateBranch, tDeleteBranch,
  tUpdateCredentials, tMatches,
  tUploadImage, mediaUrl,
  type TCategory, type TTeam, type TMatch,
} from '@/lib/tla3bnyApi';
import { EGYPT_GOVERNORATES } from '@/lib/governorates';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import TeamManage from '@/components/tla3bny/TeamManage';
import MatchRow from '@/components/tla3bny/MatchRow';
import Spinner from '@/components/ui/Spinner';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, StatusBadge, LogoAvatar, EmptyState, useTT, useName } from '@/components/tla3bny/kit';

export default function DashboardPage() {
  const tt = useTT();
  const nm = useName();
  const router = useRouter();
  const { user, academy, team, token, loading, isAcademy, isTeam, refresh } = useTla3bnyAuth();

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  if (loading || !user || !token) return <Spinner />;

  if (isTeam && team) {
    return <TeamAdminDashboard token={token} team={team} refresh={refresh} />;
  }

  if (isAcademy && academy) {
    // Registration is open, so the only closed door is a suspension.
    if (academy.status === 'suspended' || academy.status === 'rejected') {
      return (
        <Card className="p-6 text-center">
          <div className="text-4xl mb-2">🚫</div>
          <h1 className="font-black text-text">{nm(academy.name, academy.name_en)}</h1>
          <div className="mt-2"><StatusBadge status="rejected" label={tt('الحساب موقوف', 'Account suspended')} /></div>
          {academy.rejection_reason && <p className="text-loss text-sm mt-3">{academy.rejection_reason}</p>}
          <p className="text-hint text-xs mt-3">{tt('تواصل مع إدارة الموقع.', 'Contact the site administrators.')}</p>
        </Card>
      );
    }
    return <AcademyDashboard token={token} refresh={refresh} />;
  }

  return <Spinner />;
}

function TeamAdminDashboard({ token, team, refresh }: { token: string; team: TTeam; refresh: () => Promise<void> }) {
  const tt = useTT();
  const nm = useName();
  const [tab, setTab] = useState<'squad' | 'matches'>('squad');
  const [matches, setMatches] = useState<TMatch[]>([]);

  useEffect(() => {
    tMatches({ team_id: team.id, order: 'asc' }).then(setMatches).catch(() => setMatches([]));
  }, [team.id]);

  const tabs: { key: 'squad' | 'matches'; ar: string; en: string }[] = [
    { key: 'squad', ar: 'الجهاز الفني واللاعبون', en: 'Staff & Players' },
    { key: 'matches', ar: 'المباريات', en: 'Matches' },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center gap-4">
        <LogoAvatar src={team.academy_logo} name={nm(team.display_name, team.display_name_en)} size={48} />
        <div>
          <h1 className="text-lg font-black text-text">{nm(team.display_name, team.display_name_en)}</h1>
          <p className="text-xs text-teal font-bold">{team.age_category}</p>
        </div>
      </Card>

      <CredentialsEditor token={token} refresh={refresh} />

      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt(t.ar, t.en)}
          </button>
        ))}
      </div>

      {tab === 'squad' && <TeamManage token={token} teamId={team.id} />}

      {tab === 'matches' && (
        <div>
          {matches.length === 0
            ? <EmptyState icon="📋" text={tt('لا مباريات بعد', 'No matches yet')} />
            : matches.map(m => <MatchRow key={m.id} m={m} showComp />)
          }
        </div>
      )}
    </div>
  );
}

function AcademyDashboard({ token, refresh }: { token: string; refresh: () => Promise<void> }) {
  const tt = useTT();
  const { academy } = useTla3bnyAuth();
  const [tab, setTab] = useState<'info' | 'teams'>('info');
  const [cats, setCats] = useState<TCategory[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { tCategories().then(setCats).catch(() => setCats([])); }, []);
  if (!academy) return <Spinner />;
  const teams = academy.teams ?? [];

  const tabs: { key: 'info' | 'teams'; ar: string; en: string }[] = [
    { key: 'info', ar: 'معلومات الأكاديمية', en: 'Academy Info' },
    { key: 'teams', ar: 'الفرق', en: 'Teams' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt(t.ar, t.en)}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="space-y-4">
          <ProfileEditor token={token} refresh={refresh} />
          <CredentialsEditor token={token} refresh={refresh} />
          <ManagersEditor token={token} refresh={refresh} />
          <BranchesEditor token={token} refresh={refresh} />
        </div>
      )}

      {tab === 'teams' && (
        <div className="space-y-3">
          <ErrorNote>{err}</ErrorNote>
          {teams.length === 0 && (
            <p className="text-hint text-sm text-center py-4">{tt('لا فرق بعد', 'No teams yet')}</p>
          )}
          {teams.map(t => (
            <TeamCard key={t.id} team={t} token={token} refresh={refresh}
              open={selected === t.id} onToggle={() => setSelected(selected === t.id ? null : t.id)} />
          ))}
          <AddTeam token={token} cats={cats} refresh={refresh} onErr={setErr} />
        </div>
      )}
    </div>
  );
}

function ProfileEditor({ token, refresh }: { token: string; refresh: () => Promise<void> }) {
  const tt = useTT();
  const { academy } = useTla3bnyAuth();
  const [f, setF] = useState({
    name: academy?.name ?? '', name_en: academy?.name_en ?? '', phone: academy?.phone ?? '',
    whatsapp_number: academy?.whatsapp_number ?? '', facebook_url: academy?.facebook_url ?? '',
    description: academy?.description ?? '',
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [photos, setPhotos] = useState<string[]>(academy?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const addPhoto = async (file: File | null) => {
    if (!file || photos.length >= 3) return;
    setUploading(true);
    try { const path = await tUploadImage(token, file); setPhotos(p => [...p, path].slice(0, 3)); }
    finally { setUploading(false); }
  };
  const save = async () => {
    setBusy(true); setOk(false);
    try { await tUpdateAcademy(token, f, logo, photos); await refresh(); setOk(true); } finally { setBusy(false); }
  };
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <LogoAvatar src={academy?.logo_path} name={f.name} size={48} />
        <h2 className="font-black text-text">{tt('ملف الأكاديمية', 'Academy profile')}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tt('الاسم', 'Name')}><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label={tt('الاسم بالإنجليزية', 'Name (English)')}><input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
        <Field label={tt('الهاتف', 'Phone')}><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} className={inputCls} /></Field>
        <Field label={tt('واتساب', 'WhatsApp')}><input value={f.whatsapp_number} onChange={e => setF({ ...f, whatsapp_number: e.target.value })} dir="ltr" className={inputCls} /></Field>
        <Field label={tt('فيسبوك', 'Facebook')}><input value={f.facebook_url} onChange={e => setF({ ...f, facebook_url: e.target.value })} className={inputCls} /></Field>
      </div>
      <Field label={tt('نبذة عن الأكاديمية', 'About the academy')}><textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} rows={3} /></Field>

      <div>
        <label className="text-teal text-[11px] font-bold block mb-1">{tt('صور الأكاديمية (حتى 3)', 'Academy photos (up to 3)')}</label>
        <div className="flex gap-2 flex-wrap">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(p) ?? ''} alt="" className="w-16 h-16 object-cover rounded-lg border border-bdr" />
              <button onClick={() => setPhotos(ph => ph.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -end-1.5 bg-loss text-white rounded-full w-5 h-5 text-[11px] grid place-items-center">✕</button>
            </div>
          ))}
          {photos.length < 3 && (
            <label className="w-16 h-16 rounded-lg border border-dashed border-bdr grid place-items-center text-hint text-xl cursor-pointer hover:border-aqua/50">
              {uploading ? '…' : '+'}
              <input type="file" accept="image/*" className="hidden" onChange={e => { addPhoto(e.target.files?.[0] ?? null); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <label className="text-xs text-hint">{tt('الشعار:', 'Logo:')}<input type="file" accept="image/*" onChange={e => setLogo(e.target.files?.[0] ?? null)} className="ms-2 file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" /></label>
        <PrimaryButton onClick={save} disabled={busy}>{busy ? tt('…', '…') : tt('حفظ', 'Save')}</PrimaryButton>
        {ok && <span className="text-win text-sm font-bold">✓</span>}
      </div>
    </Card>
  );
}

/** Change your own sign-in details. Every role gets this — the username is what
 *  an organiser, an academy owner or a team manager logs in with. */
function CredentialsEditor({ token, refresh }: { token: string; refresh: () => Promise<void> }) {
  const tt = useTT();
  const { user } = useTla3bnyAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const changed = username.trim().toLowerCase() !== (user?.username ?? '') || password.length > 0;

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await tUpdateCredentials(token, {
        username: username.trim().toLowerCase(),
        ...(password ? { password } : {}),
      });
      setPassword('');
      setMsg(tt('تم الحفظ', 'Saved'));
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4 space-y-3">
      <h2 className="font-black text-text">{tt('بيانات الدخول', 'Sign-in details')}</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tt('اسم المستخدم', 'Username')}>
          <input value={username} dir="ltr" onChange={e => setUsername(e.target.value)} className={inputCls} />
        </Field>
        <Field label={tt('كلمة مرور جديدة', 'New password')}>
          <input type="password" value={password} placeholder={tt('اتركها فارغة لعدم التغيير', 'Leave blank to keep')}
            onChange={e => setPassword(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <ErrorNote>{err}</ErrorNote>
      <div className="flex items-center gap-3">
        <PrimaryButton onClick={save} disabled={busy || !changed || !username.trim()} className="text-sm">
          {busy ? tt('…', '…') : tt('حفظ', 'Save')}
        </PrimaryButton>
        {msg && <span className="text-win text-sm font-bold">✓ {msg}</span>}
      </div>
    </Card>
  );
}

function ManagersEditor({ token, refresh }: { token: string; refresh: () => Promise<void> }) {
  const tt = useTT();
  const { academy } = useTla3bnyAuth();
  const [f, setF] = useState({ name: '', role: '', phone: '' });
  const [editId, setEditId] = useState<number | null>(null);
  const [ef, setEf] = useState({ name: '', role: '', phone: '' });
  const add = async () => { if (!academy || !f.name) return; await tAddManager(token, academy.id, f); setF({ name: '', role: '', phone: '' }); await refresh(); };
  const startEdit = (m: { id: number; name: string; role: string | null; phone: string | null }) => {
    setEditId(m.id); setEf({ name: m.name ?? '', role: m.role ?? '', phone: m.phone ?? '' });
  };
  const saveEdit = async () => {
    if (!academy || !ef.name || editId == null) return;
    await tUpdateManager(token, academy.id, editId, ef); setEditId(null); await refresh();
  };
  if (!academy) return null;
  return (
    <Card className="p-4 space-y-2">
      <h2 className="font-black text-text">{tt('المسؤولون', 'Managers')}</h2>
      {academy.managers.map(m => editId === m.id ? (
        <div key={m.id} className="space-y-2 border-t border-bdr/40 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <input value={ef.name} onChange={e => setEf({ ...ef, name: e.target.value })} placeholder={tt('الاسم', 'Name')} className={inputCls} />
            <input value={ef.role} onChange={e => setEf({ ...ef, role: e.target.value })} placeholder={tt('الوظيفة', 'Role')} className={inputCls} />
            <input value={ef.phone} onChange={e => setEf({ ...ef, phone: e.target.value })} placeholder={tt('الهاتف', 'Phone')} className={inputCls} />
          </div>
          <div className="flex gap-2">
            <PrimaryButton onClick={saveEdit} disabled={!ef.name} className="text-sm">{tt('حفظ', 'Save')}</PrimaryButton>
            <button onClick={() => setEditId(null)} className="text-hint text-sm font-bold px-3">{tt('إلغاء', 'Cancel')}</button>
          </div>
        </div>
      ) : (
        <div key={m.id} className="flex items-center justify-between text-sm border-t border-bdr/40 pt-1.5 first:border-0 first:pt-0">
          <span className="text-text font-bold">{m.name} <span className="text-hint font-normal">{m.role}</span></span>
          <span className="flex items-center gap-3 flex-shrink-0">
            <button onClick={() => startEdit(m)} className="text-hint hover:text-aqua" title={tt('تعديل', 'Edit')}>✎</button>
            <button onClick={async () => { await tDeleteManager(token, academy.id, m.id); refresh(); }} className="text-hint hover:text-loss" title={tt('حذف', 'Delete')}>🗑</button>
          </span>
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

function BranchesEditor({ token, refresh }: { token: string; refresh: () => Promise<void> }) {
  const tt = useTT();
  const { academy } = useTla3bnyAuth();
  const empty = { name: '', governorate: '', address: '', location_url: '', phone: '' };
  const [f, setF] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [ef, setEf] = useState(empty);
  const add = async () => {
    if (!academy || !f.name) return;
    await tAddBranch(token, academy.id, f);
    setF(empty);
    await refresh();
  };
  const startEdit = (b: { id: number; name: string; governorate: string | null; address: string | null; location_url: string | null; phone: string | null }) => {
    setEditId(b.id); setEf({ name: b.name ?? '', governorate: b.governorate ?? '', address: b.address ?? '', location_url: b.location_url ?? '', phone: b.phone ?? '' });
  };
  const saveEdit = async () => {
    if (!academy || !ef.name || editId == null) return;
    await tUpdateBranch(token, academy.id, editId, ef); setEditId(null); await refresh();
  };
  const fields = (v: typeof empty, set: (x: typeof empty) => void) => (
    <div className="grid grid-cols-2 gap-2">
      <input value={v.name} onChange={e => set({ ...v, name: e.target.value })} placeholder={tt('اسم الفرع', 'Branch name')} className={inputCls} />
      <select value={v.governorate} onChange={e => set({ ...v, governorate: e.target.value })} className={inputCls}>
        <option value="">{tt('المحافظة', 'Governorate')}</option>
        {EGYPT_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
      <input value={v.phone} onChange={e => set({ ...v, phone: e.target.value })} placeholder={tt('الهاتف', 'Phone')} className={inputCls} />
      <input value={v.address} onChange={e => set({ ...v, address: e.target.value })} placeholder={tt('العنوان', 'Address')} className={inputCls} />
      <input value={v.location_url} onChange={e => set({ ...v, location_url: e.target.value })} placeholder={tt('رابط الخريطة', 'Map link')} className={inputCls} />
    </div>
  );
  if (!academy) return null;
  return (
    <Card className="p-4 space-y-2">
      <h2 className="font-black text-text">{tt('الفروع', 'Branches')}</h2>
      <p className="text-hint text-[11px]">{tt('أضِف فروع أكاديميتك وأماكنها لتظهر في صفحتك.', 'Add your academy branches and their locations to show on your page.')}</p>
      {(academy.branches ?? []).map(b => editId === b.id ? (
        <div key={b.id} className="space-y-2 border-t border-bdr/40 pt-2">
          {fields(ef, setEf)}
          <div className="flex gap-2">
            <PrimaryButton onClick={saveEdit} disabled={!ef.name} className="text-sm">{tt('حفظ', 'Save')}</PrimaryButton>
            <button onClick={() => setEditId(null)} className="text-hint text-sm font-bold px-3">{tt('إلغاء', 'Cancel')}</button>
          </div>
        </div>
      ) : (
        <div key={b.id} className="flex items-center justify-between text-sm border-t border-bdr/40 pt-1.5">
          <span className="min-w-0">
            <span className="text-text font-bold">📍 {b.name}{b.governorate && <span className="text-teal font-normal"> · {b.governorate}</span>}</span>
            {b.address && <span className="text-hint text-[11px] block truncate">{b.address}</span>}
          </span>
          <span className="flex items-center gap-3 flex-shrink-0">
            <button onClick={() => startEdit(b)} className="text-hint hover:text-aqua" title={tt('تعديل', 'Edit')}>✎</button>
            <button onClick={async () => { await tDeleteBranch(token, academy.id, b.id); refresh(); }} className="text-hint hover:text-loss" title={tt('حذف', 'Delete')}>🗑</button>
          </span>
        </div>
      ))}
      {fields(f, setF)}
      <PrimaryButton onClick={add} disabled={!f.name} className="text-sm">{tt('إضافة فرع', 'Add branch')}</PrimaryButton>
    </Card>
  );
}

function AddTeam({ token, cats, refresh, onErr }: { token: string; cats: TCategory[]; refresh: () => Promise<void>; onErr: (s: string) => void }) {
  const tt = useTT();
  const { academy } = useTla3bnyAuth();
  const [ageId, setAgeId] = useState('');
  const [cls, setCls] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try { setPhoto(await tUploadImage(token, file)); } finally { setUploading(false); }
  };
  const add = async () => {
    if (!academy || !ageId) return;
    try {
      await tCreateTeam(token, academy.id, {
        age_category_id: Number(ageId),
        class_label: cls || undefined,
        description: description.trim() || undefined,
        photo_path: photo || undefined,
      });
      setAgeId(''); setCls(''); setDescription(''); setPhoto(null); await refresh();
    } catch (e) { onErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={tt('الفئة', 'Age')}>
          <select value={ageId} onChange={e => setAgeId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label={tt('المجموعة/الفئة', 'Class')}><input value={cls} onChange={e => setCls(e.target.value)} placeholder="A / B …" className={inputCls} /></Field>
      </div>
      <div className="flex items-start gap-3">
        <div>
          <label className="text-teal text-[11px] font-bold block mb-1">{tt('صورة الفريق', 'Team photo')}</label>
          {photo ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(photo) ?? ''} alt="" className="w-16 h-16 object-cover rounded-lg border border-bdr" />
              <button onClick={() => setPhoto(null)}
                className="absolute -top-1.5 -end-1.5 bg-loss text-white rounded-full w-5 h-5 text-[11px] grid place-items-center">✕</button>
            </div>
          ) : (
            <label className="w-16 h-16 rounded-lg border border-dashed border-bdr grid place-items-center text-hint text-xl cursor-pointer hover:border-aqua/50">
              {uploading ? '…' : '+'}
              <input type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Field label={tt('نبذة عن الفريق', 'Short description')}>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={500}
              placeholder={tt('نبذة قصيرة…', 'Short blurb…')} className={inputCls} />
          </Field>
        </div>
      </div>
      <PrimaryButton onClick={add} disabled={!ageId}>{tt('إضافة فريق', 'Add team')}</PrimaryButton>
    </Card>
  );
}

function TeamCard({ team, token, refresh, open, onToggle }: {
  team: TTeam; token: string; refresh: () => Promise<void>; open: boolean; onToggle: () => void;
}) {
  const tt = useTT();
  const nm = useName();
  const [acc, setAcc] = useState({ username: '', password: '' });
  const [accOpen, setAccOpen] = useState(false);
  const [existing, setExisting] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Only asked for when the panel is opened — one request per team on every
  // dashboard load would be a lot of noise for a rarely-used panel.
  useEffect(() => {
    if (!accOpen) return;
    tTeamAccount(token, team.id)
      .then(r => setExisting(r.username))
      .catch(() => setExisting(null));
  }, [accOpen, token, team.id]);

  const saveAcc = async () => {
    try {
      const r = await tSetTeamAccount(token, team.id, acc);
      setExisting(r.username);
      setMsg(tt('تم حفظ حساب مدير الفريق', 'Team manager login saved'));
      setAcc({ username: '', password: '' });
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  // Editing the team's photo / short description (shown on the team hero card).
  const [editOpen, setEditOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(team.photo_path);
  const [desc, setDesc] = useState(team.description ?? '');
  const [uploading, setUploading] = useState(false);
  const uploadPhoto = async (file: File | null) => {
    if (!file) return; setUploading(true);
    try { setPhoto(await tUploadImage(token, file)); } finally { setUploading(false); }
  };
  const saveEdit = async () => {
    await tUpdateTeam(token, team.id, { photo_path: photo ?? '', description: desc });
    setEditOpen(false); await refresh();
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onToggle} className="text-hint text-sm shrink-0">{open ? '▾' : '▸'}</button>
          <Link href={`/team?id=${team.id}`} className="font-bold text-text text-sm hover:text-aqua truncate">
            {nm(team.display_name, team.display_name_en)}
          </Link>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setEditOpen(o => !o)} className="text-aqua hover:text-aqua text-sm" title={tt('تعديل الصورة والنبذة', 'Edit photo & description')}>✎</button>
          <button onClick={() => setAccOpen(o => !o)} className="text-xs text-teal font-bold hover:underline">{tt('حساب مدير الفريق', 'Manager login')}</button>
          <button onClick={async () => { if (confirm(tt('حذف الفريق؟', 'Delete team?'))) { await tDeleteTeam(token, team.id); refresh(); } }} className="text-hint hover:text-loss text-sm">🗑</button>
        </div>
      </div>
      {editOpen && (
        <div className="mt-2 flex items-start gap-3 border-t border-bdr/40 pt-2">
          <div>
            <label className="text-teal text-[11px] font-bold block mb-1">{tt('صورة الفريق', 'Team photo')}</label>
            {photo ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(photo) ?? ''} alt="" className="w-16 h-16 object-cover rounded-lg border border-bdr" />
                <button onClick={() => setPhoto(null)}
                  className="absolute -top-1.5 -end-1.5 bg-loss text-white rounded-full w-5 h-5 text-[11px] grid place-items-center">✕</button>
              </div>
            ) : (
              <label className="w-16 h-16 rounded-lg border border-dashed border-bdr grid place-items-center text-hint text-xl cursor-pointer hover:border-aqua/50">
                {uploading ? '…' : '+'}
                <input type="file" accept="image/*" hidden onChange={e => uploadPhoto(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} maxLength={500}
              placeholder={tt('نبذة قصيرة عن الفريق…', 'Short blurb…')} className={inputCls} />
            <div className="flex gap-2">
              <PrimaryButton onClick={saveEdit} className="text-sm">{tt('حفظ', 'Save')}</PrimaryButton>
              <button onClick={() => setEditOpen(false)} className="text-hint text-sm font-bold px-3">{tt('إلغاء', 'Cancel')}</button>
            </div>
          </div>
        </div>
      )}
      {accOpen && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-hint">
            {existing
              ? tt(`الحساب الحالي: ${existing} — الحفظ هيغيّر البيانات دي.`,
                   `Current login: ${existing} — saving replaces it.`)
              : tt('اعمل اسم مستخدم وكلمة مرور وسلّمهم لمدير الفريق.',
                   'Create a username and password and hand them to the team manager.')}
          </p>
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
      {open && <div className="mt-3 border-t border-bdr pt-3"><TeamManage token={token} teamId={team.id} /></div>}
    </Card>
  );
}
