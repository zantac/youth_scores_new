'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import CompetitionSelect from './CompetitionSelect';
import {
  apiCompetitions, apiCompetitionTeams, apiCompetitionMatches, apiTeamPlayers,
  apiCreateMatch, apiGetMatch, apiUpdateMatch, apiDeleteMatch, apiRestoreMatch,
  apiAddGoal, apiUpdateGoal, apiDeleteGoal,
  apiAddCard, apiUpdateCard, apiDeleteCard, apiSetLineup, apiAddSub, apiUpdateSub, apiDeleteSub,
  apiAddShootoutKick, apiUpdateShootoutKick, apiDeleteShootoutKick,
  apiStages,
  type EntryCompetition, type EntryTeam, type EntryMatchRow, type EntryMatch, type EntryGoal,
  type EntryCard, type EntrySub, type EntryShootoutKick, type MStage,
} from '@/lib/adminApi';

type Loc = { ar: string; en: string };
const loc = (l?: Loc | null) => (l ? l.ar || l.en : '');

// Loose enough that a search types the way people actually spell: alef and ya
// variants fold together and diacritics are ignored, so "الاهلى" finds "الأهلي".
const fold = (s: string) =>
  s.toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();

const STATUS: { v: string; l: string }[] = [
  { v: 'scheduled', l: 'مجدولة' }, { v: 'live', l: 'مباشرة' },
  { v: 'completed', l: 'انتهت' }, { v: 'postponed', l: 'مؤجلة' }, { v: 'cancelled', l: 'ملغاة' },
];
const STATUS_L: Record<string, string> = Object.fromEntries(STATUS.map(s => [s.v, s.l]));

export default function MatchesEntry() {
  const { token } = useAdminAuth();
  const [comps, setComps] = useState<EntryCompetition[]>([]);
  const [cid, setCid] = useState<number | null>(null);
  const [teams, setTeams] = useState<EntryTeam[]>([]);
  const [stages, setStages] = useState<MStage[]>([]);
  const [matches, setMatches] = useState<EntryMatchRow[]>([]);
  const [editing, setEditing] = useState<EntryMatch | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fTeam, setFTeam] = useState('');
  const [fWeek, setFWeek] = useState('');
  const [fDate, setFDate] = useState('');

  useEffect(() => { if (token) apiCompetitions(token).then(setComps).catch(e => setErr(e.message)); }, [token]);

  const loadComp = useCallback((id: number) => {
    if (!token) return;
    setCid(id); setEditing(null); setShowNew(false); setStages([]);
    Promise.all([apiCompetitionTeams(token, id), apiCompetitionMatches(token, id), apiStages(token, id)])
      .then(([t, m, s]) => { setTeams(t); setMatches(m); setStages(s); })
      .catch(e => setErr(e.message));
  }, [token]);

  const refreshMatches = useCallback(() => {
    if (token && cid) apiCompetitionMatches(token, cid).then(setMatches);
  }, [token, cid]);

  const openMatch = (mid: number) => token && apiGetMatch(token, mid).then(setEditing).catch(e => setErr(e.message));

  // A competition can hold a few hundred matches, so the list is filtered here
  // rather than scrolled. Everything is already loaded, so this stays instant.
  const weeks = useMemo(() => {
    const seen = [...new Set(matches.map(m => m.week).filter(Boolean))];
    return seen.sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b));
  }, [matches]);

  const active = useMemo(() => matches.filter(m => !m.deleted_at), [matches]);
  const recentlyDeleted = useMemo(() => matches.filter(m => m.deleted_at), [matches]);

  const shown = useMemo(() => {
    const q = fold(fTeam);
    return active.filter(m =>
      (!q || fold(loc(m.home.name)).includes(q) || fold(loc(m.away.name)).includes(q))
      && (!fWeek || m.week === fWeek)
      && (!fDate || m.date === fDate));
  }, [active, fTeam, fWeek, fDate]);

  const filtering = Boolean(fTeam || fWeek || fDate);
  const clear = () => { setFTeam(''); setFWeek(''); setFDate(''); };

  const restoreFromList = async (mid: number) => {
    if (!token) return;
    try { await apiRestoreMatch(token, mid); refreshMatches(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ في الاسترداد'); }
  };

  if (editing) {
    return <MatchEditor token={token!} match={editing} teams={teams} stages={stages}
      onChange={setEditing} onBack={() => { setEditing(null); refreshMatches(); }} />;
  }

  return (
    <div className="space-y-4">
      {err && <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">{err}</p>}

      <div>
        <label className="block text-teal text-xs font-bold mb-1.5">اختر البطولة</label>
        <CompetitionSelect
          options={comps.map(c => ({ id: c.id, season: c.season, name: loc(c.name), age: c.age, sector: loc(c.sector) }))}
          value={cid}
          onChange={id => {
            if (id) loadComp(id);
            else { setCid(null); setTeams([]); setMatches([]); setEditing(null); setShowNew(false); }
          }}
        />
      </div>

      {cid && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-hint text-xs">
              {filtering ? `${shown.length} من ${active.length} مباراة` : `${active.length} مباراة`}
            </p>
            <button onClick={() => setShowNew(s => !s)}
              className={`font-bold text-xs px-4 py-2 rounded-xl border transition-colors ${
                showNew
                  ? 'border-loss text-loss hover:bg-loss/10'
                  : 'border-dashed border-bdr text-teal hover:border-aqua hover:text-aqua'
              }`}>
              {showNew ? '✕ إلغاء' : '+ مباراة جديدة'}
            </button>
          </div>

          <div className="bg-cardBg border border-bdr rounded-xl p-3 space-y-2">
            <input value={fTeam} onChange={e => setFTeam(e.target.value)}
              placeholder="ابحث باسم فريق…" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <select value={fWeek} onChange={e => setFWeek(e.target.value)} className={inputCls}>
                <option value="">كل الجولات</option>
                {weeks.map(w => <option key={w} value={w}>الجولة {w}</option>)}
              </select>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                className={inputCls} />
            </div>
            {filtering && (
              <button onClick={clear} className="text-hint text-[11px] font-bold">✕ مسح الفلاتر</button>
            )}
          </div>

          {showNew && <NewMatch token={token!} cid={cid} teams={teams} stages={stages}
            onDone={() => { setShowNew(false); refreshMatches(); }} />}

          <div className="space-y-2">
            {shown.map(m => (
              <button key={m.id} onClick={() => openMatch(m.id)}
                className="w-full bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl p-3 text-start hover:border-aqua/40 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-sm font-medium truncate text-end">{loc(m.home.name)}</div>
                  <div className="flex flex-col items-center min-w-[64px]">
                    {m.home_score != null
                      ? <span className="text-aqua font-extrabold tnum bg-darkBg border border-bdr rounded-lg px-2.5 py-0.5">{m.home_score} - {m.away_score}</span>
                      : <span className="text-hint tnum text-xs">{m.date ? (m.time || '--:--') : 'غير محدد'}</span>}
                    <span className="text-[9px] text-hint mt-1">{STATUS_L[m.status] ?? m.status}</span>
                  </div>
                  <div className="flex-1 text-sm font-medium truncate">{loc(m.away.name)}</div>
                </div>
                {/* Round and date, so two meetings of the same pair are told apart. */}
                <p className="text-hint text-[10px] tnum text-center mt-1.5">
                  {[m.week && `الجولة ${m.week}`, m.date || 'غير محدد'].filter(Boolean).join(' · ')}
                </p>
              </button>
            ))}
            {active.length === 0 && <p className="text-hint text-sm text-center py-6">لا توجد مباريات — أضف واحدة</p>}
            {active.length > 0 && shown.length === 0 && (
              <p className="text-hint text-sm text-center py-6">لا نتائج مطابقة للفلاتر</p>
            )}
          </div>

          {recentlyDeleted.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-bdr/50">
              <p className="text-hint text-[11px] font-bold">محذوفة مؤخراً (قابلة للاسترداد خلال 24 ساعة)</p>
              {recentlyDeleted.map(m => (
                <div key={m.id} className="bg-cardBg border border-loss/20 rounded-xl p-3 opacity-60">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-sm text-hint truncate text-end line-through">{loc(m.home.name)}</div>
                    <div className="text-hint text-xs tnum min-w-[64px] text-center">
                      {m.home_score != null ? `${m.home_score} - ${m.away_score}` : (m.date || 'غير محدد')}
                    </div>
                    <div className="flex-1 text-sm text-hint truncate line-through">{loc(m.away.name)}</div>
                    <button onClick={() => restoreFromList(m.id)}
                      className="flex-shrink-0 text-gold text-[11px] font-bold border border-gold/40 rounded-lg px-2.5 py-1 hover:bg-gold/10">
                      استعادة
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function field(label: string, node: React.ReactNode) {
  return <div><label className="block text-teal text-[11px] font-bold mb-1">{label}</label>{node}</div>;
}
const inputCls = "w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua";

function NewMatch({ token, cid, teams, stages, onDone }: { token: string; cid: number; teams: EntryTeam[]; stages: MStage[]; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ home_team_id: '', away_team_id: '', date: today, time: '18:00', week: '', venue: '', status: 'scheduled', stage_id: '', group_id: '' });
  const [tbd, setTbd] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));

  const selectedStage = stages.find(s => s.id === Number(f.stage_id));
  const stageGroups = selectedStage?.groups ?? [];
  const isGroupStage = selectedStage?.type === 'group';

  const submit = async () => {
    setErr(null); setBusy(true);
    const selectedGroup = stageGroups.find(g => g.id === Number(f.group_id));
    try {
      await apiCreateMatch(token, cid, {
        home_team_id: Number(f.home_team_id), away_team_id: Number(f.away_team_id),
        date: tbd ? '' : f.date, time: tbd ? '' : f.time, week: f.week, venue: f.venue, status: f.status,
        stage_id: f.stage_id ? Number(f.stage_id) : undefined,
        group_id: f.group_id ? Number(f.group_id) : undefined,
        round: selectedGroup ? (selectedGroup.name_ar || selectedGroup.name_en || '') : undefined,
      });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };

  const teamOpts = <>{teams.map(t => <option key={t.id} value={t.id}>{loc(t.name)}</option>)}</>;
  return (
    <div className="bg-cardBg2 border border-aqua/30 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Row 1: Stage + Group (group slot kept to hold the column even when empty) */}
        {stages.length > 0 && <>
          {field('الدور', (
            <select value={f.stage_id} onChange={e => setF(p => ({ ...p, stage_id: e.target.value, group_id: '', home_team_id: '', away_team_id: '' }))} className={inputCls}>
              <option value="">— اختر الدور</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en || s.type}</option>)}
            </select>
          ))}
          {isGroupStage && stageGroups.length > 0 ? field('المجموعة', (
            <select value={f.group_id} onChange={e => setF(p => ({ ...p, group_id: e.target.value, home_team_id: '', away_team_id: '' }))} className={inputCls}>
              <option value="">— اختر المجموعة</option>
              {stageGroups.map(g => <option key={g.id} value={g.id}>{g.name_ar || g.name_en || `Group ${g.id}`}</option>)}
            </select>
          )) : <div />}
        </>}
        {/* Row 2: Teams */}
        {field('الفريق المضيف', <select value={f.home_team_id} onChange={e => set('home_team_id', e.target.value)} className={inputCls}><option value="">—</option>{teamOpts}</select>)}
        {field('الفريق الضيف', <select value={f.away_team_id} onChange={e => set('away_team_id', e.target.value)} className={inputCls}><option value="">—</option>{teamOpts}</select>)}
        {field('التاريخ', <input type="date" value={f.date} disabled={tbd} onChange={e => set('date', e.target.value)} className={inputCls + (tbd ? ' opacity-40' : '')} />)}
        {field('الوقت', <input type="time" value={f.time} disabled={tbd} onChange={e => set('time', e.target.value)} className={inputCls + (tbd ? ' opacity-40' : '')} />)}
        {field('الجولة', <input value={f.week} onChange={e => set('week', e.target.value)} placeholder="27" className={inputCls} />)}
        {field('الحالة', <select value={f.status} onChange={e => set('status', e.target.value)} className={inputCls}>{STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select>)}
        <div className="col-span-2">{field('الملعب', <input value={f.venue} onChange={e => set('venue', e.target.value)} placeholder="اسم الملعب (اختياري)" className={inputCls} />)}</div>
      </div>
      <label className="flex items-center gap-2 text-teal text-xs cursor-pointer">
        <input type="checkbox" checked={tbd} onChange={e => setTbd(e.target.checked)} />
        التاريخ غير محدد بعد (مباراة مؤكدة بدون موعد)
      </label>
      {err && <p className="text-loss text-xs">{err}</p>}
      <button onClick={submit} disabled={busy || !f.home_team_id || !f.away_team_id || (isGroupStage && !f.group_id)}
        className="w-full bg-aqua text-on-accent font-extrabold py-2.5 rounded-xl disabled:opacity-50">
        {busy ? 'جارٍ الحفظ…' : 'إنشاء المباراة'}
      </button>
    </div>
  );
}

function MatchEditor({ token, match, teams, stages, onChange, onBack }: {
  token: string; match: EntryMatch; teams: EntryTeam[]; stages: MStage[];
  onChange: (m: EntryMatch) => void; onBack: () => void;
}) {
  const [players, setPlayers] = useState<Record<number, string[]>>({});
  const [hs, setHs] = useState(match.home_score ?? '');
  const [as, setAs] = useState(match.away_score ?? '');
  const [hp, setHp] = useState<string | number>(match.home_penalty_score ?? '');
  const [ap, setAp] = useState<string | number>(match.away_penalty_score ?? '');
  const [status, setStatus] = useState(match.status);
  const [mDate, setMDate] = useState(match.date);
  const [mTime, setMTime] = useState(match.time);
  const [week, setWeek] = useState(match.week || '');
  const [weekSaved, setWeekSaved] = useState(false);
  const [venue, setVenue] = useState(match.venue || '');
  const [venueSaved, setVenueSaved] = useState(false);
  const [note, setNote] = useState(match.note || '');
  const [noteSaved, setNoteSaved] = useState(false);
  const [stageId, setStageId] = useState(match.stage_id ? String(match.stage_id) : '');
  const [groupId, setGroupId] = useState(match.group_id ? String(match.group_id) : '');
  const [stageSaved, setStageSaved] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [softDeleted, setSoftDeleted] = useState(false);
  const [schedSaved, setSchedSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editGoalId, setEditGoalId] = useState<number | null>(null);
  const [editCardId, setEditCardId] = useState<number | null>(null);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [editKickId, setEditKickId] = useState<number | null>(null);

  const editorStage = stages.find(s => s.id === Number(stageId));
  const editorGroups = editorStage?.groups ?? [];

  const saveStage = async () => {
    setErr(null);
    const selectedGroup = editorGroups.find(g => g.id === Number(groupId));
    try {
      const m = await apiUpdateMatch(token, match.id, {
        stage_id: stageId ? Number(stageId) : null,
        group_id: groupId ? Number(groupId) : null,
        round: selectedGroup ? (selectedGroup.name_ar || selectedGroup.name_en || '') : undefined,
      });
      onChange(m); setStageSaved(true); setTimeout(() => setStageSaved(false), 1500);
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };

  useEffect(() => {
    [match.home.id, match.away.id].forEach(id =>
      apiTeamPlayers(token, id).then(ps => setPlayers(p => ({ ...p, [id]: ps }))).catch(() => {}));
  }, [token, match.home.id, match.away.id]);

  const saveScore = async () => {
    setErr(null);
    try {
      const m = await apiUpdateMatch(token, match.id, {
        home_score: hs === '' ? null : Number(hs),
        away_score: as === '' ? null : Number(as),
        home_penalty_score: hp === '' ? null : Number(hp),
        away_penalty_score: ap === '' ? null : Number(ap),
        status,
      });
      onChange(m); setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };

  // Schedule (or reschedule) the fixture, or clear its date back to TBD.
  const saveSchedule = async (clear: boolean) => {
    setErr(null);
    try {
      const m = await apiUpdateMatch(token, match.id, clear ? { date: '' } : { date: mDate, time: mTime });
      onChange(m); setMDate(m.date); setMTime(m.time);
      setSchedSaved(true); setTimeout(() => setSchedSaved(false), 1500);
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };

  // Round number (الجولة).
  const saveWeek = async () => {
    setErr(null);
    try {
      const m = await apiUpdateMatch(token, match.id, { week });
      onChange(m); setWeek(m.week || '');
      setWeekSaved(true); setTimeout(() => setWeekSaved(false), 1500);
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };

  // Ground the match is played on (الملعب).
  const saveVenue = async () => {
    setErr(null);
    try {
      const m = await apiUpdateMatch(token, match.id, { venue });
      onChange(m); setVenue(m.venue || '');
      setVenueSaved(true); setTimeout(() => setVenueSaved(false), 1500);
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };

  // Free-text reason for the result (no-show, no ambulance, ground busy…).
  const saveNote = async () => {
    setErr(null);
    try {
      const m = await apiUpdateMatch(token, match.id, { note });
      onChange(m); setNote(m.note || '');
      setNoteSaved(true); setTimeout(() => setNoteSaved(false), 1500);
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
  };

  const deleteMatch = async () => {
    setErr(null); setDelBusy(true);
    try {
      await apiDeleteMatch(token, match.id);
      setSoftDeleted(true); setConfirmDel(false);
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
    finally { setDelBusy(false); }
  };

  const undoDelete = async () => {
    setErr(null); setDelBusy(true);
    try {
      const restored = await apiRestoreMatch(token, match.id);
      onChange(restored); setSoftDeleted(false);
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
    finally { setDelBusy(false); }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-aqua text-sm font-bold">‹ رجوع للمباريات</button>

      {/* Score card */}
      <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
          <div className="text-sm font-bold">{loc(match.home.name)}</div>
          <div className="flex items-center gap-2">
            <input type="number" value={hs} onChange={e => setHs(e.target.value)} className="w-12 bg-darkBg border border-bdr rounded-lg px-1 py-2 text-center text-aqua font-extrabold text-lg tnum outline-none focus:border-aqua" />
            <span className="text-hint">-</span>
            <input type="number" value={as} onChange={e => setAs(e.target.value)} className="w-12 bg-darkBg border border-bdr rounded-lg px-1 py-2 text-center text-aqua font-extrabold text-lg tnum outline-none focus:border-aqua" />
          </div>
          <div className="text-sm font-bold">{loc(match.away.name)}</div>
        </div>
        {/* Penalty shootout score — shown when the match ends level */}
        {(hs !== '' && as !== '' && Number(hs) === Number(as)) || hp !== '' || ap !== '' ? (
          <div className="mt-3 pt-3 border-t border-bdr/50">
            <p className="text-hint text-[11px] mb-2">ركلات الترجيح (اختياري)</p>
            <div className="flex items-center justify-center gap-3">
              <input type="number" min="0" value={hp} onChange={e => setHp(e.target.value)}
                placeholder="—" className="w-12 bg-darkBg border border-gold/40 rounded-lg px-1 py-2 text-center text-gold font-extrabold text-lg tnum outline-none focus:border-gold" />
              <span className="text-hint text-sm">ر.ت</span>
              <input type="number" min="0" value={ap} onChange={e => setAp(e.target.value)}
                placeholder="—" className="w-12 bg-darkBg border border-gold/40 rounded-lg px-1 py-2 text-center text-gold font-extrabold text-lg tnum outline-none focus:border-gold" />
              {(hp !== '' || ap !== '') && (
                <button onClick={() => { setHp(''); setAp(''); }}
                  className="text-loss text-[11px] font-bold border border-loss/40 rounded px-2 py-1">مسح</button>
              )}
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-2 mt-3">
          <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls + ' flex-1'}>
            {STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
          <button onClick={saveScore} className="bg-aqua text-on-accent font-extrabold px-5 py-2 rounded-lg text-sm">
            {saved ? '✓ حُفظ' : 'حفظ'}
          </button>
        </div>
        {err && <p className="text-loss text-xs mt-2">{err}</p>}
        {/* Moment of the match — set it, change it, or clear it back to TBD. */}
        <div className="mt-3 pt-3 border-t border-bdr/50 flex items-end gap-2">
          {field('التاريخ', <input type="date" value={mDate} onChange={e => setMDate(e.target.value)} className={inputCls} />)}
          <div className="w-24">{field('الوقت', <input type="time" value={mTime} onChange={e => setMTime(e.target.value)} className={inputCls} />)}</div>
          <button onClick={() => saveSchedule(false)} disabled={!mDate}
            className="bg-aqua text-on-accent font-bold px-3 py-2 rounded-lg text-xs whitespace-nowrap disabled:opacity-40">
            {schedSaved ? '✓ حُفظ' : 'حفظ الموعد'}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="flex-1 text-hint text-[10px]">الجولة {match.week || '—'} · {match.date || 'غير محدد'}</span>
          {match.date && (
            <button onClick={() => saveSchedule(true)}
              className="text-loss text-[10px] font-bold border border-loss/40 rounded px-2 py-1 whitespace-nowrap">
              جعله غير محدد
            </button>
          )}
        </div>
        {/* Round number (الجولة) — editable after the match is created. */}
        <div className="mt-3 pt-3 border-t border-bdr/50 flex items-end gap-2">
          <div className="w-28">{field('الجولة', <input value={week} onChange={e => setWeek(e.target.value)} placeholder="27" className={inputCls} />)}</div>
          <button onClick={saveWeek}
            className="bg-aqua text-on-accent font-bold px-3 py-2 rounded-lg text-xs whitespace-nowrap">
            {weekSaved ? '✓ حُفظ' : 'حفظ الجولة'}
          </button>
        </div>
        {/* Venue (الملعب). */}
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">{field('الملعب', <input value={venue} onChange={e => setVenue(e.target.value)} placeholder="اسم الملعب" className={inputCls} />)}</div>
          <button onClick={saveVenue}
            className="bg-aqua text-on-accent font-bold px-3 py-2 rounded-lg text-xs whitespace-nowrap">
            {venueSaved ? '✓ حُفظ' : 'حفظ الملعب'}
          </button>
        </div>
      </div>

      {/* Stage / Group assignment */}
      {stages.length > 0 && (
        <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 space-y-3">
          <p className="text-text font-bold text-sm">📋 الدور والمجموعة</p>
          <div className="grid grid-cols-2 gap-2">
            {field('الدور', (
              <select value={stageId} onChange={e => { setStageId(e.target.value); setGroupId(''); }} className={inputCls}>
                <option value="">— بدون دور</option>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en || s.type}</option>)}
              </select>
            ))}
            {editorGroups.length > 0 && field('المجموعة', (
              <select value={groupId} onChange={e => setGroupId(e.target.value)} className={inputCls}>
                <option value="">— بدون مجموعة</option>
                {editorGroups.map(g => <option key={g.id} value={g.id}>{g.name_ar || g.name_en || `Group ${g.id}`}</option>)}
              </select>
            ))}
          </div>
          <button onClick={saveStage} className="bg-aqua text-on-accent font-bold px-4 py-2 rounded-lg text-xs">
            {stageSaved ? '✓ حُفظ' : 'حفظ الدور / المجموعة'}
          </button>
        </div>
      )}

      {/* Match note — a free-text reason for the result. */}
      <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 space-y-2">
        <p className="text-text font-bold text-sm">📝 ملاحظة المباراة</p>
        <p className="text-hint text-[11px] leading-relaxed">
          سبب النتيجة إن وُجد — مثل عدم حضور أحد الفريقين، عدم وجود سيارة إسعاف، أو انشغال الملعب بمباراة أخرى.
        </p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={255}
          placeholder="اكتب الملاحظة هنا…" className={inputCls + ' resize-none'} />
        <div className="flex items-center justify-between">
          <span className="text-hint text-[10px] tnum">{note.length}/255</span>
          <button onClick={saveNote}
            className="bg-aqua text-on-accent font-bold px-4 py-1.5 rounded-lg text-sm">
            {noteSaved ? '✓ حُفظ' : 'حفظ الملاحظة'}
          </button>
        </div>
      </div>

      {/* Goals */}
      <EventSection title="⚽ الأهداف" items={match.goals.map(g => ({
        id: g.id, side: g.side, main: g.scorer, sub: [g.assist && `صناعة ${g.assist}`, g.is_penalty && 'ركلة جزاء', g.is_own_goal && 'عكسية'].filter(Boolean).join(' · '), minute: g.minute,
      }))} onDelete={async id => { setEditGoalId(null); onChange(await apiDeleteGoal(token, id)); }}
        onEdit={setEditGoalId} editingId={editGoalId}
        home={match.home.name} away={match.away.name}
        form={<GoalForm token={token} match={match} players={players}
          editGoal={match.goals.find(g => g.id === editGoalId) ?? null}
          onCancelEdit={() => setEditGoalId(null)}
          onAdd={m => { onChange(m); setEditGoalId(null); }} />} />

      {/* Penalty shootout kicks — only shown for draws with a penalty score set */}
      {(match.home_penalty_score != null || match.away_penalty_score != null || (match.shootout?.length ?? 0) > 0) && (
        <EventSection title="🥅 ركلات الترجيح"
          items={(match.shootout ?? []).map(k => ({
            id: k.id, side: k.side,
            main: k.player || '—',
            sub: k.result === 'scored' ? '✓ سجّل' : k.result === 'missed' ? '✗ أخطأ' : k.result === 'saved' ? '🧤 أوقفه الحارس' : '↗ خارج',
            minute: null,
          }))}
          onDelete={async id => { setEditKickId(null); onChange(await apiDeleteShootoutKick(token, id)); }}
          onEdit={setEditKickId} editingId={editKickId}
          home={match.home.name} away={match.away.name}
          form={<ShootoutKickForm token={token} match={match}
            editKick={(match.shootout ?? []).find(k => k.id === editKickId) ?? null}
            onCancelEdit={() => setEditKickId(null)}
            onAdd={m => { onChange(m); setEditKickId(null); }} />} />
      )}

      {/* Cards */}
      <EventSection title="🟨 البطاقات" items={match.cards.map(c => ({
        id: c.id, side: c.side, main: c.player, sub: c.card_type === 'red' ? 'حمراء' : c.card_type === 'second_yellow' ? 'صفراء ثانية' : 'صفراء', minute: c.minute,
      }))} onDelete={async id => { setEditCardId(null); onChange(await apiDeleteCard(token, id)); }}
        onEdit={setEditCardId} editingId={editCardId}
        home={match.home.name} away={match.away.name}
        form={<CardForm token={token} match={match} players={players}
          editCard={match.cards.find(c => c.id === editCardId) ?? null}
          onCancelEdit={() => setEditCardId(null)}
          onAdd={m => { onChange(m); setEditCardId(null); }} />} />

      {/* Line-up — above substitutions, since the squad has to exist first. */}
      <LineupSection token={token} match={match} players={players} onChange={onChange} />

      {/* Substitutions */}
      <EventSection title="🔁 التبديلات" items={match.subs.map(s => ({
        id: s.id, side: s.side, main: `↑ ${s.player_in}`, sub: `↓ ${s.player_out}`, minute: s.minute,
      }))} onDelete={async id => { setEditSubId(null); onChange(await apiDeleteSub(token, id)); }}
        onEdit={setEditSubId} editingId={editSubId}
        home={match.home.name} away={match.away.name}
        form={<SubForm token={token} match={match}
          editSub={match.subs.find(s => s.id === editSubId) ?? null}
          onCancelEdit={() => setEditSubId(null)}
          onAdd={m => { onChange(m); setEditSubId(null); }} />} />

      {/* Delete / undo-delete */}
      {softDeleted ? (
        <div className="bg-cardBg border border-gold/30 rounded-2xl p-4 space-y-2">
          <p className="text-gold font-bold text-sm">تم حذف المباراة</p>
          <p className="text-hint text-[11px] leading-relaxed">
            المباراة مخفية الآن من الجمهور. يمكن استردادها خلال 24 ساعة.
          </p>
          {err && <p className="text-loss text-xs">{err}</p>}
          <div className="flex gap-2">
            <button onClick={undoDelete} disabled={delBusy}
              className="bg-gold text-black font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {delBusy ? '…' : 'تراجع عن الحذف'}
            </button>
            <button onClick={onBack} className="text-hint text-sm font-bold px-4 py-2 border border-bdr rounded-lg">
              العودة
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-cardBg border border-loss/30 rounded-2xl p-4 space-y-2">
          <p className="text-text font-bold text-sm">حذف المباراة</p>
          <p className="text-hint text-[11px] leading-relaxed">
            تختفي المباراة فورًا من الجمهور والترتيب، ويمكن استردادها من قائمة المباريات خلال 24 ساعة.
          </p>
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)}
              className="text-loss text-sm font-bold border border-loss/40 rounded-lg px-4 py-2">
              🗑️ حذف المباراة
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-loss text-xs">هل أنت متأكد؟</span>
              <button onClick={() => setConfirmDel(false)} className="text-hint text-xs font-bold px-3 py-2">إلغاء</button>
              <button onClick={deleteMatch} disabled={delBusy}
                className="bg-loss text-white font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                {delBusy ? '…' : 'تأكيد الحذف'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Line-up ──────────────────────────────────────────────────────────────────
// One side at a time, saved whole: an XI is picked as a set, and sending it in
// one call means a save can never leave half a list behind. Only starter/bench
// is recorded — no minutes or positions.
function LineupSection({ token, match, players, onChange }: {
  token: string; match: EntryMatch; players: Record<number, string[]>;
  onChange: (m: EntryMatch) => void;
}) {
  const [teamId, setTeamId] = useState(String(match.home.id));
  const side = Number(teamId) === match.home.id ? match.lineup.home : match.lineup.away;
  const [starters, setStarters] = useState<string[]>(side.starters);
  const [bench, setBench] = useState<string[]>(side.bench);
  const [extra, setExtra] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reload the draft whenever the side changes or the server sends a new match.
  useEffect(() => {
    const s = Number(teamId) === match.home.id ? match.lineup.home : match.lineup.away;
    setStarters(s.starters); setBench(s.bench); setErr(null);
  }, [teamId, match]);

  // Anyone already named belongs in the list even if they are not on the roster,
  // since entry creates players on the fly.
  const roster = [...new Set([...(players[Number(teamId)] ?? []), ...starters, ...bench])];

  const setRole = (name: string, role: 'start' | 'bench' | null) => {
    setStarters(s => { const w = s.filter(x => x !== name); return role === 'start' ? [...w, name] : w; });
    setBench(b => { const w = b.filter(x => x !== name); return role === 'bench' ? [...w, name] : w; });
  };

  const addExtra = () => {
    const n = extra.trim();
    if (n && !roster.includes(n)) setBench(b => [...b, n]);
    setExtra('');
  };

  const dirty = starters.join('|') !== side.starters.join('|') || bench.join('|') !== side.bench.join('|');

  const save = async () => {
    setErr(null); setBusy(true);
    try { onChange(await apiSetLineup(token, match.id, Number(teamId), starters, bench)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-text font-bold text-sm">👥 التشكيلة</p>
        <span className="text-hint text-[11px] tnum">{starters.length} أساسي · {bench.length} بديل</span>
      </div>
      <SideSelect match={match} value={teamId} onChange={setTeamId} />

      <div className="space-y-1">
        {roster.map(n => {
          const isStart = starters.includes(n);
          const isBench = bench.includes(n);
          const pill = (on: boolean, cls: string) =>
            `text-[11px] font-bold rounded-lg px-2.5 py-1 border ${on ? cls : 'text-hint border-bdr'}`;
          return (
            <div key={n} className="flex items-center gap-2 bg-darkBg/60 border border-bdr rounded-lg px-3 py-1.5">
              <span className={`flex-1 text-sm truncate ${isStart || isBench ? 'text-text' : 'text-hint'}`}>{n}</span>
              <button onClick={() => setRole(n, isStart ? null : 'start')}
                className={pill(isStart, 'text-aqua border-aqua/50 bg-aqua/10')}>أساسي</button>
              <button onClick={() => setRole(n, isBench ? null : 'bench')}
                className={pill(isBench, 'text-gold border-gold/50 bg-gold/10')}>بديل</button>
            </div>
          );
        })}
        {roster.length === 0 && <p className="text-hint text-xs">لا توجد قائمة لهذا الفريق بعد</p>}
      </div>

      <div className="flex gap-2">
        <input value={extra} onChange={e => setExtra(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addExtra(); }}
          placeholder="أضف لاعبًا غير مسجّل…" className={inputCls} />
        <button onClick={addExtra} disabled={!extra.trim()}
          className="text-aqua text-xs font-bold px-3 border border-aqua/40 rounded-lg disabled:opacity-40 whitespace-nowrap">+ إضافة</button>
      </div>

      {err && <p className="text-loss text-xs">{err}</p>}
      <button onClick={save} disabled={busy || !dirty}
        className="w-full bg-aqua text-on-accent font-extrabold py-2 rounded-lg text-sm disabled:opacity-40">
        {busy ? '…' : 'حفظ التشكيلة'}
      </button>
    </div>
  );
}

// ── Substitutions ────────────────────────────────────────────────────────────
function SubForm({ token, match, onAdd, editSub, onCancelEdit }: {
  token: string; match: EntryMatch; onAdd: (m: EntryMatch) => void;
  editSub?: EntrySub | null; onCancelEdit?: () => void;
}) {
  const [teamId, setTeamId] = useState(String(match.home.id));
  const [out, setOut] = useState(''); const [inn, setInn] = useState(''); const [minute, setMinute] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  // Pick from the named squad, so a typo cannot invent a player here.
  const side = Number(teamId) === match.home.id ? match.lineup.home : match.lineup.away;
  const named = [...side.starters, ...side.bench];

  // Load the chosen sub in edit mode; blank the form otherwise.
  useEffect(() => {
    if (editSub) {
      setTeamId(String(editSub.team_id));
      setOut(editSub.player_out); setInn(editSub.player_in);
      setMinute(editSub.minute != null ? String(editSub.minute) : ''); setErr(null);
    } else { setOut(''); setInn(''); setMinute(''); setErr(null); }
  }, [editSub]);

  const submit = async () => {
    if (!out.trim() || !inn.trim()) return;
    setErr(null); setBusy(true);
    try {
      const body = { team_id: Number(teamId), player_out: out, player_in: inn, minute: minute || undefined };
      onAdd(editSub ? await apiUpdateSub(token, editSub.id, body) : await apiAddSub(token, match.id, body));
      if (!editSub) { setOut(''); setInn(''); setMinute(''); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`border-t pt-3 space-y-2 ${editSub ? 'border-aqua/40' : 'border-bdr/50'}`}>
      {editSub && <p className="text-aqua text-[11px] font-bold">✎ تعديل تبديل</p>}
      <datalist id={`sq-${teamId}`}>{named.map(n => <option key={n} value={n} />)}</datalist>
      <div className="grid grid-cols-2 gap-2">
        <SideSelect match={match} value={teamId} onChange={v => { setTeamId(v); setOut(''); setInn(''); }} />
        <input value={minute} onChange={e => setMinute(e.target.value)} type="number" placeholder="الدقيقة" className={inputCls} />
        <input value={out} onChange={e => setOut(e.target.value)} list={`sq-${teamId}`} placeholder="خارج ↓" className={inputCls} />
        <input value={inn} onChange={e => setInn(e.target.value)} list={`sq-${teamId}`} placeholder="داخل ↑" className={inputCls} />
      </div>
      {named.length === 0 && <p className="text-hint text-[11px]">احفظ تشكيلة هذا الفريق أولًا لاختيار الأسماء.</p>}
      {err && <p className="text-loss text-xs">{err}</p>}
      <div className="flex items-center gap-2">
        {editSub && <button onClick={onCancelEdit} className="text-hint text-xs font-bold px-2">إلغاء</button>}
        <button onClick={submit} disabled={busy || !out.trim() || !inn.trim()}
          className="flex-1 bg-gold/90 text-on-accent font-bold py-1.5 rounded-lg text-sm disabled:opacity-50">
          {editSub ? 'حفظ التعديل' : '+ إضافة تبديل'}</button>
      </div>
    </div>
  );
}

function EventSection({ title, items, onDelete, onEdit, editingId, home, away, form }: {
  title: string; items: { id: number; side: string; main: string; sub: string; minute: number | null }[];
  onDelete: (id: number) => void; onEdit?: (id: number) => void; editingId?: number | null;
  home: Loc; away: Loc; form: React.ReactNode;
}) {
  return (
    <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 space-y-3">
      <p className="text-text font-bold text-sm">{title}</p>
      <div className="space-y-1.5">
        {items.map(it => (
          <div key={it.id} className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${it.id === editingId ? 'bg-aqua/10 border-aqua/50' : 'bg-darkBg/60 border-bdr'}`}>
            <span className="text-[10px] text-hint w-10">{it.side === 'home' ? loc(home).slice(0, 6) : loc(away).slice(0, 6)}</span>
            <span className="text-aqua tnum text-xs w-8">{it.minute != null ? `${it.minute}'` : ''}</span>
            <span className="flex-1 text-text text-sm truncate">{it.main}{it.sub && <span className="text-hint text-[11px]"> — {it.sub}</span>}</span>
            {onEdit && <button onClick={() => onEdit(it.id)} className="text-aqua text-xs">تعديل</button>}
            <button onClick={() => onDelete(it.id)} className="text-loss text-xs">حذف</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-hint text-xs">لا يوجد</p>}
      </div>
      {form}
    </div>
  );
}

function SideSelect({ match, value, onChange }: { match: EntryMatch; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      <option value={String(match.home.id)}>{loc(match.home.name)}</option>
      <option value={String(match.away.id)}>{loc(match.away.name)}</option>
    </select>
  );
}

function GoalForm({ token, match, players, onAdd, editGoal, onCancelEdit }: {
  token: string; match: EntryMatch; players: Record<number, string[]>; onAdd: (m: EntryMatch) => void;
  editGoal?: EntryGoal | null; onCancelEdit?: () => void;
}) {
  const [teamId, setTeamId] = useState(String(match.home.id));
  const [scorer, setScorer] = useState(''); const [assist, setAssist] = useState('');
  const [minute, setMinute] = useState(''); const [pen, setPen] = useState(false); const [og, setOg] = useState(false);
  const [busy, setBusy] = useState(false);
  // The side selector picks who the goal counts for. An own goal is put in by
  // an opponent, so the names to choose from come from the other team.
  const otherId = Number(teamId) === match.home.id ? match.away.id : match.home.id;
  const scorerTeamId = og ? otherId : Number(teamId);
  const list = players[scorerTeamId] ?? [];

  // In edit mode, load the chosen goal into the fields (and clear back to a
  // blank add-form when the edit is cancelled or saved). team_id is always the
  // credited side, so it drives the selector even for an own goal.
  useEffect(() => {
    if (editGoal) {
      setTeamId(String(editGoal.team_id));
      setScorer(editGoal.scorer); setAssist(editGoal.assist ?? '');
      setMinute(editGoal.minute != null ? String(editGoal.minute) : '');
      setPen(editGoal.is_penalty); setOg(editGoal.is_own_goal);
    } else {
      setScorer(''); setAssist(''); setMinute(''); setPen(false); setOg(false);
    }
  }, [editGoal]);

  const submit = async () => {
    if (!scorer.trim()) return;
    setBusy(true);
    try {
      const body = { team_id: Number(teamId), scorer, assist: assist || undefined, minute: minute || undefined, is_penalty: pen, is_own_goal: og };
      const m = editGoal ? await apiUpdateGoal(token, editGoal.id, body) : await apiAddGoal(token, match.id, body);
      onAdd(m);
      if (!editGoal) { setScorer(''); setAssist(''); setMinute(''); setPen(false); setOg(false); }
    } finally { setBusy(false); }
  };

  return (
    <div className={`border-t pt-3 space-y-2 ${editGoal ? 'border-aqua/40' : 'border-bdr/50'}`}>
      {editGoal && <p className="text-aqua text-[11px] font-bold">✎ تعديل هدف</p>}
      <datalist id={`pl-${scorerTeamId}`}>{list.map(n => <option key={n} value={n} />)}</datalist>
      <div className="grid grid-cols-2 gap-2">
        <SideSelect match={match} value={teamId} onChange={setTeamId} />
        <input value={scorer} onChange={e => setScorer(e.target.value)} list={`pl-${scorerTeamId}`}
          placeholder={og ? 'اسم اللاعب صاحب الهدف العكسي' : 'اسم الهدّاف'} className={inputCls} />
        {!og && <input value={assist} onChange={e => setAssist(e.target.value)} list={`pl-${scorerTeamId}`} placeholder="صانع الهدف (اختياري)" className={inputCls} />}
        <input value={minute} onChange={e => setMinute(e.target.value)} type="number" placeholder="الدقيقة" className={inputCls} />
      </div>
      {og && (
        <p className="text-gold text-[11px]">
          الهدف يُحتسب لـ«{loc(Number(teamId) === match.home.id ? match.home.name : match.away.name)}»،
          واللاعب من «{loc(Number(teamId) === match.home.id ? match.away.name : match.home.name)}».
        </p>
      )}
      <div className="flex items-center gap-4 text-xs text-teal">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={pen} onChange={e => setPen(e.target.checked)} disabled={og} /> ركلة جزاء</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={og} onChange={e => { setOg(e.target.checked); setScorer(''); setAssist(''); if (e.target.checked) setPen(false); }} /> هدف عكسي</label>
        {editGoal && <button onClick={onCancelEdit} className="ms-auto text-hint font-bold px-2">إلغاء</button>}
        <button onClick={submit} disabled={busy || !scorer.trim()} className={`${editGoal ? '' : 'ms-auto'} bg-gold/90 text-on-accent font-bold px-4 py-1.5 rounded-lg disabled:opacity-50`}>
          {editGoal ? 'حفظ التعديل' : '+ إضافة هدف'}
        </button>
      </div>
    </div>
  );
}

const KICK_RESULTS = [
  { v: 'scored',    l: '✓ سجّل' },
  { v: 'missed',   l: '✗ أخطأ' },
  { v: 'saved',    l: '🧤 أوقفه الحارس' },
  { v: 'off_target', l: '↗ خارج الهدف' },
];

function ShootoutKickForm({ token, match, onAdd, editKick, onCancelEdit }: {
  token: string; match: EntryMatch; onAdd: (m: EntryMatch) => void;
  editKick?: EntryShootoutKick | null; onCancelEdit?: () => void;
}) {
  const [teamId, setTeamId] = useState(String(match.home.id));
  const [player, setPlayer] = useState('');
  const [result, setResult] = useState('scored');
  const [winning, setWinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (editKick) {
      setTeamId(String(editKick.team_id)); setPlayer(editKick.player);
      setResult(editKick.result); setWinning(editKick.is_winning_kick);
    } else { setPlayer(''); setResult('scored'); setWinning(false); }
    setErr(null);
  }, [editKick]);

  const submit = async () => {
    if (!player.trim()) return;
    setErr(null); setBusy(true);
    try {
      const body = { team_id: Number(teamId), player, result, is_winning_kick: winning };
      onAdd(editKick
        ? await apiUpdateShootoutKick(token, editKick.id, body)
        : await apiAddShootoutKick(token, match.id, body));
      if (!editKick) { setPlayer(''); setResult('scored'); setWinning(false); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`border-t pt-3 space-y-2 ${editKick ? 'border-aqua/40' : 'border-bdr/50'}`}>
      {editKick && <p className="text-aqua text-[11px] font-bold">✎ تعديل ركلة</p>}
      <div className="grid grid-cols-2 gap-2">
        <SideSelect match={match} value={teamId} onChange={v => { setTeamId(v); setPlayer(''); }} />
        <input value={player} onChange={e => setPlayer(e.target.value)}
          placeholder="اسم اللاعب" className={inputCls} />
        <select value={result} onChange={e => setResult(e.target.value)} className={inputCls}>
          {KICK_RESULTS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
        <label className="flex items-center gap-2 text-teal text-xs cursor-pointer">
          <input type="checkbox" checked={winning} onChange={e => setWinning(e.target.checked)} />
          الركلة الحاسمة
        </label>
      </div>
      {err && <p className="text-loss text-xs">{err}</p>}
      <div className="flex items-center gap-2">
        {editKick && <button onClick={onCancelEdit} className="text-hint text-xs font-bold px-2">إلغاء</button>}
        <button onClick={submit} disabled={busy || !player.trim()}
          className="flex-1 bg-gold/90 text-on-accent font-bold py-1.5 rounded-lg text-sm disabled:opacity-50">
          {editKick ? 'حفظ التعديل' : '+ إضافة ركلة'}
        </button>
      </div>
    </div>
  );
}

function CardForm({ token, match, players, onAdd, editCard, onCancelEdit }: {
  token: string; match: EntryMatch; players: Record<number, string[]>; onAdd: (m: EntryMatch) => void;
  editCard?: EntryCard | null; onCancelEdit?: () => void;
}) {
  const [teamId, setTeamId] = useState(String(match.home.id));
  const [player, setPlayer] = useState(''); const [type, setType] = useState('yellow'); const [minute, setMinute] = useState('');
  const [busy, setBusy] = useState(false);
  const list = players[Number(teamId)] ?? [];

  // Load the chosen card in edit mode; blank the form otherwise.
  useEffect(() => {
    if (editCard) {
      setTeamId(String(editCard.team_id)); setPlayer(editCard.player); setType(editCard.card_type);
      setMinute(editCard.minute != null ? String(editCard.minute) : '');
    } else { setPlayer(''); setType('yellow'); setMinute(''); }
  }, [editCard]);

  const submit = async () => {
    if (!player.trim()) return;
    setBusy(true);
    try {
      const body = { team_id: Number(teamId), player, card_type: type, minute: minute || undefined };
      const m = editCard ? await apiUpdateCard(token, editCard.id, body) : await apiAddCard(token, match.id, body);
      onAdd(m);
      if (!editCard) { setPlayer(''); setMinute(''); }
    } finally { setBusy(false); }
  };

  return (
    <div className={`border-t pt-3 space-y-2 ${editCard ? 'border-aqua/40' : 'border-bdr/50'}`}>
      {editCard && <p className="text-aqua text-[11px] font-bold">✎ تعديل بطاقة</p>}
      <datalist id={`plc-${teamId}`}>{list.map(n => <option key={n} value={n} />)}</datalist>
      <div className="grid grid-cols-2 gap-2">
        <SideSelect match={match} value={teamId} onChange={setTeamId} />
        <input value={player} onChange={e => setPlayer(e.target.value)} list={`plc-${teamId}`} placeholder="اسم اللاعب" className={inputCls} />
        <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
          <option value="yellow">صفراء</option><option value="second_yellow">صفراء ثانية</option><option value="red">حمراء</option>
        </select>
        <input value={minute} onChange={e => setMinute(e.target.value)} type="number" placeholder="الدقيقة" className={inputCls} />
      </div>
      <div className="flex items-center gap-2">
        {editCard && <button onClick={onCancelEdit} className="text-hint text-xs font-bold px-2">إلغاء</button>}
        <button onClick={submit} disabled={busy || !player.trim()} className="flex-1 bg-yellow/90 text-on-accent font-bold px-4 py-1.5 rounded-lg disabled:opacity-50">
          {editCard ? 'حفظ التعديل' : '+ إضافة بطاقة'}</button>
      </div>
    </div>
  );
}
