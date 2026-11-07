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
import ChatThread from './ChatThread';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT, useName, usePositionLabel } from './kit';
import { PLAYER_POSITIONS } from '@/lib/tla3bnyFormations';

/** Fixed-list position picker. Stores the canonical code (e.g. "CB"/"ST") so
 *  the value keeps matching the pitch/lineup slots; a legacy free-text value
 *  that isn't in the list is preserved as its own option so editing a player
 *  never silently drops it. */
function PositionSelect({
  tt, value, onChange,
}: { tt: (ar: string, en: string) => string; value: string; onChange: (v: string) => void }) {
  const known = PLAYER_POSITIONS.some(p => p.code === value);
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      <option value="">{tt('اختر المركز', 'Select position')}</option>
      {PLAYER_POSITIONS.map(p => (
        <option key={p.code} value={p.code}>{tt(p.ar, p.en)} ({p.code})</option>
      ))}
      {value && !known && <option value={value}>{value}</option>}
    </select>
  );
}

/** The manage sub-sections, each its own tab. `section`/`onSectionChange` let a
 *  parent (the team page) drive the active tab from the URL; without them the
 *  tab is kept in local state (e.g. inside the dashboard). */
const MANAGE_SECTIONS = [
  { key: 'coaches', ar: 'الجهاز الفني', en: 'Coaching staff' },
  { key: 'players', ar: 'اللاعبون', en: 'Players' },
  { key: 'competitions', ar: 'البطولات والتسجيل', en: 'Competitions & registration' },
  { key: 'chat', ar: 'محادثات المنظمين', en: 'Chat with organizers' },
] as const;
export type ManageSection = typeof MANAGE_SECTIONS[number]['key'];

/** Players (squad) + per-competition registration + coaches, for one team.
 *
 *  The squad is the academy's durable global roster — adding a player here does
 *  NOT enter them in any competition. Entering players in a competition, with
 *  that competition's own required papers, is a separate step done per active
 *  competition below (CompetitionRegistration). This lets the same team play a
 *  new competition — or the same one next season — with a fresh document set. */
export default function TeamManage({
  token, teamId, section, onSectionChange, onChanged,
}: {
  token: string; teamId: number;
  section?: string; onSectionChange?: (s: ManageSection) => void;
  /** Fired after a successful add/edit/delete so a parent (the team page) can
   *  refresh its own copy of the team — keeps the squad tab/hero in sync. */
  onChanged?: () => void;
}) {
  const tt = useTT();
  const nm = useName();
  const pos = usePositionLabel();
  // Active sub-tab: URL-controlled when `section` is passed, else local state.
  const [internalSection, setInternalSection] = useState<ManageSection>('players');
  const sub: ManageSection =
    (section && MANAGE_SECTIONS.some(s => s.key === section)) ? section as ManageSection : internalSection;
  const selectSection = (s: ManageSection) => { setInternalSection(s); onSectionChange?.(s); };
  const [team, setTeam] = useState<TTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [compEntries, setCompEntries] = useState<TTeamCompEntry[]>([]);
  const [chatComp, setChatComp] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    // Pass the token for a no-store read so a just-added/removed player or coach
    // shows immediately (a token-less read is served from the browser cache).
    try { setTeam(await tTeam(teamId, token)); } finally { setLoading(false); }
    onChanged?.();
  }, [teamId, token, onChanged]);
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
  // Past the player-registration deadline the academy can no longer add or edit
  // players (the organizer still can, from their own panel).
  const editLocked = activeEntries.some(e => e.registration_deadline_passed);
  // Players are added per-competition: the team must first be subscribed to a
  // competition AND approved by its organiser before players can be added.
  const canAddPlayers = activeEntries.length > 0;

  // ── squad: add player (squad-only, no competition documents here) ──────────
  const emptyPf = { name: '', name_en: '', national_id: '', position: '', jersey_number: '', dob: '' };
  // The national ID (الرقم القومي) is 14 digits. Normalise Arabic-Indic numerals
  // first (mirrors the backend) so a value typed on an Arabic keyboard counts.
  const nidDigits = (s: string) =>
    s.replace(/[٠-٩۰-۹]/g, d => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(d) % 10)).replace(/\D/g, '');
  const nidValid = (s: string) => nidDigits(s).length === 14;
  // A player must not be OLDER than the team's age bracket: for a team of birth
  // year Y (oldest_birth_year) the player must be born in Y or later. Younger is
  // fine (they may guest up). Null year = no restriction configured.
  const dobYear = (s: string) => (s && s.length >= 4 ? parseInt(s.slice(0, 4), 10) : null);
  const [pf, setPf] = useState(emptyPf);
  const [photo, setPhoto] = useState<File | null>(null);
  const [pBusy, setPBusy] = useState(false);
  // The add form is hidden behind an "Add player" button and collapses again
  // after a successful add (mirrors the youthscores web squad editor).
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const closeAddPlayer = () => { setShowAddPlayer(false); setPf(emptyPf); setPhoto(null); };
  const addPlayer = async () => {
    setErr(null); setPBusy(true);
    try {
      await tCreatePlayer(token, teamId, pf, photo);
      closeAddPlayer();
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
      // The national ID is private and not carried on the squad list; leaving it
      // blank keeps the stored value (the API ignores an empty national_id), so
      // this field is only for correcting it.
      national_id: '',
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
  const [showAddCoach, setShowAddCoach] = useState(false);
  const startEditCoach = (c: TCoach) => {
    setCEditId(c.id);
    setCf({ name: c.name, name_en: c.name_en ?? '', role_ar: c.role_ar ?? '', license: c.license ?? '', bio: c.bio ?? '', phone: c.phone ?? '' });
    setCPhoto(null);
  };
  const cancelEditCoach = () => { setCEditId(null); setShowAddCoach(false); setCf(emptyCf); setCPhoto(null); };
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

  // Age limit for the add-player form (team is now guaranteed loaded).
  const oldest = team.oldest_birth_year;
  const pfDobYear = dobYear(pf.dob);
  const pfTooOld = oldest != null && pfDobYear != null && pfDobYear < oldest;

  return (
    <div className="space-y-5">
      <ErrorNote>{err}</ErrorNote>

      {/* Sub-tabs — each addressable via its own URL on the team page. */}
      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {MANAGE_SECTIONS.map(s => (
          <button key={s.key} onClick={() => selectSection(s.key)}
            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${sub === s.key ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt(s.ar, s.en)}
          </button>
        ))}
      </div>

      {/* ── squad (global roster) ─────────────────────────────────────────── */}
      <section className={sub === 'players' ? '' : 'hidden'}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-black text-text">{tt('اللاعبون (تشكيلة الفريق)', 'Players (squad)')}</h3>
          {!editLocked && canAddPlayers && !showAddPlayer && (
            <button onClick={() => setShowAddPlayer(true)}
              className="shrink-0 text-xs font-bold text-aqua border border-aqua/40 rounded-lg px-3 py-1.5 hover:bg-aqua/10 transition-colors">
              + {tt('إضافة لاعب', 'Add player')}
            </button>
          )}
        </div>
        <p className="text-[11px] text-hint mb-2">
          {tt('هذه تشكيلة فريقك الدائمة. لإشراكهم في بطولة، اذهب لقسم «البطولات» بالأسفل وسجّلهم بأوراق تلك البطولة.',
              'This is your team\'s permanent squad. To enter players in a competition, use the "Competitions" section below and register them with that competition\'s papers.')}
        </p>

        {editLocked && (
          <Card className="p-3 mb-3 border-gold/40">
            <p className="text-[11px] text-gold font-bold text-center">
              {tt('انتهى موعد إضافة أو تعديل اللاعبين لهذه البطولة — تواصل مع المنظّم لأي تعديل.',
                  'The deadline to add or edit players for this competition has passed — contact the organizer for any change.')}
            </p>
          </Card>
        )}

        <div className="space-y-2 mb-3">
          {(team.players ?? []).length === 0 ? (
            <EmptyState icon="⚽" text={tt('لا لاعبون بعد', 'No players yet')} />
          ) : (team.players ?? []).map(p => (
            <Card key={p.id} className="p-2">
              <div className="flex items-center gap-3">
                <LogoAvatar src={p.photo_path} name={nm(p.player_name, p.player_name_en)} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text text-sm truncate">{nm(p.player_name, p.player_name_en)}</div>
                  <div className="text-[11px] text-hint">{[pos(p.position), p.jersey_number != null ? `#${p.jersey_number}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                {!editLocked && (
                  <button onClick={() => editingId === p.player_id ? setEditingId(null) : startEdit(p)}
                    className={`text-xs font-bold px-1 shrink-0 ${editingId === p.player_id ? 'text-hint' : 'text-teal hover:text-aqua'}`}>
                    {editingId === p.player_id ? tt('إلغاء', 'Cancel') : tt('تعديل', 'Edit')}
                  </button>
                )}
                <Link href={`/player?id=${p.player_id}`} className="text-xs font-bold text-aqua hover:underline px-1 shrink-0">
                  {tt('الملف', 'Profile')}
                </Link>
                {!editLocked && (
                  <button onClick={async () => { if (confirm(tt('حذف اللاعب؟', 'Delete player?'))) { await tDeletePlayer(token, p.player_id); reload(); } }}
                    className="text-hint hover:text-loss text-sm px-1">🗑</button>
                )}
              </div>

              {!editLocked && editingId === p.player_id && (
                <div className="mt-3 border-t border-bdr/50 pt-3 space-y-3">
                  <p className="text-teal text-[11px] font-bold">{tt('تعديل بيانات اللاعب', 'Edit player data')}</p>
                  <div className="space-y-3">
                    <Field label={tt('الاسم', 'Name')}>
                      <input value={ef.name} onChange={e => setEf({ ...ef, name: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label={tt('الاسم بالإنجليزية', 'Name (English)')}>
                      <input value={ef.name_en} onChange={e => setEf({ ...ef, name_en: e.target.value })} dir="ltr" className={inputCls} />
                    </Field>
                    <Field label={tt('الرقم القومي', 'National ID')}>
                      <input value={ef.national_id} onChange={e => setEf({ ...ef, national_id: e.target.value })}
                        className={inputCls} inputMode="numeric" maxLength={14} dir="ltr"
                        placeholder={tt('اتركه فارغًا للإبقاء على الرقم الحالي', 'Leave blank to keep the current ID')} />
                      {ef.national_id && !nidValid(ef.national_id) && (
                        <p className="text-[10px] text-loss font-bold mt-1">{tt('الرقم القومي يجب أن يتكوّن من 14 رقمًا', 'National ID must be exactly 14 digits')}</p>
                      )}
                    </Field>
                    <Field label={tt('المركز', 'Position')}>
                      <PositionSelect tt={tt} value={ef.position} onChange={v => setEf({ ...ef, position: v })} />
                    </Field>
                    <Field label={tt('رقم القميص', 'Jersey number')}>
                      <input value={ef.jersey_number} onChange={e => setEf({ ...ef, jersey_number: e.target.value })} className={inputCls} inputMode="numeric" />
                    </Field>
                    <Field label={tt('تاريخ الميلاد', 'Date of birth')}>
                      <input type="date" value={ef.dob} onChange={e => setEf({ ...ef, dob: e.target.value })} className={inputCls} />
                    </Field>
                  </div>
                  <Field label={tt('صورة جديدة (اختياري)', 'New photo (optional)')}>
                    <input type="file" accept="image/*" onChange={e => setEditPhoto(e.target.files?.[0] ?? null)}
                      className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
                    <p className="text-[10px] text-hint mt-1">{tt('صورة للرأس وجزء من الكتفين، ويجب أن يظهر الوجه بوضوح.', 'A head-and-shoulders photo — the face must be clearly visible.')}</p>
                  </Field>
                  <p className="text-[10px] text-hint">
                    {tt('بعد الحفظ، سيُعاد إرسال اللاعب للاعتماد في البطولات المسجّل بها.', 'After saving, the player is resubmitted for approval in the competitions they are entered in.')}
                  </p>
                  <PrimaryButton onClick={saveEdit} disabled={eBusy || !ef.name.trim() || (!!ef.national_id && !nidValid(ef.national_id))} className="text-sm">
                    {eBusy ? tt('جارٍ الحفظ…', 'Saving…') : tt('حفظ التعديلات', 'Save changes')}
                  </PrimaryButton>
                </div>
              )}
            </Card>
          ))}
        </div>

        {!editLocked && canAddPlayers && showAddPlayer && (
          <Card className="p-3 space-y-3">
            <p className="text-teal text-xs font-bold">{tt('إضافة لاعب للتشكيلة', 'Add a player to the squad')}</p>
            <div className="space-y-3">
              <Field label={tt('الاسم', 'Name')}><input value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} className={inputCls} /></Field>
              <Field label={tt('الاسم بالإنجليزية', 'Name (English)')}><input value={pf.name_en} onChange={e => setPf({ ...pf, name_en: e.target.value })} dir="ltr" className={inputCls} /></Field>
              <Field label={tt('الرقم القومي', 'National ID')}>
                <input value={pf.national_id} onChange={e => setPf({ ...pf, national_id: e.target.value })}
                  className={inputCls} inputMode="numeric" maxLength={14} dir="ltr" placeholder="١٤ رقمًا" />
                <p className="text-[10px] text-hint mt-1">
                  {pf.national_id && !nidValid(pf.national_id)
                    ? <span className="text-loss font-bold">{tt('الرقم القومي يجب أن يتكوّن من 14 رقمًا', 'National ID must be exactly 14 digits')}</span>
                    : tt('مطلوب — يُستخدم للتحقق من هوية اللاعب ومنع تسجيله في نفس البطولة مع أكثر من أكاديمية.',
                         'Required — verifies the player\'s identity and stops the same child being entered in one competition by more than one academy.')}
                </p>
              </Field>
              <Field label={tt('المركز', 'Position')}><PositionSelect tt={tt} value={pf.position} onChange={v => setPf({ ...pf, position: v })} /></Field>
              <Field label={tt('رقم القميص', 'Jersey number')}><input value={pf.jersey_number} onChange={e => setPf({ ...pf, jersey_number: e.target.value })} className={inputCls} inputMode="numeric" /></Field>
              <Field label={tt('تاريخ الميلاد', 'Date of birth')}>
                <input type="date" value={pf.dob} onChange={e => setPf({ ...pf, dob: e.target.value })} className={inputCls} />
                <p className="text-[10px] mt-1">
                  {pfTooOld
                    ? <span className="text-loss font-bold">{tt(`عمر اللاعب أكبر من فئة الفريق — يجب أن يكون من مواليد ${oldest} أو أحدث`, `Player is older than the team's age — must be born in ${oldest} or later`)}</span>
                    : <span className="text-hint">{oldest != null
                        ? tt(`مطلوب — يجب أن يكون اللاعب من مواليد ${oldest} أو أحدث (عمر الفريق).`, `Required — the player must be born in ${oldest} or later (the team's age).`)
                        : tt('مطلوب.', 'Required.')}</span>}
                </p>
              </Field>
            </div>
            <Field label={tt('الصورة (مطلوبة)', 'Photo (required)')}>
              <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] ?? null)} className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
              <p className="text-[10px] text-hint mt-1">{tt('صورة حديثة للرأس وجزء من الكتفين مع ظهور الوجه بوضوح — إلزامية وتُستخدم للتحقق من الهوية.', 'A recent head-and-shoulders photo with the face clearly visible — required, used to verify identity.')}</p>
            </Field>
            <div className="flex items-center gap-3">
              <PrimaryButton onClick={addPlayer} disabled={pBusy || !pf.name.trim() || !nidValid(pf.national_id) || !pf.dob || pfTooOld || !photo}>{pBusy ? tt('…', '…') : tt('إضافة لاعب', 'Add player')}</PrimaryButton>
              <button onClick={closeAddPlayer} className="text-sm text-hint">{tt('إلغاء', 'Cancel')}</button>
            </div>
          </Card>
        )}

        {!editLocked && !canAddPlayers && (
          <Card className="p-3 border-aqua/30">
            <p className="text-[11px] text-teal font-bold text-center leading-relaxed">
              {compEntries.length === 0
                ? tt('لإضافة اللاعبين، اشترك بفريقك في بطولة أولًا: افتح صفحة البطولة واطلب الاشتراك في بطولة فرعية بعمر فريقك. بعد موافقة المنظّم يظهر زر «إضافة لاعب» هنا.',
                      'To add players, first subscribe this team to a competition: open a competition and request to join a sub-competition for your team\'s age. Once the organiser approves, the "Add player" button appears here.')
                : tt('بانتظار موافقة المنظّم على اشتراك فريقك في البطولة؛ بعد الموافقة يظهر زر «إضافة لاعب» هنا.',
                      'Waiting for the organiser to approve your team\'s entry; once approved, the "Add player" button appears here.')}
            </p>
          </Card>
        )}
      </section>

      {/* ── competitions: register squad players per competition ──────────── */}
      <section className={sub === 'competitions' ? '' : 'hidden'}>
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

      {/* ── chat with the competition's organizers ────────────────────────── */}
      <section className={sub === 'chat' ? '' : 'hidden'}>
        <h3 className="font-black text-text mb-2">{tt('المحادثات مع المنظمين', 'Chat with organizers')}</h3>
        {activeEntries.length === 0 ? (
          <Card className="p-4 text-center">
            <p className="text-[11px] text-hint">
              {tt('تظهر المحادثات مع منظّمي البطولات بعد قبول اشتراك فريقك في بطولة.',
                  'Chats with competition organizers appear once your team is approved in a competition.')}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeEntries.map(e => (
              <div key={e.entry_id}>
                <button onClick={() => setChatComp(chatComp === e.competition_id ? null : e.competition_id)}
                  className="w-full flex items-center justify-between gap-2 bg-cardBg border border-bdr rounded-xl px-3 py-2.5 hover:border-aqua/40 transition-colors">
                  <span className="text-sm font-bold text-text truncate">💬 {e.competition_name}</span>
                  <span className="text-aqua text-xs font-bold shrink-0">
                    {chatComp === e.competition_id ? tt('إغلاق', 'Close') : tt('محادثة', 'Open chat')}
                  </span>
                </button>
                {chatComp === e.competition_id && (
                  <div className="mt-2">
                    <ChatThread token={token} compId={e.competition_id} teamId={teamId}
                      mySide="academy" title={e.competition_name ?? undefined} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── coaches ───────────────────────────────────────────────────────── */}
      <section className={sub === 'coaches' ? '' : 'hidden'}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-black text-text">{tt('الجهاز الفني', 'Coaching staff')}</h3>
          {canAddPlayers && !showAddCoach && !cEditId && (
            <button onClick={() => setShowAddCoach(true)}
              className="shrink-0 text-xs font-bold text-aqua border border-aqua/40 rounded-lg px-3 py-1.5 hover:bg-aqua/10 transition-colors">
              + {tt('إضافة للجهاز', 'Add staff')}
            </button>
          )}
        </div>
        <div className="space-y-2 mb-3">
          {(team.coaches ?? []).map(c => (
            <Card key={c.id} className="p-2 flex items-center gap-3">
              <LogoAvatar src={c.photo_path} name={nm(c.name, c.name_en)} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-text text-sm truncate">{nm(c.name, c.name_en)}</div>
                <div className="text-[11px] text-hint truncate">{[c.role_ar, c.license].filter(Boolean).join(' · ')}</div>
              </div>
              {canAddPlayers && (
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
        {!canAddPlayers ? (
          <Card className="p-3 border-aqua/30">
            <p className="text-[11px] text-teal font-bold text-center leading-relaxed">
              {compEntries.length === 0
                ? tt('لإضافة الجهاز الفني، اشترك بفريقك في بطولة أولًا. بعد موافقة المنظّم يمكنك إضافة الجهاز الفني هنا.',
                      'To add coaching staff, first subscribe this team to a competition. Once the organiser approves, you can add staff here.')
                : tt('بانتظار موافقة المنظّم على اشتراك فريقك في البطولة؛ بعد الموافقة يمكنك إضافة الجهاز الفني هنا.',
                      'Waiting for the organiser to approve your team\'s entry; once approved, you can add coaching staff here.')}
            </p>
          </Card>
        ) : (showAddCoach || cEditId) ? (
          <Card className="p-3 space-y-3">
            <div className="text-[11px] font-bold text-aqua">{cEditId ? tt('تعديل المدرب', 'Editing coach') : tt('إضافة للجهاز الفني', 'Add coaching staff')}</div>
            <div className="space-y-3">
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
            <p className="text-[10px] text-hint">{tt('الصورة: للرأس وجزء من الكتفين، والوجه ظاهر بوضوح.', 'Photo: head-and-shoulders, the face must be clearly visible.')}</p>
            <div className="flex items-center gap-3">
              <input type="file" accept="image/*" onChange={e => setCPhoto(e.target.files?.[0] ?? null)} className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
              <PrimaryButton onClick={saveCoach} disabled={cBusy || !cf.name}>{cBusy ? tt('…', '…') : cEditId ? tt('حفظ', 'Save') : tt('إضافة', 'Add')}</PrimaryButton>
              <button onClick={cancelEditCoach} className="text-sm text-hint">{tt('إلغاء', 'Cancel')}</button>
            </div>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
