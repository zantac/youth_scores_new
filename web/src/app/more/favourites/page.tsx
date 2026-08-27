'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';
import Spinner from '@/components/ui/Spinner';
import { fetchTeam } from '@/lib/api';
import { localize, buildCompTitle, cloudinaryUrl } from '@/lib/utils';
import {
  followedCompetitions, unfollowCompetition,
  followedTeams, unfollowTeam,
} from '@/lib/notifications';
import type { ConfigData, TeamPublic } from '@/lib/types';

// Followed competitions/teams are stored client-side as bare ids (see
// lib/notifications). Competition titles are resolved from the loaded config;
// team names/logos are fetched by id. Mirrors the Android app's Favourites
// screen.

type CompTitle = { ar: string; en: string };

// Map each competition data-id (the one embedded in a season → competition →
// age/sector data URL, and used by the follow button) to its display title.
function buildCompIndex(config: ConfigData | null): Map<string, CompTitle> {
  const map = new Map<string, CompTitle>();
  for (const season of config?.seasons ?? []) {
    for (const comp of season.competitions) {
      for (const age of comp.ages) {
        const ageLabel = age.ageName ?? age.age;
        const leaves = age.sectors.length
          ? age.sectors.map(s => ({ url: s.url, sector: s.name as CompTitle | null }))
          : age.directMatchesUrl
            ? [{ url: age.directMatchesUrl, sector: null }]
            : [];
        for (const leaf of leaves) {
          const m = leaf.url.match(/\/competitions\/(\d+)\/data/);
          if (!m) continue;
          map.set(m[1], buildCompTitle(comp.name, ageLabel, leaf.sector));
        }
      }
    }
  }
  return map;
}

export default function FavouritesPage() {
  const { config, configLoading, locale } = useApp();
  const isAr = locale === 'ar';

  const [compIds, setCompIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<Record<string, TeamPublic | null>>({});
  const [teamsLoading, setTeamsLoading] = useState(false);

  const compIndex = useMemo(() => buildCompIndex(config), [config]);

  // Load the followed id lists once, on the client.
  useEffect(() => {
    setCompIds(followedCompetitions());
    setTeamIds(followedTeams());
  }, []);

  // Resolve team names/logos by id.
  useEffect(() => {
    if (teamIds.length === 0) { setTeams({}); return; }
    let alive = true;
    setTeamsLoading(true);
    Promise.all(teamIds.map(id => fetchTeam(id).then(t => [id, t] as const).catch(() => [id, null] as const)))
      .then(pairs => { if (alive) setTeams(Object.fromEntries(pairs)); })
      .finally(() => { if (alive) setTeamsLoading(false); });
    return () => { alive = false; };
  }, [teamIds]);

  const removeComp = async (id: string) => {
    setCompIds(ids => ids.filter(x => x !== id)); // optimistic
    try { await unfollowCompetition(id); } catch { /* stays removed locally */ }
  };
  const removeTeam = async (id: string) => {
    setTeamIds(ids => ids.filter(x => x !== id));
    try { await unfollowTeam(id); } catch { /* stays removed locally */ }
  };

  const empty = compIds.length === 0 && teamIds.length === 0;

  return (
    <>
      <AppBar title={isAr ? 'المفضلة' : 'Favourites'} back />

      <div className="p-3 max-w-lg mx-auto">
        {configLoading && !config && compIds.length > 0 && <Spinner />}

        {empty ? (
          <Empty isAr={isAr} />
        ) : (
          <>
            {/* ── Competitions ─────────────────────────────────────────────── */}
            <SectionTitle icon="🏆" label={isAr ? 'البطولات' : 'Competitions'} count={compIds.length} />
            {compIds.length === 0 ? (
              <EmptyRow text={isAr ? 'لا توجد بطولات متابَعة' : 'No followed competitions'} />
            ) : (
              <div className="space-y-2 mb-5">
                {compIds.map(id => {
                  const title = compIndex.get(id);
                  const label = title
                    ? localize(title, locale)
                    : `${isAr ? 'بطولة' : 'Competition'} #${id}`;
                  return (
                    <FavRow
                      key={id}
                      href={`/competition?id=${id}`}
                      leading={<span className="text-lg">🏆</span>}
                      label={label}
                      isAr={isAr}
                      onRemove={() => removeComp(id)}
                    />
                  );
                })}
              </div>
            )}

            {/* ── Teams ────────────────────────────────────────────────────── */}
            <SectionTitle icon="🛡️" label={isAr ? 'الفرق' : 'Teams'} count={teamIds.length} />
            {teamIds.length === 0 ? (
              <EmptyRow text={isAr ? 'لا توجد فرق متابَعة' : 'No followed teams'} />
            ) : (
              <div className="space-y-2">
                {teamsLoading && Object.keys(teams).length === 0 && <Spinner />}
                {teamIds.map(id => {
                  const t = teams[id];
                  const label = t ? localize(t.name, locale) : `${isAr ? 'فريق' : 'Team'} #${id}`;
                  return (
                    <FavRow
                      key={id}
                      href={`/team?id=${id}`}
                      leading={
                        t?.logo
                          ? // eslint-disable-next-line @next/next/no-img-element
                            <img src={cloudinaryUrl(t.logo, 128)} alt="" className="w-7 h-7 object-contain" />
                          : <span className="text-lg">🛡️</span>
                      }
                      label={label}
                      isAr={isAr}
                      onRemove={() => removeTeam(id)}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SectionTitle({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1 mb-2 mt-1">
      <span>{icon}</span>
      <span className="text-text font-bold text-sm">{label}</span>
      <span className="text-hint text-xs">({count})</span>
    </div>
  );
}

function FavRow({ href, leading, label, isAr, onRemove }: {
  href: string; leading: React.ReactNode; label: string; isAr: boolean; onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl px-3 py-2.5 transition-all hover:border-aqua/30">
      <Link href={href} className="flex items-center gap-3 flex-1 min-w-0">
        <span className="w-7 h-7 grid place-items-center flex-shrink-0">{leading}</span>
        <span className="flex-1 min-w-0 text-text text-sm font-bold truncate">{label}</span>
      </Link>
      <button
        onClick={onRemove}
        title={isAr ? 'إلغاء المتابعة' : 'Unfollow'}
        aria-label={isAr ? 'إلغاء المتابعة' : 'Unfollow'}
        className="text-gold text-lg leading-none px-1 flex-shrink-0 hover:opacity-70"
      >
        ★
      </button>
      <Link href={href} className="text-hint text-lg flex-shrink-0">{isAr ? '‹' : '›'}</Link>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-hint text-xs px-1 mb-5">{text}</p>;
}

function Empty({ isAr }: { isAr: boolean }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="text-5xl mb-3">⭐</div>
      <p className="text-text font-bold text-base mb-2">
        {isAr ? 'لا توجد عناصر متابَعة بعد' : 'Nothing followed yet'}
      </p>
      <p className="text-hint text-sm leading-relaxed">
        {isAr
          ? 'تابِع بطولة أو فريقاً بالضغط على النجمة ⭐ لتظهر هنا وتصلك إشعارات النتائج.'
          : 'Follow a competition or team with the ⭐ to see it here and get results notifications.'}
      </p>
    </div>
  );
}
