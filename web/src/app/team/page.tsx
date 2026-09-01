'use client';
import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Spinner from '@/components/ui/Spinner';
import { hrefFor } from '@/lib/links';

// Back-compat: old /team?id=5 links redirect to the canonical /team/5/. Flask 301s
// the same on a hard hit; this covers in-SPA navigation still using the old form.
function Redirect() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  useEffect(() => {
    if (id) router.replace(hrefFor('team', id));
  }, [id, router]);
  return <Spinner label="..." />;
}

export default function TeamRedirectPage() {
  return (
    <Suspense fallback={<Spinner label="..." />}>
      <Redirect />
    </Suspense>
  );
}
