'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import CoachView from '../CoachView';

function Spinner() {
  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" />
    </div>
  );
}

// Read the id from window.location.pathname, not useParams(): on a hard-loaded
// static-export shell useParams returns the baked sentinel ('_'); window.location
// reflects the true URL. Re-derive on usePathname() change for client-side nav.
export default function CoachByIdClient() {
  const pathname = usePathname();
  const [id, setId] = useState('');
  useEffect(() => {
    const seg = window.location.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
    setId(seg === '_' ? '' : seg);
  }, [pathname]);

  if (!id) return <Spinner />;
  return <CoachView id={id} />;
}
