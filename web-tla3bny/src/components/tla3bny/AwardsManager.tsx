'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  tCompTeams, tMatches, tCompetitionRounds, tCompetitionAwards, tTeamOfRoundAll,
  tGrantAward, tRevokeAward, tAwardSuggestions, tSaveTeamOfRound, tDeleteTeamOfRound,
  tCompetitionCoaches,
  TEAM_AWARD_TYPES, COACH_AWARD_TYPES,
  type TCompetition, type TCompTeam, type TMatch, type TAward, type TAwardType,
  type TTeamOfRound, type TAwardSuggestions, type TCoachPool,
} from '@/lib/tla3bnyApi';
import { formationRowLabels, FORMATIONS, FORMATION_NAMES } from '@/lib/tla3bnyFormations';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT, useName } from './kit';

const AWARD_META: Record<TAwardType, [string, string, string]> = {
  champion:        ['🏆', 'بطل', 'Champion'],
  runner_up:       ['🥈', 'وصيف', 'Runner-up'],
  third_place:     ['🥉', 'المركز الثالث', 'Third place'],
  top_scorer:      ['⚽', 'الهدّاف', 'Top scorer'],
  top_assister:    ['🅰️', 'صانع الألعاب', 'Top assister'],
  best_player:     ['⭐', 'أفضل لاعب', 'Best player'],
  best_goalkeeper: ['🧤', 'أفضل حارس', 'Best goalkeeper'],
  player_of_match: ['🎖️', 'رجل المباراة', 'Player of the match'],
  player_of_round: ['🌟', 'لاعب الجولة', 'Player of the round'],
  best_coach:      ['🎓', 'أفضل مدرب', 'Best coach'],
  coach_of_round:  ['📋', 'مدرب الجولة', 'Coach of the round'],
};
const ALL_TYPES = Object.keys(AWARD_META) as TAwardType[];

interface PoolPlayer { player_id: number; player_name: string | null; team_id: number | null; team_name: string | null }

/** Competition organizer's honours desk: grant titles & individual awards (with
 *  one-tap stat suggestions) and build each round's best XI. */
export default function AwardsManager({ token, comp }: { token: string; comp: TCompetition }) {
  const tt = useTT();
  const nm = useName();
  const ages = comp.ages ?? [];
  const [cageId, setCageId] = useState<number | undefined>(ages[0]?.id);
  const selectedAge = ages.find(a => a.id === cageId);
  const ageId = selectedAge?.age_category_id;

  const [teams, setTeams] = useState<TCompTeam[]>([]);
  const [coaches, setCoaches] = useState<TCoachPool[]>([]);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [rounds, setRounds] = useState<string[]>([]);
  const [awards, setAwards] = useState<TAward[]>([]);
  const [totrs, setTotrs] = useState<TTeamOfRound[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Granted awards are grouped by type, each group collapsed by default.
  const [openTypes, setOpenTypes] = useState<Set<TAwardType>>(new Set());
  const toggleType = (t: TAwardType) =>
    setOpenTypes(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  // Editing an existing award = re-grant it to a different winner (same scope),
  // which replaces the previous holder.
  const [editId, setEditId] = useState<number | null>(null);
  const [editWho, setEditWho] = useState<number | ''>('');
  const [editNote, setEditNote] = useState('');
  const startEdit = (a: TAward) => {
    setEditId(a.id); setEditWho(a.team_id ?? a.coach_id ?? a.player_id ?? ''); setEditNote(a.note ?? '');
  };
  const saveEdit = async (a: TAward) => {
    if (!editWho) return;
    const isTeam = TEAM_AWARD_TYPES.includes(a.award_type);
    const isCoach = COACH_AWARD_TYPES.includes(a.award_type);
    setErr(null);
    try {
      await tGrantAward(token, comp.id, {
        award_type: a.award_type,
        competition_age_id: a.competition_age_id ?? undefined,
        round: a.round ?? undefined,
        match_id: a.match_id ?? undefined,
        player_id: !isTeam && !isCoach ? Number(editWho) : undefined,
        team_id: isTeam ? Number(editWho) : undefined,
        coach_id: isCoach ? Number(editWho) : undefined,
        note: editNote || undefined,
      });
      setEditId(null); loadHonours();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const players: PoolPlayer[] = useMemo(() =>
    teams.flatMap(t => (t.roster ?? [])
      .filter(r => r.status === 'approved')
      .map(r => ({ player_id: r.player_id, player_name: r.player_name, team_id: t.team_id, team_name: t.team_name }))),
    [teams]);

  const loadScope = useCallback(() => {
    if (!ageId || !cageId) { setTeams([]); setCoaches([]); setMatches([]); setRounds([]); return; }
    tCompTeams(comp.id, ageId, true, token, cageId).then(setTeams).catch(() => setTeams([]));
    tCompetitionCoaches(comp.id, cageId, token).then(setCoaches).catch(() => setCoaches([]));
    tMatches({ competition_id: comp.id, competition_age_id: cageId }).then(setMatches).catch(() => setMatches([]));
    tCompetitionRounds(comp.id, cageId).then(setRounds).catch(() => setRounds([]));
  }, [comp.id, ageId, cageId, token]);
  const loadHonours = useCallback(() => {
    tCompetitionAwards(comp.id).then(a => setAwards(a.filter(x => x.competition_age_id === cageId))).catch(() => setAwards([]));
    tTeamOfRoundAll(comp.id, cageId).then(setTotrs).catch(() => setTotrs([]));
  }, [comp.id, cageId]);
  useEffect(() => { loadScope(); loadHonours(); }, [loadScope, loadHonours]);

  if (ages.length === 0) {
    return <EmptyState icon="🏆" text={tt('أضِف الفئات (البطولات الفرعية) أولاً من تبويب «الفئات».', 'Add sub-competitions first from the "Ages" tab.')} />;
  }

  return (
    <div className="space-y-5">
      <ErrorNote>{err}</ErrorNote>

      <Field label={tt('البطولة الفرعية', 'Sub-competition')}>
        <select value={cageId} onChange={e => setCageId(Number(e.target.value))} className={inputCls}>
          {ages.map(a => <option key={a.id} value={a.id}>{a.name || a.age_category}</option>)}
        </select>
      </Field>

      <GrantAward
        token={token} compId={comp.id} cageId={cageId}
        players={players} teams={teams} coaches={coaches} matches={matches} rounds={rounds}
        onGranted={loadHonours} onError={setErr} />

      <section>
        <h3 className="font-black text-text mb-2">{tt('الجوائز الممنوحة', 'Awards granted')}</h3>
        {awards.length === 0 ? (
          <p className="text-xs text-hint py-1">{tt('لا جوائز بعد', 'None yet')}</p>
        ) : (
          <div className="space-y-2">
            {ALL_TYPES.filter(t => awards.some(a => a.award_type === t)).map(t => {
              const meta = AWARD_META[t];
              const list = awards.filter(a => a.award_type === t);
              const open = openTypes.has(t);
              return (
                <Card key={t} className="overflow-hidden">
                  <button onClick={() => toggleType(t)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-start hover:bg-cardBg2/40 transition-colors">
                    <span className="text-xl shrink-0">{meta[0]}</span>
                    <span className="flex-1 text-sm font-black text-text">{tt(meta[1], meta[2])}</span>
                    <span className="text-[11px] font-bold text-hint tabular-nums">{list.length}</span>
                    <span className="text-aqua text-xs shrink-0">{open ? '▲' : '▼'}</span>
                  </button>
                  {open && (
                    <div className="border-t border-bdr/50 divide-y divide-bdr/40">
                      {list.map(a => {
                        const isTeam = TEAM_AWARD_TYPES.includes(a.award_type);
                        const isCoach = COACH_AWARD_TYPES.includes(a.award_type);
                        const who = a.team_id ? a.team_name
                          : a.coach_id ? nm(a.coach_name, a.coach_name_en)
                          : nm(a.player_name, a.player_name_en);
                        if (editId === a.id) {
                          return (
                            <div key={a.id} className="px-3 py-2.5 space-y-2 bg-cardBg2/40">
                              <p className="text-[11px] text-teal font-bold">
                                {tt(meta[1], meta[2])}{a.round ? ` · ${a.round}` : ''}
                              </p>
                              {isTeam ? (
                                <select value={editWho} onChange={e => setEditWho(Number(e.target.value))} className={inputCls}>
                                  <option value="">{tt('اختر الفريق…', 'Select team…')}</option>
                                  {teams.map(tm => <option key={tm.team_id} value={tm.team_id}>{nm(tm.team_name, tm.team_name_en)}</option>)}
                                </select>
                              ) : isCoach ? (
                                <select value={editWho} onChange={e => setEditWho(Number(e.target.value))} className={inputCls}>
                                  <option value="">{tt('اختر المدرب…', 'Select coach…')}</option>
                                  {coaches.map(c => <option key={c.id} value={c.id}>{nm(c.name, c.name_en)}{c.team_name ? ` — ${c.team_name}` : ''}</option>)}
                                </select>
                              ) : (
                                <select value={editWho} onChange={e => setEditWho(Number(e.target.value))} className={inputCls}>
                                  <option value="">{tt('اختر اللاعب…', 'Select player…')}</option>
                                  {(() => {
                                    // Player of the match: restrict to the match's two teams.
                                    const m = a.match_id ? matches.find(x => x.id === a.match_id) : undefined;
                                    const pool = m ? players.filter(p => p.team_id === m.home_team_id || p.team_id === m.away_team_id) : players;
                                    return pool.map(p => <option key={p.player_id} value={p.player_id}>{p.player_name}{p.team_name ? ` — ${p.team_name}` : ''}</option>);
                                  })()}
                                </select>
                              )}
                              <input value={editNote} onChange={e => setEditNote(e.target.value)} className={inputCls} placeholder={tt('ملاحظة (اختياري)', 'Note (optional)')} />
                              <div className="flex items-center gap-2">
                                <PrimaryButton onClick={() => saveEdit(a)} disabled={!editWho} className="text-sm">{tt('حفظ', 'Save')}</PrimaryButton>
                                <button onClick={() => setEditId(null)} className="text-xs text-hint hover:text-text">{tt('إلغاء', 'Cancel')}</button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold text-text truncate">{who}</div>
                              {(a.round || a.note) && (
                                <div className="text-[11px] text-hint truncate">{[a.round, a.note].filter(Boolean).join(' · ')}</div>
                              )}
                            </div>
                            <button onClick={() => startEdit(a)}
                              className="text-teal hover:text-aqua text-xs font-bold px-1 shrink-0">{tt('تعديل', 'Edit')}</button>
                            <button onClick={async () => { await tRevokeAward(token, a.id); loadHonours(); }}
                              className="text-hint hover:text-loss text-sm px-1 shrink-0">🗑</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <TeamOfRoundBuilder
        token={token} compId={comp.id} cageId={cageId}
        players={players} rounds={rounds} totrs={totrs}
        playersOnPitch={selectedAge?.players_on_pitch}
        onSaved={loadHonours} onError={setErr} />
    </div>
  );
}

// ── grant one award ──────────────────────────────────────────────────────────
function GrantAward({ token, compId, cageId, players, teams, coaches, matches, rounds, onGranted, onError }: {
  token: string; compId: number; cageId?: number;
  players: PoolPlayer[]; teams: TCompTeam[]; coaches: TCoachPool[]; matches: TMatch[]; rounds: string[];
  onGranted: () => void; onError: (e: string | null) => void;
}) {
  const tt = useTT();
  const nm = useName();
  const [atype, setAtype] = useState<TAwardType>('champion');
  const [playerId, setPlayerId] = useState<number | ''>('');
  const [teamId, setTeamId] = useState<number | ''>('');
  const [coachId, setCoachId] = useState<number | ''>('');
  const [round, setRound] = useState('');
  const [matchId, setMatchId] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [sug, setSug] = useState<TAwardSuggestions | null>(null);
  const [busy, setBusy] = useState(false);

  const isTeam = TEAM_AWARD_TYPES.includes(atype);
  const isCoach = COACH_AWARD_TYPES.includes(atype);
  const needsRound = atype === 'player_of_round' || atype === 'coach_of_round';
  const needsMatch = atype === 'player_of_match';
  const canSuggest = ['top_scorer', 'top_assister', 'player_of_round', 'player_of_match', ...TEAM_AWARD_TYPES].includes(atype);

  useEffect(() => { setSug(null); setPlayerId(''); setTeamId(''); setCoachId(''); }, [atype, cageId]);

  const suggest = async () => {
    onError(null);
    try {
      setSug(await tAwardSuggestions(token, compId, {
        award_type: atype, competition_age_id: cageId,
        round: needsRound ? round : undefined,
        match_id: needsMatch && matchId ? Number(matchId) : undefined,
      }));
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  };

  const grant = async () => {
    onError(null); setBusy(true);
    try {
      await tGrantAward(token, compId, {
        award_type: atype,
        competition_age_id: cageId,
        round: needsRound ? round : undefined,
        match_id: needsMatch && matchId ? Number(matchId) : undefined,
        player_id: !isTeam && !isCoach && playerId ? Number(playerId) : undefined,
        team_id: isTeam && teamId ? Number(teamId) : undefined,
        coach_id: isCoach && coachId ? Number(coachId) : undefined,
        note: note || undefined,
      });
      setNote(''); setPlayerId(''); setTeamId(''); setCoachId(''); setSug(null);
      onGranted();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const ready = (isTeam ? !!teamId : isCoach ? !!coachId : !!playerId) && (!needsRound || !!round) && (!needsMatch || !!matchId);

  // For player of the match, the pool is only the two teams that played the
  // selected match — not every player in the sub-competition.
  const selectedMatch = needsMatch && matchId ? matches.find(m => m.id === Number(matchId)) : undefined;
  const pickPlayers = selectedMatch
    ? players.filter(p => p.team_id === selectedMatch.home_team_id || p.team_id === selectedMatch.away_team_id)
    : players;

  return (
    <Card className="p-3 space-y-3">
      <h3 className="font-black text-text">{tt('منح جائزة', 'Grant an award')}</h3>
      <Field label={tt('نوع الجائزة', 'Award')}>
        <select value={atype} onChange={e => setAtype(e.target.value as TAwardType)} className={inputCls}>
          {ALL_TYPES.map(t => <option key={t} value={t}>{AWARD_META[t][0]} {tt(AWARD_META[t][1], AWARD_META[t][2])}</option>)}
        </select>
      </Field>

      {needsMatch && (
        <Field label={tt('المباراة', 'Match')}>
          <select value={matchId} onChange={e => { setMatchId(Number(e.target.value)); setPlayerId(''); }} className={inputCls}>
            <option value="">{tt('اختر…', 'Select…')}</option>
            {matches.map(m => (
              <option key={m.id} value={m.id}>
                {nm(m.home_team_name, m.home_team_name_en)} × {nm(m.away_team_name, m.away_team_name_en)}{m.date ? ` · ${m.date}` : ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      {needsRound && (
        <Field label={tt('الجولة', 'Round')}>
          {rounds.length > 0 ? (
            <select value={round} onChange={e => setRound(e.target.value)} className={inputCls}>
              <option value="">{tt('اختر…', 'Select…')}</option>
              {rounds.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <input value={round} onChange={e => setRound(e.target.value)} className={inputCls} placeholder={tt('مثال: الجولة 1', 'e.g. Round 1')} />
          )}
        </Field>
      )}

      <Field label={isTeam ? tt('الفريق', 'Team') : isCoach ? tt('المدرب', 'Coach') : tt('اللاعب', 'Player')}>
        {isTeam ? (
          <select value={teamId} onChange={e => setTeamId(Number(e.target.value))} className={inputCls}>
            <option value="">{tt('اختر…', 'Select…')}</option>
            {teams.map(t => <option key={t.team_id} value={t.team_id}>{nm(t.team_name, t.team_name_en)}</option>)}
          </select>
        ) : isCoach ? (
          <select value={coachId} onChange={e => setCoachId(Number(e.target.value))} className={inputCls}>
            <option value="">{tt('اختر…', 'Select…')}</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{nm(c.name, c.name_en)}{c.team_name ? ` — ${c.team_name}` : ''}</option>)}
          </select>
        ) : (
          <select value={playerId} onChange={e => setPlayerId(Number(e.target.value))} className={inputCls}>
            <option value="">{tt('اختر…', 'Select…')}</option>
            {pickPlayers.map(p => <option key={p.player_id} value={p.player_id}>{p.player_name}{p.team_name ? ` — ${p.team_name}` : ''}</option>)}
          </select>
        )}
      </Field>
      {needsMatch && !matchId && (
        <p className="text-[11px] text-hint">{tt('اختر المباراة أولًا لعرض لاعبي الفريقين.', 'Select the match first to list its two teams\' players.')}</p>
      )}
      {isCoach && coaches.length === 0 && (
        <p className="text-[11px] text-hint">{tt('لا يوجد مدربون في فرق هذه البطولة الفرعية بعد.', 'No coaches on this sub-competition\'s teams yet.')}</p>
      )}

      {canSuggest && (
        <div>
          <button onClick={suggest} className="text-xs font-bold text-teal border border-teal/40 rounded-lg px-3 py-1.5 hover:bg-teal/10">
            💡 {tt('اقترِح الفائز', 'Suggest winner')}
          </button>
          {sug && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(sug.teams ?? []).map(s => (
                <button key={`t${s.team_id}`} onClick={() => setTeamId(s.team_id)}
                  className="text-xs bg-cardBg2 border border-bdr rounded-full px-3 py-1 hover:border-aqua">
                  {s.team_name}{s.detail ? ` · ${s.detail}` : ''}
                </button>
              ))}
              {(sug.players ?? []).map(s => (
                <button key={`p${s.player_id}`} onClick={() => setPlayerId(s.player_id)}
                  className="text-xs bg-cardBg2 border border-bdr rounded-full px-3 py-1 hover:border-aqua flex items-center gap-1.5">
                  <LogoAvatar src={s.photo_path} name={s.player_name} size={20} />
                  {s.player_name}{s.count != null ? ` · ${s.count}` : ''}
                </button>
              ))}
              {(sug.players?.length ?? 0) === 0 && (sug.teams?.length ?? 0) === 0 && (
                <span className="text-[11px] text-hint">{tt('لا اقتراح — اختر يدويًا', 'No suggestion — pick manually')}</span>
              )}
            </div>
          )}
        </div>
      )}

      <Field label={tt('ملاحظة (اختياري)', 'Note (optional)')}>
        <input value={note} onChange={e => setNote(e.target.value)} className={inputCls} />
      </Field>
      <PrimaryButton onClick={grant} disabled={busy || !ready}>{busy ? tt('…', '…') : tt('منح الجائزة', 'Grant award')}</PrimaryButton>
    </Card>
  );
}

// ── team of the round: best XI builder ───────────────────────────────────────
function TeamOfRoundBuilder({ token, compId, cageId, players, rounds, totrs, playersOnPitch, onSaved, onError }: {
  token: string; compId: number; cageId?: number; players: PoolPlayer[];
  rounds: string[]; totrs: TTeamOfRound[]; playersOnPitch?: number;
  onSaved: () => void; onError: (e: string | null) => void;
}) {
  const tt = useTT();
  const [round, setRound] = useState('');
  const [formation, setFormation] = useState('');
  const [slots, setSlots] = useState<Record<string, number | ''>>({});
  const [busy, setBusy] = useState(false);

  // Only formations that field exactly this sub-competition's players-on-pitch,
  // so the best XI is really the best-N and the pitch matches the match format.
  const formationOptions = useMemo(
    () => FORMATION_NAMES.filter(n => FORMATIONS[n].length === playersOnPitch),
    [playersOnPitch],
  );
  const labels = useMemo(() => formationRowLabels(formation).flat(), [formation]);
  const size = playersOnPitch ?? (labels.length || 0);

  // Prefill from an existing best XI, or default to a formation that fits the pitch.
  useEffect(() => {
    const existing = totrs.find(t => t.round === round);
    if (existing) {
      setFormation(existing.formation || formationOptions[0] || '');
      const map: Record<string, number | ''> = {};
      existing.slots.forEach(s => { if (s.position_slot && s.player_id) map[s.position_slot] = s.player_id; });
      setSlots(map);
    } else {
      setSlots({});
      if (formationOptions.length > 0) {
        setFormation(prev => (formationOptions.includes(prev) ? prev : formationOptions[0]));
      }
    }
  }, [round, totrs, formationOptions]);

  const save = async () => {
    onError(null); setBusy(true);
    try {
      const payloadSlots = labels
        .filter(l => slots[l])
        .map((l, i) => ({ player_id: Number(slots[l]), position_slot: l, sort_order: i }));
      await tSaveTeamOfRound(token, compId, {
        competition_age_id: cageId, round, formation,
        slots: payloadSlots,
      });
      onSaved();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <Card className="p-3 space-y-3">
      <h3 className="font-black text-text">👕 {tt(`تشكيلة الجولة (أفضل ${size})`, `Team of the round (best ${size})`)}</h3>
      <p className="text-[11px] text-hint">{tt(`اختر أفضل لاعب في كل مركز من كل الفرق التي لعبت في الجولة (عدد اللاعبين حسب قواعد البطولة الفرعية: ${size}).`, `Pick the best player in each position from all teams that played the round (player count follows the sub-competition rules: ${size}).`)}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tt('الجولة', 'Round')}>
          {rounds.length > 0 ? (
            <select value={round} onChange={e => setRound(e.target.value)} className={inputCls}>
              <option value="">{tt('اختر…', 'Select…')}</option>
              {rounds.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <input value={round} onChange={e => setRound(e.target.value)} className={inputCls} placeholder={tt('مثال: الجولة 1', 'e.g. Round 1')} />
          )}
        </Field>
        <Field label={tt('الخطة', 'Formation')}>
          {formationOptions.length > 0 ? (
            <select value={formation} onChange={e => setFormation(e.target.value)} className={inputCls}>
              {formationOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <input value={formation} onChange={e => setFormation(e.target.value)} className={inputCls} placeholder="4-3-3" />
          )}
        </Field>
      </div>

      {formationOptions.length === 0 && playersOnPitch != null && (
        <p className="text-[11px] text-gold">{tt(`لا توجد خطة جاهزة لـ ${playersOnPitch} لاعبين — اكتب خطة يكون مجموع لاعبيها ${playersOnPitch}.`, `No preset formation for ${playersOnPitch} players — type one whose players sum to ${playersOnPitch}.`)}</p>
      )}

      {labels.length === 0 ? (
        <p className="text-[11px] text-loss">{tt('اختر خطة صحيحة', 'Choose a valid formation')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {labels.map(label => (
            <label key={label} className="flex items-center gap-2 bg-darkBg border border-bdr rounded-xl px-3 py-2">
              <span className="text-[11px] font-bold text-teal w-10 shrink-0">{label}</span>
              {/* Solid dark bg (not transparent): the native option popup inherits
                  the select's background, so a transparent one renders white in the
                  dark theme and hides the names. */}
              <select value={slots[label] ?? ''} onChange={e => setSlots(prev => ({ ...prev, [label]: e.target.value ? Number(e.target.value) : '' }))}
                className="flex-1 min-w-0 bg-darkBg text-text text-xs outline-none">
                <option value="">{tt('—', '—')}</option>
                {players.map(p => <option key={p.player_id} value={p.player_id}>{p.player_name}{p.team_name ? ` — ${p.team_name}` : ''}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <PrimaryButton onClick={save} disabled={busy || !round || labels.length === 0}>{busy ? tt('…', '…') : tt('حفظ التشكيلة', 'Save best XI')}</PrimaryButton>
        {round && totrs.some(t => t.round === round) && (
          <button onClick={async () => {
            const ex = totrs.find(t => t.round === round);
            if (ex && confirm(tt('حذف تشكيلة هذه الجولة؟', 'Delete this round\'s best XI?'))) { await tDeleteTeamOfRound(token, ex.id); onSaved(); }
          }} className="text-xs font-bold text-loss border border-loss/40 rounded-lg px-3 py-1.5 hover:bg-loss/10">
            {tt('حذف', 'Delete')}
          </button>
        )}
      </div>
    </Card>
  );
}
