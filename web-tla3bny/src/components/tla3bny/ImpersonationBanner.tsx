'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import { useTT } from './kit';

// Always-visible reminder while a super admin is "logged in as" another account,
// with one click back to their own account. Sticky (not fixed) so it pins to the
// top on scroll without overlapping the bottom nav.
export default function ImpersonationBanner() {
  const tt = useTT();
  const router = useRouter();
  const { impersonating, user, stopImpersonation } = useTla3bnyAuth();
  const [busy, setBusy] = useState(false);
  if (!impersonating) return null;

  // Restore the admin account, then land on the admin home. Without the
  // navigation the admin is left on the impersonated account's page — which
  // their own account can't render — showing an endless spinner until they
  // navigate by hand. Navigate even on failure so we never strand them there.
  const back = async () => {
    if (busy) return;
    setBusy(true);
    try { await stopImpersonation(); } finally { router.push('/admin'); }
  };

  const who = user?.name || user?.login || '';
  return (
    <div className="sticky top-0 z-50 bg-gold text-darkBg">
      <div className="w-full max-w-3xl mx-auto px-3 py-1.5 flex items-center gap-2 text-xs font-bold">
        <span className="min-w-0 truncate">
          👤 {tt(`أنت الآن داخل حساب: ${who}`, `You are inside the account: ${who}`)}
        </span>
        <button
          onClick={back} disabled={busy}
          className="ms-auto shrink-0 rounded-lg bg-darkBg/90 text-gold px-2.5 py-1 hover:bg-darkBg disabled:opacity-60">
          {busy ? tt('جارٍ…', '…') : tt('رجوع لحسابي', 'Back to my account')}
        </button>
      </div>
    </div>
  );
}
