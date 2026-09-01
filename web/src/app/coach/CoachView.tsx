'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchCoach } from '@/lib/api';
import { localize, cloudinaryUrl } from '@/lib/utils';
import type { CoachFull } from '@/lib/types';

// Coach profile keyed by an explicit id prop. Rendered by the /coach/[id] path
// route (id from the URL path) and reused via the legacy redirect shim.
export default function CoachView({ id }: { id: string }) {
  const { locale } = useApp();
  const router = useRouter();
  const [c, setC] = useState<CoachFull | null>(null);
  const [loading, setLoading] = useState(true);
  const isAr = locale === 'ar';

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    fetchCoach(id).then(setC).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-[70vh] grid place-items-center"><div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" /></div>;
  if (!c) return <div className="p-8 text-center text-hint">{isAr ? 'غير موجود' : 'Not found'}</div>;

  const name = localize(c.name, locale);
  const monogram = name.split(/\s+/).map(w => w[0]).slice(0, 2).join('');

  return (
    <div className="min-h-screen bg-darkBg pb-24">
      <div className="sticky top-[var(--header-h,0px)] z-30 bg-cardBg/90 backdrop-blur border-b border-bdr flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-aqua text-xl font-bold">‹</button>
        <span className="flex-1 text-aqua font-bold text-sm truncate">{name}</span>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-b from-cardBg to-cardBg2 border-b border-bdr p-5">
        <div className="absolute -left-10 -top-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,rgb(var(--accent-rgb)/0.16),transparent_65%)]" />
        <div className="relative flex items-center gap-4">
          {c.photo
            ? <img src={c.photo} alt={name} className="w-20 h-20 rounded-2xl object-cover" />
            : <div className="w-20 h-20 rounded-2xl grid place-items-center text-2xl font-black text-on-accent bg-gradient-to-br from-aqua to-aqua/70 shadow-[0_10px_26px_-8px_rgb(var(--accent-rgb))]">{monogram}</div>}
          <div>
            <h1 className="text-xl font-extrabold">{name}</h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {c.birth_year && <span className="text-[11px] text-teal bg-cardBg2 border border-bdr rounded-full px-2.5 py-0.5 tnum">{isAr ? 'مواليد' : 'Born'} {c.birth_year}</span>}
              {localize(c.nationality, locale) && <span className="text-[11px] text-teal bg-cardBg2 border border-bdr rounded-full px-2.5 py-0.5">{localize(c.nationality, locale)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Career */}
      <div className="px-4 pt-4">
        <h2 className="text-text font-bold text-sm mb-3">{isAr ? 'المسيرة' : 'Career'}</h2>
        {c.career.length === 0 ? (
          <p className="text-hint text-sm text-center py-4">{isAr ? 'لا توجد بيانات مسيرة' : 'No career data'}</p>
        ) : (
          <div className="space-y-3">
            {c.career.map((r, i) => (
              <div key={i}
                className={`relative flex items-stretch overflow-hidden rounded-2xl border bg-gradient-to-b from-cardBg to-cardBg2 ${r.current ? 'border-gold/40' : 'border-bdr'}`}>
                <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-[radial-gradient(circle,rgb(var(--accent-rgb)/0.12),transparent_65%)]" />
                {/* Club logo — big, spanning the full card height. No own
                    background so the card's gradient shows through unbroken. */}
                <div className="relative w-24 flex-shrink-0 grid place-items-center p-2.5">
                  {r.logo
                    ? <img src={cloudinaryUrl(r.logo, 128)} alt="" className="w-full h-full object-contain" />
                    : <span className="text-3xl">🛡️</span>}
                </div>
                <div className="relative flex-1 min-w-0 p-3 flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <p className="text-text text-base font-extrabold truncate flex-1">{r.club}</p>
                    {r.current && (
                      <span className="text-[9px] font-bold text-gold bg-gold/10 border border-gold/30 rounded px-1.5 py-0.5 flex-shrink-0">
                        {isAr ? 'حالي' : 'now'}
                      </span>
                    )}
                  </div>
                  {localize(r.alt_name, locale) && <p className="text-hint text-[11px] mt-0.5 truncate">{localize(r.alt_name, locale)}</p>}
                  <p className="text-teal text-xs mt-1 truncate">{localize(r.role, locale)}</p>
                  {localize(r.age, locale) && <p className="text-hint text-[11px] mt-1 truncate">{localize(r.age, locale)}</p>}
                  {localize(r.season, locale) && <p className="text-hint text-[11px] mt-0.5 truncate">{localize(r.season, locale)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
