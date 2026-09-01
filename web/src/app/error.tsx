'use client';

import { useEffect, useState } from 'react';

// Route-level error boundary. Any render/runtime error thrown by a page — most
// likely an API response missing a field a view maps over — is caught here and
// shown as a friendly, retryable screen instead of unmounting the tree to a
// blank white page. Reports to Sentry when a DSN is configured (mirrors
// SentryInit's dynamic-import approach; monitoring must never break the app).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Match the reader's language without depending on AppContext (which may be
  // the very thing that failed). Locale is persisted by the toggle in localStorage.
  const [ar, setAr] = useState(true);
  useEffect(() => {
    try {
      setAr((localStorage.getItem('locale') ?? 'ar') !== 'en');
    } catch {
      /* localStorage unavailable — keep the Arabic default */
    }
  }, []);

  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    import('@sentry/react')
      .then((Sentry) => Sentry.captureException(error))
      .catch(() => {/* reporting is best-effort */});
  }, [error]);

  return (
    <div dir={ar ? 'rtl' : 'ltr'} className="min-h-[60vh] grid place-items-center p-8 text-center">
      <div className="max-w-sm">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-text text-lg font-extrabold mb-2">
          {ar ? 'حدث خطأ ما' : 'Something went wrong'}
        </h1>
        <p className="text-hint text-sm mb-6">
          {ar ? 'تعذّر عرض هذه الصفحة. حاول مرة أخرى.' : "We couldn't load this page. Please try again."}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="bg-aqua text-on-accent font-bold rounded-xl px-5 py-2.5 text-sm"
          >
            {ar ? 'إعادة المحاولة' : 'Try again'}
          </button>
          <a
            href="/"
            className="bg-cardBg2 border border-bdr text-text font-bold rounded-xl px-5 py-2.5 text-sm"
          >
            {ar ? 'الرئيسية' : 'Home'}
          </a>
        </div>
      </div>
    </div>
  );
}
