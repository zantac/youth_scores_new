'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  tCompTeams, tCompetitionCoaches, tCompetitionPunishments, tCreatePunishment, tDeletePunishment,
  type TCompetition, type TCompTeam, type TCoachPool, type TPunishment, type TPunishmentType,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT, useName, SearchableSelect, type SelectOption } from './kit';

type Kind = 'player' | 'coach' | 'team';

const PUN_META: Record<TPunishmentType, [string, string, string]> = {
  match_ban:       ['🚫', 'منع من المشاركة', 'Match ban'],
  disqualification:['⛔', 'استبعاد من البطولة', 'Disqualification'],
  fine:            ['💰', 'غرامة مالية', 'Fine'],
  point_deduction: ['➖', 'خصم نقاط', 'Point deduction'],
};
const ALL_TYPES = Object.keys(PUN_META) as TPunishmentType[];
// Which recipient kinds each punishment type allows.
const KINDS: Record<TPunishmentType, Kind[]> = {
  match_ban:       ['player', 'coach'],
  disqualification:['player', 'coach', 'team'],
  fine:            ['player', 'coach', 'team'],
  point_deduction: ['team'],
};
// Disqualification carries no numeric value (just a reason).
const NEEDS_VALUE = (t: TPunishmentType) => t !== 'disqualification';

interface PoolPlayer { player_id: number; player_name: string | null; player_name_en?: string | null; photo_path?: string | null; team_name: string | null }

/** Competition organizer's discipline desk: record match bans, fines and point
 *  deductions in one place. Point deductions feed the standings; fines are private. */
export default function PunishmentsManager({ token, comp }: { token: string; comp: TCompetition }) {
  const tt = useTT();
  const nm = useName();
  const { user, isSuperAdmin } = useTla3bnyAuth();
  // Recording a punishment is open to every organizer; removing one is gated to the
  // owner or an organizer granted the permission.
  const myAdmin = (comp.admins ?? []).find(a => a.user_id === user?.id);
  const canRemove = isSuperAdmin || !!(myAdmin && (myAdmin.is_owner || myAdmin.can_remove_punishments));
  const [teams, setTeams] = useState<TCompTeam[]>([]);
  const [coaches, setCoaches] = useState<TCoachPool[]>([]);
  const [puns, setPuns] = useState<TPunishment[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const players: PoolPlayer[] = useMemo(() =>
    teams.flatMap(t => (t.roster ?? [])
      .filter(r => r.status === 'approved')
      .map(r => ({ player_id: r.player_id, player_name: r.player_name, player_name_en: r.player_name_en, photo_path: r.photo_path, team_name: t.team_name }))),
    [teams]);

  const loadPuns = useCallback(() => {
    tCompetitionPunishments(comp.id, token).then(setPuns).catch(() => setPuns([]));
  }, [comp.id, token]);
  useEffect(() => {
    tCompTeams(comp.id, undefined, true, token).then(setTeams).catch(() => setTeams([]));
    tCompetitionCoaches(comp.id, undefined, token).then(setCoaches).catch(() => setCoaches([]));
    loadPuns();
  }, [comp.id, token, loadPuns]);

  return (
    <div className="space-y-5">
      <ErrorNote>{err}</ErrorNote>

      <AddPunishment
        token={token} compId={comp.id} teams={teams} coaches={coaches} players={players}
        onAdded={loadPuns} onError={setErr} />

      <section>
        <h3 className="font-black text-text mb-1">{tt('العقوبات المسجّلة', 'Recorded punishments')}</h3>
        {!canRemove && (
          <p className="text-[11px] text-hint mb-2">{tt('ليس لديك صلاحية حذف العقوبات — تواصل مع مدير البطولة.', 'You don\'t have permission to remove punishments — ask the competition owner.')}</p>
        )}
        {puns.length === 0 ? (
          <EmptyState icon="🕊️" text={tt('لا عقوبات', 'No punishments')} />
        ) : (
          <div className="space-y-2">
            {ALL_TYPES.filter(t => puns.some(p => p.punishment_type === t)).map(t => {
              const meta = PUN_META[t];
              const list = puns.filter(p => p.punishment_type === t);
              return (
                <Card key={t} className="overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-bdr/50">
                    <span className="text-lg">{meta[0]}</span>
                    <span className="flex-1 text-sm font-black text-text">{tt(meta[1], meta[2])}</span>
                    <span className="text-[11px] font-bold text-hint tabular-nums">{list.length}</span>
                  </div>
                  <div className="divide-y divide-bdr/40">
                    {list.map(p => {
                      const who = p.player_id ? nm(p.player_name, p.player_name_en)
                        : p.coach_id ? nm(p.coach_name, p.coach_name_en)
                        : p.team_name;
                      const photo = p.player_photo ?? p.coach_photo ?? null;
                      const value = t === 'match_ban' ? tt(`${p.matches} مباريات`, `${p.matches} matches`)
                        : t === 'point_deduction' ? `-${p.points}`
                        : t === 'disqualification' ? tt('مستبعد', 'Excluded')
                        : p.amount != null ? `${p.amount.toLocaleString('en-US')} ${tt('ج.م', 'EGP')}` : tt('غرامة', 'Fine');
                      return (
                        <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                          <LogoAvatar src={photo} name={who ?? '?'} size={30} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-text truncate">
                              {who}{p.team_name && (p.player_id || p.coach_id) ? <span className="text-hint font-normal"> · {p.team_name}</span> : null}
                            </div>
                            {p.reason && <div className="text-[11px] text-hint truncate">{p.reason}</div>}
                          </div>
                          <span className="text-sm font-black text-loss shrink-0 tabular-nums">{value}</span>
                          {canRemove && (
                            <button onClick={async () => { if (confirm(tt('حذف العقوبة؟', 'Remove punishment?'))) { await tDeletePunishment(token, p.id); loadPuns(); } }}
                              className="text-hint hover:text-loss text-sm px-1 shrink-0">🗑</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function AddPunishment({ token, compId, teams, coaches, players, onAdded, onError }: {
  token: string; compId: number; teams: TCompTeam[]; coaches: TCoachPool[]; players: PoolPlayer[];
  onAdded: () => void; onError: (e: string | null) => void;
}) {
  const tt = useTT();
  const nm = useName();
  const [ptype, setPtype] = useState<TPunishmentType>('match_ban');
  const [kind, setKind] = useState<Kind>('player');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [coachId, setCoachId] = useState<number | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [num, setNum] = useState('');   // matches / points / amount
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset the recipient when the type (and so the allowed kinds) changes.
  const allowedKinds = KINDS[ptype];
  useEffect(() => {
    setKind(allowedKinds[0]);
    setPlayerId(null); setCoachId(null); setTeamId(null); setNum('');
  }, [ptype]);  // eslint-disable-line react-hooks/exhaustive-deps

  const recipientReady = kind === 'player' ? playerId !== null : kind === 'coach' ? coachId !== null : teamId !== null;
  const ready = recipientReady && (!NEEDS_VALUE(ptype) || Number(num) > 0);

  const submit = async () => {
    onError(null); setBusy(true);
    try {
      await tCreatePunishment(token, compId, {
        punishment_type: ptype,
        player_id: kind === 'player' && playerId !== null ? playerId : undefined,
        coach_id: kind === 'coach' && coachId !== null ? coachId : undefined,
        team_id: kind === 'team' && teamId !== null ? teamId : undefined,
        matches: ptype === 'match_ban' ? Number(num) : undefined,
        points: ptype === 'point_deduction' ? Number(num) : undefined,
        amount: ptype === 'fine' ? Number(num) : undefined,
        reason: reason.trim() || undefined,
      });
      setNum(''); setReason(''); setPlayerId(null); setCoachId(null); setTeamId(null);
      onAdded();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const kindLabel: Record<Kind, [string, string]> = {
    player: ['لاعب', 'Player'], coach: ['مدرب', 'Coach'], team: ['فريق', 'Team'],
  };
  const numLabel: [string, string] = ptype === 'match_ban' ? ['عدد المباريات', 'Number of matches']
    : ptype === 'point_deduction' ? ['النقاط المخصومة', 'Points deducted']
    : ['قيمة الغرامة (ج.م)', 'Fine amount (EGP)'];

  return (
    <Card className="p-3 space-y-3">
      <h3 className="font-black text-text">{tt('تسجيل عقوبة', 'Record a punishment')}</h3>

      <Field label={tt('نوع العقوبة', 'Punishment type')}>
        <select value={ptype} onChange={e => setPtype(e.target.value as TPunishmentType)} className={inputCls}>
          {ALL_TYPES.map(t => <option key={t} value={t}>{PUN_META[t][0]} {tt(PUN_META[t][1], PUN_META[t][2])}</option>)}
        </select>
      </Field>

      {allowedKinds.length > 1 && (
        <div className="flex items-center gap-1 bg-darkBg/60 border border-bdr/50 rounded-xl p-1 w-fit">
          {allowedKinds.map(k => (
            <button key={k} onClick={() => setKind(k)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${kind === k ? 'bg-cardBg text-aqua shadow-sm' : 'text-teal hover:text-text'}`}>
              {tt(kindLabel[k][0], kindLabel[k][1])}
            </button>
          ))}
        </div>
      )}

      <Field label={tt(kindLabel[kind][0], kindLabel[kind][1])}>
        {kind === 'player' ? (
          <SearchableSelect
            value={playerId}
            onChange={setPlayerId}
            withPhoto
            options={players.map<SelectOption>(p => ({
              value: p.player_id,
              label: p.player_name ?? String(p.player_id),
              sublabel: p.team_name,
              photo: p.photo_path ?? null,
              keywords: p.player_name_en ?? null,
            }))}
          />
        ) : kind === 'coach' ? (
          <SearchableSelect
            value={coachId}
            onChange={setCoachId}
            withPhoto
            options={coaches.map<SelectOption>(c => ({
              value: c.id,
              label: nm(c.name, c.name_en) ?? String(c.id),
              sublabel: c.team_name ?? null,
              photo: c.photo_path ?? null,
              keywords: c.name_en ?? null,
            }))}
          />
        ) : (
          <SearchableSelect
            value={teamId}
            onChange={setTeamId}
            options={teams.map<SelectOption>(t => ({
              value: t.team_id,
              label: nm(t.team_name, t.team_name_en) ?? String(t.team_id),
              keywords: t.team_name_en ?? null,
            }))}
          />
        )}
      </Field>

      {NEEDS_VALUE(ptype) && (
        <Field label={tt(numLabel[0], numLabel[1])}>
          <input value={num} onChange={e => setNum(e.target.value)} inputMode="numeric" className={inputCls}
            placeholder={ptype === 'fine' ? tt('مثال: 500', 'e.g. 500') : tt('مثال: 2', 'e.g. 2')} />
        </Field>
      )}

      <Field label={tt('السبب (اختياري)', 'Reason (optional)')}>
        <input value={reason} onChange={e => setReason(e.target.value)} className={inputCls} />
      </Field>

      {ptype === 'fine' && (
        <p className="text-[11px] text-hint">{tt('الغرامة خاصة — تظهر لإدارة البطولة وللأكاديمية المعنية فقط.', 'The fine is private — shown only to the organizer and the punished academy.')}</p>
      )}
      {ptype === 'match_ban' && (
        <p className="text-[11px] text-hint">{tt('لا يمكن إضافة اللاعب في التشكيلة طوال عدد المباريات المحدد (منع فعلي)، ثم يُرفع الإيقاف تلقائيًا.', 'The player cannot be added to a lineup for the set number of matches (a hard block); the ban then lifts automatically.')}</p>
      )}
      {ptype === 'disqualification' && (
        <p className="text-[11px] text-hint">{tt('استبعاد دائم من البطولة — لا يمكن إضافة اللاعب في أي تشكيلة حتى يُلغى الاستبعاد. استبعاد فريق يمنع كل لاعبيه.', 'Permanent exclusion from the competition — the player can\'t be added to any lineup until it is removed. Disqualifying a team blocks all its players.')}</p>
      )}

      <PrimaryButton onClick={submit} disabled={busy || !ready}>{busy ? tt('…', '…') : tt('تسجيل العقوبة', 'Record punishment')}</PrimaryButton>
    </Card>
  );
}
