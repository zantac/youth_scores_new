'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  tPlayerAchievements, tTeamHonours, tAcademyHonours, tCompetitionAwards, tTeamOfRoundAll,
  type TAward, type TAwardType, type TPlayerAchievements, type TTeamHonours,
  type TTeamOfRound, type TTotrSlot,
} from '@/lib/tla3bnyApi';
import { formationRowLabels, isSubSlot } from '@/lib/tla3bnyFormations';
import { formatMatchDate } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import PitchView, { type SlotView } from './PitchView';
import { Card, EmptyState, LogoAvatar, useTT, useName, usePositionLabel } from './kit';

/** [emoji, arabic, english] per award type. */
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

/** A titled honours section that collapses/expands — collapsed by default. */
function CollapsibleSection({ title, count, children }: {
  title: React.ReactNode; count?: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 mb-2 text-start hover:opacity-80 transition-opacity">
        <h3 className="font-black text-text flex-1">{title}</h3>
        {count != null && <span className="text-[11px] font-bold text-hint tabular-nums">{count}</span>}
        <span className="text-aqua text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div>{children}</div>}
    </section>
  );
}

/** A single honour as a chip: emoji + award name + who won it, deep-linked. */
function AwardChip({ a, showRecipient = true }: { a: TAward; showRecipient?: boolean }) {
  const tt = useTT();
  const nm = useName();
  const { locale } = useApp();
  const meta = AWARD_META[a.award_type];
  const scope = [a.sub_competition_name, a.round].filter(Boolean).join(' · ');
  // For a player-of-the-match, name the game it was given in: the two teams and
  // the date, so the honour isn't just an untethered "Player of the match".
  const matchTeams = (a.match_home_team || a.match_away_team)
    ? `${nm(a.match_home_team, a.match_home_team_en) || '—'} × ${nm(a.match_away_team, a.match_away_team_en) || '—'}`
    : null;
  const matchLine = matchTeams
    ? [matchTeams, a.match_date ? formatMatchDate(a.match_date, locale) : null].filter(Boolean).join(' · ')
    : null;
  const recipient = a.team_id
    ? { href: `/team?id=${a.team_id}`, name: a.team_name, logo: a.team_logo }
    : a.coach_id
    ? { href: `/coach?id=${a.coach_id}`, name: nm(a.coach_name, a.coach_name_en), logo: a.coach_photo }
    : { href: `/player?id=${a.player_id}`, name: nm(a.player_name, a.player_name_en), logo: a.player_photo };
  return (
    <Card className="p-2.5 flex items-center gap-3">
      <span className="text-2xl shrink-0" aria-hidden>{meta[0]}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-black text-text truncate">{tt(meta[1], meta[2])}</div>
        <div className="text-[11px] text-hint truncate">
          {a.competition_name}{scope ? ` · ${scope}` : ''}
        </div>
        {matchLine && (
          <div className="text-[11px] text-teal truncate">
            {a.match_id ? <Link href={`/match?id=${a.match_id}`} className="hover:underline">{matchLine}</Link> : matchLine}
          </div>
        )}
      </div>
      {showRecipient && (recipient.name) && (
        <Link href={recipient.href} className="flex items-center gap-2 shrink-0 max-w-[45%]">
          <span className="text-xs font-bold text-aqua truncate">{recipient.name}</span>
          <LogoAvatar src={recipient.logo} name={recipient.name} size={28} />
        </Link>
      )}
    </Card>
  );
}

/** The substitutes bench of a team-of-the-round, below the pitch / list. */
function SubBench({ subs }: { subs: TTotrSlot[] }) {
  const nm = useName();
  const tt = useTT();
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold text-hint px-1">{tt('البدلاء', 'Substitutes')}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {subs.map(s => (
          <Link key={s.id} href={`/player?id=${s.player_id}`} className="flex items-center gap-2 bg-darkBg border border-bdr rounded-xl px-2 py-1.5">
            <LogoAvatar src={s.photo_path} name={nm(s.player_name, s.player_name_en)} size={24} />
            <div className="text-[11px] font-bold text-text truncate min-w-0">{nm(s.player_name, s.player_name_en)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Best XI of a round on a pitch (falls back to a plain list if unpositioned),
 *  with any substitutes shown on a bench below. */
export function TeamOfRoundPitch({ totr }: { totr: TTeamOfRound }) {
  const nm = useName();
  const pos = usePositionLabel();
  const labels = formationRowLabels(totr.formation).flat();
  const bySlot: Record<string, SlotView> = {};
  let positioned = 0;
  const subs: TTotrSlot[] = [];
  const starters: TTotrSlot[] = [];
  for (const s of totr.slots) {
    if (isSubSlot(s.position_slot)) { subs.push(s); continue; }
    starters.push(s);
    if (s.position_slot && labels.includes(s.position_slot)) {
      bySlot[s.position_slot] = { playerId: s.player_id, playerName: nm(s.player_name, s.player_name_en), photoPath: s.photo_path };
      positioned++;
    }
  }
  subs.sort((a, b) => a.sort_order - b.sort_order);
  const bench = subs.length > 0 ? <SubBench subs={subs} /> : null;
  if (totr.formation && positioned > 0) {
    return (
      <div className="space-y-2">
        <PitchView formation={totr.formation} filled={bySlot} />
        {bench}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {starters.map(s => (
          <Link key={s.id} href={`/player?id=${s.player_id}`} className="flex items-center gap-2 bg-darkBg border border-bdr rounded-xl px-2 py-1.5">
            <LogoAvatar src={s.photo_path} name={nm(s.player_name, s.player_name_en)} size={28} />
            <div className="min-w-0">
              <div className="text-xs font-bold text-text truncate">{nm(s.player_name, s.player_name_en)}</div>
              {s.position_slot && <div className="text-[10px] text-hint">{pos(s.position_slot)}</div>}
            </div>
          </Link>
        ))}
      </div>
      {bench}
    </div>
  );
}

// ── player achievements ──────────────────────────────────────────────────────
export function PlayerAchievements({ playerId }: { playerId: number }) {
  const tt = useTT();
  const pos = usePositionLabel();
  const [d, setD] = useState<TPlayerAchievements | null>(null);
  useEffect(() => { tPlayerAchievements(playerId).then(setD).catch(() => setD(null)); }, [playerId]);
  if (!d) return null;
  const total = d.individual_awards.length + d.team_titles.length + d.team_of_round.length;
  if (total === 0) return null;
  return (
    <CollapsibleSection title={<>🏅 {tt('الإنجازات', 'Achievements')}</>} count={total}>
      <div className="space-y-2">
        {d.team_titles.map(a => <AwardChip key={`t${a.id}`} a={a} showRecipient={false} />)}
        {d.individual_awards.map(a => <AwardChip key={`i${a.id}`} a={a} showRecipient={false} />)}
        {d.team_of_round.map((s, i) => {
          const sub = isSubSlot(s.position_slot);
          const slotLabel = sub ? tt('بديل', 'Substitute') : pos(s.position_slot);
          return (
            <Card key={`r${i}`} className="p-2.5 flex items-center gap-3">
              <span className="text-2xl shrink-0" aria-hidden>👕</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-text truncate">
                  {sub ? tt('ضمن بدلاء تشكيلة الجولة', 'On the team of the round bench') : tt('ضمن تشكيلة الجولة', 'In the team of the round')}
                </div>
                <div className="text-[11px] text-hint truncate">
                  {[s.sub_competition_name, s.round, slotLabel].filter(Boolean).join(' · ')}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

// ── team honours ─────────────────────────────────────────────────────────────
export function TeamHonours({ teamId }: { teamId: number }) {
  const tt = useTT();
  const [d, setD] = useState<TTeamHonours | null>(null);
  useEffect(() => { tTeamHonours(teamId).then(setD).catch(() => setD(null)); }, [teamId]);
  if (!d || (d.titles.length === 0 && d.player_awards.length === 0)) return null;
  return (
    <CollapsibleSection title={<>🏆 {tt('البطولات والجوائز', 'Honours')}</>} count={d.titles.length + d.player_awards.length}>
      <div className="space-y-2">
        {d.titles.map(a => <AwardChip key={`t${a.id}`} a={a} showRecipient={false} />)}
        {d.player_awards.map(a => <AwardChip key={`p${a.id}`} a={a} />)}
      </div>
    </CollapsibleSection>
  );
}

// ── academy trophy cabinet ───────────────────────────────────────────────────
export function AcademyHonours({ academyId }: { academyId: number }) {
  const tt = useTT();
  const [titles, setTitles] = useState<TAward[] | null>(null);
  useEffect(() => { tAcademyHonours(academyId).then(setTitles).catch(() => setTitles([])); }, [academyId]);
  if (!titles || titles.length === 0) return null;
  return (
    <CollapsibleSection title={<>🏆 {tt('خزانة البطولات', 'Trophy cabinet')}</>} count={titles.length}>
      <div className="space-y-2">
        {titles.map(a => <AwardChip key={a.id} a={a} />)}
      </div>
    </CollapsibleSection>
  );
}

// ── competition honours tab ──────────────────────────────────────────────────
export function CompetitionHonours({ compId, cageId }: { compId: number; cageId?: number }) {
  const tt = useTT();
  const [awards, setAwards] = useState<TAward[] | null>(null);
  const [totr, setTotr] = useState<TTeamOfRound[]>([]);
  useEffect(() => {
    tCompetitionAwards(compId).then(setAwards).catch(() => setAwards([]));
    tTeamOfRoundAll(compId, cageId).then(setTotr).catch(() => setTotr([]));
  }, [compId, cageId]);
  if (!awards) return null;
  const inScope = cageId ? awards.filter(a => a.competition_age_id === cageId) : awards;
  const titleTypes: TAwardType[] = ['champion', 'runner_up', 'third_place'];
  const overallTypes: TAwardType[] = ['top_scorer', 'top_assister', 'best_player', 'best_goalkeeper'];
  const titles = inScope.filter(a => titleTypes.includes(a.award_type));
  const overall = inScope.filter(a => overallTypes.includes(a.award_type));
  const playerOfRound = inScope.filter(a => a.award_type === 'player_of_round');
  const playerOfMatch = inScope.filter(a => a.award_type === 'player_of_match');
  const bestCoach = inScope.filter(a => a.award_type === 'best_coach');
  const coachOfRound = inScope.filter(a => a.award_type === 'coach_of_round');
  const scopedTotr = cageId ? totr.filter(t => t.competition_age_id === cageId) : totr;

  if (titles.length + overall.length + playerOfRound.length + playerOfMatch.length
      + bestCoach.length + coachOfRound.length + scopedTotr.length === 0) {
    return <EmptyState icon="🏆" text={tt('لم تُمنح جوائز بعد', 'No honours awarded yet')} />;
  }
  return (
    <div className="space-y-3">
      {titles.length > 0 && (
        <CollapsibleSection title={<>🏆 {tt('المراكز', 'Standings honours')}</>} count={titles.length}>
          <div className="space-y-2">{titles.map(a => <AwardChip key={a.id} a={a} />)}</div>
        </CollapsibleSection>
      )}
      {overall.length > 0 && (
        <CollapsibleSection title={<>⭐ {tt('الجوائز الفردية', 'Individual awards')}</>} count={overall.length}>
          <div className="space-y-2">{overall.map(a => <AwardChip key={a.id} a={a} />)}</div>
        </CollapsibleSection>
      )}
      {scopedTotr.length > 0 && (
        <CollapsibleSection title={<>👕 {tt('تشكيلة الجولة', 'Team of the round')}</>} count={scopedTotr.length}>
          <div className="space-y-4">
            {scopedTotr.map(t => (
              <Card key={t.id} className="p-3">
                <div className="text-sm font-black text-text mb-2">{t.round}</div>
                <TeamOfRoundPitch totr={t} />
              </Card>
            ))}
          </div>
        </CollapsibleSection>
      )}
      {playerOfRound.length > 0 && (
        <CollapsibleSection title={<>🌟 {tt('لاعب الجولة', 'Player of the round')}</>} count={playerOfRound.length}>
          <div className="space-y-2">{playerOfRound.map(a => <AwardChip key={a.id} a={a} />)}</div>
        </CollapsibleSection>
      )}
      {playerOfMatch.length > 0 && (
        <CollapsibleSection title={<>🎖️ {tt('رجل المباراة', 'Player of the match')}</>} count={playerOfMatch.length}>
          <div className="space-y-2">{playerOfMatch.map(a => <AwardChip key={a.id} a={a} />)}</div>
        </CollapsibleSection>
      )}
      {bestCoach.length > 0 && (
        <CollapsibleSection title={<>🎓 {tt('أفضل مدرب', 'Best coach')}</>} count={bestCoach.length}>
          <div className="space-y-2">{bestCoach.map(a => <AwardChip key={a.id} a={a} />)}</div>
        </CollapsibleSection>
      )}
      {coachOfRound.length > 0 && (
        <CollapsibleSection title={<>📋 {tt('مدرب الجولة', 'Coach of the round')}</>} count={coachOfRound.length}>
          <div className="space-y-2">{coachOfRound.map(a => <AwardChip key={a.id} a={a} />)}</div>
        </CollapsibleSection>
      )}
    </div>
  );
}
