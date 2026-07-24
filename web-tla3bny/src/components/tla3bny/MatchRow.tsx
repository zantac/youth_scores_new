'use client';
import Link from 'next/link';
import type { TMatch } from '@/lib/tla3bnyApi';
import { formatMatchDate } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { LogoAvatar, useTT } from './kit';

export default function MatchRow({ m, showComp = false }: { m: TMatch; showComp?: boolean }) {
  const { locale } = useApp();
  const tt = useTT();
  const finished = m.status === 'finished';
  const live = m.status === 'live';

  return (
    <Link href={`/match?id=${m.id}`}
      className="block bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl px-3 py-3 hover:border-aqua/50 transition-colors">
      <div className="flex items-center justify-between text-[11px] text-hint mb-2">
        <span className="font-bold text-teal truncate">
          {[m.age_category, showComp ? m.competition_name : null, m.stage_name, m.group_name]
            .filter(Boolean).join(' · ')}
        </span>
        <span className="shrink-0">
          {live
            ? <span className="text-loss font-extrabold">● {tt('مباشر', 'LIVE')}</span>
            : finished
              ? tt('انتهت', 'FT')
              : `${formatMatchDate(m.date ?? '', locale)}${m.time ? ` · ${m.time}` : ''}`}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-2 min-w-0 justify-end flex-row-reverse text-right">
          <span className="font-bold text-text text-sm truncate">{m.home_team_name}</span>
          <LogoAvatar src={m.home_logo} name={m.home_team_name} size={34} />
        </div>

        <div className="px-3 text-center">
          {finished || (m.home_score != null && m.away_score != null) ? (
            <div className="font-black text-lg text-text tnum whitespace-nowrap">
              {m.home_score ?? 0} <span className="text-hint mx-0.5">-</span> {m.away_score ?? 0}
            </div>
          ) : (
            <div className="text-hint font-bold text-sm">{tt('ضد', 'vs')}</div>
          )}
        </div>

        <div className="flex items-center gap-2 min-w-0 text-left">
          <LogoAvatar src={m.away_logo} name={m.away_team_name} size={34} />
          <span className="font-bold text-text text-sm truncate">{m.away_team_name}</span>
        </div>
      </div>

      {m.venue && <div className="text-center text-[11px] text-hint mt-2 truncate">📍 {m.venue}</div>}
    </Link>
  );
}
