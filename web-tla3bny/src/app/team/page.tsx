'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tTeam, type TTeam } from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { Card, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

function TeamContent() {
  const tt = useTT();
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const [t, setT] = useState<TTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    tTeam(id).then(setT).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (notFound || !t) return <EmptyState icon="🔍" text={tt('الفريق غير موجود', 'Team not found')} />;

  return (
    <div className="space-y-4">
      {t.academy_id && (
        <Link href={`/academy?id=${t.academy_id}`} className="text-sm text-hint hover:text-aqua">← {t.academy_name}</Link>
      )}
      <Card className="p-5 flex items-center gap-4">
        <LogoAvatar src={t.academy_logo} name={t.academy_name} size={60} />
        <div>
          <h1 className="text-xl font-black text-text">{t.display_name}</h1>
          <p className="text-sm text-teal font-bold">{t.age_category}</p>
        </div>
      </Card>

      {t.coaches && t.coaches.length > 0 && (
        <section>
          <h2 className="font-black text-text mb-2">{tt('الجهاز الفني', 'Coaching staff')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {t.coaches.map(c => (
              <Card key={c.id} className="p-3 flex items-center gap-3">
                <LogoAvatar src={c.photo_path} name={c.name} size={40} />
                <div className="min-w-0">
                  <div className="font-bold text-text text-sm truncate">{c.name}</div>
                  <div className="text-[11px] text-hint">{c.role_ar}</div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-black text-text mb-2">{tt('اللاعبون', 'Players')}</h2>
        {t.players && t.players.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {t.players.map(p => (
              <Link key={p.id} href={`/player?id=${p.player_id}`}>
                <Card className="p-3 flex items-center gap-3 hover:border-aqua/50 transition-colors">
                  <LogoAvatar src={p.photo_path} name={p.player_name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-text text-sm truncate">{p.player_name}</div>
                    <div className="text-[11px] text-hint">{p.position}</div>
                  </div>
                  {p.jersey_number != null && <span className="font-black text-teal tnum">#{p.jersey_number}</span>}
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon="⚽" text={tt('لا لاعبون بعد', 'No players yet')} />
        )}
      </section>
    </div>
  );
}

export default function TeamPage() {
  return <Suspense fallback={<Spinner />}><TeamContent /></Suspense>;
}
