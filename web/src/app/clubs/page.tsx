'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';
import Spinner from '@/components/ui/Spinner';
import { fetchClubs } from '@/lib/api';
import { hrefFor } from '@/lib/links';
import { localize, cloudinaryUrl } from '@/lib/utils';
import type { ClubListItem } from '@/lib/types';

export default function ClubsPage() {
  const { locale } = useApp();
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const isAr = locale === 'ar';

  useEffect(() => {
    fetchClubs().then(setClubs).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return clubs;
    return clubs.filter(c =>
      localize(c.name, locale).toLowerCase().includes(term) ||
      localize(c.city, locale).toLowerCase().includes(term)
    );
  }, [clubs, q, locale]);

  return (
    <>
      <AppBar title={isAr ? 'الأندية' : 'Clubs'} />
      <div className="p-3">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder={isAr ? 'ابحث عن نادٍ...' : 'Search clubs...'}
          className="w-full bg-cardBg border border-bdr rounded-xl px-4 py-2.5 text-text text-sm placeholder-hint outline-none focus:border-aqua" />
      </div>

      {loading ? <Spinner label={isAr ? 'جاري التحميل...' : 'Loading...'} /> : (
        <div className="px-3 pb-24">
          <p className="text-hint text-xs mb-2">{filtered.length} {isAr ? 'نادٍ' : 'clubs'}</p>
          <div className="space-y-2">
            {filtered.map(c => (
              <button key={c.id} onClick={() => router.push(hrefFor('club', c.id))}
                className="w-full flex items-center gap-3 bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-3 text-start hover:border-aqua/40 transition-colors">
                {c.logo
                  ? <img src={cloudinaryUrl(c.logo, 128)} alt="" className="w-10 h-10 object-contain rounded-lg bg-darkBg flex-shrink-0" />
                  : <div className="w-10 h-10 rounded-lg bg-darkBg grid place-items-center flex-shrink-0">🛡️</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-text text-sm font-bold truncate">{localize(c.name, locale)}</p>
                  {localize(c.city, locale) && <p className="text-hint text-[11px] truncate">📍 {localize(c.city, locale)}</p>}
                </div>
                <span className="text-aqua text-xs flex-shrink-0">›</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-hint text-sm text-center py-8">{isAr ? 'لا نتائج' : 'No results'}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
