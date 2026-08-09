'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  tTeam, tTeamRequiredDocs, tTeamCompetitionEntries,
  tPlayer, tCreatePlayer, tUpdatePlayer, tDeletePlayer, tAddCoach, tUpdateCoach, tDeleteCoach, tReplaceCompPlayer,
  type TTeam, type TCoach, type TMembership, type TTeamCompEntry, type TPlayerFile, type TRequiredDocs, type LabeledDoc,
} from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { PapersProgress } from './PlayerPapers';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT, useName } from './kit';

/** Players + coaches management for a single team (used by academy + team logins). */
export default function TeamManage({ token, teamId }: { token: string; teamId: number }) {
  const tt = useTT();
  const nm = useName();
  const [team, setTeam] = useState<TTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [compEntries, setCompEntries] = useState<TTeamCompEntry[]>([]);

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
  const refreshEntries = useCallback(() => {
    tTeamCompetitionEntries(token, teamId).then(setCompEntries).catch(e => {
      setCompEntries([]);
      setErr(e instanceof Error ? e.message : String(e));
    });
  }, [token, teamId]);

  useEffect(() => {
    reload();
    tTeamRequiredDocs(teamId).then(setDocs).catch(() => setDocs({ documents: [], sources: [] }));
    refreshEntries();
  }, [reload, teamId, token, refreshEntries]);

  // Derive registration / replacement availability from competition entries.
  const openEntries = compEntries.filter(e => e.status === 'active' && e.registration_open);
  const replacementEntries = compEntries.filter(e => e.status === 'active' && e.replacements_open);
  const canAddPlayers = openEntries.some(e => e.max_players === null || e.player_count < e.max_players)
    || replacementEntries.some(e =>
        e.replacement_count < e.max_replacements &&
        (e.max_players === null || e.player_count < e.max_players));
  // Show the strictest quota: the open competition with the fewest remaining slots.
  const quota = openEntries.reduce<{ used: number; max: number | null } | null>((acc, e) => {
    if (e.max_players === null) return acc ?? { used: e.player_count, max: null };
    if (!acc || acc.max === null) return { used: e.player_count, max: e.max_players };
    // Pick the entry with the smallest remaining room (most restrictive).
    return (e.max_players - e.player_count) < (acc.max - acc.used)
      ? { used: e.player_count, max: e.max_players }
      : acc;
  }, null);

  // player add form
  const [pf, setPf] = useState({ name: '', name_en: '', position: '', jersey_number: '', dob: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [docFiles, setDocFiles] = useState<Record<string, File>>({});
  const [pBusy, setPBusy] = useState(false);
  const addPlayer = async () => {
    setErr(null); setPBusy(true);
    try {
      const documents: LabeledDoc[] = Object.entries(docFiles).map(([label, file]) => ({ label, file }));
      await tCreatePlayer(token, teamId, pf, photo, documents);
      setPf({ name: '', name_en: '', position: '', jersey_number: '', dob: '' }); setPhoto(null); setDocFiles({});
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setPBusy(false); }
  };

  const [replaceBusy, setReplaceBusy] = useState<number | null>(null);
  const replacePlayer = async (cpId: number) => {
    if (!confirm(tt('إزالة هذا اللاعب من البطولة؟ سيبقى في الفريق لكن لن يكمل المنافسة.', 'Remove this player from the competition? They stay on the team but will not continue in this tournament.'))) return;
    setErr(null); setReplaceBusy(cpId);
    try {
      await tReplaceCompPlayer(token, cpId);
      await Promise.all([reload(), refreshEntries()]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setReplaceBusy(null); }
  };

  // player edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ef, setEf] = useState({ name: '', name_en: '', position: '', jersey_number: '', dob: '' });
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editDocFiles, setEditDocFiles] = useState<Record<string, File>>({});
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
    setEditPhoto(null); setEditDocFiles({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setErr(null); setEBusy(true);
    try {
      const documents: LabeledDoc[] = Object.entries(editDocFiles).map(([label, file]) => ({ label, file }));
      await tUpdatePlayer(token, editingId, ef, editPhoto, documents);
      setEditingId(null);
      await Promise.all([
        reload(),
        tTeamCompetitionEntries(token, teamId).then(setCompEntries).catch(() => {}),
      ]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setEBusy(false); }
  };

  // Build map of rejected player IDs from competition entries
  const rejectedPlayerIds = new Set(
    compEntries.flatMap(e => e.rejected_players.map(rp => rp.player_id))
  );
  // Players still waiting for the organizer's approval (newly added or edited).
  const pendingPlayerIds = new Set(
    compEntries.flatMap(e => (e.pending_players ?? []).map(pp => pp.player_id))
  );
  const allRejections = compEntries.flatMap(e =>
    e.rejected_players.map(rp => ({ ...rp, competition_name: e.competition_name }))
  );

  // coach form
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

      {/* players */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-black text-text">{tt('اللاعبون', 'Players')}</h3>
          {quota && (
            <span className={`text-xs font-bold tabular-nums ${quota.max !== null && quota.used >= quota.max ? 'text-loss' : 'text-teal'}`}>
              {quota.used}{quota.max !== null ? ` / ${quota.max}` : ''} {tt('لاعب', 'players')}
            </span>
          )}
        </div>

        {/* Competition context banner */}
        {compEntries.length === 0 ? (
          <Card className="p-4 text-center mb-3">
            <p className="text-sm font-bold text-hint">
              {tt('فريقك لم يُضَف لأي بطولة بعد', 'Your team has not been added to any competition yet')}
            </p>
            <p className="text-[11px] text-hint mt-1">
              {tt('تواصل مع المنظّم ليضيف فريقك، ثم يمكنك تسجيل اللاعبين والجهاز الفني.',
                  'Contact the organiser to add your team, then you can register players and coaching staff.')}
            </p>
          </Card>
        ) : !canAddPlayers ? (
          <Card className="p-3 mb-3">
            <p className="text-sm font-bold text-loss text-center">
              {tt('اكتمل الحد الأقصى للاعبين أو أُغلق التسجيل', 'Player cap reached or registration closed')}
            </p>
          </Card>
        ) : null}

        {/* Replacement window banners */}
        {replacementEntries.map(e => (
          <Card key={e.entry_id} className="p-3 mb-3 border-gold/40 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-gold font-bold text-sm">
                  🔄 {tt('نافذة الاستبدال مفتوحة', 'Replacement window open')}
                  {e.sub_competition_name && (
                    <span className="text-hint font-normal text-[11px] ms-1">· {e.sub_competition_name}</span>
                  )}
                </p>
                <p className="text-[11px] text-hint mt-0.5">
                  {tt(
                    `استُخدم ${e.replacement_count} من ${e.max_replacements} استبدالات`,
                    `${e.replacement_count} of ${e.max_replacements} replacements used`,
                  )}
                </p>
              </div>
              <span className={`text-sm font-black tabular-nums ${e.replacement_count >= e.max_replacements ? 'text-loss' : 'text-gold'}`}>
                {e.replacement_count}/{e.max_replacements}
              </span>
            </div>
            {e.replacement_count < e.max_replacements && e.approved_players.length > 0 && (
              <div className="space-y-1 border-t border-bdr/50 pt-2">
                <p className="text-[11px] text-teal font-bold">{tt('اختر لاعبًا لاستبداله', 'Select a player to replace')}</p>
                {e.approved_players.map(ap => (
                  <div key={ap.competition_player_id} className="flex items-center justify-between bg-darkBg border border-bdr rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <span className="text-sm text-text font-bold truncate block">{ap.player_name}</span>
                      {ap.position && <span className="text-[11px] text-hint">{ap.position}</span>}
                    </div>
                    <button
                      onClick={() => replacePlayer(ap.competition_player_id)}
                      disabled={replaceBusy === ap.competition_player_id}
                      className="text-xs font-bold text-loss border border-loss/40 rounded-lg px-3 py-1.5 hover:bg-loss/10 disabled:opacity-50 shrink-0 ms-2">
                      {replaceBusy === ap.competition_player_id ? tt('…', '…') : tt('استبدال', 'Replace')}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {e.replacement_count >= e.max_replacements && (
              <p className="text-loss text-[11px]">
                {tt('تم استنفاد الحصة الكاملة للاستبدال.', 'All replacements have been used.')}
              </p>
            )}
          </Card>
        ))}

        {/* Rejection alerts */}
        {allRejections.length > 0 && (
          <div className="mb-3 space-y-2">
            {allRejections.map((rp, i) => (
              <div key={i} className="flex items-start gap-2 bg-loss/10 border border-loss/30 rounded-xl px-3 py-2.5">
                <span className="text-loss text-base shrink-0">🟥</span>
                <div className="min-w-0 flex-1">
                  <p className="text-loss text-xs font-bold">
                    {rp.player_name} · {tt('مرفوض في', 'Rejected in')} {rp.competition_name}
                  </p>
                  {rp.rejection_reason && (
                    <p className="text-loss/80 text-[11px] mt-0.5">{tt('السبب:', 'Reason:')} {rp.rejection_reason}</p>
                  )}
                  <p className="text-hint text-[11px] mt-0.5">
                    {tt('عدّل بيانات اللاعب أو أوراقه لإعادة الطلب للمراجعة.', 'Edit the player\'s data or papers to resubmit for review.')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 mb-3">
          {(team.players ?? []).length === 0 ? (
            <EmptyState icon="⚽" text={tt('لا لاعبون بعد', 'No players yet')} />
          ) : (team.players ?? []).map(p => (
            <Card key={p.id} className={`p-2 ${rejectedPlayerIds.has(p.player_id) ? 'border-loss/40' : pendingPlayerIds.has(p.player_id) ? 'border-gold/40' : ''}`}>
              <div className="flex items-center gap-3">
                <LogoAvatar src={p.photo_path} name={nm(p.player_name, p.player_name_en)} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text text-sm truncate">{nm(p.player_name, p.player_name_en)}</div>
                  <div className="text-[11px] text-hint">{[p.position, p.jersey_number != null ? `#${p.jersey_number}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                {rejectedPlayerIds.has(p.player_id) ? (
                  <span className="text-[10px] font-bold text-loss bg-loss/10 border border-loss/30 rounded-full px-2 py-0.5 shrink-0">
                    {tt('مرفوض', 'Rejected')}
                  </span>
                ) : pendingPlayerIds.has(p.player_id) && (
                  <span className="text-[10px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-2 py-0.5 shrink-0">
                    {tt('بانتظار الاعتماد', 'Pending')}
                  </span>
                )}
                <PapersProgress required={requiredDocs} files={papers[p.player_id] ?? []} />
                <button onClick={() => editingId === p.player_id ? setEditingId(null) : startEdit(p)}
                  className={`text-xs font-bold px-1 shrink-0 ${editingId === p.player_id ? 'text-hint' : 'text-teal hover:text-aqua'}`}>
                  {editingId === p.player_id ? tt('إلغاء', 'Cancel') : tt('تعديل', 'Edit')}
                </button>
                <Link href={`/player?id=${p.player_id}`} className="text-xs font-bold text-aqua hover:underline px-1 shrink-0">
                  {tt('الأوراق', 'Papers')}
                </Link>
                <button onClick={async () => { if (confirm(tt('حذف اللاعب؟', 'Delete player?'))) { await tDeletePlayer(token, p.player_id); reload(); } }}
                  className="text-hint hover:text-loss text-sm px-1">🗑</button>
              </div>

              {/* Inline edit form */}
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
                  {requiredDocs.length > 0 && (
                    <div>
                      <span className="block text-teal text-[10px] font-bold mb-1">{tt('تحديث الأوراق (اختياري)', 'Update papers (optional)')}</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {requiredDocs.map(doc => (
                          <label key={doc} className="flex items-center gap-2 bg-darkBg border border-bdr rounded-xl px-3 py-2">
                            <span className="text-xs text-text flex-1 min-w-0 truncate">{doc}{editDocFiles[doc] && <span className="text-win"> ✓</span>}</span>
                            <input type="file" accept="image/*,.pdf"
                              onChange={e => setEditDocFiles(prev => { const n = { ...prev }; const f = e.target.files?.[0]; if (f) n[doc] = f; else delete n[doc]; return n; })}
                              className="text-[10px] text-hint file:me-1 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cardBg2 file:text-teal w-32" />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-hint">
                    {tt('بعد الحفظ، سيُعاد إرسال اللاعب للاعتماد في جميع البطولات.', 'After saving, the player will be resubmitted for approval in all competitions.')}
                  </p>
                  <PrimaryButton onClick={saveEdit} disabled={eBusy || !ef.name.trim()} className="text-sm">
                    {eBusy ? tt('جارٍ الحفظ…', 'Saving…') : tt('حفظ التعديلات', 'Save changes')}
                  </PrimaryButton>
                </div>
              )}
            </Card>
          ))}
        </div>

        {canAddPlayers && (
          <Card className="p-3 space-y-3">
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
            <div>
              <span className="block text-teal text-xs font-bold mb-1">{tt('أوراق التسجيل', 'Registration papers')}</span>
              <p className="text-[10px] text-hint mb-1.5">
                {requiredDocs.length === 0
                  ? tt('لا أوراق مطلوبة حاليًا', 'No papers required right now')
                  : tt('تظهر للمنظّم فقط. ارفعها الآن، أو لاحقًا من صفحة اللاعب عبر «الملف والأوراق».',
                       'Visible to the organiser only. Upload now, or later from the player\'s page via "Profile & papers".')}
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
        )}
      </section>

      {/* competition entries — joining is now done from each sub-competition's
          About page (the academy picks which team enters there). */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-black text-text">{tt('البطولات', 'Competitions')}</h3>
        </div>
        <div className="space-y-2">
          {compEntries.length === 0 && (
            <p className="text-xs text-hint py-2">{tt('لا بطولات مسجّلة بعد', 'Not registered in any competition yet')}</p>
          )}
          {compEntries.map(e => (
            <Card key={e.entry_id} className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-text text-sm truncate">
                  {e.sub_competition_name
                    ? `${e.competition_name} · ${e.sub_competition_name}`
                    : e.competition_name}
                </div>
              </div>
              {e.status === 'pending' ? (
                <span className="text-[11px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-2 py-0.5 shrink-0">
                  {tt('قيد الموافقة', 'Pending')}
                </span>
              ) : (
                <span className="text-[11px] font-bold text-win bg-win/10 border border-win/30 rounded-full px-2 py-0.5 shrink-0">
                  {tt('مسجّل', 'Active')}
                </span>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* coaches */}
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
        {/* Like players, coaching staff can only be added once the team is in a
            competition. */}
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
