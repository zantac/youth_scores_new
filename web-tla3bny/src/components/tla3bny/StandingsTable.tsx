'use client';
import Link from 'next/link';
import type { TStandingRow } from '@/lib/tla3bnyApi';
import { useApp } from '@/context/AppContext';
import { LogoAvatar } from './kit';

/**
 * The youthscores league table: full column set, a five-match form guide under
 * each team, the leader picked out in gold, and the tiebreaker rules spelled
 * out underneath so nobody has to ask why two equal teams are ordered as they
 * are. The rows come from the API already sorted and ranked.
 */

const FORM_BG: Record<string, string> = { W: '#2FD996', D: '#4a5a7e', L: '#FF5D6E' };

export default function StandingsTable({ rows }: { rows: TStandingRow[] }) {
  const { locale } = useApp();
  const isAr = locale === 'ar';
  if (!rows.length) return null;

  const h = (label: string, cls = 'text-center') => (
    <th className={`text-aqua text-[10px] font-bold py-2 px-1 ${cls}`}>{label}</th>
  );

  const rules = isAr
    ? ['النقاط', 'نتيجة المواجهة المباشرة', 'فارق أهداف المواجهة المباشرة', 'فارق الأهداف العام', 'الأهداف المسجلة']
    : ['Points', 'Head-to-head result', 'Head-to-head goal difference', 'Overall goal difference', 'Goals scored'];

  return (
    <div className="space-y-2">
      <div className="bg-cardBg rounded-xl border border-bdr overflow-x-auto">
        <table className="w-full text-xs min-w-[500px]">
          <thead className="bg-darkBg">
            <tr>
              {h('#', 'text-center w-7')}
              {h(isAr ? 'الفريق' : 'Team', 'text-start min-w-[120px]')}
              {h(isAr ? 'ل' : 'P')}
              {h(isAr ? 'نقط' : 'Pts')}
              {h(isAr ? 'له' : 'GF')}
              {h(isAr ? 'عليه' : 'GA')}
              {h(isAr ? 'فارق' : 'GD')}
              {h(isAr ? 'ف' : 'W')}
              {h(isAr ? 'ت' : 'D')}
              {h(isAr ? 'خ' : 'L')}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isTop = i === 0;
              return (
                <tr key={r.team_id}
                  className={`border-t border-bdr/40 transition-colors hover:bg-aqua/[0.06] ${
                    isTop ? 'bg-gold/[0.07]' : i % 2 === 0 ? 'bg-darkBg/30' : ''}`}>
                  <td className="text-center py-2 px-1">
                    <span className={`inline-grid place-items-center w-5 h-5 rounded-md text-[11px] font-extrabold tnum ${
                      isTop ? 'bg-gold/15 text-gold' : 'text-hint'}`}>{r.rank}</span>
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <LogoAvatar src={r.academy_logo} name={r.team_name} size={20} />
                        <Link href={`/team?id=${r.team_id}`}
                          className={`truncate hover:text-aqua ${isTop ? 'text-gold font-bold' : 'text-text'}`}>
                          {r.team_name}
                        </Link>
                        {r.point_deduction > 0 && (
                          <span className="text-loss text-[9px] border border-loss/50 rounded px-1 tnum">
                            -{r.point_deduction}
                          </span>
                        )}
                      </div>
                      {r.form?.length > 0 && (
                        <div className="flex gap-1">
                          {r.form.map((res, fi) => (
                            <div key={fi} style={{ backgroundColor: FORM_BG[res] }}
                              className="w-3.5 h-3.5 rounded-[5px] flex items-center justify-center shadow-sm">
                              <span className="text-[7px] text-white font-extrabold">{res}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="text-center text-teal py-2 px-1 tnum">{r.P}</td>
                  <td className={`text-center font-extrabold py-2 px-1 tnum ${isTop ? 'text-gold' : 'text-aqua'}`}>{r.Pts}</td>
                  <td className="text-center text-teal py-2 px-1 tnum">{r.GF}</td>
                  <td className="text-center text-teal py-2 px-1 tnum">{r.GA}</td>
                  <td className={`text-center font-semibold py-2 px-1 tnum ${
                    r.GD > 0 ? 'text-win' : r.GD < 0 ? 'text-loss' : 'text-teal'}`}>
                    {r.GD > 0 ? `+${r.GD}` : r.GD}
                  </td>
                  <td className="text-center text-teal py-2 px-1 tnum">{r.W}</td>
                  <td className="text-center text-teal py-2 px-1 tnum">{r.D}</td>
                  <td className="text-center text-teal py-2 px-1 tnum">{r.L}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-darkBg/60 border border-bdr/50 rounded-xl px-3 py-2.5 space-y-2">
        <p className="text-hint text-[10px] font-bold uppercase tracking-wide">
          {isAr ? 'معايير الفصل عند التساوي في النقاط' : 'Tiebreaker rules (equal points)'}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {rules.map((rule, i) => (
            <span key={i} className="flex items-center gap-1 text-[10px] text-hint">
              <span className="w-3.5 h-3.5 rounded-full bg-bdr flex items-center justify-center text-[8px] font-bold text-teal flex-shrink-0">
                {i + 1}
              </span>
              {rule}
            </span>
          ))}
        </div>
        {rows.some(r => r.point_deduction > 0) && (
          <>
            <div className="border-t border-bdr/40" />
            <p className="text-[10px] text-hint flex items-center gap-1.5">
              <span className="text-loss font-bold border border-loss/50 rounded px-1 text-[9px]">-N</span>
              {isAr ? 'خصم نقاط مطبق على هذا الفريق' : 'point deduction applied to this team'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
