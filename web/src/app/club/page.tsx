'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';
import { fetchClub } from '@/lib/api';
import { localize, safeUrl } from '@/lib/utils';
import type { ClubPublic } from '@/lib/types';

export default function ClubPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] grid place-items-center"><div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" /></div>}>
      <ClubProfile />
    </Suspense>
  );
}

function ClubProfile() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const { locale } = useApp();
  const router = useRouter();
  const [c, setC] = useState<ClubPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const isAr = locale === 'ar';

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    fetchClub(id).then(setC).finally(() => setLoading(false));
  }, [id]);

  const name = c ? localize(c.name, locale) : '';

  const socials = c ? ([
    ['website', c.website, '🌐'], ['facebook', c.facebook, 'f'],
    ['instagram', c.instagram, '📷'], ['youtube', c.youtube, '▶'], ['twitter', c.twitter, '𝕏'],
  ] as const)
    .map(([k, url, icon]) => [k, safeUrl(url), icon] as const)
    .filter(([, url]) => url) : [];

  return (
    <>
      <AppBar title={name || (isAr ? 'النادي' : 'Club')} back />
      {loading ? (
        <div className="min-h-[60vh] grid place-items-center"><div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" /></div>
      ) : !c ? (
        <div className="p-8 text-center text-hint">{isAr ? 'النادي غير موجود' : 'Club not found'}</div>
      ) : (
        <div className="pb-24">
          {/* Hero */}
          <div className="relative overflow-hidden bg-gradient-to-b from-cardBg to-cardBg2 border-b border-bdr p-5 flex items-center gap-4">
            <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,rgb(var(--accent-rgb)/0.14),transparent_65%)]" />
            {c.logo ? <img src={c.logo} alt={name} className="relative w-20 h-20 rounded-2xl object-contain bg-darkBg" /> : <div className="relative w-20 h-20 rounded-2xl bg-darkBg grid place-items-center text-3xl">🛡️</div>}
            <div className="relative min-w-0">
              <h1 className="text-xl font-extrabold truncate">{name}</h1>
              {localize(c.city, locale) && <p className="text-hint text-xs flex items-center gap-1 mt-1">📍 {localize(c.city, locale)}</p>}
              {socials.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {socials.map(([k, url, icon]) => (
                    <a key={k} href={url!} target="_blank" rel="noopener noreferrer"
                      className="w-7 h-7 rounded-lg bg-cardBg2 border border-bdr grid place-items-center text-teal text-xs hover:border-aqua/40">{icon}</a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Youth-sector managers */}
          <div className="px-4 pt-5">
            <h2 className="text-text font-bold text-sm mb-3">{isAr ? 'مسؤولو قطاع الناشئين' : 'Youth Sector Staff'}</h2>
            {c.managers.length === 0 ? (
              <p className="text-hint text-sm text-center py-4">{isAr ? 'لا توجد بيانات' : 'No data'}</p>
            ) : (
              <div className="space-y-2">
                {c.managers.map(m => (
                  <button key={`${m.id}-${m.role?.ar ?? ''}`} onClick={() => router.push(`/coach?id=${m.id}`)}
                    className="w-full flex items-center gap-3 bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-3 text-start hover:border-aqua/40 transition-colors">
                    {m.photo ? <img src={m.photo} alt="" className="w-10 h-10 rounded-full object-cover bg-darkBg flex-shrink-0" /> : <div className="w-10 h-10 rounded-full bg-darkBg grid place-items-center flex-shrink-0">👤</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-text font-bold text-sm truncate">{localize(m.name, locale)}</p>
                      <p className="text-teal text-[11px] truncate">{localize(m.role, locale) || '—'}</p>
                    </div>
                    <span className="text-aqua text-xs flex-shrink-0">›</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Teams by age / season */}
          <div className="px-4 pt-5">
            <h2 className="text-text font-bold text-sm mb-3">{isAr ? 'الفرق' : 'Teams'}</h2>
            {c.teams.length === 0 ? (
              <p className="text-hint text-sm text-center py-4">{isAr ? 'لا توجد فرق' : 'No teams'}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {c.teams.map(t => (
                  <button key={t.id} onClick={() => router.push(`/team?id=${t.id}`)}
                    className="bg-cardBg border border-bdr rounded-xl px-3 py-2.5 text-start hover:border-aqua/40 transition-colors">
                    <p className="text-text text-sm font-bold truncate">{localize(t.age, locale) || localize(t.name, locale)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
