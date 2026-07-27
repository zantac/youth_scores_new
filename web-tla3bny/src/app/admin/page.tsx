'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  tSeasons, tCreateSeason, tDeleteSeason,
  tCategories, tCreateCategory, tUpdateCategory, tDeleteCategory,
  tManageAcademies, tRestoreAcademy, tSuspendAcademy, tSetAcademyAccount,
  tCompetitions, tCreateCompetition, tDeleteCompetition, tAddCompAdmin, tRemoveCompAdmin,
  type TSeason, type TCategory, type TAcademy, type TCompetition,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import Spinner from '@/components/ui/Spinner';
import CompDocsEditor from '@/components/tla3bny/CompDocsEditor';
import NewsAdmin from '@/components/tla3bny/NewsAdmin';
import { Card, Field, inputCls, PrimaryButton, StatusBadge, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

type Tab = 'competitions' | 'news' | 'academies' | 'seasons' | 'ages';

export default function AdminPage() {
  const tt = useTT();
  const router = useRouter();
  const { user, token, loading, isSuperAdmin, isCompetitionAdmin, competitions } = useTla3bnyAuth();
  const [tab, setTab] = useState<Tab>('competitions');

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

  const tabs: Tab[] = ['competitions', 'news', 'academies', 'seasons', 'ages'];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-text">{tt('الإدارة', 'Admin')}</h1>
      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt({ seasons: 'المواسم', ages: 'الفئات', academies: 'الأكاديميات', competitions: 'البطولات', news: '📰 الأخبار' }[t],
              { seasons: 'Seasons', ages: 'Ages', academies: 'Academies', competitions: 'Competitions', news: '📰 News' }[t])}
          </button>
        ))}
      </div>
      {tab === 'seasons' && <Seasons token={token} />}
      {tab === 'ages' && <Ages token={token} />}
      {tab === 'academies' && <Academies token={token} />}
      {tab === 'competitions' && <Competitions token={token} />}
      {/* compId null = site-wide news, which only the super admin can post. */}
      {tab === 'news' && <NewsAdmin token={token} compId={null} />}
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

/** Mirrors codes.TLA3BNY_DEFAULT_PLAYER_DOCS — the starting point an organiser
 *  edits; they can add as many papers as they need. */
const DEFAULT_DOCS = 'شهادة الميلاد\nخطاب من المدرسة\nالرقم القومي للاعب\nالشهادة الصحية';

const toLines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);

function Ages({ token }: { token: string }) {
  const tt = useTT();
  const [items, setItems] = useState<TCategory[]>([]);
  const [f, setF] = useState({ label: '', docs: DEFAULT_DOCS });
  const reload = useCallback(() => { tCategories().then(setItems).catch(() => setItems([])); }, []);
  useEffect(reload, [reload]);
  return (
    <div className="space-y-2">
      {items.map(c => <AgeRow key={c.id} token={token} cat={c} reload={reload} />)}
      <Card className="p-3 space-y-2">
        <Field label={tt('الفئة', 'Label')}><input value={f.label} onChange={e => setF({ ...f, label: e.target.value })} className={inputCls} placeholder="U10" /></Field>
        <Field label={tt('أوراق افتراضية للفئة (سطر لكل ورقة)', 'Default papers for this age (one per line)')}>
          <textarea value={f.docs} onChange={e => setF({ ...f, docs: e.target.value })} rows={3} className={inputCls} />
        </Field>
        <PrimaryButton onClick={async () => { if (f.label) { await tCreateCategory(token, { label: f.label, required_documents: toLines(f.docs) }); setF({ label: '', docs: DEFAULT_DOCS }); reload(); } }} disabled={!f.label}>{tt('إضافة فئة', 'Add age')}</PrimaryButton>
      </Card>
    </div>
  );
}

function AgeRow({ token, cat, reload }: { token: string; cat: TCategory; reload: () => void }) {
  const tt = useTT();
  const [docs, setDocs] = useState((cat.required_documents ?? []).join('\n'));
  const [ok, setOk] = useState(false);
  const save = async () => {
    await tUpdateCategory(token, cat.id, { required_documents: docs.split('\n').map(x => x.trim()).filter(Boolean) });
    setOk(true); setTimeout(() => setOk(false), 1500); reload();
  };
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-black text-text">{cat.label}</span>
        <button onClick={async () => { try { await tDeleteCategory(token, cat.id); reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } }} className="text-hint hover:text-loss">🗑</button>
      </div>
      <span className="block text-teal text-[10px] font-bold mb-1">
        {tt('أوراق افتراضية (تُستخدم للفرق غير المسجلة في بطولة)', 'Default papers (used by teams not yet in a competition)')}
      </span>
      <textarea value={docs} onChange={e => setDocs(e.target.value)} rows={3} className={inputCls} />
      <div className="flex items-center gap-2 mt-2">
        <PrimaryButton onClick={save} className="text-sm">{tt('حفظ', 'Save')}</PrimaryButton>
        {ok && <span className="text-win text-sm">✓</span>}
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
  const [f, setF] = useState({ season_id: '', name: '', location: '', docs: DEFAULT_DOCS });
  const reload = useCallback(() => { tCompetitions(undefined, token).then(setItems).catch(() => setItems([])); }, [token]);
  useEffect(() => { tSeasons().then(setSeasons); reload(); }, [reload]);
  const create = async () => {
    if (!f.season_id || !f.name) return;
    await tCreateCompetition(
      token,
      { season_id: Number(f.season_id), name: f.name, location: f.location || undefined },
      null, toLines(f.docs),
    );
    setF({ season_id: '', name: '', location: '', docs: DEFAULT_DOCS }); reload();
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

function CompRow({ c, token, reload }: { c: TCompetition; token: string; reload: () => void }) {
  const tt = useTT();
  const [adminOpen, setAdminOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [af, setAf] = useState({ username: '', password: '', name: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const addAdmin = async () => {
    try {
      await tAddCompAdmin(token, c.id, af);
      setMsg(tt('تم إسناد المنظم', 'Organizer assigned'));
      setAf({ username: '', password: '', name: '' });
      reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-text">{c.name} <span className="text-[11px] text-hint">· {c.season_name}</span></span>
        <div className="flex items-center gap-2">
          <button onClick={() => setDocsOpen(o => !o)} className="text-xs text-teal font-bold hover:underline">{tt('الأوراق', 'Papers')}</button>
          <button onClick={() => setAdminOpen(o => !o)} className="text-xs text-teal font-bold hover:underline">{tt('المنظمون', 'Organizers')}</button>
          <Link href={`/manage?comp=${c.id}`} className="text-xs text-aqua font-bold hover:underline">{tt('إدارة', 'Manage')}</Link>
          <button onClick={async () => { if (confirm(tt('حذف البطولة؟', 'Delete competition?'))) { await tDeleteCompetition(token, c.id); reload(); } }} className="text-hint hover:text-loss">🗑</button>
        </div>
      </div>
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
