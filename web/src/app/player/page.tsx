'use client';
import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { hrefFor } from '@/lib/links';

function Spinner() {
  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" />
    </div>
  );
}

// Back-compat: old /player?id=5 links redirect to the canonical /player/5/,
// preserving ?tab=. Flask 301s the same on a hard hit; this covers in-SPA nav.
function Redirect() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  useEffect(() => {
    if (!id) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete('id');
    const qs = rest.toString();
    router.replace(`${hrefFor('player', id)}${qs ? `?${qs}` : ''}`);
  }, [id, params, router]);
  return <Spinner />;
}

export default function PlayerRedirectPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Redirect />
    </Suspense>
  );
}
