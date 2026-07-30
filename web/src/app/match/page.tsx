'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchMatchFull } from '@/lib/api';
import { localize, formatMatchDate } from '@/lib/utils';
import type { MatchFull } from '@/lib/types';

const CARD_ICON: Record<string, { icon: string; cls: string }> = {
  yellow:        { icon: '🟨', cls: 'bg-yellow/15 text-yellow' },
  second_yellow: { icon: '🟨', cls: 'bg-orange/15 text-orange' },
  red:           { icon: '🟥', cls: 'bg-loss/15 text-loss' },
};

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
  // Derived before conditional returns so it can be used in a hook below.
  const isLive = m?.status === 'live';

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    fetchMatchFull(id).then(setM).finally(() => setLoading(false));
  }, [id]);

  // Poll the match endpoint every 20 s while the status is live so the score
  // and event list stay current without any websocket infrastructure.
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
  const compName = m.competition ? localize(m.competition.name, locale) : '';

  type Ev = { minute: number | null; side: 'home' | 'away'; main: string; sub?: string; icon: string; cls: string; playerId?: number | null };
  const events: Ev[] = [
    ...m.goals.map(g => ({ minute: g.minute, side: g.side, main: g.scorer || '—', playerId: g.scorer_id,
      sub: [g.assist && `${isAr ? 'صناعة' : 'assist'} ${g.assist}`, g.is_penalty && (isAr ? 'ركلة جزاء' : 'pen'), g.is_own_goal && (isAr ? 'عكسي' : 'OG')].filter(Boolean).join(' · ') || undefined,
      icon: '⚽', cls: 'bg-gold/15 text-gold' })),
    ...m.cards.map(c => ({ minute: c.minute, side: c.side, main: c.player || '—', icon: CARD_ICON[c.type]?.icon ?? '🟨', cls: CARD_ICON[c.type]?.cls ?? 'bg-yellow/15 text-yellow' })),
    ...m.subs.map(s => ({ minute: s.minute, side: s.side, main: s.in || '—', sub: s.out ? `${isAr ? 'خروج' : 'off'} ${s.out}` : undefined, icon: '🔁', cls: 'bg-win/15 text-win' })),
  ].sort((a, b) => (b.minute ?? -1) - (a.minute ?? -1));

  const Crest = ({ url, size = 'w-16 h-16' }: { url?: string; size?: string }) =>
    url ? <img src={url} alt="" className={`${size} object-contain drop-shadow-lg`} /> : <div className={`${size} rounded-full bg-bdr grid place-items-center text-xl`}>⚽</div>;

  return (
    <div className="min-h-screen bg-darkBg pb-24">
      <div className="sticky top-0 z-30 bg-cardBg/90 backdrop-blur border-b border-bdr flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-aqua text-xl font-bold">‹</button>
        <span className="flex-1 text-aqua font-bold text-sm truncate">{compName || (isAr ? 'المباراة' : 'Match')}</span>
        <button onClick={() => setShare(true)} className="text-gold text-lg" aria-label="share">↗</button>
      </div>

      <div className="relative overflow-hidden bg-gradient-to-b from-cardBg to-cardBg2 border-b border-bdr px-4 py-6 text-center">
        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(60%_100%_at_50%_0,rgb(var(--accent-rgb)/0.16),transparent_70%)] pointer-events-none" />
        <p className="relative text-hint text-xs mb-5">{compName}{m.week ? ` · ${isAr ? 'الجولة' : 'Round'} ${m.week}` : ''}</p>
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex flex-col items-center gap-2"><Crest url={m.home.logo} /><p className="text-sm font-bold leading-tight">{homeName}</p></div>
          <div className="flex flex-col items-center">
            {isCompleted || isLive ? (
              <div className="flex items-baseline gap-3 font-extrabold tnum">
                <span className="text-5xl text-text" style={{ textShadow: '0 0 30px rgb(var(--accent-rgb)/0.3)' }}>{m.home_score}</span>
                <span className="text-2xl text-hint">-</span>
                <span className="text-5xl text-text">{m.away_score}</span>
              </div>
            ) : <span className="text-aqua font-extrabold text-2xl tnum">{m.time}</span>}
            {m.home_penalty != null && m.away_penalty != null && (
              <span className="text-gold text-xs mt-1 tnum">{isAr ? 'ركلات' : 'Pens'} {m.home_penalty}-{m.away_penalty}</span>
            )}
            <span className={`mt-2 text-[11px] font-bold px-3 py-0.5 rounded-full ${isLive ? 'bg-loss/20 text-loss' : isCompleted ? 'bg-win/15 text-win border border-win/30' : 'bg-cardBg2 text-hint'}`}>
              {isLive ? (isAr ? '● مباشر' : '● LIVE') : isCompleted ? (isAr ? 'انتهت' : 'FT') : formatMatchDate(m.date, locale)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-2"><Crest url={m.away.logo} /><p className="text-sm font-bold leading-tight">{awayName}</p></div>
        </div>
        {m.venue && <p className="relative text-hint text-[11px] mt-4">🏟️ {m.venue}</p>}
        {m.note && (
          <p className="relative text-gold text-[11px] mt-2 mx-auto max-w-md leading-relaxed bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">
            📝 {m.note}
          </p>
        )}
      </div>

      <div className="p-4">
        {events.length === 0 ? (
          <div className="bg-cardBg border border-bdr rounded-2xl p-8 text-center text-hint text-sm">
            {isAr ? 'لا توجد أحداث مسجّلة لهذه المباراة' : 'No recorded events for this match'}
          </div>
        ) : (
          <div className="relative">
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-gradient-to-b from-bdr to-transparent" />
            {events.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_44px_1fr] items-center gap-2 py-1.5">
                <div className={e.side === 'home' ? 'col-start-1' : 'col-start-3'}>
                  <div className={`flex items-center gap-2 bg-cardBg border border-bdr rounded-xl px-3 py-2 ${e.side === 'home' ? 'flex-row-reverse text-start' : ''}`}>
                    <span className={`w-6 h-6 rounded-lg grid place-items-center text-xs flex-shrink-0 ${e.cls}`}>{e.icon}</span>
                    <div className="min-w-0">
                      {e.playerId
                        ? <button onClick={() => router.push(`/player?id=${e.playerId}`)} className="text-text text-xs font-bold truncate hover:text-aqua transition-colors">{e.main}</button>
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
            <div className="flex flex-col items-center gap-2">{m.home.logo && <img src={m.home.logo} alt="" className="w-12 h-12 object-contain" />}<span className="text-xs font-bold">{homeName}</span></div>
            <span className="text-3xl font-extrabold tnum text-gold">{m.home_score} - {m.away_score}</span>
            <div className="flex flex-col items-center gap-2">{m.away.logo && <img src={m.away.logo} alt="" className="w-12 h-12 object-contain" />}<span className="text-xs font-bold">{awayName}</span></div>
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
