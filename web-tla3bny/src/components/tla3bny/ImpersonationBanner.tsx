'use client';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import { useTT } from './kit';

// Always-visible reminder while a super admin is "logged in as" another account,
// with one click back to their own account. Sticky (not fixed) so it pins to the
// top on scroll without overlapping the bottom nav.
export default function ImpersonationBanner() {
  const tt = useTT();
  const { impersonating, user, stopImpersonation } = useTla3bnyAuth();
  if (!impersonating) return null;

  const who = user?.name || user?.login || '';
  return (
    <div className="sticky top-0 z-50 bg-gold text-darkBg">
      <div className="w-full max-w-3xl mx-auto px-3 py-1.5 flex items-center gap-2 text-xs font-bold">
        <span className="min-w-0 truncate">
          👤 {tt(`أنت الآن داخل حساب: ${who}`, `You are inside the account: ${who}`)}
        </span>
        <button
          onClick={() => { stopImpersonation(); }}
          className="ms-auto shrink-0 rounded-lg bg-darkBg/90 text-gold px-2.5 py-1 hover:bg-darkBg">
          {tt('رجوع لحسابي', 'Back to my account')}
        </button>
      </div>
    </div>
  );
}
