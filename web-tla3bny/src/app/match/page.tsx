'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  tMatch, tMatchLineups, tUpdateMatch, tDeleteMatch, tEnterResult,
  tCompTeams, tRoster,
  type TMatch, type TLineup, type TMatchEvent, type TCompPlayer,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import PitchView, { type SlotView } from '@/components/tla3bny/PitchView';
import Spinner from '@/components/ui/Spinner';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

// ── helpers ───────────────────────────────────────────────────────────────────
type EvType = TMatchEvent['event_type'];
const EV_ICON: Record<string, string> = {
  goal: '⚽', assist: '🅰️', yellow: '🟨', red: '🟥',
  substitution_in: '🔺', substitution_out: '🔻',
};

const goals      = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'goal');
const assists    = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'assist');
const yellows    = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'yellow');
const reds       = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'red');
const subsIn     = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'substitution_in');
const subsOut    = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'substitution_out');

function teamLabel(m: TMatch, teamId: number) {
  return teamId === m.home_team_id ? m.home_team_name : m.away_team_name;
}

// ── ── ── PUBLIC TABS ── ── ──

// Lineup tab: pitch view for both teams
function LineupTab({ m, lineups, canEdit }: { m: TMatch; lineups: TLineup[]; canEdit: (id: number) => boolean }) {
  const tt = useTT();
  return (
    <div className="space-y-4">
      {[m.home_team_id, m.away_team_id].map(tid => {
        const l = lineups.find(x => x.team_id === tid);
        if (!l) {
          return canEdit(tid) ? (
            <Link key={tid} href={`/lineup?match=${m.id}&team=${tid}`}
              className="flex items-center justify-between bg-cardBg border border-dashed border-aqua/40 rounded-2xl px-4 py-4 hover:bg-aqua/5 transition-colors">
              <div>
                <p className="font-bold text-text text-sm">{teamLabel(m, tid)}</p>
                <p className="text-hint text-xs mt-0.5">{tt('لا تشكيلة بعد', 'No lineup yet')}</p>
              </div>
              <span className="text-aqua text-sm font-bold">{tt('إضافة التشكيلة ←', 'Add lineup →')}</span>
            </Link>
          ) : (
            <div key={tid} className="flex items-center justify-between bg-cardBg border border-bdr rounded-2xl px-4 py-3 opacity-50">
              <p className="font-bold text-text text-sm">{teamLabel(m, tid)}</p>
              <span className="text-hint text-xs">{tt('لا تشكيلة بعد', 'No lineup yet')}</span>
            </div>
          );
        }
        const filled: Record<string, SlotView> = {};
        l.slots.filter(s => !s.is_substitute && s.position_slot).forEach(s => {
          filled[s.position_slot!] = { playerId: s.player_id, playerName: s.player_name, photoPath: s.photo_path };
        });
        const subs = l.slots.filter(s => s.is_substitute);
        return (
          <Card key={tid} className="overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div>
                <p className="font-black text-text">{l.team_name}</p>
                {l.formation && <p className="text-[11px] text-teal">{l.formation}</p>}
              </div>
              {canEdit(tid) && (
                <Link href={`/lineup?match=${m.id}&team=${tid}`}
                  className="text-xs font-bold text-aqua border border-aqua/40 rounded-lg px-3 py-1">
                  {tt('تعديل', 'Edit')}
                </Link>
              )}
            </div>
            <div className="max-w-sm mx-auto px-2 pb-2">
              <PitchView formation={l.formation} filled={filled} />
            </div>
            {subs.length > 0 && (
              <div className="border-t border-bdr/50 px-4 py-3">
                <p className="text-[11px] text-teal font-bold mb-2">{tt('البدلاء', 'Substitutes')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {subs.map(s => (
                    <span key={s.id} className="flex items-center gap-1 bg-cardBg2 border border-bdr rounded-full ps-1 pe-2 py-0.5">
                      <LogoAvatar src={s.photo_path} name={s.player_name} size={18} />
                      <span className="text-[11px] font-bold text-text">{s.player_name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// Generic event list row
function EvRow({ e, m }: { e: TMatchEvent; m: TMatch }) {
  const isHome = e.team_id === m.home_team_id;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-bdr/40 last:border-0">
      <span className="text-lg">{EV_ICON[e.event_type] ?? '•'}</span>
      <div className="flex-1 min-w-0">
        {e.player_id
          ? <Link href={`/player?id=${e.player_id}`} className="font-bold text-text text-sm hover:text-aqua">{e.player_name}</Link>
          : <span className="font-bold text-text text-sm">{e.player_name}</span>}
        <p className="text-[11px] text-hint">{isHome ? m.home_team_name : m.away_team_name}</p>
      </div>
      {e.minute != null && <span className="text-hint text-xs tabular-nums shrink-0">{e.minute}&apos;</span>}
    </div>
  );
}

function ScorersTab({ m }: { m: TMatch }) {
  const tt = useTT();
  const evs = goals(m.events ?? []);
  if (evs.length === 0) return <EmptyState icon="⚽" text={tt('لا أهداف بعد', 'No goals yet')} />;
  return <Card className="p-4">{evs.map(e => <EvRow key={e.id} e={e} m={m} />)}</Card>;
}

function GoalsTab({ m }: { m: TMatch }) {
  const tt = useTT();
  const evs = m.events ?? [];
  const goalEvs = goals(evs);
  if (goalEvs.length === 0) return <EmptyState icon="⚽" text={tt('لا أهداف بعد', 'No goals yet')} />;
  return (
    <Card className="p-4 space-y-3">
      {goalEvs.map(g => {
        const assist = assists(evs).find(a => a.team_id === g.team_id && a.minute === g.minute);
        const isHome = g.team_id === m.home_team_id;
        return (
          <div key={g.id} className="flex items-start gap-3 pb-3 border-b border-bdr/40 last:border-0 last:pb-0">
            <span className="text-xl mt-0.5">⚽</span>
            <div className="flex-1 min-w-0">
              {g.player_id
                ? <Link href={`/player?id=${g.player_id}`} className="font-bold text-text hover:text-aqua">{g.player_name}</Link>
                : <span className="font-bold text-text">{g.player_name}</span>}
              <p className="text-[11px] text-hint">{isHome ? m.home_team_name : m.away_team_name}</p>
              {assist && (
                <p className="text-[11px] text-teal mt-0.5">🅰️ {tt('صناعة', 'Assist')}: {assist.player_name}</p>
              )}
            </div>
            {g.minute != null && <span className="text-hint text-xs tabular-nums shrink-0">{g.minute}&apos;</span>}
          </div>
        );
      })}
    </Card>
  );
}

function SubsTab({ m }: { m: TMatch }) {
  const tt = useTT();
  const ins = subsIn(m.events ?? []);
  const outs = subsOut(m.events ?? []);
  if (ins.length === 0 && outs.length === 0)
    return <EmptyState icon="🔁" text={tt('لا تبديلات بعد', 'No substitutions yet')} />;
  // Pair in/out events
  const used = new Set<number>();
  const pairs: { inEv: TMatchEvent; outEv?: TMatchEvent }[] = [];
  for (const inEv of ins) {
    const outEv = inEv.related_event_id
      ? outs.find(o => o.id === inEv.related_event_id && !used.has(o.id))
      : outs.find(o => o.team_id === inEv.team_id && o.minute === inEv.minute && !used.has(o.id));
    pairs.push({ inEv, outEv });
    if (outEv) used.add(outEv.id);
  }
  return (
    <Card className="p-4 space-y-3">
      {pairs.map(({ inEv, outEv }) => (
        <div key={inEv.id} className="flex items-start gap-3 pb-3 border-b border-bdr/40 last:border-0 last:pb-0">
          <span className="text-xl mt-0.5">🔁</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-hint mb-0.5">{teamLabel(m, inEv.team_id)}</p>
            <p className="text-sm font-bold text-win">🔺 {inEv.player_name}</p>
            {outEv && <p className="text-sm font-bold text-hint">🔻 {outEv.player_name}</p>}
          </div>
          {inEv.minute != null && <span className="text-hint text-xs tabular-nums shrink-0">{inEv.minute}&apos;</span>}
        </div>
      ))}
    </Card>
  );
}

function CardsTab({ m, type }: { m: TMatch; type: 'yellow' | 'red' }) {
  const tt = useTT();
  const evs = type === 'yellow' ? yellows(m.events ?? []) : reds(m.events ?? []);
  const label = type === 'yellow' ? tt('لا بطاقات صفراء', 'No yellow cards') : tt('لا بطاقات حمراء', 'No red cards');
  if (evs.length === 0) return <EmptyState icon={type === 'yellow' ? '🟨' : '🟥'} text={label} />;
  return <Card className="p-4">{evs.map(e => <EvRow key={e.id} e={e} m={m} />)}</Card>;
}

// ── ── ── ADMIN PANEL ── ── ──
function AdminPanel({ token, m, lineups, onUpdate, onLineupsUpdate }: {
  token: string; m: TMatch; lineups: TLineup[];
  onUpdate: (m: TMatch) => void; onLineupsUpdate: () => void;
}) {
  const tt = useTT();

  // Result state
  const [homeScore, setHomeScore] = useState(m.home_score != null ? String(m.home_score) : '');
  const [awayScore, setAwayScore] = useState(m.away_score != null ? String(m.away_score) : '');
  const [status, setStatus] = useState(m.status);

  // Info state
  const [date, setDate] = useState(m.date ?? '');
  const [time, setTime] = useState(m.time ?? '');
  const [round, setRound] = useState(m.round ?? '');
  const [venue, setVenue] = useState(m.venue ?? '');
  const [note, setNote] = useState(m.note ?? '');

  // Events state (all in one array, sectioned in UI)
  const [events, setEvents] = useState<TMatchEvent[]>(m.events ?? []);
  const addEv = (ev: Omit<TMatchEvent, 'id' | 'match_id' | 'related_event_id'>) =>
    setEvents(prev => [...prev, { ...ev, id: Date.now(), match_id: m.id, related_event_id: null }]);
  const removeEv = (id: number) => setEvents(prev => prev.filter(e => e.id !== id));

  // Roster for event forms
  const [rosters, setRosters] = useState<Record<number, TCompPlayer[]>>({});
  useEffect(() => {
    tCompTeams(m.competition_id, m.age_category_id).then(entries => {
      [m.home_team_id, m.away_team_id].forEach(tid => {
        const entry = entries.find(x => x.team_id === tid);
        if (entry) tRoster(entry.id).then(r =>
          setRosters(prev => ({ ...prev, [tid]: (r.roster ?? []).filter(p => p.status === 'approved') }))
        );
      });
    }).catch(() => {});
  }, [m.competition_id, m.age_category_id, m.home_team_id, m.away_team_id]);

  // Busy / ok / err states
  const [resultBusy, setResultBusy] = useState(false);
  const [infoBusy, setInfoBusy] = useState(false);
  const [eventsBusy, setEventsBusy] = useState(false);
  const [infoOk, setInfoOk] = useState(false);
  const [eventsOk, setEventsOk] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const saveResult = async () => {
    setErr(null); setResultBusy(true);
    try {
      const updated = await tEnterResult(token, m.id, {
        home_score: homeScore === '' ? null : Number(homeScore),
        away_score: awayScore === '' ? null : Number(awayScore),
        events: events.filter(e => e.player_id != null).map(e => ({
          event_type: e.event_type, team_id: e.team_id,
          player_id: e.player_id, minute: e.minute ?? undefined,
        })),
      });
      onUpdate(updated);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setResultBusy(false); }
  };

  const saveInfo = async () => {
    setErr(null); setInfoBusy(true);
    try {
      const updated = await tUpdateMatch(token, m.id, {
        date: date || undefined, time: time || undefined,
        venue: venue || undefined, round: round || undefined,
        status, note: note || undefined,
      });
      onUpdate(updated); setInfoOk(true); setTimeout(() => setInfoOk(false), 1500);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setInfoBusy(false); }
  };

  const saveEvents = async () => {
    setErr(null); setEventsBusy(true);
    try {
      const updated = await tEnterResult(token, m.id, {
        home_score: m.home_score, away_score: m.away_score,
        events: events.filter(e => e.player_id != null).map(e => ({
          event_type: e.event_type, team_id: e.team_id,
          player_id: e.player_id, minute: e.minute ?? undefined,
        })),
      });
      onUpdate(updated); setEventsOk(true); setTimeout(() => setEventsOk(false), 1500);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setEventsBusy(false); }
  };

  return (
    <div className="space-y-4 p-4">
      <ErrorNote>{err}</ErrorNote>

      {/* 1. Result */}
      <Section title={tt('نتيجة المباراة', 'Match result')}>
        <div className="flex items-center justify-center gap-6 py-2">
          <ScoreInput label={m.home_team_name ?? ''} value={homeScore} onChange={setHomeScore} />
          <span className="text-hint font-black text-2xl">-</span>
          <ScoreInput label={m.away_team_name ?? ''} value={awayScore} onChange={setAwayScore} />
        </div>
        <Field label={tt('الحالة', 'Status')}>
          <select value={status} onChange={e => setStatus(e.target.value as TMatch['status'])} className={inputCls}>
            <option value="scheduled">{tt('قادمة', 'Scheduled')}</option>
            <option value="live">{tt('مباشر', 'Live')}</option>
            <option value="finished">{tt('انتهت', 'Finished')}</option>
          </select>
        </Field>
        <PrimaryButton onClick={saveResult} disabled={resultBusy} className="w-full">
          {resultBusy ? tt('…', '…') : tt('حفظ النتيجة', 'Save result')}
        </PrimaryButton>
      </Section>

      {/* 2. Match info */}
      <Section title={tt('بيانات المباراة', 'Match info')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tt('التاريخ', 'Date')}><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} /></Field>
          <Field label={tt('الوقت', 'Time')}><input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} /></Field>
          <Field label={tt('الجولة', 'Round')}><input value={round} onChange={e => setRound(e.target.value)} className={inputCls} /></Field>
          <Field label={tt('الملعب', 'Venue')}><input value={venue} onChange={e => setVenue(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="flex items-center gap-2">
          <PrimaryButton onClick={saveInfo} disabled={infoBusy} className="text-sm">
            {infoBusy ? tt('…', '…') : tt('حفظ', 'Save')}
          </PrimaryButton>
          {infoOk && <span className="text-win text-sm font-bold">✓</span>}
        </div>
      </Section>

      {/* 3. Match note */}
      <Section title={tt('ملاحظة المباراة', 'Match note')}>
        <p className="text-hint text-[11px] -mt-1">
          {tt('سبب النتيجة أو أي ملاحظة (تظهر للجميع)', 'Result note or any remark (visible to all)')}
        </p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          maxLength={512} className={inputCls + ' resize-none'}
          placeholder={tt('مثال: فاز الفريق بسبب غياب المنافس', 'e.g. Team won due to opponent absence')} />
        <div className="flex items-center justify-between">
          <span className="text-hint text-[10px] tabular-nums">{note.length}/512</span>
          <button onClick={saveInfo} disabled={infoBusy}
            className="text-xs font-bold text-aqua hover:underline disabled:opacity-50">
            {tt('حفظ الملاحظة', 'Save note')}
          </button>
        </div>
      </Section>

      {/* 4. Goals */}
      <EventSection
        title={tt('الأهداف', 'Goals')}
        icon="⚽"
        events={events}
        types={['goal', 'assist']}
        m={m}
        rosters={rosters}
        onAdd={addEv}
        onRemove={removeEv}
        onSave={saveEvents}
        saving={eventsBusy}
        ok={eventsOk}
        tt={tt}
      />

      {/* 5. Cards */}
      <EventSection
        title={tt('البطاقات', 'Cards')}
        icon="🟨"
        events={events}
        types={['yellow', 'red']}
        m={m}
        rosters={rosters}
        onAdd={addEv}
        onRemove={removeEv}
        onSave={saveEvents}
        saving={eventsBusy}
        ok={eventsOk}
        tt={tt}
      />

      {/* 6. Substitutions */}
      <EventSection
        title={tt('التبديلات', 'Substitutions')}
        icon="🔁"
        events={events}
        types={['substitution_in', 'substitution_out']}
        m={m}
        rosters={rosters}
        onAdd={addEv}
        onRemove={removeEv}
        onSave={saveEvents}
        saving={eventsBusy}
        ok={eventsOk}
        tt={tt}
      />

      {/* 7. Lineup links */}
      <Section title={tt('التشكيلة', 'Lineup')}>
        <div className="space-y-2">
          {[m.home_team_id, m.away_team_id].map(tid => {
            const l = lineups.find(x => x.team_id === tid);
            return (
              <Link key={tid} href={`/lineup?match=${m.id}&team=${tid}`}
                className="flex items-center justify-between bg-darkBg border border-bdr rounded-xl px-3 py-2.5 hover:border-aqua/40 transition-colors">
                <span className="text-text text-sm font-bold">{teamLabel(m, tid)}</span>
                <span className="text-aqua text-xs font-bold">
                  {l ? `${tt('تعديل', 'Edit')} (${l.slots.filter(s => !s.is_substitute).length} ${tt('لاعب', 'players')})` : tt('إضافة ←', 'Add →')}
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* 8. Delete */}
      <Section title={tt('حذف المباراة', 'Delete match')} danger>
        <p className="text-hint text-[11px]">
          {tt('يحذف المباراة وجميع أحداثها وتشكيلاتها نهائيًا.', 'Permanently deletes the match and all its events and lineups.')}
        </p>
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)}
            className="text-loss text-sm font-bold border border-loss/40 rounded-lg px-4 py-2 hover:bg-loss/10">
            {tt('حذف', 'Delete')}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setConfirmDel(false)} className="text-hint text-xs font-bold px-3 py-2">{tt('إلغاء', 'Cancel')}</button>
            <button onClick={async () => { await tDeleteMatch(token, m.id); router.back(); }}
              className="bg-loss text-white font-bold px-4 py-2 rounded-lg text-sm">
              {tt('تأكيد الحذف', 'Confirm delete')}
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <Card className={`p-4 space-y-3 ${danger ? 'border-loss/25' : ''}`}>
      <p className="font-black text-text text-sm border-b border-bdr/50 pb-2">{title}</p>
      {children}
    </Card>
  );
}

function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <input type="number" value={value} onChange={e => onChange(e.target.value)} min={0}
        className="w-16 bg-darkBg border border-bdr rounded-xl px-2 py-2 text-center text-aqua font-extrabold text-2xl tnum outline-none focus:border-aqua" />
      <span className="text-[11px] text-hint text-center max-w-[80px] truncate">{label}</span>
    </div>
  );
}

function EventSection({ title, icon, events, types, m, rosters, onAdd, onRemove, onSave, saving, ok, tt }: {
  title: string; icon: string;
  events: TMatchEvent[]; types: EvType[];
  m: TMatch; rosters: Record<number, TCompPlayer[]>;
  onAdd: (ev: Omit<TMatchEvent, 'id' | 'match_id' | 'related_event_id'>) => void;
  onRemove: (id: number) => void;
  onSave: () => void; saving: boolean; ok: boolean;
  tt: (ar: string, en: string) => string;
}) {
  const shown = events.filter(e => types.includes(e.event_type));
  const [evType, setEvType] = useState<string>(types[0]);
  const [evTeam, setEvTeam] = useState(String(m.home_team_id));
  const [evPlayer, setEvPlayer] = useState('');
  const [evMinute, setEvMinute] = useState('');
  const roster = rosters[Number(evTeam)] ?? [];

  const add = () => {
    if (!evPlayer) return;
    const player = roster.find(p => p.player_name === evPlayer);
    onAdd({
      event_type: evType as EvType,
      team_id: Number(evTeam),
      player_id: player?.player_id ?? null,
      player_name: player?.player_name ?? evPlayer,
      minute: evMinute ? Number(evMinute) : null,
    });
    setEvPlayer(''); setEvMinute('');
  };

  return (
    <Card className="p-4 space-y-3">
      <p className="font-black text-text text-sm border-b border-bdr/50 pb-2">{icon} {title}</p>

      {shown.length > 0 && (
        <div className="space-y-1">
          {shown.map(e => (
            <div key={e.id} className="flex items-center gap-2 bg-darkBg/60 border border-bdr rounded-lg px-3 py-1.5">
              <span className="text-base">{EV_ICON[e.event_type] ?? '•'}</span>
              <span className="text-text text-xs flex-1 truncate font-bold">{e.player_name}</span>
              <span className="text-[11px] text-hint tabular-nums">
                {e.team_id === m.home_team_id ? m.home_team_name?.slice(0, 8) : m.away_team_name?.slice(0, 8)}
                {e.minute != null && ` · ${e.minute}'`}
              </span>
              <button onClick={() => onRemove(e.id)} className="text-hint hover:text-loss text-xs shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-bdr/50 pt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label={tt('النوع', 'Type')}>
            <select value={evType} onChange={e => setEvType(e.target.value)} className={inputCls}>
              {types.map(t => <option key={t} value={t}>{EV_ICON[t]} {t.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label={tt('الفريق', 'Team')}>
            <select value={evTeam} onChange={e => setEvTeam(e.target.value)} className={inputCls}>
              <option value={m.home_team_id}>{m.home_team_name}</option>
              <option value={m.away_team_id}>{m.away_team_name}</option>
            </select>
          </Field>
          <Field label={tt('اللاعب', 'Player')}>
            <select value={evPlayer} onChange={e => setEvPlayer(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {roster.map(p => <option key={p.player_id} value={p.player_name ?? ''}>{p.player_name}</option>)}
            </select>
          </Field>
          <Field label={tt("الدقيقة", "Minute")}>
            <input type="number" value={evMinute} onChange={e => setEvMinute(e.target.value)} min={1} max={120} placeholder="45" className={inputCls} />
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={add} disabled={!evPlayer}
            className="flex-1 border border-aqua/40 text-aqua text-xs font-bold rounded-lg py-2 hover:bg-aqua/10 disabled:opacity-40">
            + {tt('إضافة', 'Add')}
          </button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 bg-aqua text-on-accent text-xs font-bold rounded-lg py-2 disabled:opacity-50">
            {ok ? '✓' : saving ? tt('…', '…') : tt('حفظ', 'Save')}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── ── ── SHARE SHEET ── ── ──
function ShareSheet({ m, onClose }: { m: TMatch; onClose: () => void }) {
  const tt = useTT();
  const scoreText = m.home_score != null ? `${m.home_score} - ${m.away_score}` : tt('ضد', 'vs');
  const text = `${m.home_team_name} ${scoreText} ${m.away_team_name} · ${m.competition_name ?? 'tla3bny'}`;
  const url = typeof window !== 'undefined' ? window.location.href : '';
  return (
    <div className="fixed inset-0 z-[200] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full bg-gradient-to-b from-cardBg to-cardBg2 rounded-t-3xl border-t border-bdr p-4 pb-8" onClick={e => e.stopPropagation()}>
        <div className="w-9 h-1 bg-bdr rounded-full mx-auto mb-4" />
        <p className="text-center text-hint text-sm font-bold mb-3">{tt('شارك النتيجة', 'Share result')}</p>
        <div className="rounded-2xl border border-bdr p-5 bg-gradient-to-br from-[#0c2036] to-[#0a1730] mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-hint truncate">{m.competition_name}</span>
            <span className="text-aqua font-extrabold text-xs">تلاعبني</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <div className="flex flex-col items-center gap-1">
              <LogoAvatar src={m.home_logo} name={m.home_team_name} size={48} />
              <span className="text-xs font-bold text-white">{m.home_team_name}</span>
            </div>
            <span className="text-3xl font-extrabold tnum text-gold">{scoreText}</span>
            <div className="flex flex-col items-center gap-1">
              <LogoAvatar src={m.away_logo} name={m.away_team_name} size={48} />
              <span className="text-xs font-bold text-white">{m.away_team_name}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <a href={`https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-[#25D366] text-[#053a1a] font-bold py-3 rounded-xl text-sm">
            {tt('واتساب', 'WhatsApp')}
          </a>
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-[#1877F2] text-white font-bold py-3 rounded-xl text-sm">
            {tt('فيسبوك', 'Facebook')}
          </a>
        </div>
      </div>
    </div>
  );
}

// ── ── ── MAIN CONTENT ── ── ──
type PublicTab = 'lineup' | 'scorers' | 'goals' | 'subs' | 'yellow' | 'red';

function MatchContent() {
  const tt = useTT();
  const params = useSearchParams();
  const router = useRouter();
  const id = Number(params.get('id'));
  const { user, token, academy, isSuperAdmin, canAdminCompetition } = useTla3bnyAuth();
  const [m, setM] = useState<TMatch | null>(null);
  const [lineups, setLineups] = useState<TLineup[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [pubTab, setPubTab] = useState<PublicTab>('lineup');
  const [share, setShare] = useState(false);

  const load = useCallback(() => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    tMatch(id).then(setM).catch(() => setNotFound(true)).finally(() => setLoading(false));
    tMatchLineups(id).then(setLineups).catch(() => setLineups([]));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (notFound || !m) return <EmptyState icon="🔍" text={tt('المباراة غير موجودة', 'Match not found')} />;

  const canManage = isSuperAdmin || canAdminCompetition(m.competition_id);
  // The academy's team list (loaded by tMe) is the authoritative source —
  // more reliable than m.home_academy_id which can be null if the relationship
  // is lazy-loaded.
  const academyTeamIds = new Set((academy?.teams ?? []).map(t => t.id));
  const canEditSide = (teamId: number) => {
    if (canManage) return true;
    if (user?.role === 'team' && user.team_id === teamId) return true;
    if (user?.role === 'academy') return academyTeamIds.has(teamId);
    return false;
  };

  const finished = m.status === 'finished';
  const live = m.status === 'live';
  const hasScore = m.home_score != null && m.away_score != null;
  const evs = m.events ?? [];
  const context = [m.competition_name, m.age_category, m.stage_name, m.group_name].filter(Boolean).join(' · ');

  // Build public tabs dynamically
  const pubTabs: { key: PublicTab; ar: string; en: string; show: boolean }[] = [
    { key: 'lineup',  ar: 'التشكيلة',         en: 'Lineup',       show: true },
    { key: 'scorers', ar: 'الهدافون',          en: 'Scorers',      show: goals(evs).length > 0 },
    { key: 'goals',   ar: 'الأهداف',           en: 'Goals',        show: goals(evs).length > 0 },
    { key: 'subs',    ar: 'التبديلات',         en: 'Substitutes',  show: subsIn(evs).length > 0 || subsOut(evs).length > 0 },
    { key: 'yellow',  ar: 'البطاقات الصفراء',  en: 'Yellow cards', show: yellows(evs).length > 0 },
    { key: 'red',     ar: 'البطاقات الحمراء',  en: 'Red cards',    show: reds(evs).length > 0 },
  ].filter(t => t.show);

  return (
    <div className="min-h-screen bg-darkBg pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-cardBg/90 backdrop-blur border-b border-bdr flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-aqua text-xl font-bold leading-none">{'‹'}</button>
        <span className="flex-1 text-aqua font-bold text-sm truncate">{context || tt('المباراة', 'Match')}</span>
        {canManage && (
          <button onClick={() => setShowAdmin(v => !v)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${showAdmin ? 'bg-aqua text-on-accent border-aqua' : 'text-teal border-bdr hover:border-teal'}`}>
            {showAdmin ? tt('عرض', 'View') : tt('إدارة', 'Manage')}
          </button>
        )}
        <button onClick={() => setShare(true)} className="text-gold text-lg leading-none">{'↗'}</button>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-b from-cardBg to-cardBg2 border-b border-bdr px-4 py-8 text-center">
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(60%_100%_at_50%_0,rgb(var(--accent-rgb)/0.18),transparent_70%)] pointer-events-none" />
        <p className="relative text-hint text-xs mb-5">
          {context}{m.round ? ` · ${m.round}` : ''}
        </p>
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Link href={`/team?id=${m.home_team_id}`} className="flex flex-col items-center gap-2 group">
            <LogoAvatar src={m.home_logo} name={m.home_team_name} size={64} />
            <p className="text-sm font-bold leading-tight text-center group-hover:text-aqua transition-colors">{m.home_team_name}</p>
          </Link>
          <div className="flex flex-col items-center gap-1 min-w-[100px]">
            {hasScore && (finished || live) ? (
              <div className="flex items-baseline gap-2 font-extrabold tnum">
                <span className="text-5xl text-text" style={{ textShadow: '0 0 30px rgb(var(--accent-rgb)/0.3)' }}>{m.home_score}</span>
                <span className="text-2xl text-hint">-</span>
                <span className="text-5xl text-text">{m.away_score}</span>
              </div>
            ) : (
              <span className="text-aqua font-extrabold text-2xl tnum">{m.time || '--:--'}</span>
            )}
            <span className={`mt-1 text-[11px] font-bold px-3 py-0.5 rounded-full ${live ? 'bg-loss/20 text-loss' : finished ? 'bg-win/15 text-win border border-win/30' : 'bg-cardBg2 text-hint'}`}>
              {live ? tt('● مباشر', '● LIVE') : finished ? tt('انتهت', 'FT') : (m.date ?? tt('قادمة', 'TBD'))}
            </span>
          </div>
          <Link href={`/team?id=${m.away_team_id}`} className="flex flex-col items-center gap-2 group">
            <LogoAvatar src={m.away_logo} name={m.away_team_name} size={64} />
            <p className="text-sm font-bold leading-tight text-center group-hover:text-aqua transition-colors">{m.away_team_name}</p>
          </Link>
        </div>
        {m.venue && <p className="relative text-hint text-[11px] mt-4">🏟️ {m.venue}</p>}
        {m.note && (
          <p className="relative text-gold text-[11px] mt-2 mx-auto max-w-md leading-relaxed bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">
            📝 {m.note}
          </p>
        )}
      </div>

      {/* Admin panel */}
      {showAdmin && canManage && token ? (
        <AdminPanel
          token={token} m={m} lineups={lineups}
          onUpdate={updated => { setM(updated); }}
          onLineupsUpdate={load}
        />
      ) : (
        <>
          {/* Public tabs */}
          <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar px-4 bg-cardBg/50">
            {pubTabs.map(t => (
              <button key={t.key} onClick={() => setPubTab(t.key)}
                className={`px-3 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${pubTab === t.key ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
                {tt(t.ar, t.en)}
              </button>
            ))}
          </div>

          <div className="p-4">
            {pubTab === 'lineup'  && <LineupTab m={m} lineups={lineups} canEdit={canEditSide} />}
            {pubTab === 'scorers' && <ScorersTab m={m} />}
            {pubTab === 'goals'   && <GoalsTab m={m} />}
            {pubTab === 'subs'    && <SubsTab m={m} />}
            {pubTab === 'yellow'  && <CardsTab m={m} type="yellow" />}
            {pubTab === 'red'     && <CardsTab m={m} type="red" />}
          </div>
        </>
      )}

      {share && <ShareSheet m={m} onClose={() => setShare(false)} />}
    </div>
  );
}

export default function MatchPage() {
  return <Suspense fallback={<Spinner />}><MatchContent /></Suspense>;
}
