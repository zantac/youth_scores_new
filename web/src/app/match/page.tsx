'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchMatchFull } from '@/lib/api';
import { localize, formatMatchDate } from '@/lib/utils';
import type { MatchFull } from '@/lib/types';

const CARD_ICON: Record<string, { icon: string; cls: string }> = {
  yellow:        { icon: '🟨', cls: 'bg-gold/15 text-gold' },
  second_yellow: { icon: '🟨🟥', cls: 'bg-loss/10 text-loss' },
  red:           { icon: '🟥', cls: 'bg-loss/15 text-loss' },
};

function TeamAvatar({ url, name, size = 64 }: { url?: string; name: string; size?: number }) {
  const initials = name.trim().slice(0, 2).toUpperCase();
  if (url) return <img src={url} alt={name} style={{ width: size, height: size }} className="object-contain drop-shadow-lg" />;
  return (
    <div style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
      className="rounded-xl grid place-items-center font-black text-on-accent bg-gradient-to-br from-aqua to-aqua/70 shadow-[0_8px_20px_-8px_rgb(var(--accent-rgb)/0.5)]">
      {initials}
    </div>
  );
}

export default function MatchCenterPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] grid place-items-center"><div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" /></div>}>
      <MatchCenter />
    </Suspense>
  );
}

function MatchCenter() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const { locale } = useApp();
  const router = useRouter();
  const [m, setM] = useState<MatchFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState(false);
  const isAr = locale === 'ar';
  const isLive = m?.status === 'live';

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    fetchMatchFull(id).then(setM).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || !isLive) return;
    const iv = setInterval(() => {
      fetchMatchFull(id).then(updated => { if (updated) setM(updated); });
    }, 20_000);
    return () => clearInterval(iv);
  }, [id, isLive]);

  if (loading) return <div className="min-h-[70vh] grid place-items-center"><div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" /></div>;
  if (!m) return <div className="p-8 text-center text-hint">{isAr ? 'المباراة غير موجودة' : 'Match not found'}</div>;

  const homeName = localize(m.home.name, locale);
  const awayName = localize(m.away.name, locale);
  const isCompleted = m.status === 'completed';
  const isPostponed = m.status === 'postponed';
  const isCancelled = m.status === 'cancelled';
  const hasScore = m.home_score != null && m.away_score != null;
  const compName = m.competition ? localize(m.competition.name, locale) : '';
  const context = [compName, m.week ? `${isAr ? 'الجولة' : 'Round'} ${m.week}` : null].filter(Boolean).join(' · ');

  // Open a team's page *within this competition* — the same in-competition view
  // the standings/teams tabs open (not the global cross-competition profile), by
  // deep-linking into the competition page with ?team=.
  const openTeam = (teamId?: number) => {
    const c = m.competition;
    if (!c || teamId == null) return;
    const name = typeof c.name === 'string' ? { ar: c.name, en: c.name } : c.name;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const p = new URLSearchParams({
      url: `${origin}/api/competitions/${c.id}/data`,
      title: compName,
      titleAr: name.ar,
      titleEn: name.en,
      team: String(teamId),
    });
    router.push(`/competition?${p.toString()}`);
  };

  type Ev = { minute: number | null; side: 'home' | 'away'; main: string; sub?: string; icon: string; cls: string; playerId?: number | null };
  const events: Ev[] = [
    ...m.goals.map(g => ({
      minute: g.minute, side: g.side, main: g.scorer || '—', playerId: g.scorer_id,
      sub: [
        g.assist && `🅰️ ${g.assist}`,
        g.is_penalty && (isAr ? 'ركلة جزاء' : 'pen'),
        g.is_own_goal && (isAr ? 'عكسي' : 'OG'),
      ].filter(Boolean).join(' · ') || undefined,
      icon: '⚽', cls: 'bg-gold/15 text-gold',
    })),
    ...m.cards.map(c => ({
      minute: c.minute, side: c.side, main: c.player || '—',
      sub: c.type === 'second_yellow' ? (isAr ? 'صفراء ثانية' : '2nd yellow') : undefined,
      icon: CARD_ICON[c.type]?.icon ?? '🟨', cls: CARD_ICON[c.type]?.cls ?? 'bg-gold/15 text-gold',
    })),
    ...m.subs.map(s => ({
      minute: s.minute, side: s.side, main: s.in || '—',
      sub: s.out ? `🔻 ${s.out}` : undefined,
      icon: '🔁', cls: 'bg-win/15 text-win',
    })),
  ].sort((a, b) => (b.minute ?? -1) - (a.minute ?? -1));

  const hasEvents = events.length > 0;

  return (
    <div className="min-h-screen bg-darkBg pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-cardBg/90 backdrop-blur border-b border-bdr flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-aqua text-xl font-bold leading-none">‹</button>
        <span className="flex-1 text-aqua font-bold text-sm truncate">{context || (isAr ? 'المباراة' : 'Match')}</span>
        <button onClick={() => setShare(true)} className="text-gold text-lg leading-none" aria-label="share">↗</button>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-b from-cardBg to-cardBg2 border-b border-bdr px-4 py-8 text-center">
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(60%_100%_at_50%_0,rgb(var(--accent-rgb)/0.18),transparent_70%)] pointer-events-none" />
        {context && <p className="relative text-hint text-xs mb-5">{context}</p>}
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button onClick={() => openTeam(m.home.id)} aria-label={homeName}
            className="flex flex-col items-center gap-2 group focus:outline-none">
            <TeamAvatar url={m.home.logo} name={homeName} size={64} />
            <p className="text-sm font-bold leading-tight text-center group-hover:text-aqua group-active:opacity-80 transition-colors">{homeName}</p>
          </button>
          <div className="flex flex-col items-center gap-1 min-w-[100px]">
            {hasScore && (isCompleted || isLive) ? (
              <div className="flex items-baseline gap-2 font-extrabold tnum">
                <span className="text-5xl text-text" style={{ textShadow: '0 0 30px rgb(var(--accent-rgb)/0.3)' }}>{m.home_score}</span>
                <span className="text-2xl text-hint">-</span>
                <span className="text-5xl text-text">{m.away_score}</span>
              </div>
            ) : (
              <span className="text-aqua font-extrabold text-2xl tnum">{m.time || '--:--'}</span>
            )}
            {m.home_penalty != null && m.away_penalty != null && (
              <span className="text-[11px] font-bold text-gold tabular-nums">
                {isAr ? `ركلات الجزاء ${m.home_penalty}-${m.away_penalty}` : `Pens ${m.home_penalty}-${m.away_penalty}`}
              </span>
            )}
            <span className={`mt-1 text-[11px] font-bold px-3 py-0.5 rounded-full ${
              isLive ? 'bg-loss/20 text-loss' :
              isCompleted ? 'bg-win/15 text-win border border-win/30' :
              isPostponed ? 'bg-gold/15 text-gold' :
              isCancelled ? 'bg-loss/15 text-loss' :
              'bg-cardBg2 text-hint'
            }`}>
              {isLive ? (isAr ? '● مباشر' : '● LIVE') :
               isCompleted ? (isAr ? 'انتهت' : 'FT') :
               isPostponed ? (isAr ? 'مؤجلة' : 'Postponed') :
               isCancelled ? (isAr ? 'ملغاة' : 'Cancelled') :
               formatMatchDate(m.date, locale)}
            </span>
          </div>
          <button onClick={() => openTeam(m.away.id)} aria-label={awayName}
            className="flex flex-col items-center gap-2 group focus:outline-none">
            <TeamAvatar url={m.away.logo} name={awayName} size={64} />
            <p className="text-sm font-bold leading-tight text-center group-hover:text-aqua group-active:opacity-80 transition-colors">{awayName}</p>
          </button>
        </div>
        {m.venue && <p className="relative text-hint text-[11px] mt-4">🏟️ {m.venue}</p>}
        {m.note && (
          <p className="relative text-gold text-[11px] mt-2 mx-auto max-w-md leading-relaxed bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">
            📝 {m.note}
          </p>
        )}
      </div>

      {/* Tab bar — only shown when there are events */}
      {hasEvents && (
        <div className="flex items-center gap-1 border-b border-bdr overflow-x-auto no-scrollbar px-4 bg-cardBg/50">
          <div className="px-3 py-2.5 text-sm font-bold border-b-2 border-aqua text-aqua whitespace-nowrap">
            {isAr ? 'الأحداث' : 'Events'}
          </div>
        </div>
      )}

      {/* Events timeline */}
      <div className="p-4">
        {!hasEvents ? (
          <div className="bg-cardBg border border-bdr rounded-2xl p-8 text-center text-hint text-sm">
            {isAr ? 'لا توجد أحداث مسجّلة لهذه المباراة' : 'No recorded events for this match'}
          </div>
        ) : (
          <div className="relative">
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-bdr to-transparent" />
            {events.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_44px_1fr] items-center gap-2 py-1.5">
                <div className={e.side === 'home' ? 'col-start-1' : 'col-start-3'}>
                  <div className={`flex items-center gap-2 bg-cardBg border border-bdr rounded-xl px-3 py-2 ${e.side === 'home' ? 'flex-row-reverse text-start' : ''}`}>
                    <span className={`w-6 h-6 rounded-lg grid place-items-center text-xs flex-shrink-0 ${e.cls}`}>{e.icon}</span>
                    <div className="min-w-0">
                      {e.playerId
                        ? <button onClick={() => router.push(`/player?id=${e.playerId}`)} className="text-text text-xs font-bold truncate hover:text-aqua transition-colors block">{e.main}</button>
                        : <p className="text-text text-xs font-bold truncate">{e.main}</p>}
                      {e.sub && <p className="text-hint text-[10px] truncate">{e.sub}</p>}
                    </div>
                  </div>
                </div>
                <span className="col-start-2 justify-self-center text-hint text-[11px] font-bold tnum bg-darkBg border border-bdr rounded-full w-10 text-center py-0.5 z-10">
                  {e.minute != null ? `${e.minute}'` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {share && <ShareSheet m={m} homeName={homeName} awayName={awayName} compName={compName} locale={locale} onClose={() => setShare(false)} />}
    </div>
  );
}

function ShareSheet({ m, homeName, awayName, compName, locale, onClose }: {
  m: MatchFull; homeName: string; awayName: string; compName: string; locale: string; onClose: () => void;
}) {
  const isAr = locale === 'ar';
  const text = `${homeName} ${m.home_score ?? ''} - ${m.away_score ?? ''} ${awayName} · ${compName} · youthscores.org`;
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const wa = `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const scorers = m.goals.filter(g => g.scorer);

  return (
    <div className="fixed inset-0 z-[200] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full bg-gradient-to-b from-cardBg to-cardBg2 rounded-t-3xl border-t border-bdr p-4 pb-8" onClick={e => e.stopPropagation()}>
        <div className="w-9 h-1 bg-bdr rounded-full mx-auto mb-4" />
        <p className="text-center text-hint text-sm font-bold mb-3">{isAr ? 'شارك النتيجة' : 'Share result'}</p>
        <div className="relative rounded-2xl overflow-hidden border border-bdr p-5 bg-gradient-to-br from-[#0c2036] to-[#0a1730]">
          <div className="absolute inset-0 opacity-60 bg-[radial-gradient(90%_70%_at_100%_0,rgb(var(--gold-rgb)/0.28),transparent_55%),radial-gradient(70%_60%_at_0_100%,rgb(var(--accent-rgb)/0.18),transparent_55%)]" />
          <div className="relative flex items-center justify-between mb-4">
            <span className="text-[11px] text-hint truncate">{compName}</span>
            <span className="text-aqua font-extrabold text-xs whitespace-nowrap">يوث سكورز</span>
          </div>
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <div className="flex flex-col items-center gap-2">
              <TeamAvatar url={m.home.logo} name={homeName} size={48} />
              <span className="text-xs font-bold">{homeName}</span>
            </div>
            <span className="text-3xl font-extrabold tnum text-gold">{m.home_score} - {m.away_score}</span>
            <div className="flex flex-col items-center gap-2">
              <TeamAvatar url={m.away.logo} name={awayName} size={48} />
              <span className="text-xs font-bold">{awayName}</span>
            </div>
          </div>
          {scorers.length > 0 && <p className="relative text-hint text-[10px] text-center mt-3 truncate">⚽ {scorers.map(g => g.scorer).join(' · ')}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#25D366] text-[#053a1a] font-bold py-3 rounded-xl text-sm">💬 واتساب</a>
          <a href={fb} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#1877F2] text-white font-bold py-3 rounded-xl text-sm">📘 فيسبوك</a>
        </div>
      </div>
    </div>
  );
}
