'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tAcademy, mediaUrl, whatsappLink, type TAcademy } from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { Card, EmptyState, LogoAvatar, useTT, useName } from '@/components/tla3bny/kit';
import TeamHero from '@/components/tla3bny/TeamHero';
import PhotoStrip from '@/components/tla3bny/PhotoStrip';

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

  const wa = whatsappLink(a.whatsapp_number, tt('مرحباً، أود الاستفسار عن الأكاديمية', 'Hi, I would like to ask about the academy'));
  const photos = (a.photos ?? []).map(mediaUrl).filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <Link href="/academies" className="text-sm text-hint hover:text-aqua">← {tt('كل الأكاديميات', 'All academies')}</Link>

      {/* Hero */}
      <Card className="p-0 overflow-hidden">
        <div className="relative p-5 bg-gradient-to-br from-cardBg2 to-cardBg">
          <div className="pointer-events-none absolute -top-12 -end-12 w-48 h-48 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.16),transparent_65%)]" />
          <div className="relative flex items-center gap-4">
            <LogoAvatar src={a.logo_path} name={nm(a.name, a.name_en)} size={84} />
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-text leading-tight">{nm(a.name, a.name_en)}</h1>
              {a.teams && a.teams.length > 0 && (
                <p className="text-[11px] text-teal font-bold mt-1">{a.teams.length} {tt('فريق', 'teams')}</p>
              )}
            </div>
          </div>
        </div>
        {/* Contact bar */}
        {(wa || a.phone || a.facebook_url) && (
          <div className="flex flex-wrap gap-2 p-4 border-t border-bdr">
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl bg-[#25D366] text-white shadow-sm hover:opacity-90 transition-opacity">
                💬 {tt('تواصل واتساب', 'Chat on WhatsApp')}
              </a>
            )}
            {a.phone && <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl bg-cardBg2 border border-bdr text-text">📞 {a.phone}</a>}
            {a.facebook_url && <a href={a.facebook_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl bg-cardBg2 border border-bdr text-aqua">f {tt('فيسبوك', 'Facebook')}</a>}
          </div>
        )}
      </Card>

      {/* About */}
      {a.description && (
        <Card className="p-4">
          <h2 className="font-black text-text mb-1.5">{tt('عن الأكاديمية', 'About')}</h2>
          <p className="text-sm text-text/90 leading-[1.9] whitespace-pre-line">{a.description}</p>
        </Card>
      )}

      {a.branches?.length > 0 && (
        <section>
          <h2 className="font-black text-text mb-2">{tt('الفروع', 'Branches')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {a.branches.map(b => (
              <Card key={b.id} className="p-3">
                <div className="font-bold text-text text-sm">📍 {b.name}{b.governorate && <span className="text-teal font-normal"> · {b.governorate}</span>}</div>
                {b.address && <div className="text-[11px] text-hint mt-0.5">{b.address}</div>}
                <div className="flex flex-wrap gap-2 mt-2">
                  {b.location_url && <a href={b.location_url} target="_blank" rel="noreferrer" className="text-[11px] font-bold px-2 py-1 rounded-lg bg-cardBg2 border border-bdr text-teal">🗺️ {tt('الخريطة', 'Map')}</a>}
                  {b.phone && <a href={`tel:${b.phone}`} className="text-[11px] font-bold px-2 py-1 rounded-lg bg-cardBg2 border border-bdr text-text">📞 {b.phone}</a>}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

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
          <div className="space-y-3">
            {a.teams.map(t => (
              <Link key={t.id} href={`/team?id=${t.id}`}
                className="block hover:opacity-95 active:opacity-80 transition-opacity">
                <TeamHero team={t} />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon="⚽" text={tt('لا فرق بعد', 'No teams yet')} />
        )}
      </section>

      {/* Photos — rectangular; side by side on wide screens, swipeable with
          arrows on small ones. */}
      {photos.length > 0 && (
        <section>
          <h2 className="font-black text-text mb-2">{tt('صور', 'Photos')}</h2>
          <PhotoStrip photos={photos} />
        </section>
      )}
    </div>
  );
}

export default function AcademyPage() {
  return <Suspense fallback={<Spinner />}><AcademyContent /></Suspense>;
}
