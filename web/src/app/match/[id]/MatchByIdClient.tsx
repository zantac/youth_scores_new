'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import MatchView from '../MatchView';

function Spinner() {
  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" />
    </div>
  );
}

// The real id is read from window.location.pathname, NOT useParams(): on a
// hard-loaded static-export shell useParams returns the baked sentinel ('_'),
// while window.location reflects the true URL (browser-verified). usePathname()
// changes on client-side nav between two match pages, so re-derive on it.
export default function MatchByIdClient() {
  const pathname = usePathname();
  const [id, setId] = useState('');
  useEffect(() => {
    const seg = window.location.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
    setId(seg === '_' ? '' : seg);
  }, [pathname]);

  if (!id) return <Spinner />;
  return <MatchView id={id} />;
}
