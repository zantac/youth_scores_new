'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Spinner from '@/components/ui/Spinner';
import TeamView from '../TeamView';

// Read the id from window.location.pathname, not useParams(): on a hard-loaded
// static-export shell useParams returns the baked sentinel ('_'); window.location
// reflects the true URL. Re-derive on usePathname() change for client-side nav.
export default function TeamByIdClient() {
  const pathname = usePathname();
  const [id, setId] = useState('');
  useEffect(() => {
    const seg = window.location.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
    setId(seg === '_' ? '' : seg);
  }, [pathname]);

  if (!id) return <Spinner label="..." />;
  return <TeamView id={id} />;
}
