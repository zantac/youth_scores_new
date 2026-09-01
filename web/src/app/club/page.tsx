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

// Back-compat: old /club?id=5 links redirect to the canonical /club/5/. Flask 301s
// the same on a hard hit; this covers in-SPA navigation still using the old form.
function Redirect() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  useEffect(() => {
    if (id) router.replace(hrefFor('club', id));
  }, [id, router]);
  return <Spinner />;
}

export default function ClubRedirectPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Redirect />
    </Suspense>
  );
}
