'use client';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import type { Match, Team } from '@/lib/types';
import { formatMatchDate, countdownLabel, localize, teamNameLines } from '@/lib/utils';

interface Props {
  match: Match;
  homeTeam?: Team;
  awayTeam?: Team;
  locale: string;
  onClick?: () => void;
}

function Logo({ url, name }: { url?: string; name: string }) {
  if (!url) return <div className="w-10 h-10 rounded-full bg-bdr flex items-center justify-center text-lg">⚽</div>;
  return <Image src={url} alt={name} width={40} height={40} className="rounded object-contain" unoptimized />;
}

export default function MatchCard({ match, homeTeam, awayTeam, locale, onClick }: Props) {
  const home = teamNameLines(homeTeam, locale, match.homeTeamId);
  const away = teamNameLines(awayTeam, locale, match.awayTeamId);
  const homeName = home.primary;
  const awayName = away.primary;
  const isCompleted = match.status.toLowerCase() === 'completed';
  const isLive      = match.status.toLowerCase() === 'live';
  const isPostponed = match.status.toLowerCase() === 'postponed';
  const isCancelled = match.status.toLowerCase() === 'cancelled';
  const homeWon = isCompleted && match.homeScore != null &&
    (match.homeScore > match.awayScore! ||
     (match.homeScore === match.awayScore && match.homePenalty != null && match.homePenalty > match.awayPenalty!));
  const awayWon = isCompleted && match.awayScore != null &&
    (match.awayScore > match.homeScore! ||
     (match.homeScore === match.awayScore && match.awayPenalty != null && match.awayPenalty > match.homePenalty!));

  const [countdown, setCountdown] = useState<string | null>(null);
  useEffect(() => {
    if (isCompleted || isLive) return;
    const update = () => setCountdown(countdownLabel(match.date, match.time, locale));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [isCompleted, isLive, match.date, match.time, locale]);

  return (
    <div onClick={onClick} className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl p-3 mb-2 cursor-pointer transition-all hover:border-aqua/30 hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)] active:opacity-80">
      {match.group && (
        <p className="text-[11px] font-bold text-teal mb-2 truncate">{match.group}</p>
      )}
      <div className="flex items-center gap-2">
        {/* Home */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <Logo url={homeTeam?.logo} name={homeName} />
          <p className={`text-xs text-center leading-tight ${homeWon ? 'text-gold font-bold' : 'text-text'}`}>
            {homeName}
          </p>
          {home.alias && <p className="text-hint text-[10px] text-center leading-tight">{home.alias}</p>}
        </div>

        {/* Centre */}
        <div className="flex flex-col items-center min-w-[72px] gap-0.5">
          {isCompleted ? (
            <>
              {match.homeScore != null ? (
                <div className="bg-darkBg border border-bdr rounded-lg px-3 py-1 shadow-inner">
                  <span className="text-aqua font-extrabold text-lg tnum tracking-tight">{match.homeScore} - {match.awayScore}</span>
                </div>
              ) : (
                <span className="text-hint font-extrabold text-base tnum">– : –</span>
              )}
              {match.homePenalty != null && match.awayPenalty != null && (
                <span className="text-gold text-[10px] font-medium tnum">
                  {locale === 'ar' ? 'ر.ت' : 'Pens'}: {match.homePenalty} - {match.awayPenalty}
                </span>
              )}
              {/* Explicit finished flag so a played match reads as ended in the
                  list, not just as a past date (matches the detail page). */}
              <span className="text-win text-[9px] font-bold border border-win/30 bg-win/10 rounded px-1.5 py-px">{locale === 'ar' ? 'انتهت' : 'FT'}</span>
              <span className="text-hint text-[9px]">{formatMatchDate(match.date, locale)}</span>
            </>
          ) : isLive ? (
            <>
              {/* Always flag a live match with an explicit LIVE badge (mirrors the
                  detail page), so it reads as live at a glance in the list — not
                  just a red-tinted score/kickoff-time box. */}
              <span className="inline-flex items-center gap-1 text-red-400 text-[9px] font-bold border border-red-500/50 bg-red-500/15 rounded px-1.5 py-px">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />{locale === 'ar' ? 'مباشر' : 'LIVE'}
              </span>
              {/* A live match shows its running score once one is entered; until
                  then it falls back to the kickoff time. */}
              {match.homeScore != null ? (
                <>
                  <div className="bg-red-500/20 border border-red-500 rounded-lg px-3 py-1 shadow-inner">
                    <span className="text-red-400 font-extrabold text-lg tnum tracking-tight">{match.homeScore} - {match.awayScore}</span>
                  </div>
                  {match.homePenalty != null && match.awayPenalty != null && (
                    <span className="text-gold text-[10px] font-medium tnum">
                      {locale === 'ar' ? 'ر.ت' : 'Pens'}: {match.homePenalty} - {match.awayPenalty}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-aqua font-bold text-base tnum">{match.time || '--:--'}</span>
              )}
              <span className="text-hint text-[9px]">{formatMatchDate(match.date, locale)}</span>
            </>
          ) : isPostponed ? (
            <>
              <div className="bg-orange-500/10 border border-orange-500/50 rounded-lg px-2 py-1">
                <span className="text-orange-400 text-xs font-bold">{locale === 'ar' ? 'مؤجلة' : 'PPD'}</span>
              </div>
              <span className="text-hint text-[9px]">{formatMatchDate(match.date, locale)}</span>
            </>
          ) : isCancelled ? (
            <>
              <div className="bg-loss/10 border border-loss/40 rounded-lg px-2 py-1">
                <span className="text-loss text-xs font-bold">{locale === 'ar' ? 'ملغاة' : 'Canc.'}</span>
              </div>
              <span className="text-hint text-[9px] line-through">{formatMatchDate(match.date, locale)}</span>
            </>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-aqua font-bold text-base tnum">{match.time || '--:--'}</span>
              {countdown && <span className="text-gold text-[9px] text-center">{countdown}</span>}
              <span className="text-hint text-[9px]">{formatMatchDate(match.date, locale)}</span>
            </div>
          )}
        </div>

        {/* Away */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <Logo url={awayTeam?.logo} name={awayName} />
          <p className={`text-xs text-center leading-tight ${awayWon ? 'text-gold font-bold' : 'text-text'}`}>
            {awayName}
          </p>
          {away.alias && <p className="text-hint text-[10px] text-center leading-tight">{away.alias}</p>}
        </div>
      </div>
      {match.venue && <p className="text-center text-[10px] text-hint mt-1 truncate">{match.venue}</p>}
      {match.note && <p className="text-center text-[10px] text-gold mt-1 leading-snug px-1">{match.note}</p>}
    </div>
  );
}
