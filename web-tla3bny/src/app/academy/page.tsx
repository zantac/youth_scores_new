'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tAcademy, mediaUrl, type TAcademy } from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { Card, EmptyState, LogoAvatar, useTT, useName } from '@/components/tla3bny/kit';

function AcademyContent() {
  const tt = useTT();
  const nm = useName();
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const [a, setA] = useState<TAcademy | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    tAcademy(id).then(setA).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (notFound || !a) return <EmptyState icon="🔍" text={tt('الأكاديمية غير موجودة', 'Academy not found')} />;

  return (
    <div className="space-y-4">
      <Link href="/academies" className="text-sm text-hint hover:text-aqua">← {tt('كل الأكاديميات', 'All academies')}</Link>

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <LogoAvatar src={a.logo_path} name={nm(a.name, a.name_en)} size={72} />
          <div className="min-w-0">
            <h1 className="text-xl font-black text-text">{nm(a.name, a.name_en)}</h1>
            {a.training_place && <p className="text-sm text-hint">📍 {a.training_place}</p>}
          </div>
        </div>
        {a.description && <p className="text-sm text-hint mt-3 whitespace-pre-line">{a.description}</p>}
        <div className="flex flex-wrap gap-2 mt-4">
          {a.phone && <a href={`tel:${a.phone}`} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-cardBg2 border border-bdr text-text">📞 {a.phone}</a>}
          {a.facebook_url && <a href={a.facebook_url} target="_blank" rel="noreferrer" className="text-xs font-bold px-3 py-1.5 rounded-lg bg-cardBg2 border border-bdr text-aqua">f {tt('فيسبوك', 'Facebook')}</a>}
        </div>
      </Card>

      {a.managers.length > 0 && (
        <section>
          <h2 className="font-black text-text mb-2">{tt('الإدارة', 'Management')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {a.managers.map(m => (
              <Card key={m.id} className="p-3">
                <div className="font-bold text-text text-sm">{m.name}</div>
                <div className="text-[11px] text-hint">{[m.role, m.phone].filter(Boolean).join(' · ')}</div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-black text-text mb-2">{tt('الفرق', 'Teams')}</h2>
        {a.teams && a.teams.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {a.teams.map(t => (
              <Link key={t.id} href={`/team?id=${t.id}`}>
                <Card className="p-3 flex items-center justify-between hover:border-aqua/50 transition-colors">
                  <span className="font-bold text-text text-sm">{nm(t.display_name, t.display_name_en)}</span>
                  <span className="text-[11px] text-teal font-bold">{t.age_category}</span>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon="⚽" text={tt('لا فرق بعد', 'No teams yet')} />
        )}
      </section>
    </div>
  );
}

export default function AcademyPage() {
  return <Suspense fallback={<Spinner />}><AcademyContent /></Suspense>;
}
