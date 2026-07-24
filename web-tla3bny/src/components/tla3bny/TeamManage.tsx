'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  tTeam, tCreatePlayer, tDeletePlayer, tAddCoach, tDeleteCoach,
  type TTeam,
} from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT } from './kit';

/** Players + coaches management for a single team (used by academy + team logins). */
export default function TeamManage({ token, teamId }: { token: string; teamId: number }) {
  const tt = useTT();
  const [team, setTeam] = useState<TTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setTeam(await tTeam(teamId)); } finally { setLoading(false); }
  }, [teamId]);
  useEffect(() => { reload(); }, [reload]);

  // player form
  const [pf, setPf] = useState({ name: '', position: '', jersey_number: '', dob: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [pBusy, setPBusy] = useState(false);
  const addPlayer = async () => {
    setErr(null); setPBusy(true);
    try {
      await tCreatePlayer(token, teamId, pf, photo, docs);
      setPf({ name: '', position: '', jersey_number: '', dob: '' }); setPhoto(null); setDocs([]);
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
            <Card key={p.id} className="p-2 flex items-center gap-3">
              <LogoAvatar src={p.photo_path} name={p.player_name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-text text-sm truncate">{p.player_name}</div>
                <div className="text-[11px] text-hint">{[p.position, p.jersey_number != null ? `#${p.jersey_number}` : null].filter(Boolean).join(' · ')}</div>
              </div>
              <button onClick={async () => { if (confirm(tt('حذف اللاعب؟', 'Delete player?'))) { await tDeletePlayer(token, p.player_id); reload(); } }}
                className="text-hint hover:text-loss text-sm px-2">🗑</button>
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
          <div className="grid grid-cols-2 gap-3">
            <Field label={tt('الصورة', 'Photo')}>
              <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] ?? null)} className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
            </Field>
            <Field label={tt('المستندات', 'Documents')}>
              <input type="file" multiple onChange={e => setDocs(Array.from(e.target.files ?? []))} className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
            </Field>
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
