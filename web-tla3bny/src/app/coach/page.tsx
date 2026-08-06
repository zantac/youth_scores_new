'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tCoach, mediaUrl, type TCoachDetail } from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { Card, EmptyState, LogoAvatar, useName, useTT } from '@/components/tla3bny/kit';

function CoachContent() {
  const tt = useTT();
  const name = useName();
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const [c, setC] = useState<TCoachDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    tCoach(id).then(setC).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (notFound || !c) return <EmptyState icon="🔍" text={tt('المدرب غير موجود', 'Coach not found')} />;

  const team = c.team;
  const coachName = name(c.name, c.name_en);
  const wa = c.phone ? `https://wa.me/${c.phone.replace(/\D/g, '')}` : null;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {c.photo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(c.photo_path)!} alt={coachName} className="w-full h-72 object-cover object-top" />
        ) : null}
        <div className="p-4 flex items-center gap-4">
          {!c.photo_path && <LogoAvatar src={null} name={coachName} size={72} />}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-text">{coachName}</h1>
            <p className="text-sm text-teal font-bold">{c.role_ar || tt('مدرب', 'Coach')}</p>
          </div>
        </div>
      </Card>

      {team && (
        <Card className="p-4 space-y-3">
          <h2 className="font-black text-text text-sm">{tt('الفريق', 'Team')}</h2>
          <Link href={`/team?id=${team.id}`}
            className="flex items-center gap-3 rounded-xl hover:bg-aqua/5 active:bg-aqua/10 transition-colors -mx-1 px-1 py-1">
            <LogoAvatar src={team.academy_logo}
              name={name(team.display_name, team.display_name_en)} size={44} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-text text-sm truncate">{name(team.display_name, team.display_name_en)}</p>
              {team.age_category && <p className="text-hint text-xs truncate">{team.age_category}</p>}
            </div>
            <span className="text-hint text-xs">{tt('‹', '›')}</span>
          </Link>
          {team.academy_id != null && (
            <Link href={`/academy?id=${team.academy_id}`}
              className="flex items-center gap-3 rounded-xl hover:bg-aqua/5 active:bg-aqua/10 transition-colors -mx-1 px-1 py-1 border-t border-bdr pt-3">
              <LogoAvatar src={team.academy_logo}
                name={name(team.academy_name || '', team.academy_name_en || '')} size={44} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-hint">{tt('الأكاديمية', 'Academy')}</p>
                <p className="font-bold text-text text-sm truncate">{name(team.academy_name || '', team.academy_name_en || '')}</p>
              </div>
              <span className="text-hint text-xs">{tt('‹', '›')}</span>
            </Link>
          )}
        </Card>
      )}

      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[#25D366] text-[#053a1a] font-bold py-3 rounded-xl text-sm">
          💬 {tt('تواصل عبر واتساب', 'Contact on WhatsApp')}
        </a>
      )}
    </div>
  );
}

export default function CoachPage() {
  return <Suspense fallback={<Spinner />}><CoachContent /></Suspense>;
}
