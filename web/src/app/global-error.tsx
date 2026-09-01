'use client';

import { useEffect } from 'react';

// Last-resort boundary for errors thrown by the ROOT layout itself (where the
// normal error.tsx — which renders inside the layout — cannot help). It replaces
// the whole document, so it ships its own <html>/<body> and inline styles rather
// than relying on globals.css or the theme tokens, which may not be mounted.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    import('@sentry/react')
      .then((Sentry) => Sentry.captureException(error))
      .catch(() => {/* reporting is best-effort */});
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#070B14',
          color: '#EAF2FF',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>حدث خطأ ما — Something went wrong</h1>
          <p style={{ opacity: 0.7, fontSize: 14, margin: '0 0 20px' }}>
            تعذّر تحميل التطبيق. حاول مرة أخرى — Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              background: '#1EE0FF',
              color: '#04121A',
              border: 0,
              borderRadius: 12,
              padding: '10px 20px',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة / Retry
          </button>
        </div>
      </body>
    </html>
  );
}
