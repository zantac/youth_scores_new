'use client';
import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Spinner from '@/components/ui/Spinner';
import CompetitionView from '../CompetitionView';

// Read the competition id from window.location.pathname, not useParams(): on a
// hard-loaded static-export shell useParams returns the baked sentinel ('_');
// window.location reflects the true URL. Re-derive on usePathname() change.
function Inner() {
  const pathname = usePathname();
  const [id, setId] = useState('');
  useEffect(() => {
    const seg = window.location.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
    setId(seg === '_' ? '' : seg);
  }, [pathname]);

  if (!id) return <Spinner label="Loading..." />;
  return <CompetitionView id={id} />;
}

export default function CompetitionByIdClient() {
  // CompetitionView reads view-state (tab/team/stat/week) via useSearchParams,
  // which needs a Suspense boundary under output:'export'.
  return (
    <Suspense fallback={<Spinner label="Loading..." />}>
      <Inner />
    </Suspense>
  );
}
