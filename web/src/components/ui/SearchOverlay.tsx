'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchSearch } from '@/lib/api';
import { localize } from '@/lib/utils';
import type { SearchResults } from '@/lib/types';

const EMPTY: SearchResults = { clubs: [], players: [], coaches: [] };

/** Full-screen search over clubs (teams), players and coaches. Opened from the
 *  controls bar; each hit deep-links to that entity's profile page. */
export default function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { locale } = useApp();
  const router = useRouter();
  const isAr = locale === 'ar';
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced query — a fresh request supersedes the last, and a stale response
  // is dropped so results never flicker back to an earlier term.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(EMPTY); setLoading(false); return; }
    setLoading(true);
    let alive = true;
    const t = setTimeout(() => {
      fetchSearch(term)
        .then(r => { if (alive) setRes(r); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const total = res.clubs.length + res.players.length + res.coaches.length;
  const go = (path: string) => { onClose(); router.push(path); };

  const born = (y: number) => (isAr ? `مواليد ${y}` : String(y));

  const sections = useMemo(() => ([
    {
      key: 'clubs',
      label: isAr ? 'الفرق' : 'Teams',
      rows: res.clubs.map(c => ({
        id: c.id, path: `/club?id=${c.id}`, img: c.logo, round: false,
        name: localize(c.name, locale), sub: c.city ? localize(c.city, locale) : '',
      })),
    },
    {
      key: 'players',
      label: isAr ? 'اللاعبون' : 'Players',
      rows: res.players.map(p => ({
        id: p.id, path: `/player?id=${p.id}`, img: p.photo, round: true,
        name: localize(p.name, locale),
        sub: [p.club ? localize(p.club, locale) : '', p.position ? localize(p.position, locale) : '', p.birth_year ? born(p.birth_year) : '']
          .filter(Boolean).join(' · '),
      })),
    },
    {
      key: 'coaches',
      label: isAr ? 'المدربون' : 'Coaches',
      rows: res.coaches.map(c => ({
        id: c.id, path: `/coach?id=${c.id}`, img: c.photo, round: true,
        name: localize(c.name, locale),
        sub: [c.role ? localize(c.role, locale) : (isAr ? 'مدرب' : 'Coach'), c.club ? localize(c.club, locale) : '']
          .filter(Boolean).join(' · '),
      })),
    },
  ]), [res, locale, isAr]);

  const typed = q.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg mx-auto flex flex-col min-h-0 flex-1">
        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 py-3 bg-cardBg border-b border-bdr safe-top">
          <span className="text-hint text-lg" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={isAr ? 'ابحث عن فريق أو لاعب أو مدرب…' : 'Search teams, players, coaches…'}
            className="flex-1 bg-transparent text-text text-sm placeholder:text-hint outline-none"
          />
          {q && <button onClick={() => setQ('')} className="text-hint text-lg leading-none px-1" aria-label="clear">✕</button>}
          <button onClick={onClose} className="text-aqua text-sm font-bold px-2">{isAr ? 'إلغاء' : 'Cancel'}</button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto bg-darkBg/95">
          {!typed ? (
            <p className="text-hint text-xs text-center px-6 py-10">
              {isAr ? 'اكتب حرفين على الأقل للبحث' : 'Type at least two characters to search'}
            </p>
          ) : loading && total === 0 ? (
            <div className="grid place-items-center py-12">
              <div className="w-6 h-6 border-2 border-bdr border-t-aqua rounded-full animate-spin" />
            </div>
          ) : total === 0 ? (
            <p className="text-hint text-xs text-center px-6 py-10">
              {isAr ? 'لا توجد نتائج' : 'No results'}
            </p>
          ) : (
            <div className="p-3 space-y-4 pb-24">
              {sections.filter(s => s.rows.length).map(s => (
                <div key={s.key}>
                  <p className="text-hint text-[10px] font-bold uppercase tracking-wide px-1 mb-1.5">{s.label}</p>
                  <div className="bg-cardBg border border-bdr rounded-xl overflow-hidden">
                    {s.rows.map((r, i) => (
                      <button
                        key={r.id}
                        onClick={() => go(r.path)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-start active:bg-aqua/5 hover:bg-aqua/[0.04] transition-colors ${i > 0 ? 'border-t border-bdr/40' : ''}`}
                      >
                        {r.img
                          ? <img src={r.img} alt="" className={`w-9 h-9 bg-darkBg flex-shrink-0 ${r.round ? 'rounded-full object-cover' : 'rounded-lg object-contain'}`} />
                          : <span className={`w-9 h-9 grid place-items-center bg-darkBg text-hint text-sm flex-shrink-0 ${r.round ? 'rounded-full' : 'rounded-lg'}`}>{s.key === 'clubs' ? '🛡️' : '👤'}</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block text-text text-sm font-bold truncate">{r.name || '—'}</span>
                          {r.sub && <span className="block text-hint text-[11px] truncate">{r.sub}</span>}
                        </span>
                        <span className="text-hint text-xs">{isAr ? '‹' : '›'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
