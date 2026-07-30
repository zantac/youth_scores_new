'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tTeam, tMatches, type TTeam, type TMatch } from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import TeamManage from '@/components/tla3bny/TeamManage';
import Spinner from '@/components/ui/Spinner';
import MatchRow from '@/components/tla3bny/MatchRow';
import { Card, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

function TeamContent() {
  const tt = useTT();
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const { academy, team: myTeam, token, isAcademy, isTeam, isSuperAdmin } = useTla3bnyAuth();
  const [t, setT] = useState<TTeam | null>(null);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<'squad' | 'matches' | 'manage'>('squad');

  useEffect(() => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    tTeam(id).then(setT).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    tMatches({ team_id: id }).then(setMatches).catch(() => setMatches([]));
  }, [id]);

  if (loading) return <Spinner />;
  if (notFound || !t) return <EmptyState icon="🔍" text={tt('الفريق غير موجود', 'Team not found')} />;

  // Check if the logged-in user can manage this team.
  const canManage = isSuperAdmin
    || (isTeam && myTeam?.id === id)
    || (isAcademy && (academy?.teams ?? []).some(at => at.id === id));

  const tabs: { key: 'squad' | 'matches' | 'manage'; ar: string; en: string }[] = [
    { key: 'squad', ar: 'الجهاز الفني واللاعبون', en: 'Staff & Players' },
    { key: 'matches', ar: 'المباريات', en: 'Matches' },
    ...(canManage && token ? [{ key: 'manage' as const, ar: 'إدارة الفريق', en: 'Manage' }] : []),
  ];

  return (
    <div className="space-y-4">
      {t.academy_id && (
        <Link href={`/academy?id=${t.academy_id}`} className="text-sm text-hint hover:text-aqua">
          {'←'} {t.academy_name}
        </Link>
      )}

      <Card className="p-5 flex items-center gap-4">
        <LogoAvatar src={t.academy_logo} name={t.academy_name} size={60} />
        <div>
          <h1 className="text-xl font-black text-text">{t.display_name}</h1>
          <p className="text-sm text-teal font-bold">{t.age_category}</p>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === tb.key ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt(tb.ar, tb.en)}
          </button>
        ))}
      </div>

      {/* Staff & Players */}
      {tab === 'squad' && (
        <div className="space-y-4">
          {t.coaches && t.coaches.length > 0 && (
            <section>
              <h2 className="font-black text-text mb-2">{tt('الجهاز الفني', 'Coaching staff')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {t.coaches.map(c => (
                  <Card key={c.id} className="p-3 flex items-center gap-3">
                    <LogoAvatar src={c.photo_path} name={c.name} size={40} />
                    <div className="min-w-0">
                      <div className="font-bold text-text text-sm truncate">{c.name}</div>
                      <div className="text-[11px] text-hint">{c.role_ar}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="font-black text-text mb-2">{tt('اللاعبون', 'Players')}</h2>
            {t.players && t.players.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {t.players.map(p => (
                  <Link key={p.id} href={`/player?id=${p.player_id}`}>
                    <Card className="p-3 flex items-center gap-3 hover:border-aqua/50 transition-colors">
                      <LogoAvatar src={p.photo_path} name={p.player_name} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-text text-sm truncate">{p.player_name}</div>
                        <div className="text-[11px] text-hint">{p.position}</div>
                      </div>
                      {p.jersey_number != null && (
                        <span className="font-black text-teal tnum">#{p.jersey_number}</span>
                      )}
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon="⚽" text={tt('لا لاعبون بعد', 'No players yet')} />
            )}
          </section>
        </div>
      )}

      {/* Matches */}
      {tab === 'matches' && (
        <div>
          {matches.length === 0
            ? <EmptyState icon="📋" text={tt('لا مباريات بعد', 'No matches yet')} />
            : matches.map(m => <MatchRow key={m.id} m={m} showComp />)
          }
        </div>
      )}

      {/* Manage — only visible to the owning academy/team */}
      {tab === 'manage' && canManage && token && (
        <TeamManage token={token} teamId={id} />
      )}
    </div>
  );
}

export default function TeamPage() {
  return <Suspense fallback={<Spinner />}><TeamContent /></Suspense>;
}
