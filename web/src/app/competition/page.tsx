'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Spinner from '@/components/ui/Spinner';
import { hrefFor } from '@/lib/links';
import CompetitionView from './CompetitionView';

// The /competition entry point serves two forms:
//  • ?id=N  → the modern identity; redirect to the canonical /competition/N/
//    (preserving view-state params like tab/team). Flask 301s the same on a hard
//    hit; this covers in-SPA navigation still using the old form.
//  • ?url=… → the legacy data-URL form (no id to path-ify); render it in place.
function Entry() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');

  useEffect(() => {
    if (!id) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete('id');
    const qs = rest.toString();
    router.replace(`${hrefFor('competition', id)}${qs ? `?${qs}` : ''}`);
  }, [id, params, router]);

  if (id) return <Spinner label="Loading..." />;
  return <CompetitionView />;
}

export default function CompetitionPage() {
  return (
    <Suspense fallback={<Spinner label="Loading..." />}>
      <Entry />
    </Suspense>
  );
}
