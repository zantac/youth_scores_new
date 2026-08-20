'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { apiAdminSearch, type AdminSearchResults } from '@/lib/adminApi';

const EMPTY: AdminSearchResults = { clubs: [], teams: [], players: [], coaches: [] };

/** Global admin search. Clubs → /admin/club, teams → /admin/team. A player or
 *  coach opens their team's admin page with their edit form auto-opened (so you
 *  can edit/remove them right away); if they have no team, their profile opens. */
export default function AdminSearchOverlay({ onClose }: { onClose: () => void }) {
  const { token } = useAdminAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<AdminSearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || !token) { setRes(EMPTY); setLoading(false); return; }
    setLoading(true);
    let alive = true;
    const t = setTimeout(() => {
      apiAdminSearch(token, term)
        .then(r => { if (alive) setRes(r); })
        .catch(() => { if (alive) setRes(EMPTY); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, token]);

  const total = res.clubs.length + res.teams.length + res.players.length + res.coaches.length;
  const go = (path: string) => { onClose(); router.push(path); };

  const sections = useMemo(() => ([
    {
      key: 'clubs', label: 'الأندية',
      rows: res.clubs.map(c => ({
        id: `c${c.id}`, name: c.name, sub: c.city, icon: '🛡️',
        href: `/admin/club?id=${c.id}`,
      })),
    },
    {
      key: 'teams', label: 'الفرق',
      rows: res.teams.map(t => ({
        id: `t${t.id}`, name: t.name, sub: '', icon: '👕',
        href: `/admin/team?id=${t.id}`,
      })),
    },
    {
      key: 'players', label: 'اللاعبون',
      rows: res.players.map(p => ({
        id: `p${p.id}`, name: p.name, sub: [p.club, `مواليد ${p.birth_year}`].filter(Boolean).join(' · '), icon: '👤',
        href: p.team_id ? `/admin/team?id=${p.team_id}&player=${p.id}` : `/player?id=${p.id}`,
      })),
    },
    {
      key: 'coaches', label: 'المدربون',
      rows: res.coaches.map(c => ({
        id: `co${c.id}`, name: c.name, sub: [c.role || 'مدرب', c.club].filter(Boolean).join(' · '), icon: '👔',
        href: c.team_id ? `/admin/team?id=${c.team_id}&coach=${c.id}` : `/coach?id=${c.id}`,
      })),
    },
  ]), [res]);

  const typed = q.trim().length >= 2;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col" dir="rtl">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl mx-auto flex flex-col min-h-0 flex-1">
        <div className="flex items-center gap-2 px-3 py-3 bg-cardBg border-b border-bdr">
          <span className="text-hint text-lg" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ابحث عن نادٍ أو فريق أو لاعب…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-text text-sm placeholder:text-hint outline-none"
          />
          {q && <button onClick={() => setQ('')} className="text-hint text-lg leading-none px-1" aria-label="clear">✕</button>}
          <button onClick={onClose} className="text-aqua text-sm font-bold px-2">إلغاء</button>
        </div>

        <div className="flex-1 overflow-y-auto bg-darkBg">
          {!typed ? (
            <p className="text-hint text-xs text-center px-6 py-10">اكتب حرفين على الأقل للبحث</p>
          ) : loading && total === 0 ? (
            <div className="grid place-items-center py-12">
              <div className="w-6 h-6 border-2 border-bdr border-t-aqua rounded-full animate-spin" />
            </div>
          ) : total === 0 ? (
            <p className="text-hint text-xs text-center px-6 py-10">لا توجد نتائج</p>
          ) : (
            <div className="p-3 space-y-4 pb-24">
              {sections.filter(s => s.rows.length).map(s => (
                <div key={s.key}>
                  <p className="text-hint text-[10px] font-bold uppercase tracking-wide px-1 mb-1.5">{s.label}</p>
                  <div className="bg-cardBg border border-bdr rounded-xl overflow-hidden">
                    {s.rows.map((r, i) => (
                      <button
                        key={r.id}
                        disabled={!r.href}
                        onClick={() => r.href && go(r.href)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-start transition-colors ${i > 0 ? 'border-t border-bdr/40' : ''} ${r.href ? 'active:bg-aqua/5 hover:bg-aqua/[0.04]' : 'opacity-60 cursor-default'}`}
                      >
                        <span className="w-8 h-8 grid place-items-center bg-darkBg rounded-lg text-sm flex-shrink-0">{r.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-text text-sm font-bold truncate">{r.name || '—'}</span>
                          {r.sub && <span className="block text-hint text-[11px] truncate">{r.sub}</span>}
                        </span>
                        {r.href
                          ? <span className="text-aqua text-xs">‹</span>
                          : <span className="text-hint text-[10px] flex-shrink-0">لا فريق</span>}
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
