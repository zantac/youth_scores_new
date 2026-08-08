'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tAcademies, type TAcademy } from '@/lib/tla3bnyApi';
import { EGYPT_GOVERNORATES } from '@/lib/governorates';
import Spinner from '@/components/ui/Spinner';
import AcademyHero from '@/components/tla3bny/AcademyHero';
import { EmptyState, useTT } from '@/components/tla3bny/kit';

export default function AcademiesPage() {
  const tt = useTT();
  const [academies, setAcademies] = useState<TAcademy[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [gov, setGov] = useState('');

  useEffect(() => {
    tAcademies().then(setAcademies).catch(() => setAcademies([])).finally(() => setLoading(false));
  }, []);

  const filtered = academies.filter(a =>
    a.name.toLowerCase().includes(q.trim().toLowerCase())
    // By governorate: an academy shows if ANY of its branches is there, so one
    // with branches in several governorates appears under each.
    && (!gov || (a.branches ?? []).some(b => b.governorate === gov)));

  const inputCls = 'bg-darkBg border border-bdr rounded-xl px-4 py-2.5 text-text text-sm outline-none focus:border-aqua';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-text">{tt('الأكاديميات', 'Academies')}</h1>
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={tt('بحث…', 'Search…')} className={`flex-1 ${inputCls}`} />
        <select value={gov} onChange={e => setGov(e.target.value)} className={inputCls} aria-label={tt('المحافظة', 'Governorate')}>
          <option value="">{tt('كل المحافظات', 'All governorates')}</option>
          {EGYPT_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon="🏫" text={tt('لا توجد أكاديميات', 'No academies')} />
      ) : (
        <div className="space-y-3">
          {filtered.map(a => (
            <Link key={a.id} href={`/academy?id=${a.id}`}
              className="block hover:opacity-95 active:opacity-80 transition-opacity">
              <AcademyHero academy={a} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
