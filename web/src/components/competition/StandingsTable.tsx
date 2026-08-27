'use client';
import type { Standing, Team, Match } from '@/lib/types';
import { teamForm, localize, teamNameLines, cloudinaryUrl } from '@/lib/utils';

interface Props {
  standings: Standing[];
  teams: Team[];
  matches: Match[];
  locale: string;
  onTeamClick?: (teamId: string) => void;
}

const FORM_BG: Record<string, string> = { W: '#2FD996', D: '#4a5a7e', L: '#FF5D6E' };

export default function StandingsTable({ standings, teams, matches, locale, onTeamClick }: Props) {
  if (!standings.length) return null;
  const isAr = locale === 'ar';

  const h = (label: string, cls = 'text-center') =>
    <th className={`text-aqua text-[10px] font-bold py-2 px-1 ${cls}`}>{label}</th>;

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
          {standings.map((s, i) => {
            const team = teams.find(t => t.id === s.teamId);
            const form = teamForm(s.teamId, matches);
            const isTop = i === 0;
            const { primary, alias } = teamNameLines(team, locale, s.teamId);
            return (
              <tr key={s.teamId}
                className={`border-t border-bdr/40 transition-colors ${isTop ? 'bg-gold/[0.07]' : i % 2 === 0 ? 'bg-darkBg/30' : ''} ${onTeamClick ? 'cursor-pointer hover:bg-aqua/[0.06] active:bg-aqua/10' : ''}`}
                onClick={() => onTeamClick?.(s.teamId)}>
                <td className="text-center py-2 px-1">
                  <span className={`inline-grid place-items-center w-5 h-5 rounded-md text-[11px] font-extrabold tnum ${isTop ? 'bg-gold/15 text-gold' : 'text-hint'}`}>{s.position}</span>
                </td>
                <td className="py-1.5 px-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      {team?.logo && <img src={cloudinaryUrl(team.logo, 128)} alt={localize(team.name, locale)} className="w-5 h-5 object-contain rounded" />}
                      <span className="min-w-0 flex flex-col leading-tight">
                        <span className={`truncate ${isTop ? 'text-gold font-bold' : 'text-text'}`}>{primary}</span>
                        {alias && <span className="truncate text-hint text-[10px]">{alias}</span>}
                      </span>
                      {s.pointDeduction > 0 &&
                        <span className="text-[9px] text-loss border border-loss/50 rounded px-1 tnum">-{s.pointDeduction}</span>}
                    </div>
                    {form.length > 0 && (
                      <div className="flex gap-1">
                        {form.map((r, fi) => (
                          <div key={fi} style={{ backgroundColor: FORM_BG[r] }} className="w-3.5 h-3.5 rounded-[5px] flex items-center justify-center shadow-sm">
                            <span className="text-[7px] text-white font-extrabold">{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td className="text-center text-teal py-2 px-1 tnum">{s.played}</td>
                <td className={`text-center font-extrabold py-2 px-1 tnum ${isTop ? 'text-gold' : 'text-aqua'}`}>{s.points}</td>
                <td className="text-center text-teal py-2 px-1 tnum">{s.goalsFor}</td>
                <td className="text-center text-teal py-2 px-1 tnum">{s.goalsAgainst}</td>
                <td className={`text-center font-semibold py-2 px-1 tnum ${s.goalDiff > 0 ? 'text-win' : s.goalDiff < 0 ? 'text-loss' : 'text-teal'}`}>
                  {s.goalDiff > 0 ? `+${s.goalDiff}` : s.goalDiff}
                </td>
                <td className="text-center text-teal py-2 px-1 tnum">{s.won}</td>
                <td className="text-center text-teal py-2 px-1 tnum">{s.drawn}</td>
                <td className="text-center text-teal py-2 px-1 tnum">{s.lost}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* Tiebreaker rules + point deduction footnote */}
    <div className="bg-darkBg/60 border border-bdr/50 rounded-xl px-3 py-2.5 space-y-2">
      <p className="text-hint text-[10px] font-bold uppercase tracking-wide">
        {isAr ? 'معايير الفصل عند التساوي في النقاط' : 'Tiebreaker rules (equal points)'}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {rules.map((rule, i) => (
          <span key={i} className="flex items-center gap-1 text-[10px] text-hint">
            <span className="w-3.5 h-3.5 rounded-full bg-bdr flex items-center justify-center text-[8px] font-bold text-teal flex-shrink-0">{i + 1}</span>
            {rule}
          </span>
        ))}
      </div>
      {standings.some(s => s.pointDeduction > 0) && (
        <>
          <div className="border-t border-bdr/40" />
          <p className="text-[10px] text-hint flex items-center gap-1.5">
            <span className="text-red-400 font-bold border border-red-400/50 rounded px-1 text-[9px]">-N</span>
            {isAr ? 'خصم نقاط مطبق على هذا الفريق' : 'point deduction applied to this team'}
          </p>
        </>
      )}
    </div>
    </div>
  );
}
