'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  tTeam, tTeamCompetitionEntries,
  tCreatePlayer, tUpdatePlayer, tDeletePlayer, tAddCoach, tUpdateCoach, tDeleteCoach,
  type TTeam, type TCoach, type TMembership, type TTeamCompEntry,
} from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import CompetitionRegistration from './CompetitionRegistration';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT, useName } from './kit';

/** Players (squad) + per-competition registration + coaches, for one team.
 *
 *  The squad is the academy's durable global roster — adding a player here does
 *  NOT enter them in any competition. Entering players in a competition, with
 *  that competition's own required papers, is a separate step done per active
 *  competition below (CompetitionRegistration). This lets the same team play a
 *  new competition — or the same one next season — with a fresh document set. */
export default function TeamManage({ token, teamId }: { token: string; teamId: number }) {
  const tt = useTT();
  const nm = useName();
  const [team, setTeam] = useState<TTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [compEntries, setCompEntries] = useState<TTeamCompEntry[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setTeam(await tTeam(teamId)); } finally { setLoading(false); }
  }, [teamId]);
  const refreshEntries = useCallback(() => {
    tTeamCompetitionEntries(token, teamId).then(setCompEntries).catch(e => {
      setCompEntries([]);
      setErr(e instanceof Error ? e.message : String(e));
    });
  }, [token, teamId]);

  useEffect(() => {
    reload();
    refreshEntries();
  }, [reload, refreshEntries]);

  const activeEntries = compEntries.filter(e => e.status === 'active');
  const pendingEntries = compEntries.filter(e => e.status === 'pending');

  // ── squad: add player (squad-only, no competition documents here) ──────────
  const emptyPf = { name: '', name_en: '', position: '', jersey_number: '', dob: '' };
  const [pf, setPf] = useState(emptyPf);
  const [photo, setPhoto] = useState<File | null>(null);
  const [pBusy, setPBusy] = useState(false);
  const addPlayer = async () => {
    setErr(null); setPBusy(true);
    try {
      await tCreatePlayer(token, teamId, pf, photo);
      setPf(emptyPf); setPhoto(null);
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setPBusy(false); }
  };

  // ── squad: edit player identity ────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ef, setEf] = useState(emptyPf);
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [eBusy, setEBusy] = useState(false);
  const startEdit = (p: TMembership) => {
    setEditingId(p.player_id);
    setEf({
      name: p.player_name ?? '',
      name_en: p.player_name_en ?? '',
      position: p.position ?? '',
      jersey_number: p.jersey_number != null ? String(p.jersey_number) : '',
      dob: '',
    });
    setEditPhoto(null);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    setErr(null); setEBusy(true);
    try {
      await tUpdatePlayer(token, editingId, ef, editPhoto);
      setEditingId(null);
      await Promise.all([reload(), Promise.resolve(refreshEntries())]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setEBusy(false); }
  };

  // ── coaches ─────────────────────────────────────────────────────────────────
  const emptyCf = { name: '', name_en: '', role_ar: '', license: '', bio: '', phone: '' };
  const [cf, setCf] = useState(emptyCf);
  const [cPhoto, setCPhoto] = useState<File | null>(null);
  const [cBusy, setCBusy] = useState(false);
  const [cEditId, setCEditId] = useState<number | null>(null);
  const startEditCoach = (c: TCoach) => {
    setCEditId(c.id);
    setCf({ name: c.name, name_en: c.name_en ?? '', role_ar: c.role_ar ?? '', license: c.license ?? '', bio: c.bio ?? '', phone: c.phone ?? '' });
    setCPhoto(null);
  };
  const cancelEditCoach = () => { setCEditId(null); setCf(emptyCf); setCPhoto(null); };
  const saveCoach = async () => {
    setErr(null); setCBusy(true);
    try {
      if (cEditId) await tUpdateCoach(token, cEditId, cf, cPhoto);
      else await tAddCoach(token, teamId, cf, cPhoto);
      cancelEditCoach();
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setCBusy(false); }
  };

  if (loading || !team) return <Spinner />;

  return (
    <div className="space-y-5">
      <ErrorNote>{err}</ErrorNote>

      {/* ── squad (global roster) ─────────────────────────────────────────── */}
      <section>
        <h3 className="font-black text-text mb-2">{tt('اللاعبون (تشكيلة الفريق)', 'Players (squad)')}</h3>
        <p className="text-[11px] text-hint mb-2">
          {tt('هذه تشكيلة فريقك الدائمة. لإشراكهم في بطولة، اذهب لقسم «البطولات» بالأسفل وسجّلهم بأوراق تلك البطولة.',
              'This is your team\'s permanent squad. To enter players in a competition, use the "Competitions" section below and register them with that competition\'s papers.')}
        </p>

        <div className="space-y-2 mb-3">
          {(team.players ?? []).length === 0 ? (
            <EmptyState icon="⚽" text={tt('لا لاعبون بعد', 'No players yet')} />
          ) : (team.players ?? []).map(p => (
            <Card key={p.id} className="p-2">
              <div className="flex items-center gap-3">
                <LogoAvatar src={p.photo_path} name={nm(p.player_name, p.player_name_en)} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text text-sm truncate">{nm(p.player_name, p.player_name_en)}</div>
                  <div className="text-[11px] text-hint">{[p.position, p.jersey_number != null ? `#${p.jersey_number}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                <button onClick={() => editingId === p.player_id ? setEditingId(null) : startEdit(p)}
                  className={`text-xs font-bold px-1 shrink-0 ${editingId === p.player_id ? 'text-hint' : 'text-teal hover:text-aqua'}`}>
                  {editingId === p.player_id ? tt('إلغاء', 'Cancel') : tt('تعديل', 'Edit')}
                </button>
                <Link href={`/player?id=${p.player_id}`} className="text-xs font-bold text-aqua hover:underline px-1 shrink-0">
                  {tt('الملف', 'Profile')}
                </Link>
                <button onClick={async () => { if (confirm(tt('حذف اللاعب؟', 'Delete player?'))) { await tDeletePlayer(token, p.player_id); reload(); } }}
                  className="text-hint hover:text-loss text-sm px-1">🗑</button>
              </div>

              {editingId === p.player_id && (
                <div className="mt-3 border-t border-bdr/50 pt-3 space-y-3">
                  <p className="text-teal text-[11px] font-bold">{tt('تعديل بيانات اللاعب', 'Edit player data')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={tt('الاسم', 'Name')}>
                      <input value={ef.name} onChange={e => setEf({ ...ef, name: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label={tt('الاسم بالإنجليزية', 'Name (English)')}>
                      <input value={ef.name_en} onChange={e => setEf({ ...ef, name_en: e.target.value })} dir="ltr" className={inputCls} />
                    </Field>
                    <Field label={tt('المركز', 'Position')}>
                      <input value={ef.position} onChange={e => setEf({ ...ef, position: e.target.value })} className={inputCls} placeholder="ST / GK …" />
                    </Field>
                    <Field label={tt('الرقم', 'Jersey')}>
                      <input value={ef.jersey_number} onChange={e => setEf({ ...ef, jersey_number: e.target.value })} className={inputCls} inputMode="numeric" />
                    </Field>
                    <Field label={tt('تاريخ الميلاد', 'Date of birth')}>
                      <input type="date" value={ef.dob} onChange={e => setEf({ ...ef, dob: e.target.value })} className={inputCls} />
                    </Field>
                  </div>
                  <Field label={tt('صورة جديدة (اختياري)', 'New photo (optional)')}>
                    <input type="file" accept="image/*" onChange={e => setEditPhoto(e.target.files?.[0] ?? null)}
                      className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
                  </Field>
                  <p className="text-[10px] text-hint">
                    {tt('بعد الحفظ، سيُعاد إرسال اللاعب للاعتماد في البطولات المسجّل بها.', 'After saving, the player is resubmitted for approval in the competitions they are entered in.')}
                  </p>
                  <PrimaryButton onClick={saveEdit} disabled={eBusy || !ef.name.trim()} className="text-sm">
                    {eBusy ? tt('جارٍ الحفظ…', 'Saving…') : tt('حفظ التعديلات', 'Save changes')}
                  </PrimaryButton>
                </div>
              )}
            </Card>
          ))}
        </div>

        <Card className="p-3 space-y-3">
          <p className="text-teal text-xs font-bold">{tt('إضافة لاعب للتشكيلة', 'Add a player to the squad')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tt('الاسم', 'Name')}><input value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} className={inputCls} /></Field>
            <Field label={tt('الاسم بالإنجليزية', 'Name (English)')}><input value={pf.name_en} onChange={e => setPf({ ...pf, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
            <Field label={tt('المركز', 'Position')}><input value={pf.position} onChange={e => setPf({ ...pf, position: e.target.value })} className={inputCls} placeholder="ST / GK …" /></Field>
            <Field label={tt('الرقم', 'Jersey')}><input value={pf.jersey_number} onChange={e => setPf({ ...pf, jersey_number: e.target.value })} className={inputCls} inputMode="numeric" /></Field>
            <Field label={tt('تاريخ الميلاد', 'Date of birth')}><input type="date" value={pf.dob} onChange={e => setPf({ ...pf, dob: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label={tt('الصورة', 'Photo')}>
            <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] ?? null)} className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
          </Field>
          <PrimaryButton onClick={addPlayer} disabled={pBusy || !pf.name}>{pBusy ? tt('…', '…') : tt('إضافة لاعب', 'Add player')}</PrimaryButton>
        </Card>
      </section>

      {/* ── competitions: register squad players per competition ──────────── */}
      <section>
        <h3 className="font-black text-text mb-2">{tt('البطولات وتسجيل اللاعبين', 'Competitions & player registration')}</h3>

        {compEntries.length === 0 && (
          <Card className="p-4 text-center">
            <p className="text-sm font-bold text-hint">
              {tt('فريقك لم يُضَف لأي بطولة بعد', 'Your team has not been added to any competition yet')}
            </p>
            <p className="text-[11px] text-hint mt-1">
              {tt('اطلب الاشتراك في بطولة من صفحة البطولة، وبعد موافقة المنظّم سجّل لاعبيك هنا.',
                  'Request to join a competition from its page; once the organiser approves, register your players here.')}
            </p>
          </Card>
        )}

        {pendingEntries.map(e => (
          <Card key={e.entry_id} className="p-3 mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-text text-sm truncate">
                {e.sub_competition_name ? `${e.competition_name} · ${e.sub_competition_name}` : e.competition_name}
              </div>
              <div className="text-[11px] text-hint">{tt('بانتظار موافقة المنظّم على اشتراك الفريق', 'Waiting for the organiser to approve the team\'s entry')}</div>
            </div>
            <span className="text-[11px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-2 py-0.5 shrink-0">
              {tt('قيد الموافقة', 'Pending')}
            </span>
          </Card>
        ))}

        <div className="space-y-4">
          {activeEntries.map(e => (
            <Card key={e.entry_id} className="p-3">
              <CompetitionRegistration token={token} entryId={e.entry_id} onChange={refreshEntries} />
            </Card>
          ))}
        </div>
      </section>

      {/* ── coaches ───────────────────────────────────────────────────────── */}
      <section>
        <h3 className="font-black text-text mb-2">{tt('الجهاز الفني', 'Coaching staff')}</h3>
        <div className="space-y-2 mb-3">
          {(team.coaches ?? []).map(c => (
            <Card key={c.id} className="p-2 flex items-center gap-3">
              <LogoAvatar src={c.photo_path} name={nm(c.name, c.name_en)} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-text text-sm truncate">{nm(c.name, c.name_en)}</div>
                <div className="text-[11px] text-hint truncate">{[c.role_ar, c.license].filter(Boolean).join(' · ')}</div>
              </div>
              {compEntries.length > 0 && (
                <button onClick={() => cEditId === c.id ? cancelEditCoach() : startEditCoach(c)}
                  className={`text-xs font-bold px-1 shrink-0 ${cEditId === c.id ? 'text-hint' : 'text-teal hover:text-aqua'}`}>
                  {cEditId === c.id ? tt('إلغاء', 'Cancel') : tt('تعديل', 'Edit')}
                </button>
              )}
              <button onClick={async () => { if (confirm(tt('حذف؟', 'Delete?'))) { await tDeleteCoach(token, c.id); reload(); } }}
                className="text-hint hover:text-loss text-sm px-2">🗑</button>
            </Card>
          ))}
        </div>
        {compEntries.length === 0 ? (
          <Card className="p-3 text-center">
            <p className="text-[11px] text-hint">
              {tt('أضِف فريقك لبطولة أولاً لتتمكن من إضافة الجهاز الفني.',
                  'Add your team to a competition first to add coaching staff.')}
            </p>
          </Card>
        ) : (
          <Card className="p-3 space-y-3">
            {cEditId && <div className="text-[11px] font-bold text-aqua">{tt('تعديل المدرب', 'Editing coach')}</div>}
            <div className="grid grid-cols-3 gap-3">
              <Field label={tt('الاسم', 'Name')}><input value={cf.name} onChange={e => setCf({ ...cf, name: e.target.value })} className={inputCls} /></Field>
              <Field label={tt('الاسم بالإنجليزية', 'Name (English)')}><input value={cf.name_en} onChange={e => setCf({ ...cf, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
              <Field label={tt('الوظيفة', 'Role')}><input value={cf.role_ar} onChange={e => setCf({ ...cf, role_ar: e.target.value })} className={inputCls} placeholder={tt('مدرب', 'Coach')} /></Field>
              <Field label={tt('الرخصة التدريبية', 'Coaching licence')}><input value={cf.license} onChange={e => setCf({ ...cf, license: e.target.value })} className={inputCls} placeholder={tt('مثال: رخصة B', 'e.g. Licence B')} /></Field>
              <Field label={tt('الهاتف', 'Phone')}><input value={cf.phone} onChange={e => setCf({ ...cf, phone: e.target.value })} className={inputCls} /></Field>
            </div>
            <Field label={tt('نبذة عن المسيرة', 'Career brief')}>
              <textarea value={cf.bio} onChange={e => setCf({ ...cf, bio: e.target.value })} className={inputCls} rows={3}
                placeholder={tt('خبرة المدرب، الأندية السابقة، الإنجازات…', 'Experience, former clubs, achievements…')} />
            </Field>
            <div className="flex items-center gap-3">
              <input type="file" accept="image/*" onChange={e => setCPhoto(e.target.files?.[0] ?? null)} className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
              <PrimaryButton onClick={saveCoach} disabled={cBusy || !cf.name}>{cBusy ? tt('…', '…') : cEditId ? tt('حفظ', 'Save') : tt('إضافة', 'Add')}</PrimaryButton>
              {cEditId && <button onClick={cancelEditCoach} className="text-sm text-hint">{tt('إلغاء', 'Cancel')}</button>}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
