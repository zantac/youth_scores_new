'use client';
import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';
import Spinner from '@/components/ui/Spinner';
import { localize, safeUrl } from '@/lib/utils';

export default function VenuesPage() {
  const { config, configLoading, locale, markVenuesSeen } = useApp();
  const [q, setQ] = useState('');
  const isAr = locale === 'ar';

  // Opening the Venues page clears its bottom-bar badge (and keeps it cleared
  // while viewing, even across a background feed refresh).
  useEffect(() => { markVenuesSeen(); }, [markVenuesSeen]);

  const venues = (config?.venues ?? []).filter(v =>
    !q || localize(v.name, locale).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <AppBar title={isAr ? 'الملاعب' : 'Venues'} />

      <div className="p-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={isAr ? 'بحث...' : 'Search...'}
          className="w-full bg-cardBg border border-bdr rounded-xl px-4 py-2.5 text-text text-sm placeholder-hint outline-none focus:border-aqua mb-3" />

        {configLoading && !config && <Spinner />}

        <div className="space-y-2">
          {venues.map(v => (
            <div key={v.venue_id} className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl flex items-center gap-3 px-4 py-3 transition-all hover:border-aqua/30">
              <span className="w-10 h-10 rounded-xl grid place-items-center text-lg bg-aqua/10 border border-aqua/20 flex-shrink-0">🏟️</span>
              <span className="flex-1 text-text text-sm font-medium">{localize(v.name, locale)}</span>
              {safeUrl(v.url) && (
                <a href={safeUrl(v.url)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-aqua text-xs font-bold bg-aqua/10 border border-aqua/30 rounded-lg px-3 py-1.5 hover:bg-aqua/20 transition-colors">
                  📍 {isAr ? 'الخريطة' : 'Map'}
                </a>
              )}
            </div>
          ))}
          {!configLoading && venues.length === 0 && (
            <p className="text-center text-hint py-12">{isAr ? 'لا توجد ملاعب' : 'No venues'}</p>
          )}
        </div>
      </div>
    </>
  );
}
