'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tAcademies, type TAcademy } from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { Card, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

export default function AcademiesPage() {
  const tt = useTT();
  const [academies, setAcademies] = useState<TAcademy[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    tAcademies().then(setAcademies).catch(() => setAcademies([])).finally(() => setLoading(false));
  }, []);

  const filtered = academies.filter(a => a.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-text">{tt('الأكاديميات', 'Academies')}</h1>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={tt('بحث…', 'Search…')}
        className="w-full bg-darkBg border border-bdr rounded-xl px-4 py-2.5 text-text text-sm outline-none focus:border-aqua" />

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon="🏫" text={tt('لا توجد أكاديميات', 'No academies')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(a => (
            <Link key={a.id} href={`/academy?id=${a.id}`}>
              <Card className="p-3 flex items-center gap-3 hover:border-aqua/50 transition-colors">
                <LogoAvatar src={a.logo_path} name={a.name} size={48} />
                <div className="min-w-0">
                  <div className="font-bold text-text truncate">{a.name}</div>
                  <div className="text-[11px] text-hint truncate">
                    {[a.training_place, a.teams ? `${a.teams.length} ${tt('فرق', 'teams')}` : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
