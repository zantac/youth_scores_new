'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';
import { hrefFor } from '@/lib/links';
import FollowButton from '@/components/ui/FollowButton';
import Spinner from '@/components/ui/Spinner';
import JerseyNumber from '@/components/ui/JerseyNumber';
import { fetchTeam } from '@/lib/api';
import { localize, teamNameLines, groupRosterByPosition, cloudinaryUrl } from '@/lib/utils';
import type { TeamPublic } from '@/lib/types';

// Team profile keyed by an explicit id prop. Rendered by the /team/[id] path route
// (id from the URL path) and reused via the legacy redirect shim.
export default function TeamView({ id }: { id: string }) {
  const { locale } = useApp();
  const router = useRouter();
  const [t, setT] = useState<TeamPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const isAr = locale === 'ar';

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    fetchTeam(id).then(setT).finally(() => setLoading(false));
  }, [id]);

  // The three sections collapse; all start closed.
  const [open, setOpen] = useState({ seasons: false, staff: false, players: false });
  const toggle = (k: 'seasons' | 'staff' | 'players') => setOpen(o => ({ ...o, [k]: !o[k] }));

  // Open a competition the team played, on its Teams tab with this team's
  // in-competition detail open — the same view the standings/match links use.
  const openCompetition = (c: TeamPublic['competitions'][number]) => {
    const p = new URLSearchParams({ id: String(c.competition_id), tab: 'teams', team: id });
    router.push(`/competition?${p.toString()}`);
  };

  // The club is the identity; a second name (academy/sponsor) sits beneath it,
  // exactly as the standings and match cards show it.
  const lines = t ? teamNameLines({ name: t.name, clubName: t.club?.name }, locale) : null;
  const title = lines ? lines.primary : (isAr ? 'الفريق' : 'Team');

  // Default the list fields so a partial payload renders as empty sections rather
  // than throwing on .length/.map (the error boundary is the backstop for the rest).
  const competitions = t?.competitions ?? [];
  const staff = t?.staff ?? [];
  const roster = t?.roster ?? [];

  return (
    <>
      <AppBar title={title} back actions={id ? <FollowButton teamId={id} /> : undefined} />
      {loading ? <Spinner label={isAr ? 'جاري التحميل...' : 'Loading...'} />
        : !t ? <div className="p-8 text-center text-hint">{isAr ? 'الفريق غير موجود' : 'Team not found'}</div>
        : (
        <div className="pb-24">
          {/* Hero */}
          <div className="relative overflow-hidden bg-gradient-to-b from-cardBg to-cardBg2 border-b border-bdr p-5 flex items-center gap-4">
            <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,rgb(var(--accent-rgb)/0.14),transparent_65%)]" />
            {t.logo
              ? <img src={cloudinaryUrl(t.logo, 128)} alt="" className="relative w-16 h-16 rounded-2xl object-contain" />
              : <div className="relative w-16 h-16 rounded-2xl grid place-items-center text-2xl">🛡️</div>}
            <div className="relative min-w-0">
              <h1 onClick={() => router.push(hrefFor('club', t.club?.id))}
                className="text-lg font-extrabold truncate cursor-pointer hover:text-aqua transition-colors">
                {lines!.primary} <span className="text-aqua text-xs align-middle">›</span>
              </h1>
              {lines!.alias && (
                <p className="text-hint text-sm truncate">{lines!.alias}</p>
              )}
              <p className="text-hint text-xs truncate mt-0.5">{localize(t.age, locale)}</p>
            </div>
          </div>

          {/* Seasons — each opens that season's competition (this team's view). */}
          {competitions.length > 0 && (
            <div className="px-4 pt-5">
              <button onClick={() => toggle('seasons')} className="w-full flex items-center justify-between gap-2 mb-3">
                <h2 className="text-text font-bold text-sm">
                  {isAr ? 'المواسم' : 'Seasons'}
                  <span className="text-hint text-xs font-normal"> ({competitions.length})</span>
                </h2>
                <span className={`text-hint transition-transform ${open.seasons ? 'rotate-90' : ''}`}>›</span>
              </button>
              {open.seasons && (
                <div className="space-y-2">
                  {competitions.map(c => (
                    <button key={c.competition_id} onClick={() => openCompetition(c)}
                      className="w-full flex items-center gap-3 bg-cardBg border border-bdr rounded-xl px-3 py-2.5 text-start hover:border-aqua/40 transition-colors">
                      <span className="text-lg flex-shrink-0">🏆</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-text text-sm font-bold truncate">{localize(c.season, locale) || localize(c.title, locale)}</p>
                        <p className="text-hint text-[11px] truncate">{localize(c.title, locale)}</p>
                      </div>
                      <span className="text-aqua text-xs flex-shrink-0">›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Technical staff */}
          <div className="px-4 pt-5">
            <button onClick={() => toggle('staff')} className="w-full flex items-center justify-between gap-2 mb-3">
              <h2 className="text-text font-bold text-sm">
                {isAr ? 'الجهاز الفني' : 'Technical Staff'}
                {staff.length > 0 && <span className="text-hint text-xs font-normal"> ({staff.length})</span>}
              </h2>
              <span className={`text-hint transition-transform ${open.staff ? 'rotate-90' : ''}`}>›</span>
            </button>
            {open.staff && (staff.length === 0 ? (
              <p className="text-hint text-sm text-center py-4">{isAr ? 'لا توجد بيانات' : 'No data'}</p>
            ) : (
              <div className="space-y-2">
                {staff.map(s => (
                  <button key={`${s.id}-${s.role?.ar ?? ''}`} onClick={() => router.push(hrefFor('coach', s.id))}
                    className="w-full flex items-center gap-3 bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-3 text-start hover:border-aqua/40 transition-colors">
                    {s.photo
                      ? <img src={s.photo} alt="" className="w-10 h-10 rounded-full object-cover bg-darkBg flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-full bg-darkBg grid place-items-center flex-shrink-0">👤</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-text font-bold text-sm truncate">{localize(s.name, locale)}</p>
                      <p className="text-teal text-[11px] truncate">{localize(s.role, locale) || '—'}</p>
                    </div>
                    <span className="text-aqua text-xs flex-shrink-0">›</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Roster */}
          <div className="px-4 pt-5">
            <button onClick={() => toggle('players')} className="w-full flex items-center justify-between gap-2 mb-3">
              <h2 className="text-text font-bold text-sm">
                {isAr ? 'اللاعبون' : 'Players'}
                {roster.length > 0 && <span className="text-hint text-xs font-normal"> ({roster.length})</span>}
              </h2>
              <span className={`text-hint transition-transform ${open.players ? 'rotate-90' : ''}`}>›</span>
            </button>
            {open.players && (roster.length === 0 ? (
              <p className="text-hint text-sm text-center py-4">{isAr ? 'لا توجد قائمة' : 'No squad'}</p>
            ) : (
              <div className="space-y-5">
                {groupRosterByPosition(roster, locale).map(sec => (
                    <div key={sec.label}>
                      <p className="text-teal text-[11px] font-bold mb-2">
                        {sec.label} <span className="text-hint font-normal">({sec.players.length})</span>
                      </p>
                      <div className="space-y-2">
                        {sec.players.map(p => (
                          <button key={p.id} onClick={() => router.push(hrefFor('player', p.id))}
                            className="w-full flex items-center gap-3 bg-cardBg border border-bdr rounded-xl px-3 py-2.5 text-start hover:border-aqua/40 transition-colors">
                            {p.photo
                              ? <img src={p.photo} alt="" className="w-10 h-10 rounded-full object-cover bg-darkBg flex-shrink-0" />
                              : <div className="w-10 h-10 rounded-full bg-darkBg grid place-items-center flex-shrink-0">👤</div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-text text-sm font-bold truncate">{localize(p.name, locale)}</p>
                              <p className="text-hint text-[11px] truncate">
                                {[localize(p.position, locale), p.birth_year || ''].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            {p.guest && <span className="text-teal text-[10px] border border-teal/40 rounded px-2 py-0.5 flex-shrink-0">{isAr ? 'صاعد' : 'up'}</span>}
                            <JerseyNumber shirt={p.shirt} />
                          </button>
                        ))}
                      </div>
                    </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
