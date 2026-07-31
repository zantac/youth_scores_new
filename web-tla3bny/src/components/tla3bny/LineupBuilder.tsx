'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  tMatch, tMatchLineups, tSaveLineup, tEligibleLineupPlayers,
  type TMatch, type TEligiblePlayer,
} from '@/lib/tla3bnyApi';
import { FORMATIONS, FORMATION_NAMES, slotBase } from '@/lib/tla3bnyFormations';
import Spinner from '@/components/ui/Spinner';
import PitchView, { type SlotView } from './PitchView';
import { Card, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT } from './kit';

type PickerTarget = { kind: 'starters' } | { kind: 'subs' } | { kind: 'slot'; slot: string };

export default function LineupBuilder({
  token, matchId, teamId, onSaved,
}: {
  token: string; matchId: number; teamId: number; onSaved?: () => void;
}) {
  const tt = useTT();
  const [match, setMatch] = useState<TMatch | null>(null);
  const [players, setPlayers] = useState<TEligiblePlayer[]>([]);

  // Step 1: plain player selection (no positions).
  const [starters, setStarters] = useState<number[]>([]);
  const [subs, setSubs] = useState<number[]>([]);

  // Step 2: optional position assignment on the pitch.
  const [step, setStep] = useState<1 | 2>(1);
  const [formation, setFormation] = useState('4-3-3');
  const [assign, setAssign] = useState<Record<string, number>>({});  // slot → playerId

  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const m = await tMatch(matchId);
        if (!alive) return;
        setMatch(m);
        const eligible = await tEligibleLineupPlayers(matchId, teamId).catch(() => []);
        if (!alive) return;
        setPlayers(eligible);
        const lineups = await tMatchLineups(matchId).catch(() => []);
        if (!alive) return;
        const mine = lineups.find(l => l.team_id === teamId);
        const playersOnPitch = m.rules?.players_on_pitch ?? 11;
        const validForms = FORMATION_NAMES.filter(f => FORMATIONS[f].length === playersOnPitch);
        const defaultForm = validForms[0] ?? FORMATION_NAMES[0];
        if (mine) {
          const savedForm = mine.formation && FORMATIONS[mine.formation] ? mine.formation : defaultForm;
          setFormation(savedForm);
          const a: Record<string, number> = {};
          const st: number[] = [];
          const s: number[] = [];
          for (const slot of mine.slots) {
            if (slot.player_id == null) continue;
            if (slot.is_substitute) {
              s.push(slot.player_id);
            } else if (slot.position_slot) {
              a[slot.position_slot] = slot.player_id;
              st.push(slot.player_id);
            } else {
              st.push(slot.player_id);  // unpositioned starter
            }
          }
          setAssign(a);
          setStarters(st);
          setSubs(s);
          // If position assignments exist, restore step 2 view.
          if (Object.keys(a).length > 0) setStep(2);
        } else {
          setFormation(defaultForm);
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [matchId, teamId]);

  const playerById = useCallback((id: number) => players.find(p => p.player_id === id), [players]);

  // IDs already used in some capacity (for mutual-exclusivity checks).
  const allSelectedIds = useMemo(() => new Set<number>([...starters, ...subs]), [starters, subs]);

  // ── formation (step 2) helpers ──────────────────────────────────────────────

  const filled: Record<string, SlotView> = {};
  for (const [slot, pid] of Object.entries(assign)) {
    const p = playerById(pid);
    if (p) filled[slot] = { playerId: p.player_id, playerName: p.player_name, photoPath: p.photo_path };
  }

  const changeFormation = (f: string) => {
    const oldOrder = FORMATIONS[formation] ?? [];
    setFormation(f);
    setAssign(prev => {
      const newOrder = FORMATIONS[f] ?? [];
      const next: Record<string, number> = {};
      const keptPids = new Set<number>();
      for (const [slot, pid] of Object.entries(prev)) {
        if (newOrder.includes(slot)) { next[slot] = pid; keptPids.add(pid); }
      }
      const leftover = oldOrder
        .filter(slot => prev[slot] != null && !keptPids.has(prev[slot]))
        .map(slot => prev[slot]);
      const emptySlots = newOrder.filter(slot => !(slot in next));
      for (let i = 0; i < Math.min(emptySlots.length, leftover.length); i++) {
        next[emptySlots[i]] = leftover[i];
      }
      return next;
    });
  };

  // Picker handler — unified for starters, subs, and slot pickers.
  const pick = (playerId: number | null) => {
    if (!picker) return;
    if (picker.kind === 'starters') {
      if (playerId != null) {
        // Remove from subs if there, then toggle in starters. Keep picker open.
        setSubs(s => s.filter(id => id !== playerId));
        setStarters(s => s.includes(playerId) ? s.filter(id => id !== playerId) : [...s, playerId]);
        // Also remove from assign if de-selected.
        setAssign(a => {
          if (s => s.includes(playerId)) {
            const n = { ...a };
            for (const k of Object.keys(n)) if (n[k] === playerId) delete n[k];
            return n;
          }
          return a;
        });
      }
    } else if (picker.kind === 'subs') {
      if (playerId != null) {
        // Remove from starters if there, then toggle in subs. Keep picker open.
        setStarters(s => s.filter(id => id !== playerId));
        setAssign(a => { const n = { ...a }; for (const k of Object.keys(n)) if (n[k] === playerId) delete n[k]; return n; });
        setSubs(s => s.includes(playerId) ? s.filter(id => id !== playerId) : [...s, playerId]);
      }
    } else if (picker.kind === 'slot') {
      const slot = picker.slot;
      setAssign(a => {
        const n = { ...a };
        if (playerId != null) for (const k of Object.keys(n)) if (n[k] === playerId) delete n[k];
        if (playerId == null) delete n[slot]; else n[slot] = playerId;
        return n;
      });
      setPicker(null);
    }
  };

  // Fix the closure bug in pick for starters toggle.
  const toggleStarter = (playerId: number) => {
    setSubs(s => s.filter(id => id !== playerId));
    setStarters(prev => {
      if (prev.includes(playerId)) {
        // De-selecting: also remove from assign.
        setAssign(a => { const n = { ...a }; for (const k of Object.keys(n)) if (n[k] === playerId) delete n[k]; return n; });
        return prev.filter(id => id !== playerId);
      }
      return [...prev, playerId];
    });
  };

  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try {
      const assignedPids = new Set(Object.values(assign));
      const slots = [
        // Positioned starters from step 2.
        ...Object.entries(assign).map(([slot, pid]) => ({ position_slot: slot, player_id: pid, is_substitute: false })),
        // Starters selected in step 1 but not assigned a position.
        ...starters.filter(pid => !assignedPids.has(pid)).map(pid => ({ position_slot: null as string | null, player_id: pid, is_substitute: false })),
        ...subs.map(pid => ({ position_slot: null as string | null, player_id: pid, is_substitute: true })),
      ];
      await tSaveLineup(token, matchId, teamId, {
        formation: Object.keys(assign).length > 0 ? formation : null,
        slots,
      });
      setSaved(true);
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const subMatch = msg.match(/Too many substitutes \(max (\d+)\)/);
      const sizeMatch = msg.match(/Lineup too large \(max (\d+)\)/);
      const starterMatch = msg.match(/Too many starters \(max (\d+)\)/);
      if (subMatch) setErr(tt(`عدد البدلاء يتجاوز الحد المسموح (الحد الأقصى ${subMatch[1]})`, msg));
      else if (starterMatch) setErr(tt(`عدد الأساسيين يتجاوز الحد المسموح (الحد الأقصى ${starterMatch[1]})`, msg));
      else if (sizeMatch) setErr(tt(`التشكيلة كبيرة جدًا (الحد الأقصى ${sizeMatch[1]} لاعبًا)`, msg));
      else setErr(msg);
    } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  if (!match) return <EmptyState icon="🔍" text={tt('المباراة غير موجودة', 'Match not found')} />;

  const teamName = teamId === match.home_team_id ? match.home_team_name : match.away_team_name;
  const rules = match.rules;
  const playersOnPitch = rules?.players_on_pitch ?? 11;
  const maxSubs = rules?.max_substitutes ?? null;
  const formationRequired = rules?.formation_required ?? false;
  const oldestBirthYear = rules?.oldest_birth_year ?? null;
  const validFormations = FORMATION_NAMES.filter(f => FORMATIONS[f].length === playersOnPitch);

  const startersOverLimit = starters.length > playersOnPitch;
  const subsOverLimit = maxSubs != null && subs.length > maxSubs;
  const step1Complete = starters.length === playersOnPitch && !subsOverLimit;
  const canSaveStep1 = !formationRequired && starters.length > 0;

  // Players available for slot assignment in step 2 (only from selected starters).
  const starterPoolIds = new Set(starters);
  const slotUsedIds = useMemo(() => new Set<number>([...Object.values(assign), ...subs]), [assign, subs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-black text-text flex-1">{tt('التشكيلة', 'Lineup')} · {teamName}</h2>
        {/* Step indicator */}
        <div className="flex items-center gap-1 text-[11px] font-bold">
          <span className={`px-2 py-0.5 rounded-full border ${step === 1 ? 'bg-aqua text-on-accent border-aqua' : 'text-hint border-bdr'}`}>
            {tt('١ · الاختيار', '1 · Select')}
          </span>
          <span className="text-hint">›</span>
          <span className={`px-2 py-0.5 rounded-full border ${step === 2 ? 'bg-aqua text-on-accent border-aqua' : 'text-hint border-bdr'}`}>
            {tt('٢ · الخطة', '2 · Formation')}
            {formationRequired && <span className="text-loss"> *</span>}
          </span>
        </div>
      </div>

      {rules && (
        <p className="text-[11px] text-hint">
          {tt(
            `أساسيون: ${rules.players_on_pitch} · بدلاء: حتى ${rules.max_substitutes} · إجمالي: ${rules.lineup_size}`,
            `Starters: ${rules.players_on_pitch} · Subs: up to ${rules.max_substitutes} · Total: ${rules.lineup_size}`,
          )}
          {formationRequired && <span className="text-loss"> · {tt('الخطة مطلوبة', 'Formation required')}</span>}
        </p>
      )}

      {players.length === 0 && (
        <Card className="p-4">
          <p className="text-sm text-hint">
            {tt('لا يوجد لاعبون معتمدون لهذا الفريق في هذه البطولة.',
              'This team has no approved players in this competition.')}
          </p>
        </Card>
      )}

      {/* ── Step 1: player selection ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Starters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-text">{tt('الأساسيون', 'Starters')}</h3>
                <span className={`text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full border ${
                  startersOverLimit
                    ? 'text-loss bg-loss/10 border-loss/30'
                    : starters.length === playersOnPitch
                      ? 'text-win bg-win/10 border-win/30'
                      : 'text-hint bg-cardBg2 border-bdr'
                }`}>
                  {starters.length} / {playersOnPitch}
                </span>
              </div>
              <button onClick={() => setPicker({ kind: 'starters' })} disabled={players.length === 0}
                className="text-xs font-bold text-aqua hover:underline disabled:opacity-40">
                + {tt('اختيار', 'Select')}
              </button>
            </div>
            {startersOverLimit && (
              <p className="text-[11px] font-bold text-loss mb-2">
                ⚠ {tt(`عدد الأساسيين يتجاوز الحد المسموح — الحد الأقصى ${playersOnPitch}`, `Too many starters — max is ${playersOnPitch}`)}
              </p>
            )}
            {starters.length === 0 ? (
              <p className="text-xs text-hint">{tt('لا يوجد أساسيون', 'No starters selected')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {starters.map(id => {
                  const p = playerById(id);
                  return (
                    <span key={id} className="flex items-center gap-1.5 bg-cardBg2 border border-bdr rounded-full ps-1 pe-2 py-0.5">
                      <LogoAvatar src={p?.photo_path} name={p?.player_name} size={22} />
                      <span className="text-xs font-bold text-text">{p?.player_name}</span>
                      <button onClick={() => toggleStarter(id)} className="text-hint hover:text-loss text-sm leading-none">×</button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Substitutes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-text">{tt('البدلاء', 'Substitutes')}</h3>
                {maxSubs != null && (
                  <span className={`text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full border ${
                    subsOverLimit
                      ? 'text-loss bg-loss/10 border-loss/30'
                      : subs.length === maxSubs
                        ? 'text-win bg-win/10 border-win/30'
                        : 'text-hint bg-cardBg2 border-bdr'
                  }`}>
                    {subs.length} / {maxSubs}
                  </span>
                )}
              </div>
              <button onClick={() => setPicker({ kind: 'subs' })} disabled={players.length === 0}
                className="text-xs font-bold text-aqua hover:underline disabled:opacity-40">
                + {tt('إضافة', 'Add')}
              </button>
            </div>
            {subsOverLimit && (
              <p className="text-[11px] font-bold text-loss mb-2">
                ⚠ {tt(`تجاوزت الحد المسموح — أقصى عدد للبدلاء ${maxSubs}`, `Too many substitutes — max allowed is ${maxSubs}`)}
              </p>
            )}
            {subs.length === 0 ? (
              <p className="text-xs text-hint">{tt('لا يوجد بدلاء', 'No substitutes selected')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {subs.map(id => {
                  const p = playerById(id);
                  return (
                    <span key={id} className="flex items-center gap-1.5 bg-cardBg2 border border-bdr rounded-full ps-1 pe-2 py-0.5">
                      <LogoAvatar src={p?.photo_path} name={p?.player_name} size={22} />
                      <span className="text-xs font-bold text-text">{p?.player_name}</span>
                      <button onClick={() => setSubs(s => s.filter(x => x !== id))} className="text-hint hover:text-loss text-sm leading-none">×</button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <ErrorNote>{err}</ErrorNote>
          <div className="flex items-center gap-3 flex-wrap">
            {canSaveStep1 && (
              <PrimaryButton onClick={save} disabled={busy || startersOverLimit || subsOverLimit}>
                {busy ? tt('جارٍ الحفظ…', 'Saving…') : tt('حفظ بدون خطة', 'Save without formation')}
              </PrimaryButton>
            )}
            <button
              onClick={() => setStep(2)}
              disabled={starters.length === 0}
              className={`px-4 py-2 rounded-xl text-sm font-extrabold border transition-colors disabled:opacity-40 ${
                formationRequired
                  ? 'bg-gradient-to-l from-aqua to-aqua/85 text-on-accent border-aqua'
                  : 'bg-cardBg2 border-bdr text-text hover:border-aqua'
              }`}>
              {formationRequired
                ? tt('التالي: الخطة ←', 'Next: Formation →')
                : tt('إضافة خطة (اختياري) ←', 'Add formation (optional) →')}
            </button>
            {saved && <span className="text-win text-sm font-bold">✓ {tt('تم الحفظ', 'Saved')}</span>}
          </div>
        </div>
      )}

      {/* ── Step 2: formation / position assignment ──────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <button onClick={() => setStep(1)} className="text-sm text-hint hover:text-aqua">
            ← {tt('رجوع للاختيار', 'Back to selection')}
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-bold text-teal">{tt('الخطة', 'Formation')}</label>
            <select value={formation} onChange={e => changeFormation(e.target.value)}
              className="bg-darkBg border border-bdr rounded-xl px-3 py-2 text-text text-sm outline-none focus:border-aqua">
              {validFormations.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            {validFormations.length === 0 && (
              <span className="text-loss text-[11px]">
                {tt(`لا خطط لـ ${playersOnPitch} لاعبين`, `No formations for ${playersOnPitch} players`)}
              </span>
            )}
            <span className="text-[11px] text-hint">{tt('اضغط على مركز لاختيار لاعب', 'Tap a position to assign')}</span>
          </div>

          <div className="max-w-md mx-auto w-full">
            <PitchView formation={formation} filled={filled} onTapSlot={s => setPicker({ kind: 'slot', slot: s })} />
          </div>

          {/* Unassigned starters pool */}
          {(() => {
            const assignedPids = new Set(Object.values(assign));
            const unassigned = starters.filter(id => !assignedPids.has(id));
            if (unassigned.length === 0) return null;
            return (
              <div>
                <p className="text-[11px] font-bold text-teal mb-1.5">
                  {tt('لم يُعيَّن لهم مركز بعد — اضغط على مركز في الملعب', 'Not yet placed — tap a position on the pitch')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {unassigned.map(id => {
                    const p = playerById(id);
                    return (
                      <span key={id} className="flex items-center gap-1.5 bg-cardBg2 border border-bdr rounded-full ps-1 pe-2 py-0.5 opacity-70">
                        <LogoAvatar src={p?.photo_path} name={p?.player_name} size={20} />
                        <span className="text-xs font-bold text-text">{p?.player_name}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <ErrorNote>{err}</ErrorNote>
          <div className="flex items-center gap-3 flex-wrap">
            <PrimaryButton onClick={save} disabled={busy || startersOverLimit || subsOverLimit}>
              {busy ? tt('جارٍ الحفظ…', 'Saving…') : tt('حفظ التشكيلة', 'Save lineup')}
            </PrimaryButton>
            {saved && <span className="text-win text-sm font-bold">✓ {tt('تم الحفظ', 'Saved')}</span>}
          </div>
        </div>
      )}

      {/* ── Player picker sheet ──────────────────────────────────────────── */}
      {picker && (
        <PlayerPicker
          players={players}
          usedIds={
            picker.kind === 'starters' ? new Set(subs) :
            picker.kind === 'subs' ? new Set(starters) :
            slotUsedIds
          }
          starterPoolIds={picker.kind === 'slot' ? starterPoolIds : undefined}
          selectedIds={
            picker.kind === 'starters' ? new Set(starters) :
            picker.kind === 'subs' ? new Set(subs) :
            undefined
          }
          multiSelect={picker.kind !== 'slot'}
          maxSelect={
            picker.kind === 'starters' ? playersOnPitch :
            picker.kind === 'subs' ? (maxSubs ?? undefined) :
            undefined
          }
          currentId={picker.kind === 'slot' ? assign[picker.slot] : undefined}
          slotHint={picker.kind === 'slot' ? slotBase(picker.slot) : null}
          oldestBirthYear={oldestBirthYear}
          title={
            picker.kind === 'starters' ? tt('اختر الأساسيين', 'Select starters') :
            picker.kind === 'subs' ? tt('اختر البدلاء', 'Select substitutes') :
            tt(`اختر لاعبًا لـ ${picker.kind === 'slot' ? picker.slot : ''}`,
               `Select for ${picker.kind === 'slot' ? picker.slot : ''}`)
          }
          onPick={picker.kind === 'starters'
            ? (id) => { if (id != null) toggleStarter(id); }
            : pick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function PlayerPicker({
  players, usedIds, starterPoolIds, selectedIds, multiSelect, maxSelect,
  currentId, slotHint, oldestBirthYear, title, onPick, onClose,
}: {
  players: TEligiblePlayer[];
  usedIds: Set<number>;
  starterPoolIds?: Set<number>;
  selectedIds?: Set<number>;
  multiSelect?: boolean;
  maxSelect?: number;
  currentId?: number;
  slotHint: string | null;
  oldestBirthYear: number | null;
  title: string;
  onPick: (id: number | null) => void;
  onClose: () => void;
}) {
  const tt = useTT();
  const sorted = useMemo(() => {
    const score = (p: TEligiblePlayer) => {
      if (!slotHint) return p.guest ? 1 : 0;
      const sp = (p.position ?? '').toUpperCase();
      const posMatch = slotHint === 'GK' ? sp === 'GK' : sp.startsWith(slotHint);
      return (p.guest ? 2 : 0) + (posMatch ? 0 : 1);
    };
    return [...players].sort((a, b) => score(a) - score(b));
  }, [players, slotHint]);

  const isOverAge = (p: TEligiblePlayer): boolean => {
    if (!oldestBirthYear || !p.dob) return false;
    return new Date(p.dob).getFullYear() < oldestBirthYear;
  };

  const selectedCount = selectedIds?.size ?? 0;
  const overLimit = maxSelect != null && selectedCount > maxSelect;
  const atLimit = maxSelect != null && selectedCount === maxSelect;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-end sm:items-center justify-center"
      onClick={overLimit && multiSelect ? undefined : onClose}>
      <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[75vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cardBg/95 backdrop-blur border-b border-bdr">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-black text-text text-sm truncate">{title}</span>
              {multiSelect && maxSelect != null && (
                <span className={`shrink-0 text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full border ${
                  overLimit ? 'text-loss bg-loss/10 border-loss/30'
                    : atLimit ? 'text-win bg-win/10 border-win/30'
                    : 'text-hint bg-cardBg2 border-bdr'
                }`}>
                  {selectedCount} / {maxSelect}
                </span>
              )}
            </div>
            {multiSelect ? (
              <button onClick={onClose} disabled={overLimit}
                className="shrink-0 text-xs font-extrabold text-on-accent bg-gradient-to-l from-aqua to-aqua/85 px-4 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
                {tt('تم', 'Done')}
              </button>
            ) : (
              <button onClick={onClose} className="text-hint hover:text-loss text-xl leading-none">×</button>
            )}
          </div>
          {multiSelect && overLimit && (
            <div className="px-4 py-2 bg-loss/10 border-t border-loss/20 text-[11px] font-bold text-loss">
              ⚠ {tt(`تجاوزت الحد المسموح — الحد الأقصى ${maxSelect}`, `Limit exceeded — max is ${maxSelect}`)}
            </div>
          )}
        </div>
        <div className="p-2">
          {currentId != null && !multiSelect && (
            <button onClick={() => onPick(null)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-loss hover:bg-loss/10 text-sm font-bold">
              ⊘ {tt('إخلاء المركز', 'Clear slot')}
            </button>
          )}
          {sorted.map(p => {
            // For slot picker: only starters from step 1 are eligible.
            const notInPool = starterPoolIds != null && !starterPoolIds.has(p.player_id);
            const isSelected = selectedIds?.has(p.player_id) ?? (p.player_id === currentId);
            // "used" means taken by the OTHER group (can't be starter AND sub).
            const used = usedIds.has(p.player_id) && !isSelected;
            const overAge = isOverAge(p);
            return (
              <button key={p.player_id}
                disabled={used || notInPool}
                onClick={() => onPick(p.player_id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-start transition-colors ${
                  used || notInPool ? 'opacity-30 cursor-default' :
                  isSelected ? 'bg-aqua/10 hover:bg-aqua/15' :
                  overAge ? 'hover:bg-gold/5' : 'hover:bg-cardBg2'
                }`}>
                <LogoAvatar src={p.photo_path} name={p.player_name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className={`font-bold text-sm truncate ${isSelected ? 'text-aqua' : 'text-text'}`}>
                    {p.player_name}
                  </div>
                  <div className="text-[11px] text-hint truncate">
                    {[
                      p.position,
                      p.dob ? new Date(p.dob).getFullYear() : null,
                      p.guest ? `↑ ${p.guest_team ?? tt('فريق أصغر', 'younger team')}` : null,
                      used ? tt('مختار في المجموعة الأخرى', 'selected in other group') : null,
                      notInPool ? tt('ليس من الأساسيين المختارين', 'not in selected starters') : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isSelected && <span className="text-lg font-black text-aqua">✓</span>}
                  {overAge && (
                    <span title={tt(`مواليد قبل ${oldestBirthYear}`, `Born before ${oldestBirthYear}`)}
                      className="text-[10px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-1.5 py-0.5">
                      ⚠ {tt('فوق السن', 'Over-age')}
                    </span>
                  )}
                  {p.guest && !used && !overAge && (
                    <span className="text-[10px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-1.5 py-0.5">{tt('ضيف', 'Guest')}</span>
                  )}
                  {p.guest && overAge && (
                    <span className="text-[10px] font-bold text-teal bg-teal/10 border border-teal/20 rounded-full px-1.5 py-0.5">{tt('ضيف', 'Guest')}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
