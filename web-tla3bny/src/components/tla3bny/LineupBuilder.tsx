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

interface Picker { slot: string | null; forSub: boolean }

export default function LineupBuilder({
  token, matchId, teamId, onSaved,
}: {
  token: string; matchId: number; teamId: number; onSaved?: () => void;
}) {
  const tt = useTT();
  const [match, setMatch] = useState<TMatch | null>(null);
  const [players, setPlayers] = useState<TEligiblePlayer[]>([]);
  const [formation, setFormation] = useState('4-3-3');
  const [assign, setAssign] = useState<Record<string, number>>({});
  const [subs, setSubs] = useState<number[]>([]);
  const [picker, setPicker] = useState<Picker | null>(null);
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
        // Pick a default formation that matches the competition's player count.
        const playersOnPitch = m.rules?.players_on_pitch ?? 11;
        const validForms = FORMATION_NAMES.filter(f => FORMATIONS[f].length === playersOnPitch);
        const defaultForm = validForms[0] ?? FORMATION_NAMES[0];
        if (mine) {
          const savedForm = mine.formation && FORMATIONS[mine.formation] ? mine.formation : defaultForm;
          setFormation(savedForm);
          const a: Record<string, number> = {};
          const s: number[] = [];
          for (const slot of mine.slots) {
            if (slot.player_id == null) continue;
            if (slot.is_substitute) s.push(slot.player_id);
            else if (slot.position_slot) a[slot.position_slot] = slot.player_id;
          }
          setAssign(a);
          setSubs(s);
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
  const usedIds = useMemo(() => new Set<number>([...Object.values(assign), ...subs]), [assign, subs]);

  const filled: Record<string, SlotView> = {};
  for (const [slot, pid] of Object.entries(assign)) {
    const p = playerById(pid);
    if (p) filled[slot] = { playerId: p.player_id, playerName: p.player_name, photoPath: p.photo_path };
  }

  const changeFormation = (f: string) => {
    setFormation(f);
    setAssign(prev => {
      const order = FORMATIONS[f] ?? [];
      const next: Record<string, number> = {};
      for (const [slot, pid] of Object.entries(prev)) if (order.includes(slot)) next[slot] = pid;
      return next;
    });
  };

  const pick = (playerId: number | null) => {
    if (!picker) return;
    if (picker.forSub) {
      if (playerId != null) {
        setAssign(a => { const n = { ...a }; for (const k of Object.keys(n)) if (n[k] === playerId) delete n[k]; return n; });
        setSubs(s => (s.includes(playerId) ? s : [...s, playerId]));
      }
    } else if (picker.slot) {
      const slot = picker.slot;
      setSubs(s => s.filter(id => id !== playerId));
      setAssign(a => {
        const n = { ...a };
        if (playerId != null) for (const k of Object.keys(n)) if (n[k] === playerId) delete n[k];
        if (playerId == null) delete n[slot]; else n[slot] = playerId;
        return n;
      });
    }
    setPicker(null);
  };

  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try {
      const slots = [
        ...Object.entries(assign).map(([slot, pid]) => ({ position_slot: slot, player_id: pid, is_substitute: false })),
        ...subs.map(pid => ({ position_slot: 'SUB', player_id: pid, is_substitute: true })),
      ];
      await tSaveLineup(token, matchId, teamId, { formation, slots });
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  if (!match) return <EmptyState icon="🔍" text={tt('المباراة غير موجودة', 'Match not found')} />;

  const teamName = teamId === match.home_team_id ? match.home_team_name : match.away_team_name;
  const currentPickId = picker && !picker.forSub && picker.slot ? assign[picker.slot] : undefined;
  const rules = match.rules;
  const playersOnPitch = rules?.players_on_pitch ?? 11;
  const oldestBirthYear = rules?.oldest_birth_year ?? null;
  const validFormations = FORMATION_NAMES.filter(f => FORMATIONS[f].length === playersOnPitch);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black text-text">{tt('التشكيلة', 'Lineup')} · {teamName}</h2>

      {rules && (
        <p className="text-[11px] text-hint">
          {tt(
            `أساسيون: ${rules.players_on_pitch} · بدلاء: حتى ${rules.max_substitutes} · إجمالي: ${rules.lineup_size}`,
            `Starters: ${rules.players_on_pitch} · Subs: up to ${rules.max_substitutes} · Total: ${rules.lineup_size}`,
          )}
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

      <div className="flex items-center gap-2">
        <label className="text-xs font-bold text-teal">{tt('الخطة', 'Formation')}</label>
        <select value={formation} onChange={e => changeFormation(e.target.value)}
          className="bg-darkBg border border-bdr rounded-xl px-3 py-2 text-text text-sm outline-none focus:border-aqua">
          {validFormations.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        {validFormations.length === 0 && (
          <span className="text-loss text-[11px]">{tt(`لا خطط لـ ${playersOnPitch} لاعبين`, `No formations for ${playersOnPitch} players`)}</span>
        )}
        <span className="text-[11px] text-hint">{tt('اضغط على مركز لاختيار لاعب', 'Tap a position to assign')}</span>
      </div>

      <div className="max-w-md mx-auto w-full">
        <PitchView formation={formation} filled={filled} onTapSlot={s => setPicker({ slot: s, forSub: false })} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-text">{tt('البدلاء', 'Substitutes')}</h3>
          <button onClick={() => setPicker({ slot: null, forSub: true })} disabled={players.length === 0}
            className="text-xs font-bold text-aqua hover:underline disabled:opacity-40">+ {tt('إضافة', 'Add')}</button>
        </div>
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
      <div className="flex items-center gap-3">
        <PrimaryButton onClick={save} disabled={busy || players.length === 0}>
          {busy ? tt('جارٍ الحفظ…', 'Saving…') : tt('حفظ التشكيلة', 'Save lineup')}
        </PrimaryButton>
        {saved && <span className="text-win text-sm font-bold">✓ {tt('تم الحفظ', 'Saved')}</span>}
      </div>

      {picker && (
        <PlayerPicker
          players={players}
          usedIds={usedIds}
          currentId={currentPickId}
          slotHint={picker.slot ? slotBase(picker.slot) : null}
          oldestBirthYear={oldestBirthYear}
          title={picker.forSub ? tt('إضافة بديل', 'Add substitute') : tt(`اختر لاعبًا لـ ${picker.slot}`, `Select for ${picker.slot}`)}
          onPick={pick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function PlayerPicker({
  players, usedIds, currentId, slotHint, oldestBirthYear, title, onPick, onClose,
}: {
  players: TEligiblePlayer[];
  usedIds: Set<number>;
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
    const birthYear = new Date(p.dob).getFullYear();
    return birthYear < oldestBirthYear;
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cardBg/95 backdrop-blur px-4 py-3 border-b border-bdr flex items-center justify-between">
          <span className="font-black text-text text-sm">{title}</span>
          <button onClick={onClose} className="text-hint hover:text-loss text-xl leading-none">×</button>
        </div>
        <div className="p-2">
          {currentId != null && (
            <button onClick={() => onPick(null)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-loss hover:bg-loss/10 text-sm font-bold">
              ⊘ {tt('إخلاء المركز', 'Clear slot')}
            </button>
          )}
          {sorted.map(p => {
            const used = usedIds.has(p.player_id) && p.player_id !== currentId;
            const overAge = isOverAge(p);
            return (
              <button key={p.player_id} disabled={used} onClick={() => onPick(p.player_id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-start ${used ? 'opacity-40' : overAge ? 'hover:bg-gold/5' : 'hover:bg-cardBg2'}`}>
                <LogoAvatar src={p.photo_path} name={p.player_name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text text-sm truncate">{p.player_name}</div>
                  <div className="text-[11px] text-hint truncate">
                    {[
                      p.position,
                      p.dob ? new Date(p.dob).getFullYear() : null,
                      p.guest ? `↑ ${p.guest_team ?? tt('فريق أصغر', 'younger team')}` : null,
                      used ? tt('مختار بالفعل', 'already selected') : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.player_id === currentId && <span className="text-aqua">✓</span>}
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
