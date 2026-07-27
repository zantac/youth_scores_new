'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  tTeam, tTeamRequiredDocs, tPlayer, tCreatePlayer, tDeletePlayer, tAddCoach, tDeleteCoach,
  type TTeam, type TPlayerFile, type TRequiredDocs, type LabeledDoc,
} from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { PapersProgress } from './PlayerPapers';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT } from './kit';

/** Players + coaches management for a single team (used by academy + team logins). */
export default function TeamManage({ token, teamId }: { token: string; teamId: number }) {
  const tt = useTT();
  const [team, setTeam] = useState<TTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // The papers this team must supply: whatever the competitions it plays in
  // ask for, falling back to its age category's list.
  const [docs, setDocs] = useState<TRequiredDocs>({ documents: [], sources: [] });
  const requiredDocs = docs.documents;

  // Each player's uploaded papers, keyed by player id. Fetched per player
  // because the API keeps them off the public team payload.
  const [papers, setPapers] = useState<Record<number, TPlayerFile[]>>({});
  const loadPapers = useCallback(async (t: TTeam | null) => {
    const ids = (t?.players ?? []).map(p => p.player_id);
    const entries = await Promise.all(ids.map(async id => {
      try { return [id, (await tPlayer(id, token)).files ?? []] as const; }
      catch { return [id, [] as TPlayerFile[]] as const; }
    }));
    setPapers(Object.fromEntries(entries));
  }, [token]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const t = await tTeam(teamId);
      setTeam(t);
      await loadPapers(t);
    } finally { setLoading(false); }
  }, [teamId, loadPapers]);
  useEffect(() => {
    reload();
    tTeamRequiredDocs(teamId).then(setDocs).catch(() => setDocs({ documents: [], sources: [] }));
  }, [reload, teamId]);

  // player form
  const [pf, setPf] = useState({ name: '', position: '', jersey_number: '', dob: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [docFiles, setDocFiles] = useState<Record<string, File>>({});
  const [pBusy, setPBusy] = useState(false);
  const addPlayer = async () => {
    setErr(null); setPBusy(true);
    try {
      const documents: LabeledDoc[] = Object.entries(docFiles).map(([label, file]) => ({ label, file }));
      await tCreatePlayer(token, teamId, pf, photo, documents);
      setPf({ name: '', position: '', jersey_number: '', dob: '' }); setPhoto(null); setDocFiles({});
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setPBusy(false); }
  };

  // coach form
  const [cf, setCf] = useState({ name: '', role_ar: '', phone: '' });
  const [cPhoto, setCPhoto] = useState<File | null>(null);
  const [cBusy, setCBusy] = useState(false);
  const addCoach = async () => {
    setErr(null); setCBusy(true);
    try {
      await tAddCoach(token, teamId, cf, cPhoto);
      setCf({ name: '', role_ar: '', phone: '' }); setCPhoto(null);
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setCBusy(false); }
  };

  if (loading || !team) return <Spinner />;

  return (
    <div className="space-y-5">
      <ErrorNote>{err}</ErrorNote>

      {/* players */}
      <section>
        <h3 className="font-black text-text mb-2">{tt('اللاعبون', 'Players')}</h3>
        <div className="space-y-2 mb-3">
          {(team.players ?? []).length === 0 ? (
            <EmptyState icon="⚽" text={tt('لا لاعبون بعد', 'No players yet')} />
          ) : (team.players ?? []).map(p => (
            <Card key={p.id} className="p-2">
              <div className="flex items-center gap-3">
                <LogoAvatar src={p.photo_path} name={p.player_name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text text-sm truncate">{p.player_name}</div>
                  <div className="text-[11px] text-hint">{[p.position, p.jersey_number != null ? `#${p.jersey_number}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                <PapersProgress required={requiredDocs} files={papers[p.player_id] ?? []} />
                {/* Papers live on the player's own profile, next to their photo. */}
                <Link href={`/player?id=${p.player_id}`} className="text-xs font-bold text-aqua hover:underline px-1 shrink-0">
                  {tt('الملف والأوراق', 'Profile & papers')}
                </Link>
                <button onClick={async () => { if (confirm(tt('حذف اللاعب؟', 'Delete player?'))) { await tDeletePlayer(token, p.player_id); reload(); } }}
                  className="text-hint hover:text-loss text-sm px-2">🗑</button>
              </div>
            </Card>
          ))}
        </div>
        <Card className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={tt('الاسم', 'Name')}><input value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} className={inputCls} /></Field>
            <Field label={tt('المركز', 'Position')}><input value={pf.position} onChange={e => setPf({ ...pf, position: e.target.value })} className={inputCls} placeholder="ST / GK …" /></Field>
            <Field label={tt('الرقم', 'Jersey')}><input value={pf.jersey_number} onChange={e => setPf({ ...pf, jersey_number: e.target.value })} className={inputCls} inputMode="numeric" /></Field>
            <Field label={tt('تاريخ الميلاد', 'Date of birth')}><input type="date" value={pf.dob} onChange={e => setPf({ ...pf, dob: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label={tt('الصورة', 'Photo')}>
            <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] ?? null)} className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
          </Field>
          <div>
            <span className="block text-teal text-xs font-bold mb-1">{tt('أوراق التسجيل', 'Registration papers')}</span>
            <p className="text-[10px] text-hint mb-1.5">
              {requiredDocs.length === 0
                ? tt('لا أوراق مطلوبة حاليًا', 'No papers required right now')
                : tt('تظهر للمنظّم فقط. ارفعها الآن، أو لاحقًا من صفحة اللاعب عبر «الملف والأوراق».',
                     'Visible to the organiser only. Upload now, or later from the player’s page via “Profile & papers”.')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {requiredDocs.map(doc => (
                <label key={doc} className="flex items-center gap-2 bg-darkBg border border-bdr rounded-xl px-3 py-2">
                  <span className="text-xs text-text flex-1 min-w-0 truncate">{doc}{docFiles[doc] && <span className="text-win"> ✓</span>}</span>
                  <input type="file" accept="image/*,.pdf"
                    onChange={e => setDocFiles(prev => { const n = { ...prev }; const f = e.target.files?.[0]; if (f) n[doc] = f; else delete n[doc]; return n; })}
                    className="text-[10px] text-hint file:me-1 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cardBg2 file:text-teal w-32" />
                </label>
              ))}
            </div>
          </div>
          <PrimaryButton onClick={addPlayer} disabled={pBusy || !pf.name}>{pBusy ? tt('…', '…') : tt('إضافة لاعب', 'Add player')}</PrimaryButton>
        </Card>
      </section>

      {/* coaches */}
      <section>
        <h3 className="font-black text-text mb-2">{tt('الجهاز الفني', 'Coaching staff')}</h3>
        <div className="space-y-2 mb-3">
          {(team.coaches ?? []).map(c => (
            <Card key={c.id} className="p-2 flex items-center gap-3">
              <LogoAvatar src={c.photo_path} name={c.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-text text-sm truncate">{c.name}</div>
                <div className="text-[11px] text-hint">{c.role_ar}</div>
              </div>
              <button onClick={async () => { if (confirm(tt('حذف؟', 'Delete?'))) { await tDeleteCoach(token, c.id); reload(); } }}
                className="text-hint hover:text-loss text-sm px-2">🗑</button>
            </Card>
          ))}
        </div>
        <Card className="p-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label={tt('الاسم', 'Name')}><input value={cf.name} onChange={e => setCf({ ...cf, name: e.target.value })} className={inputCls} /></Field>
            <Field label={tt('الوظيفة', 'Role')}><input value={cf.role_ar} onChange={e => setCf({ ...cf, role_ar: e.target.value })} className={inputCls} placeholder={tt('مدرب', 'Coach')} /></Field>
            <Field label={tt('الهاتف', 'Phone')}><input value={cf.phone} onChange={e => setCf({ ...cf, phone: e.target.value })} className={inputCls} /></Field>
          </div>
          <div className="flex items-center gap-3">
            <input type="file" accept="image/*" onChange={e => setCPhoto(e.target.files?.[0] ?? null)} className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
            <PrimaryButton onClick={addCoach} disabled={cBusy || !cf.name}>{cBusy ? tt('…', '…') : tt('إضافة', 'Add')}</PrimaryButton>
          </div>
        </Card>
      </section>
    </div>
  );
}
