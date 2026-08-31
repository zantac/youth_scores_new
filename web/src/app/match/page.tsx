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

// Back-compat shim: old /match?id=5 links (previously-shared cards, notifications,
// stray internal links) redirect to the canonical /match/5/. Flask 301s the same
// on a hard hit; this handles any in-SPA navigation that still used the old form.
function Redirect() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  useEffect(() => {
    if (id) router.replace(hrefFor('match', id));
  }, [id, router]);
  return <Spinner />;
}

export default function MatchRedirectPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Redirect />
    </Suspense>
  );
}
