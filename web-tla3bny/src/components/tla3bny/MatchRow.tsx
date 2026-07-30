'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import type { TMatch } from '@/lib/tla3bnyApi';
import { formatMatchDate, countdownLabel } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { LogoAvatar, useTT } from './kit';

/**
 * One match, presented the way youthscores presents one: crest + name on each
 * side, the score (or kick-off time and a live countdown) in the middle, and
 * the winner's name picked out in gold once it is over.
 */
export default function MatchRow({ m, showComp = false }: { m: TMatch; showComp?: boolean }) {
  const { locale } = useApp();
  const tt = useTT();
  const finished = m.status === 'completed' || m.status === 'finished';
  const live = m.status === 'live';
  const postponed = m.status === 'postponed';
  const cancelled = m.status === 'cancelled';
  const hasScore = m.home_score != null && m.away_score != null;

  const homeWon = finished && hasScore && m.home_score! > m.away_score!;
  const awayWon = finished && hasScore && m.away_score! > m.home_score!;

  // Recomputed every minute so a card left on screen keeps counting down.
  const [countdown, setCountdown] = useState<string | null>(null);
  useEffect(() => {
    if (finished || live || postponed || cancelled) return;
    const update = () => setCountdown(countdownLabel(m.date ?? '', m.time ?? '', locale));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [finished, live, postponed, cancelled, m.date, m.time, locale]);

  const context = [m.age_category, showComp ? m.competition_name : null, m.stage_name, m.group_name]
    .filter(Boolean).join(' · ');

  return (
    <Link href={`/match?id=${m.id}`}
      className="block bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl px-3 py-3 mb-2 hover:border-aqua/30 hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)] active:opacity-80 transition-all">
      {(context || m.round) && (
        <div className="flex items-center justify-between text-[11px] mb-2 gap-2">
          <span className="font-bold text-teal truncate">{context}</span>
          {m.round && <span className="text-hint shrink-0">{m.round}</span>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1 flex flex-col items-center gap-1">
          <LogoAvatar src={m.home_logo} name={m.home_team_name} size={40} />
          <p className={`text-xs text-center leading-tight ${homeWon ? 'text-gold font-bold' : 'text-text'}`}>
            {m.home_team_name}
          </p>
        </div>

        <div className="flex flex-col items-center min-w-[76px] gap-0.5">
          {hasScore && (finished || live) ? (
            <>
              <div className="bg-darkBg border border-bdr rounded-lg px-3 py-1 shadow-inner">
                <span className="text-aqua font-extrabold text-lg tnum tracking-tight">
                  {m.home_score_pen != null
                    ? `${m.home_score_pen} - ${m.away_score_pen}`
                    : m.home_score_et != null
                      ? `${m.home_score_et} - ${m.away_score_et}`
                      : `${m.home_score} - ${m.away_score}`}
                </span>
              </div>
              {m.home_score_pen != null && (
                <span className="text-gold text-[9px] font-bold">{tt('بعد ركلات', 'on pens')}</span>
              )}
              {m.home_score_et != null && m.home_score_pen == null && (
                <span className="text-teal text-[9px] font-bold">{tt('بعد وقت إضافي', 'a.e.t.')}</span>
              )}
              {live
                ? <span className="text-loss text-[10px] font-extrabold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-loss animate-pulse" />{tt('مباشرة', 'LIVE')}
                  </span>
                : <span className="text-hint text-[9px]">{tt('انتهت', 'FT')}</span>}
              <span className="text-hint text-[9px]">{formatMatchDate(m.date ?? '', locale)}</span>
            </>
          ) : live ? (
            <>
              <div className="bg-loss/20 border border-loss rounded-lg px-2 py-1 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-loss animate-pulse" />
                <span className="text-loss font-bold text-sm tnum">{m.time || tt('مباشرة', 'LIVE')}</span>
              </div>
              <span className="text-hint text-[9px]">{formatMatchDate(m.date ?? '', locale)}</span>
            </>
          ) : postponed ? (
            <>
              <span className="text-gold font-bold text-xs">{tt('مؤجلة', 'Postponed')}</span>
              <span className="text-hint text-[9px]">{formatMatchDate(m.date ?? '', locale)}</span>
            </>
          ) : cancelled ? (
            <>
              <span className="text-loss font-bold text-xs">{tt('ملغاة', 'Cancelled')}</span>
              <span className="text-hint text-[9px]">{formatMatchDate(m.date ?? '', locale)}</span>
            </>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-aqua font-bold text-base tnum">{m.time || '--:--'}</span>
              {countdown && <span className="text-gold text-[9px] text-center">{countdown}</span>}
              <span className="text-hint text-[9px]">{formatMatchDate(m.date ?? '', locale)}</span>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center gap-1">
          <LogoAvatar src={m.away_logo} name={m.away_team_name} size={40} />
          <p className={`text-xs text-center leading-tight ${awayWon ? 'text-gold font-bold' : 'text-text'}`}>
            {m.away_team_name}
          </p>
        </div>
      </div>

      {m.venue && <p className="text-center text-[10px] text-hint mt-1 truncate">📍 {m.venue}</p>}
    </Link>
  );
}
