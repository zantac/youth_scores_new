'use client';
import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  tMatch, tMatchLineups, tUpdateMatch, tDeleteMatch, tEnterResult,
  tCompTeams, tRoster, tCompetition,
  mediaUrl,
  type TMatch, type TLineup, type TLineupSlot, type TMatchEvent, type TCompPlayer, type TCompAge,
} from '@/lib/tla3bnyApi';
import { slotBase } from '@/lib/tla3bnyFormations';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import PitchView, { type SlotView } from '@/components/tla3bny/PitchView';
import Spinner from '@/components/ui/Spinner';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

// ── draft auto-save ───────────────────────────────────────────────────────────
const draftKey = (matchId: number) => `draft_result_match_${matchId}`;

interface ResultDraft {
  home_score: string;
  away_score: string;
  events: TMatchEvent[];
  saved_at: string;
}

function saveDraft(matchId: number, home: string, away: string, events: TMatchEvent[]) {
  try {
    localStorage.setItem(draftKey(matchId), JSON.stringify({
      home_score: home, away_score: away, events,
      saved_at: new Date().toISOString(),
    } satisfies ResultDraft));
  } catch { /* storage full — ignore */ }
}

function clearDraft(matchId: number) {
  try { localStorage.removeItem(draftKey(matchId)); } catch {}
}

function loadDraft(matchId: number): ResultDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(matchId));
    if (!raw) return null;
    const d = JSON.parse(raw) as ResultDraft;
    // Discard drafts older than 24 hours.
    if (Date.now() - new Date(d.saved_at).getTime() > 86_400_000) {
      clearDraft(matchId);
      return null;
    }
    return d;
  } catch { return null; }
}

function fmtDraftTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// ── helpers ───────────────────────────────────────────────────────────────────
type EvType = TMatchEvent['event_type'];
const EV_ICON: Record<string, string> = {
  goal: '⚽', assist: '🅰️', yellow: '🟨', second_yellow: '🟨🟥', red: '🟥',
  substitution_in: '🔺', substitution_out: '🔻',
  penalty_scored: '✅', penalty_missed: '❌',
};
const EV_LABEL_AR: Record<string, [string, string]> = {
  goal: ['هدف', 'Goal'], assist: ['صناعة', 'Assist'],
  yellow: ['بطاقة صفراء', 'Yellow card'],
  second_yellow: ['صفراء ثانية (طرد)', 'Second yellow (red)'],
  red: ['بطاقة حمراء', 'Red card'],
  substitution_in: ['دخول', 'Sub in'], substitution_out: ['خروج', 'Sub out'],
  penalty_scored: ['ضربة جزاء مسجّلة', 'Penalty scored'],
  penalty_missed: ['ضربة جزاء مُضاعة', 'Penalty missed'],
};

/** Derive the "decisive" score label for display. Penalty score takes precedence. */
function matchScoreLabel(m: TMatch) {
  if (m.home_score_pen != null && m.away_score_pen != null)
    return { home: m.home_score_pen, away: m.away_score_pen };
  if (m.home_score_et != null && m.away_score_et != null)
    return { home: m.home_score_et, away: m.away_score_et };
  return { home: m.home_score, away: m.away_score };
}

const goals      = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'goal');
const assists    = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'assist');
const yellows    = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'yellow' || e.event_type === 'second_yellow');
const reds       = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'red' || e.event_type === 'second_yellow');
const subsIn     = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'substitution_in');
const subsOut    = (evs: TMatchEvent[]) => evs.filter(e => e.event_type === 'substitution_out');

function teamLabel(m: TMatch, teamId: number) {
  return teamId === m.home_team_id ? m.home_team_name : m.away_team_name;
}

// ── ── ── PUBLIC TABS ── ── ──

// One player tile used in the sheet/cards view.
function PlayerCard({ slot, small = false }: { slot: TLineupSlot; small?: boolean }) {
  const url = mediaUrl(slot.photo_path);
  const initials = (slot.player_name ?? '?').trim().slice(0, 2).toUpperCase();
  const aspect = small ? 'aspect-square' : 'aspect-[3/4]';
  const textSize = small ? 'text-xl' : 'text-2xl';

  const inner = (
    <div className="flex flex-col items-center gap-1 text-center">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={slot.player_name ?? ''} className={`w-full ${aspect} object-cover object-top rounded-xl border border-bdr`} />
      ) : (
        <div className={`w-full ${aspect} rounded-xl bg-gradient-to-br from-aqua/30 to-cardBg2 border border-bdr grid place-items-center`}>
          <span className={`${textSize} font-extrabold text-aqua`}>{initials}</span>
        </div>
      )}
      <span className="text-xs font-bold text-text leading-tight line-clamp-2">{slot.player_name}</span>
      {!slot.is_substitute && slot.position_slot && (
        <span className="text-[10px] font-bold text-teal">{slotBase(slot.position_slot)}</span>
      )}
    </div>
  );

  return slot.player_id ? (
    <Link href={`/player?id=${slot.player_id}`}>{inner}</Link>
  ) : <div>{inner}</div>;
}

// Card/sheet view: photo grid for match-day identity verification.
function SheetView({ m, lineups }: { m: TMatch; lineups: TLineup[] }) {
  const tt = useTT();
  return (
    <div className="space-y-8">
      {[m.home_team_id, m.away_team_id].map(tid => {
        const l = lineups.find(x => x.team_id === tid);
        const name = teamLabel(m, tid);
        if (!l || l.slots.every(s => s.player_id == null)) {
          return (
            <p key={tid} className="text-hint text-sm text-center py-4">
              {name} — {tt('لا تشكيلة', 'No lineup')}
            </p>
          );
        }
        const starters = l.slots.filter(s => !s.is_substitute && s.player_id != null);
        const subs     = l.slots.filter(s =>  s.is_substitute && s.player_id != null);
        return (
          <div key={tid}>
            <div className="flex items-baseline gap-2 mb-3">
              <h3 className="font-black text-text">{l.team_name ?? name}</h3>
              {l.formation && <span className="text-xs text-teal font-bold">{l.formation}</span>}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {starters.map(s => <PlayerCard key={s.id} slot={s} />)}
            </div>
            {subs.length > 0 && (
              <>
                <p className="text-[11px] font-bold text-teal mt-5 mb-2">{tt('البدلاء', 'Substitutes')}</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {subs.map(s => <PlayerCard key={s.id} slot={s} small />)}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Lineup tab: pitch view + card view toggle for both teams.
function LineupTab({ m, lineups, canEdit }: { m: TMatch; lineups: TLineup[]; canEdit: (id: number) => boolean }) {
  const tt = useTT();
  const [view, setView] = useState<'pitch' | 'cards'>('pitch');
  const hasLineups = lineups.some(l => l.slots.some(s => s.player_id != null));

  return (
    <div className="space-y-4">
      {hasLineups && (
        <div className="flex items-center gap-1 bg-darkBg/60 border border-bdr/50 rounded-xl p-1 w-fit">
          {(['pitch', 'cards'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${view === v ? 'bg-cardBg text-aqua shadow-sm' : 'text-teal hover:text-text'}`}>
              {v === 'pitch' ? tt('الملعب', 'Pitch') : tt('🪪 بطاقات', '🪪 Cards')}
            </button>
          ))}
        </div>
      )}

      {view === 'cards' ? <SheetView m={m} lineups={lineups} /> : (
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
            const subs = l.slots.filter(s => s.is_substitute && s.player_id != null);
            const unpositioned = l.slots.filter(s => !s.is_substitute && !s.position_slot && s.player_id != null);
            const hasFormation = l.formation && Object.keys(filled).length > 0;
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
                {hasFormation ? (
                  <div className="max-w-sm mx-auto px-2 pb-2">
                    <PitchView formation={l.formation} filled={filled} />
                  </div>
                ) : unpositioned.length > 0 ? (
                  <div className="px-4 pb-3">
                    <p className="text-[11px] text-teal font-bold mb-2">{tt('الأساسيون', 'Starters')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {unpositioned.map(s => (
                        <span key={s.id} className="flex items-center gap-1 bg-cardBg2 border border-bdr rounded-full ps-1 pe-2 py-0.5">
                          <LogoAvatar src={s.photo_path} name={s.player_name} size={18} />
                          <span className="text-[11px] font-bold text-text">{s.player_name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-sm mx-auto px-2 pb-2">
                    <PitchView formation={l.formation} filled={filled} />
                  </div>
                )}
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
      )}
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
  return (
    <Card className="p-4">
      {evs.map(e => (
        <div key={e.id} className="flex items-center gap-3 py-2 border-b border-bdr/40 last:border-0">
          <span className="text-lg">{EV_ICON[e.event_type] ?? '•'}</span>
          <div className="flex-1 min-w-0">
            {e.player_id
              ? <Link href={`/player?id=${e.player_id}`} className="font-bold text-text text-sm hover:text-aqua">{e.player_name}</Link>
              : <span className="font-bold text-text text-sm">{e.player_name}</span>}
            <p className="text-[11px] text-hint">
              {e.team_id === m.home_team_id ? m.home_team_name : m.away_team_name}
              {e.event_type === 'second_yellow' && (
                <span className="ms-1 text-gold font-bold">{tt('· صفراء ثانية', '· 2nd yellow')}</span>
              )}
            </p>
          </div>
          {e.minute != null && <span className="text-hint text-xs tabular-nums shrink-0">{e.minute}&apos;</span>}
        </div>
      ))}
    </Card>
  );
}

// ── ── ── ADMIN PANEL ── ── ──
function AdminPanel({ token, m, lineups, onUpdate, onLineupsUpdate }: {
  token: string; m: TMatch; lineups: TLineup[];
  onUpdate: (m: TMatch) => void; onLineupsUpdate: () => void;
}) {
  const tt = useTT();

  // Holds the current form values so the auto-save interval never captures stale
  // state via closure. Initialized with empty values; the sync useEffect keeps it
  // up-to-date every render.
  const draftRef = useRef({
    homeScore: m.home_score != null ? String(m.home_score) : '',
    awayScore: m.away_score != null ? String(m.away_score) : '',
    events: [] as TMatchEvent[],
    dirty: false,
  });

  // Result state — regular time
  const [homeScore, setHomeScore] = useState(m.home_score != null ? String(m.home_score) : '');
  const [awayScore, setAwayScore] = useState(m.away_score != null ? String(m.away_score) : '');
  const changeHomeScore = (v: string) => { setHomeScore(v); draftRef.current.dirty = true; };
  const changeAwayScore = (v: string) => { setAwayScore(v); draftRef.current.dirty = true; };

  // Extra time
  const [hasET, setHasET] = useState(m.home_score_et != null);
  const [homeET, setHomeET] = useState(m.home_score_et != null ? String(m.home_score_et) : '');
  const [awayET, setAwayET] = useState(m.away_score_et != null ? String(m.away_score_et) : '');

  // Penalty shootout
  const [hasPen, setHasPen] = useState(m.home_score_pen != null);
  const [homePen, setHomePen] = useState(m.home_score_pen != null ? String(m.home_score_pen) : '');
  const [awayPen, setAwayPen] = useState(m.away_score_pen != null ? String(m.away_score_pen) : '');
  const [status, setStatus] = useState(m.status);
  // Keep status in sync when the parent updates the match (e.g. after saving score).
  useEffect(() => { setStatus(m.status); }, [m.status]);

  // Info state
  const [date, setDate] = useState(m.date ?? '');
  const [time, setTime] = useState(m.time ?? '');
  const [round, setRound] = useState(m.round ?? '');
  const [venue, setVenue] = useState(m.venue ?? '');
  const [note, setNote] = useState(m.note ?? '');
  const [stageId, setStageId] = useState(m.stage_id ? String(m.stage_id) : '');
  const [groupId, setGroupId] = useState(m.group_id ? String(m.group_id) : '');
  useEffect(() => {
    setStageId(m.stage_id ? String(m.stage_id) : '');
    setGroupId(m.group_id ? String(m.group_id) : '');
  }, [m.stage_id, m.group_id]);

  // Competition stages for stage/group editing
  const [compAges, setCompAges] = useState<TCompAge[]>([]);
  useEffect(() => {
    tCompetition(m.competition_id).then(c => setCompAges(c.ages ?? [])).catch(() => {});
  }, [m.competition_id]);
  const matchCage = compAges.find(a => a.id === m.competition_age_id);
  const matchStages = matchCage?.stages ?? [];
  const matchSelectedStage = matchStages.find(s => s.id === Number(stageId));
  const matchGroups = matchSelectedStage?.groups ?? [];

  // Events state (all in one array, sectioned in UI)
  const [events, setEvents] = useState<TMatchEvent[]>(m.events ?? []);

  // ── draft auto-save ────────────────────────────────────────────────────────
  // Keep draftRef in sync with the latest render values.
  useEffect(() => { draftRef.current = { ...draftRef.current, homeScore, awayScore, events }; },
    [homeScore, awayScore, events]);

  // Recover a draft when the admin first opens the panel.
  const [recoveredDraft, setRecoveredDraft] = useState<ResultDraft | null>(null);
  useEffect(() => {
    const d = loadDraft(m.id);
    if (!d) return;
    const hasEvents = d.events.length > 0;
    const scoreDiffers =
      d.home_score !== String(m.home_score ?? '') ||
      d.away_score !== String(m.away_score ?? '');
    if (hasEvents || scoreDiffers) setRecoveredDraft(d);
  // Run once on mount — m.id / scores are stable at this point.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreDraft = () => {
    if (!recoveredDraft) return;
    setHomeScore(recoveredDraft.home_score);
    setAwayScore(recoveredDraft.away_score);
    setEvents(recoveredDraft.events);
    draftRef.current.dirty = true;
    setRecoveredDraft(null);
  };
  const discardDraft = () => { clearDraft(m.id); setRecoveredDraft(null); };

  // Periodic auto-save every 10 seconds (only if something changed).
  useEffect(() => {
    const id = setInterval(() => {
      if (!draftRef.current.dirty) return;
      const { homeScore, awayScore, events } = draftRef.current;
      saveDraft(m.id, homeScore, awayScore, events);
    }, 10_000);
    return () => clearInterval(id);
  // m.id is stable for the lifetime of this component.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addEv = (ev: Omit<TMatchEvent, 'id' | 'match_id' | 'related_event_id'>) => {
    setEvents(prev => {
      const next = [...prev, { ...ev, id: Date.now(), match_id: m.id, related_event_id: null }];
      // Save immediately so a crash right after adding an event loses nothing.
      draftRef.current.dirty = true;
      saveDraft(m.id, draftRef.current.homeScore, draftRef.current.awayScore, next);
      return next;
    });
  };
  const removeEv = (id: number) => {
    setEvents(prev => {
      const next = prev.filter(e => e.id !== id);
      draftRef.current.dirty = true;
      saveDraft(m.id, draftRef.current.homeScore, draftRef.current.awayScore, next);
      return next;
    });
  };

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
  const [lineupWarnings, setLineupWarnings] = useState<string[]>([]);
  const router = useRouter();

  // Check that every player named in a goal/card event appears in their team's
  // submitted lineup. Returns warning strings; empty means all clear.
  const getLineupWarnings = (): string[] => {
    const CHECK = new Set(['goal', 'assist', 'yellow', 'second_yellow', 'red'] as EvType[]);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const ev of events) {
      if (!ev.player_id || !ev.team_id || ev.is_own_goal) continue;
      if (!CHECK.has(ev.event_type as EvType)) continue;
      const lineup = lineups.find(l => l.team_id === ev.team_id);
      if (!lineup || lineup.slots.length === 0) continue; // no lineup → skip
      if (lineup.slots.some(s => s.player_id === ev.player_id)) continue;
      const key = `${ev.player_id}-${ev.event_type}`;
      if (!seen.has(key)) {
        seen.add(key);
        const [ar, en] = EV_LABEL_AR[ev.event_type] ?? [ev.event_type, ev.event_type];
        out.push(`${ev.player_name} — ${tt(ar, en)}`);
      }
    }
    return out;
  };

  const saveResult = async () => {
    // If warnings are already displayed the admin clicked "Save anyway" — skip check.
    if (lineupWarnings.length === 0) {
      const hasLineup = lineups.some(l => l.slots.length > 0);
      if (hasLineup) {
        const warnings = getLineupWarnings();
        if (warnings.length > 0) { setLineupWarnings(warnings); return; }
      }
    }
    setLineupWarnings([]);
    setErr(null); setResultBusy(true);
    try {
      const body: Record<string, unknown> = {
        home_score: homeScore === '' ? null : Number(homeScore),
        away_score: awayScore === '' ? null : Number(awayScore),
        events: events.filter(e => e.player_id != null).map(e => ({
          event_type: e.event_type, team_id: e.team_id,
          player_id: e.player_id, minute: e.minute ?? undefined,
          is_extra_time: e.is_extra_time, is_own_goal: e.is_own_goal,
          is_penalty: e.is_penalty, kick_order: e.kick_order ?? undefined,
          is_winning_kick: e.is_winning_kick,
        })),
      };
      if (hasET) {
        body.home_score_et = homeET === '' ? null : Number(homeET);
        body.away_score_et = awayET === '' ? null : Number(awayET);
      }
      if (hasPen) {
        body.home_score_pen = homePen === '' ? null : Number(homePen);
        body.away_score_pen = awayPen === '' ? null : Number(awayPen);
      }
      const updated = await tEnterResult(token, m.id, body);
      clearDraft(m.id);
      draftRef.current.dirty = false;
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
        stage_id: stageId ? Number(stageId) : null,
        group_id: groupId ? Number(groupId) : null,
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
          is_extra_time: e.is_extra_time, is_own_goal: e.is_own_goal,
          is_penalty: e.is_penalty, kick_order: e.kick_order ?? undefined,
          is_winning_kick: e.is_winning_kick,
        })),
      });
      onUpdate(updated); setEventsOk(true); setTimeout(() => setEventsOk(false), 1500);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setEventsBusy(false); }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Draft recovery banner */}
      {recoveredDraft && (
        <div className="flex items-start gap-3 bg-gold/10 border border-gold/40 rounded-2xl px-4 py-3">
          <span className="text-2xl shrink-0">⚡</span>
          <div className="flex-1 min-w-0">
            <p className="text-gold font-bold text-sm">
              {tt('مسودة محفوظة', 'Draft recovered')}
              {recoveredDraft.events.length > 0 &&
                ` · ${recoveredDraft.events.length} ${tt('أحداث', 'events')}`}
            </p>
            <p className="text-hint text-[11px]">
              {tt(`محفوظة الساعة ${fmtDraftTime(recoveredDraft.saved_at)}`,
                  `Saved at ${fmtDraftTime(recoveredDraft.saved_at)}`)}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={restoreDraft}
              className="text-gold text-xs font-bold hover:underline">
              {tt('استعادة', 'Restore')}
            </button>
            <button onClick={discardDraft}
              className="text-hint text-xs hover:text-text">
              {tt('تجاهل', 'Discard')}
            </button>
          </div>
        </div>
      )}

      <ErrorNote>{err}</ErrorNote>

      {/* 1. Result */}
      <Section title={tt('نتيجة المباراة', 'Match result')}>
        {/* Regular time */}
        <p className="text-hint text-[11px] font-bold">{tt('الوقت الأصلي (90 دقيقة)', 'Regular time (90 min)')}</p>
        <div className="flex items-center justify-center gap-6 py-1">
          <ScoreInput label={m.home_team_name ?? ''} value={homeScore} onChange={changeHomeScore} />
          <span className="text-hint font-black text-2xl">-</span>
          <ScoreInput label={m.away_team_name ?? ''} value={awayScore} onChange={changeAwayScore} />
        </div>

        {/* Extra time toggle */}
        <label className="flex items-center gap-2 text-teal text-xs font-bold cursor-pointer mt-1">
          <input type="checkbox" checked={hasET} onChange={e => {
            setHasET(e.target.checked);
            if (!e.target.checked) { setHomeET(''); setAwayET(''); setHasPen(false); setHomePen(''); setAwayPen(''); }
          }} />
          {tt('اللعب امتد لوقت إضافي', 'Match went to extra time')}
        </label>

        {hasET && (<>
          <p className="text-hint text-[11px] font-bold mt-2">
            {tt('بعد الوقت الإضافي (النتيجة التراكمية)', 'After extra time (cumulative score)')}
          </p>
          <div className="flex items-center justify-center gap-6 py-1">
            <ScoreInput label={m.home_team_name ?? ''} value={homeET} onChange={setHomeET} />
            <span className="text-hint font-black text-2xl">-</span>
            <ScoreInput label={m.away_team_name ?? ''} value={awayET} onChange={setAwayET} />
          </div>

          {/* Penalty shootout toggle — only if ET ended in a draw */}
          <label className="flex items-center gap-2 text-teal text-xs font-bold cursor-pointer mt-1">
            <input type="checkbox" checked={hasPen} onChange={e => {
              setHasPen(e.target.checked);
              if (!e.target.checked) { setHomePen(''); setAwayPen(''); }
            }} />
            {tt('الوقت الإضافي انتهى بالتعادل — ضربات جزاء', 'Extra time drew — penalty shootout')}
          </label>

          {hasPen && (<>
            <p className="text-hint text-[11px] font-bold mt-2">
              {tt('نتيجة ضربات الجزاء', 'Penalty shootout score')}
            </p>
            <div className="flex items-center justify-center gap-6 py-1">
              <ScoreInput label={m.home_team_name ?? ''} value={homePen} onChange={setHomePen} />
              <span className="text-hint font-black text-2xl">-</span>
              <ScoreInput label={m.away_team_name ?? ''} value={awayPen} onChange={setAwayPen} />
            </div>
          </>)}
        </>)}

        {lineupWarnings.length > 0 && (
          <div className="bg-gold/10 border border-gold/40 rounded-xl p-3 space-y-2">
            <p className="text-gold font-bold text-xs">
              ⚠️ {tt('لاعبون في الأحداث غير موجودين في التشكيلة:', 'Event players missing from lineup:')}
            </p>
            <ul className="space-y-0.5">
              {lineupWarnings.map((w, i) => (
                <li key={i} className="text-[11px] text-hint">• {w}</li>
              ))}
            </ul>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={saveResult}
                className="text-xs font-bold text-gold border border-gold/40 rounded-lg px-3 py-1.5 hover:bg-gold/10">
                {tt('حفظ على أي حال', 'Save anyway')}
              </button>
              <button onClick={() => setLineupWarnings([])}
                className="text-xs text-hint hover:text-text">
                {tt('مراجعة', 'Review')}
              </button>
            </div>
          </div>
        )}
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
          {matchStages.length > 0 && (
            <Field label={tt('الدور', 'Stage')}>
              <select value={stageId} onChange={e => { setStageId(e.target.value); setGroupId(''); }} className={inputCls}>
                <option value="">— {tt('بدون دور', 'No stage')}</option>
                {matchStages.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name || tt(({ league: 'دوري', group: 'مجموعات', knockout: 'خروج المغلوب' } as Record<string,string>)[s.type] ?? s.type, s.type)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {matchGroups.length > 0 && (
            <Field label={tt('المجموعة', 'Group')}>
              <select value={groupId} onChange={e => setGroupId(e.target.value)} className={inputCls}>
                <option value="">— {tt('بدون مجموعة', 'No group')}</option>
                {matchGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name || `Group ${g.id}`}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Field label={tt('الحالة', 'Status')}>
          <select value={status} onChange={e => setStatus(e.target.value as TMatch['status'])} className={inputCls}>
            <option value="scheduled">{tt('مجدولة', 'Scheduled')}</option>
            <option value="live">{tt('مباشرة', 'Live')}</option>
            <option value="completed">{tt('انتهت', 'Completed')}</option>
            <option value="postponed">{tt('مؤجلة', 'Postponed')}</option>
            <option value="cancelled">{tt('ملغاة', 'Cancelled')}</option>
          </select>
        </Field>
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
      <GoalSection
        events={events}
        m={m}
        rosters={rosters}
        lineups={lineups}
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
        types={['yellow', 'second_yellow', 'red']}
        m={m}
        rosters={rosters}
        lineups={lineups}
        onAdd={addEv}
        onRemove={removeEv}
        onSave={saveEvents}
        saving={eventsBusy}
        ok={eventsOk}
        tt={tt}
      />

      {/* 6. Penalty shootout takers — only shown when a shootout was recorded */}
      {hasPen && (
        <EventSection
          title={tt('ضاربو الجزاء', 'Penalty takers')}
          icon="🎯"
          events={events}
          types={['penalty_scored', 'penalty_missed']}
          m={m}
          rosters={rosters}
          lineups={lineups}
          onAdd={addEv}
          onRemove={removeEv}
          onSave={saveEvents}
          saving={eventsBusy}
          ok={eventsOk}
          tt={tt}
        />
      )}

      {/* 7. Substitutions */}
      <EventSection
        title={tt('التبديلات', 'Substitutions')}
        icon="🔁"
        events={events}
        types={['substitution_in', 'substitution_out']}
        m={m}
        rosters={rosters}
        lineups={lineups}
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

function GoalSection({ events, m, rosters, lineups, onAdd, onRemove, onSave, saving, ok, tt }: {
  events: TMatchEvent[]; m: TMatch; rosters: Record<number, TCompPlayer[]>; lineups: TLineup[];
  onAdd: (ev: Omit<TMatchEvent, 'id' | 'match_id' | 'related_event_id'>) => void;
  onRemove: (id: number) => void;
  onSave: () => void; saving: boolean; ok: boolean;
  tt: (ar: string, en: string) => string;
}) {
  const goalEvs  = events.filter(e => e.event_type === 'goal');
  const assistEvs = events.filter(e => e.event_type === 'assist');

  const [evTeam,   setEvTeam]   = useState(String(m.home_team_id));
  const [evScorer, setEvScorer] = useState('');
  const [evAssist, setEvAssist] = useState('');
  const [evMinute, setEvMinute] = useState('');
  const [isOwnGoal, setIsOwnGoal] = useState(false);
  const [isPenalty, setIsPenalty] = useState(false);
  const [isGoalET,  setIsGoalET]  = useState(false);

  const teamId = Number(evTeam);
  const lineupSlots = lineups.find(l => l.team_id === teamId)?.slots.filter(s => s.player_id != null) ?? [];
  const roster = lineupSlots.length > 0
    ? lineupSlots.map(s => ({ player_id: s.player_id!, player_name: s.player_name }))
    : (rosters[teamId] ?? []).map(p => ({ player_id: p.player_id, player_name: p.player_name }));

  const add = () => {
    if (!evScorer) return;
    const scorer   = roster.find(p => String(p.player_id) === evScorer);
    const assister = evAssist && !isOwnGoal ? roster.find(p => String(p.player_id) === evAssist) : null;
    const minute   = evMinute ? Number(evMinute) : null;
    // Own goal: credit the opposing team.
    const creditTeam = isOwnGoal
      ? (Number(evTeam) === m.home_team_id ? m.away_team_id : m.home_team_id)
      : Number(evTeam);
    onAdd({ event_type: 'goal', team_id: creditTeam,
      player_id: scorer?.player_id ?? null, player_name: scorer?.player_name ?? evScorer, minute,
      is_extra_time: isGoalET, is_own_goal: isOwnGoal, is_penalty: isPenalty,
      kick_order: null, is_winning_kick: false });
    if (assister) {
      onAdd({ event_type: 'assist', team_id: Number(evTeam),
        player_id: assister.player_id, player_name: assister.player_name ?? '', minute,
        is_extra_time: isGoalET, is_own_goal: false, is_penalty: false,
        kick_order: null, is_winning_kick: false });
    }
    setEvScorer(''); setEvAssist(''); setEvMinute('');
    setIsOwnGoal(false); setIsPenalty(false); setIsGoalET(false);
  };

  return (
    <Card className="p-4 space-y-3">
      <p className="font-black text-text text-sm border-b border-bdr/50 pb-2">⚽ {tt('الأهداف', 'Goals')}</p>

      {goalEvs.length > 0 && (
        <div className="space-y-1">
          {goalEvs.map(g => {
            const assist = assistEvs.find(a => a.team_id === g.team_id && a.minute === g.minute);
            return (
              <div key={g.id} className="bg-darkBg/60 border border-bdr rounded-lg px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚽</span>
                  <span className="text-text text-xs flex-1 font-bold">{g.player_name}</span>
                  <div className="flex items-center gap-1">
                    {g.is_own_goal && <span className="text-[9px] font-bold text-loss bg-loss/10 rounded px-1">OG</span>}
                    {g.is_penalty && <span className="text-[9px] font-bold text-gold bg-gold/10 rounded px-1">{tt('جزاء', 'Pen')}</span>}
                    {g.is_extra_time && <span className="text-[9px] font-bold text-teal bg-teal/10 rounded px-1">{tt('و.إ', 'ET')}</span>}
                  </div>
                  <span className="text-[11px] text-hint tabular-nums">
                    {g.team_id === m.home_team_id ? m.home_team_name?.slice(0, 10) : m.away_team_name?.slice(0, 10)}
                    {g.minute != null && ` · ${g.minute}'`}
                  </span>
                  <button onClick={() => { onRemove(g.id); if (assist) onRemove(assist.id); }}
                    className="text-hint hover:text-loss text-xs shrink-0">✕</button>
                </div>
                {assist && (
                  <p className="text-[11px] text-teal ps-7 mt-0.5">🅰️ {tt('صناعة', 'Assist')}: {assist.player_name}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-bdr/50 pt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label={tt('الفريق', 'Team')}>
            <select value={evTeam} onChange={e => { setEvTeam(e.target.value); setEvScorer(''); setEvAssist(''); }} className={inputCls}>
              <option value={m.home_team_id}>{m.home_team_name}</option>
              <option value={m.away_team_id}>{m.away_team_name}</option>
            </select>
          </Field>
          <Field label={tt('الدقيقة', 'Minute')}>
            <input type="number" value={evMinute} onChange={e => setEvMinute(e.target.value)}
              min={1} max={120} placeholder="45" className={inputCls} />
          </Field>
          <Field label={tt('صاحب الهدف', 'Goal scorer')}>
            <select value={evScorer} onChange={e => setEvScorer(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {roster.map(p => <option key={p.player_id} value={String(p.player_id)}>{p.player_name}</option>)}
            </select>
          </Field>
          <Field label={tt('صانع الهدف', 'Assist')}>
            <select value={evAssist} onChange={e => setEvAssist(e.target.value)} className={inputCls}>
              <option value="">{tt('لا صناعة', 'None')}</option>
              {roster.filter(p => String(p.player_id) !== evScorer).map(p =>
                <option key={p.player_id} value={String(p.player_id)}>{p.player_name}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-[11px] text-teal font-bold cursor-pointer">
            <input type="checkbox" checked={isOwnGoal} onChange={e => setIsOwnGoal(e.target.checked)} />
            {tt('هدف في مرماه', 'Own goal')}
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-teal font-bold cursor-pointer">
            <input type="checkbox" checked={isPenalty} onChange={e => setIsPenalty(e.target.checked)} />
            {tt('ركلة جزاء (خلال المباراة)', 'Penalty (in play)')}
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-teal font-bold cursor-pointer">
            <input type="checkbox" checked={isGoalET} onChange={e => setIsGoalET(e.target.checked)} />
            {tt('في الوقت الإضافي', 'Extra time')}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={add} disabled={!evScorer}
            className="flex-1 border border-aqua/40 text-aqua text-xs font-bold rounded-lg py-2 hover:bg-aqua/10 disabled:opacity-40">
            + {tt('إضافة الهدف', 'Add goal')}
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

function EventSection({ title, icon, events, types, m, rosters, lineups, onAdd, onRemove, onSave, saving, ok, tt }: {
  title: string; icon: string;
  events: TMatchEvent[]; types: EvType[];
  m: TMatch; rosters: Record<number, TCompPlayer[]>; lineups: TLineup[];
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
  const [isEvET, setIsEvET] = useState(false);
  // Penalty-shootout fields (only used when types includes penalty_scored/missed).
  const isPenSection = types.includes('penalty_scored' as EvType);
  const [kickOrder, setKickOrder] = useState('');
  const [isWinningKick, setIsWinningKick] = useState(false);

  const teamId = Number(evTeam);
  const lineupSlots = lineups.find(l => l.team_id === teamId)?.slots.filter(s => s.player_id != null) ?? [];
  const roster = lineupSlots.length > 0
    ? lineupSlots.map(s => ({ player_id: s.player_id!, player_name: s.player_name }))
    : (rosters[teamId] ?? []).map(p => ({ player_id: p.player_id, player_name: p.player_name }));

  const add = () => {
    if (!evPlayer) return;
    const player = roster.find(p => String(p.player_id) === evPlayer);
    onAdd({
      event_type: evType as EvType,
      team_id: Number(evTeam),
      player_id: player?.player_id ?? null,
      player_name: player?.player_name ?? evPlayer,
      minute: evMinute ? Number(evMinute) : null,
      is_extra_time: isEvET,
      is_own_goal: false,
      is_penalty: false,
      kick_order: isPenSection && kickOrder ? Number(kickOrder) : null,
      is_winning_kick: isPenSection ? isWinningKick : false,
    });
    setEvPlayer(''); setEvMinute(''); setIsEvET(false);
    if (isPenSection) { setKickOrder(''); setIsWinningKick(false); }
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
              <div className="flex items-center gap-1">
                {e.is_extra_time && <span className="text-[9px] font-bold text-teal bg-teal/10 rounded px-1">{tt('و.إ', 'ET')}</span>}
                {e.kick_order != null && <span className="text-[9px] text-hint">#{e.kick_order}</span>}
                {e.is_winning_kick && <span className="text-[9px] text-gold">★</span>}
              </div>
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
              {types.map(t => {
                const [ar, en] = EV_LABEL_AR[t] ?? [t, t];
                return <option key={t} value={t}>{EV_ICON[t]} {tt(ar, en)}</option>;
              })}
            </select>
          </Field>
          <Field label={tt('الفريق', 'Team')}>
            <select value={evTeam} onChange={e => { setEvTeam(e.target.value); setEvPlayer(''); }} className={inputCls}>
              <option value={m.home_team_id}>{m.home_team_name}</option>
              <option value={m.away_team_id}>{m.away_team_name}</option>
            </select>
          </Field>
          <Field label={tt('اللاعب', 'Player')}>
            <select value={evPlayer} onChange={e => setEvPlayer(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {roster.map(p => <option key={p.player_id} value={String(p.player_id)}>{p.player_name}</option>)}
            </select>
          </Field>
          <Field label={tt("الدقيقة", "Minute")}>
            <input type="number" value={evMinute} onChange={e => setEvMinute(e.target.value)} min={1} max={120} placeholder="45" className={inputCls} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-[11px] text-teal font-bold cursor-pointer">
            <input type="checkbox" checked={isEvET} onChange={e => setIsEvET(e.target.checked)} />
            {tt('في الوقت الإضافي', 'Extra time')}
          </label>
          {isPenSection && (
            <label className="flex items-center gap-1.5 text-[11px] text-gold font-bold cursor-pointer">
              <input type="checkbox" checked={isWinningKick} onChange={e => setIsWinningKick(e.target.checked)} />
              {tt('الضربة الحاسمة', 'Winning kick')}
            </label>
          )}
        </div>
        {isPenSection && (
          <Field label={tt('ترتيب الضربة', 'Kick order')}>
            <input type="number" value={kickOrder} onChange={e => setKickOrder(e.target.value)}
              min={1} max={20} placeholder="1" className={inputCls} />
          </Field>
        )}
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

  const finished = m.status === 'completed' || m.status === 'finished';
  const live = m.status === 'live';
  const postponed = m.status === 'postponed';
  const cancelled = m.status === 'cancelled';
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
              <>
              <div className="flex items-baseline gap-2 font-extrabold tnum">
                {(() => { const s = matchScoreLabel(m); return (<>
                  <span className="text-5xl text-text" style={{ textShadow: '0 0 30px rgb(var(--accent-rgb)/0.3)' }}>{s.home}</span>
                  <span className="text-2xl text-hint">-</span>
                  <span className="text-5xl text-text">{s.away}</span>
                </>); })()}
              </div>
              {m.home_score_pen != null && (
                <span className="text-[11px] font-bold text-gold tabular-nums">
                  {tt(`${m.home_score_et}-${m.away_score_et} بعد الوقت الإضافي · ضربات الجزاء`,
                      `${m.home_score_et}-${m.away_score_et} a.e.t. · on penalties`)}
                </span>
              )}
              {m.home_score_et != null && m.home_score_pen == null && (
                <span className="text-[11px] font-bold text-teal tabular-nums">
                  {tt(`${m.home_score}-${m.away_score} في الوقت الأصلي · بعد وقت إضافي`,
                      `${m.home_score}-${m.away_score} FT · a.e.t.`)}
                </span>
              )}
              </>
            ) : (
              <span className="text-aqua font-extrabold text-2xl tnum">{m.time || '--:--'}</span>
            )}
            <span className={`mt-1 text-[11px] font-bold px-3 py-0.5 rounded-full ${live ? 'bg-loss/20 text-loss' : finished ? 'bg-win/15 text-win border border-win/30' : postponed ? 'bg-gold/15 text-gold' : cancelled ? 'bg-loss/15 text-loss' : 'bg-cardBg2 text-hint'}`}>
              {live ? tt('● مباشرة', '● LIVE') : finished ? tt('انتهت', 'FT') : postponed ? tt('مؤجلة', 'Postponed') : cancelled ? tt('ملغاة', 'Cancelled') : (m.date ?? tt('مجدولة', 'TBD'))}
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
