'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { tPlayer, type TPlayer } from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { Card, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

function PlayerContent() {
  const tt = useTT();
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const [p, setP] = useState<TPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    tPlayer(id).then(setP).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (notFound || !p) return <EmptyState icon="🔍" text={tt('اللاعب غير موجود', 'Player not found')} />;

  const info: [string, string | null][] = [
    [tt('المركز', 'Position'), p.position],
    [tt('القدم/المركز الفرعي', 'Sub-position'), p.sub_position],
    [tt('تاريخ الميلاد', 'Date of birth'), p.dob],
    [tt('الرقم', 'Jersey'), p.jersey_number != null ? `#${p.jersey_number}` : null],
  ];

  return (
    <div className="space-y-4">
      <Card className="p-5 flex items-center gap-4">
        <LogoAvatar src={p.photo_path} name={p.name} size={72} />
        <div>
          <h1 className="text-xl font-black text-text">{p.name}</h1>
          <p className="text-sm text-teal font-bold">{p.position}</p>
        </div>
      </Card>
      <Card className="p-4">
        <dl className="grid grid-cols-2 gap-3">
          {info.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-hint">{k}</dt>
              <dd className="font-bold text-text text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

export default function PlayerPage() {
  return <Suspense fallback={<Spinner />}><PlayerContent /></Suspense>;
}
