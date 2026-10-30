'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tTeam, tMatches, T_BASE, type TTeam, type TMatch } from '@/lib/tla3bnyApi';
import { todayStr } from '@/lib/utils';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import TeamManage from '@/components/tla3bny/TeamManage';
import Spinner from '@/components/ui/Spinner';
import MatchRow from '@/components/tla3bny/MatchRow';
import { Card, EmptyState, LogoAvatar, useTT, useName } from '@/components/tla3bny/kit';
import TeamHero from '@/components/tla3bny/TeamHero';
import FollowTeamButton from '@/components/tla3bny/FollowTeamButton';
import { TeamHonours } from '@/components/tla3bny/Honours';
import PrintableCards from '@/components/tla3bny/PrintableCards';

function TeamContent() {
  const tt = useTT();
  const nm = useName();
  const router = useRouter();
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const { academy, team: myTeam, token, isAcademy, isTeam, isSuperAdmin, isCompetitionAdmin } = useTla3bnyAuth();
  const [t, setT] = useState<TTeam | null>(null);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // The active tab (and, for manage, its sub-section) live in the URL so every
  // tab has its own shareable link.
  const urlTab = params.get('tab');
  const tab: 'squad' | 'matches' | 'manage' =
    urlTab === 'matches' || urlTab === 'manage' ? urlTab : 'squad';
  const manageSection = params.get('sub') ?? undefined;
  // Re-fetch the team (fresh, no-store) after a manage edit so the squad tab
  // and hero stay in sync. Stable identity so it doesn't retrigger TeamManage.
  const refetchTeam = useCallback(() => {
    if (id) tTeam(id, token).then(setT).catch(() => {});
  }, [id, token]);
  const go = (nextTab: 'squad' | 'matches' | 'manage', sub?: string) => {
    const qs = new URLSearchParams();
    qs.set('id', String(id));
    qs.set('tab', nextTab);
    // The manage tab always carries a sub-section so its view matches the URL.
    if (nextTab === 'manage') qs.set('sub', sub ?? 'players');
    router.replace(`/team/?${qs.toString()}`, { scroll: false });
  };
  // A webcal:// link to the team's live fixtures feed — absolute URL resolved on the
  // client (T_BASE is relative in dev), so the calendar app can subscribe.
  const [fixturesFeed, setFixturesFeed] = useState('');

  // Squad → PDF (organizers only): mount the printable sheet on demand, decode
  // the photos and open the print dialog, then unmount on `afterprint` so the
  // full-size images don't stay resident in memory.
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    // Backstop so a WebView that never fires `afterprint` can't leave the
    // full-size print sheet mounted indefinitely.
    const timer = setTimeout(done, 60_000);
    return () => { window.removeEventListener('afterprint', done); clearTimeout(timer); };
  }, [printing]);

  useEffect(() => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    tTeam(id).then(setT).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const base = T_BASE.startsWith('http') ? T_BASE : `${window.location.origin}${T_BASE}`;
    setFixturesFeed(`${base}/teams/${id}/fixtures.ics`.replace(/^https?:/, 'webcal:'));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    tMatches({ team_id: id, order: 'asc' }).then(setMatches).catch(() => setMatches([]));
  }, [id]);

  // The match to land on in the Matches tab: the first one today or later, else
  // the most recent (matches come ascending by date).
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => { setToday(todayStr()); }, []);
  const anchorId = useMemo(() => {
    if (!today || matches.length === 0) return null;
    const upcoming = matches.find(m => m.date && m.date >= today);
    return (upcoming ?? matches[matches.length - 1]).id;
  }, [today, matches]);

  // Centre that match once the Matches tab is open, and hold it there for a brief
  // settle window so late layout shifts (team logos, ad-free rows reflowing) can't
  // park the view elsewhere. Stop as soon as the user scrolls; re-arm on leaving.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const scrollLocked = useRef(false);
  useEffect(() => {
    if (tab !== 'matches') { scrollLocked.current = false; return; }
    if (scrollLocked.current || anchorId == null) return;
    const lock = () => { scrollLocked.current = true; };
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('wheel', lock, opts);
    window.addEventListener('touchmove', lock, opts);
    window.addEventListener('keydown', lock);
    let frame = 0;
    let raf = 0;
    const tick = () => {
      if (scrollLocked.current) return;
      anchorRef.current?.scrollIntoView({ block: 'start' });
      if (++frame < 45) raf = requestAnimationFrame(tick);  // ~0.75s at 60fps
      else scrollLocked.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('wheel', lock, opts);
      window.removeEventListener('touchmove', lock, opts);
      window.removeEventListener('keydown', lock);
    };
  }, [tab, anchorId]);

  if (loading) return <Spinner />;
  if (notFound || !t) return <EmptyState icon="🔍" text={tt('الفريق غير موجود', 'Team not found')} />;

  // Check if the logged-in user can manage this team.
  const canManage = isSuperAdmin
    || (isTeam && myTeam?.id === id)
    || (isAcademy && (academy?.teams ?? []).some(at => at.id === id));

  // Organizers (and the owning academy/team) can print the whole squad's ID
  // cards as a PDF — a convenience version of the match-day lineup cards for
  // checking players before a match. The photos/names are already public on
  // this tab, so this only adds a one-click sheet.
  const isOrganizer = isSuperAdmin || isCompetitionAdmin;
  const canDownloadCards = isOrganizer || canManage;
  const squadCards = (t.players ?? []).map(p => ({
    key: p.id,
    photoPath: p.photo_path,
    name: nm(p.player_name, p.player_name_en),
    meta: [p.position, p.jersey_number != null ? `#${p.jersey_number}` : null]
      .filter(Boolean).join(' · ') || null,
  }));

  const canManageTab = canManage && !!token;
  const tabs: { key: 'squad' | 'matches' | 'manage'; ar: string; en: string }[] = [
    { key: 'squad', ar: 'الجهاز الفني واللاعبون', en: 'Staff & Players' },
    { key: 'matches', ar: 'المباريات', en: 'Matches' },
    ...(canManageTab ? [{ key: 'manage' as const, ar: 'إدارة الفريق', en: 'Manage' }] : []),
  ];
  // A shared manage-URL opened by someone who can't manage falls back to squad.
  const shownTab = tab === 'manage' && !canManageTab ? 'squad' : tab;

  return (
    <div className="space-y-4">
      {t.academy_id && (
        <Link href={`/academy?id=${t.academy_id}`} className="text-sm text-hint hover:text-aqua">
          {'←'} {nm(t.academy_name, t.academy_name_en)}
        </Link>
      )}

      <TeamHero team={t} action={<FollowTeamButton teamId={t.id} />} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar">
        {tabs.map(tb => (
          <button key={tb.key} onClick={() => go(tb.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${shownTab === tb.key ? 'border-aqua text-aqua' : 'border-transparent text-teal'}`}>
            {tt(tb.ar, tb.en)}
          </button>
        ))}
      </div>

      {/* Staff & Players */}
      {shownTab === 'squad' && (
        <div className="space-y-4">
          <TeamHonours teamId={t.id} />
          {t.coaches && t.coaches.length > 0 && (
            <section>
              <h2 className="font-black text-text mb-2">{tt('الجهاز الفني', 'Coaching staff')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {t.coaches.map(c => (
                  <Link key={c.id} href={`/coach?id=${c.id}`}>
                    <Card className="p-3 flex items-center gap-3 hover:border-aqua/50 transition-colors">
                      <LogoAvatar src={c.photo_path} name={nm(c.name, c.name_en)} size={40} />
                      <div className="min-w-0">
                        <div className="font-bold text-text text-sm truncate">{nm(c.name, c.name_en)}</div>
                        <div className="text-[11px] text-hint">{c.role_ar}</div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="font-black text-text">{tt('اللاعبون', 'Players')}</h2>
              {canDownloadCards && squadCards.length > 0 && (
                <button onClick={() => setPrinting(true)} disabled={printing}
                  className="flex items-center gap-2 text-xs font-bold text-aqua border border-aqua/40 rounded-lg px-3 py-1.5 hover:bg-aqua/10 disabled:opacity-50">
                  ⬇️ {printing ? tt('جارٍ التحضير…', 'Preparing…') : tt('تحميل الكروت (PDF)', 'Download cards (PDF)')}
                </button>
              )}
            </div>
            {t.players && t.players.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {t.players.map(p => (
                  <Link key={p.id} href={`/player?id=${p.player_id}`}>
                    <Card className="p-3 flex items-center gap-3 hover:border-aqua/50 transition-colors">
                      <LogoAvatar src={p.photo_path} name={nm(p.player_name, p.player_name_en)} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-text text-sm truncate">{nm(p.player_name, p.player_name_en)}</div>
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
      {shownTab === 'matches' && (
        <div className="space-y-2">
          {fixturesFeed && matches.some(m => m.date) && (
            <a href={fixturesFeed}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-aqua border border-aqua/40 rounded-lg px-2.5 py-1 hover:bg-aqua/10 transition-colors">
              📅 {tt('اشترك في مواعيد الفريق', 'Subscribe to fixtures')}
            </a>
          )}
          {matches.length === 0
            ? <EmptyState icon="📋" text={tt('لا مباريات بعد', 'No matches yet')} />
            : matches.map(m => (
                <div key={m.id} ref={m.id === anchorId ? anchorRef : undefined} className="scroll-mt-20">
                  <MatchRow m={m} showComp />
                </div>
              ))
          }
        </div>
      )}

      {/* Manage — only visible to the owning academy/team */}
      {shownTab === 'manage' && canManageTab && token && (
        <TeamManage token={token} teamId={id}
          section={manageSection} onSectionChange={s => go('manage', s)} onChanged={refetchTeam} />
      )}

      {/* Off-screen printable squad cards — mounted only while printing
          (revealed by the print CSS), then unmounted on `afterprint`. */}
      {printing && canDownloadCards && squadCards.length > 0 && (
        <PrintableCards
          title={`${nm(t.display_name, t.display_name_en)}${t.age_category ? ` · ${t.age_category}` : ''}`}
          subtitle={nm(t.academy_name, t.academy_name_en) || undefined}
          items={squadCards}
        />
      )}
    </div>
  );
}

export default function TeamPage() {
  return <Suspense fallback={<Spinner />}><TeamContent /></Suspense>;
}
