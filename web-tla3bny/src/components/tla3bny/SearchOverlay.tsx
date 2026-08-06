'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { tSearch, type TSearchResults } from '@/lib/tla3bnyApi';
import { LogoAvatar, useName, useTT } from './kit';

const EMPTY: TSearchResults = { academies: [], players: [], coaches: [] };

/** Full-screen search over academies, players and coaches, opened from the top
 *  bar. Each hit deep-links to that entity's profile page. */
export default function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { locale } = useApp();
  const tt = useTT();
  const name = useName();
  const router = useRouter();
  const isAr = locale === 'ar';
  const [q, setQ] = useState('');
  const [res, setRes] = useState<TSearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced query; a stale response is dropped so results never flicker back.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(EMPTY); setLoading(false); return; }
    setLoading(true);
    let alive = true;
    const t = setTimeout(() => {
      tSearch(term)
        .then(r => { if (alive) setRes(r); })
        .catch(() => { if (alive) setRes(EMPTY); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const total = res.academies.length + res.players.length + res.coaches.length;
  const go = (path: string) => { onClose(); router.push(path); };

  const sections = useMemo(() => ([
    {
      key: 'academies',
      label: tt('الأكاديميات', 'Academies'),
      rows: res.academies.map(a => ({
        id: a.id, path: `/academy?id=${a.id}`, img: a.logo_path,
        title: name(a.name, a.name_en), sub: '',
      })),
    },
    {
      key: 'players',
      label: tt('اللاعبون', 'Players'),
      rows: res.players.map(p => ({
        id: p.id, path: `/player?id=${p.id}`, img: p.photo_path,
        title: name(p.name, p.name_en), sub: p.position || '',
      })),
    },
    {
      key: 'coaches',
      label: tt('المدربون', 'Coaches'),
      rows: res.coaches.map(c => ({
        id: c.id, path: `/coach?id=${c.id}`, img: c.photo_path,
        title: name(c.name, c.name_en),
        sub: [c.role_ar || tt('مدرب', 'Coach'), c.team_name || ''].filter(Boolean).join(' · '),
      })),
    },
  ]), [res, tt, name]);

  const typed = q.trim().length >= 2;

  // Portal to <body>: the top bar uses backdrop-blur, which would otherwise trap
  // this fixed overlay inside the header's box instead of covering the screen.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl mx-auto flex flex-col min-h-0 flex-1">
        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 py-3 bg-cardBg border-b border-bdr">
          <span className="text-hint text-lg" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={tt('ابحث عن أكاديمية أو لاعب أو مدرب…', 'Search academies, players, coaches…')}
            className="flex-1 bg-transparent text-text text-sm placeholder:text-hint outline-none"
          />
          {q && <button onClick={() => setQ('')} className="text-hint text-lg leading-none px-1" aria-label="clear">✕</button>}
          <button onClick={onClose} className="text-aqua text-sm font-bold px-2">{tt('إلغاء', 'Cancel')}</button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto bg-darkBg/95">
          {!typed ? (
            <p className="text-hint text-xs text-center px-6 py-10">
              {tt('اكتب حرفين على الأقل للبحث', 'Type at least two characters to search')}
            </p>
          ) : loading && total === 0 ? (
            <div className="grid place-items-center py-12">
              <div className="w-6 h-6 border-2 border-bdr border-t-aqua rounded-full animate-spin" />
            </div>
          ) : total === 0 ? (
            <p className="text-hint text-xs text-center px-6 py-10">{tt('لا توجد نتائج', 'No results')}</p>
          ) : (
            <div className="p-3 space-y-4 pb-24">
              {sections.filter(s => s.rows.length).map(s => (
                <div key={s.key}>
                  <p className="text-hint text-[10px] font-bold uppercase tracking-wide px-1 mb-1.5">{s.label}</p>
                  <div className="bg-cardBg border border-bdr rounded-xl overflow-hidden">
                    {s.rows.map((r, i) => (
                      <button key={r.id} onClick={() => go(r.path)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-start active:bg-aqua/5 hover:bg-aqua/[0.04] transition-colors ${i > 0 ? 'border-t border-bdr/40' : ''}`}>
                        <LogoAvatar src={r.img} name={r.title} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-text text-sm font-bold truncate">{r.title || '—'}</span>
                          {r.sub && <span className="block text-hint text-[11px] truncate">{r.sub}</span>}
                        </span>
                        <span className="text-hint text-xs">{tt('‹', '›')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
